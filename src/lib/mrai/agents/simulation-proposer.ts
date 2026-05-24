import { getLLMProvider } from "@/lib/llm";
import { createServiceClient } from "@/lib/supabase/server";
import { loadWorkspaceMemories } from "../memory";

/**
 * Mr. AI Simulation Proposer
 *
 * Turns a user's chat-side request like "메이트 일본 진출 시뮬 돌려줘" into
 * a ready-to-edit simulation input draft, sourced from the workspace's
 * existing memory (product names, competitors, candidate markets, KPI).
 *
 * The draft is returned as an `actions` payload attached to the assistant
 * message; the chat UI renders it as a SimulationProposalCard the user
 * can edit inline before clicking "Run". That last click hits
 * /api/mrai/actions/run-simulation, which creates the project and
 * triggers the ensemble — bypassing the wizard page entirely.
 *
 * Cost: one Sonnet 4.6 pass at ~1500 in / 800 out → ~$0.02 per proposal.
 * Cheap enough to do on every "시뮬" keyword match without a gate.
 */

export type ProposalTier =
  | "hypothesis"
  | "decision"
  | "decision_plus"
  | "deep"
  | "deep_pro";

export interface SimulationProposal {
  /** Internal project name shown in the dashboard. */
  name: string;
  /** Product SKU name (LLM picks the best match from memory). */
  productName: string;
  /** Wizard category enum: beauty | fashion | food | beverage | alcohol | health | electronics | appliances | home | pet | saas | ip | other */
  category: string;
  /** Multi-line marketing description grounded in memory facts. */
  description: string;
  /** Base price as a plain numeric string (no commas). */
  basePrice: string;
  /** ISO currency code, usually USD or KRW. */
  currency: string;
  /** awareness | conversion | retention | expansion */
  objective: "awareness" | "conversion" | "retention" | "expansion";
  /** ISO-2 codes (KR is implied as origin and excluded from this list). */
  originatingCountry: string;
  /** ISO-2 list of candidate markets to evaluate. */
  countries: string[];
  /** Competitor names (one per line in the wizard). */
  competitorNames: string[];
  /** Recommended tier; user can override in the card. */
  tier: ProposalTier;
  /** Short rationale shown above the card explaining why these defaults. */
  rationale: string;
}

export async function proposeSimulation(input: {
  workspaceId: string;
  userMessage: string;
  locale?: "ko" | "en";
}): Promise<SimulationProposal> {
  const memories = await loadWorkspaceMemories(input.workspaceId);
  const supabase = createServiceClient();
  const { data: ws } = await supabase
    .from("workspaces")
    .select("name, company_name, country")
    .eq("id", input.workspaceId)
    .single();
  const wsRow = ws as { name?: string; company_name?: string; country?: string } | null;

  const memoryBlock = memories.length
    ? memories
        .map((m) => `[${m.kind}] ${m.title}\n${m.body}`)
        .join("\n\n---\n\n")
    : "(메모리 없음 — 보수적 기본값으로 채울 것)";

  const system = `당신은 한국 D2C 브랜드를 위한 시뮬레이션 input 자동 생성 어시스턴트입니다.
워크스페이스 메모리와 사용자 요청을 분석해 Market Twin 시뮬레이션 wizard에 바로 입력 가능한 JSON을 생성하세요.

== 규칙 ==
- 메모리에 적힌 사실 (제품·가격·경쟁사·검토 시장·KPI)을 최우선으로 인용.
- 사용자 요청에 특정 SKU·국가 명시 있으면 그것을 우선 적용.
- 메모리에 없는 값은 합리적 default. 검색·추측 금지.
- category는 enum 중 하나: beauty | fashion | food | beverage | alcohol | health | electronics | appliances | home | pet | saas | ip | other
- objective: 새 시장 진출이면 expansion, 인지도 확보면 awareness, 매출 전환이면 conversion, 재구매면 retention
- originatingCountry는 KR 기본 (워크스페이스 country 필드 있으면 그것)
- countries에는 originatingCountry 제외한 검토 시장만 (ISO-2 최대 5개)
- basePrice는 숫자 문자열만 (예: "109"), currency 별도 (USD 권장, 메모리에 KRW만 있으면 USD로 환산)
- competitorNames는 메모리 경쟁사 섹션에서 한국·해외 가리지 않고 최대 5개
- tier 기본 "decision" (사용자가 "빨리/가설/저비용" 언급하면 hypothesis, "깊게/이사회" 언급하면 deep)
- rationale: 메모리의 어느 fact를 인용해 이 default를 선택했는지 1~2문장으로 설명 (한국어, 평서문)

응답은 반드시 유효한 JSON 한 객체로 외부 텍스트·코드펜스 없이.`;

  const prompt = `워크스페이스 이름: ${wsRow?.name ?? "(미상)"}
회사명: ${wsRow?.company_name ?? "(미상)"}
워크스페이스 country: ${wsRow?.country ?? "KR"}

== 워크스페이스 메모리 ==
${memoryBlock}

== 사용자 요청 ==
${input.userMessage}

== 요구 응답 JSON 스키마 ==
{
  "name": "...",                       // 예: "르무통 메이트 일본·미국 진출 검증"
  "productName": "...",                // 예: "Mate (메이트)"
  "category": "fashion",
  "description": "...",                // 100-300자, 메모리의 specific 사실 인용
  "basePrice": "109",
  "currency": "USD",
  "objective": "expansion",
  "originatingCountry": "KR",
  "countries": ["JP", "US", "TW", "SG"],
  "competitorNames": ["올버즈", "호카", "스케쳐스", "온러닝"],
  "tier": "decision",
  "rationale": "..."                   // 1-2문장, 메모리 어느 부분 인용했는지
}`;

  const provider = getLLMProvider({ provider: "anthropic" });
  const res = await provider.generate({
    system,
    prompt,
    temperature: 0.2,
    maxTokens: 1200,
    cacheSystem: false,
  });
  const text = (res.text ?? "").trim();
  if (!text) throw new Error("empty proposer response");

  const parsed = parseJsonLoose(text);
  return normalizeProposal(parsed, wsRow?.country ?? "KR");
}

function parseJsonLoose(text: string): unknown {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("proposer returned non-JSON");
    return JSON.parse(m[0]);
  }
}

const VALID_CATEGORIES = new Set([
  "beauty",
  "fashion",
  "food",
  "beverage",
  "alcohol",
  "health",
  "electronics",
  "appliances",
  "home",
  "pet",
  "saas",
  "ip",
  "other",
]);

const VALID_TIERS: ProposalTier[] = [
  "hypothesis",
  "decision",
  "decision_plus",
  "deep",
  "deep_pro",
];

function normalizeProposal(raw: unknown, defaultOrigin: string): SimulationProposal {
  const r = (raw ?? {}) as Partial<SimulationProposal>;
  const category = typeof r.category === "string" && VALID_CATEGORIES.has(r.category)
    ? r.category
    : "other";
  const tier = (VALID_TIERS as string[]).includes(r.tier as string)
    ? (r.tier as ProposalTier)
    : "decision";
  const objective =
    r.objective === "awareness" ||
    r.objective === "conversion" ||
    r.objective === "retention" ||
    r.objective === "expansion"
      ? r.objective
      : "expansion";

  const countriesRaw = Array.isArray(r.countries) ? r.countries : [];
  const origin = (r.originatingCountry || defaultOrigin || "KR").toUpperCase().slice(0, 2);
  const countries = countriesRaw
    .filter((c): c is string => typeof c === "string")
    .map((c) => c.toUpperCase().slice(0, 2))
    .filter((c) => c && c !== origin)
    .slice(0, 5);

  const competitorNames = Array.isArray(r.competitorNames)
    ? (r.competitorNames as unknown[])
        .filter((c): c is string => typeof c === "string" && c.trim().length > 0)
        .map((c) => c.trim())
        .slice(0, 5)
    : [];

  return {
    name: (r.name as string)?.slice(0, 120) || "시뮬레이션",
    productName: (r.productName as string)?.slice(0, 120) || "신제품",
    category,
    description: (r.description as string)?.slice(0, 2000) || "",
    basePrice: String(r.basePrice ?? "100").replace(/[^0-9.]/g, "") || "100",
    currency: typeof r.currency === "string" ? r.currency.toUpperCase().slice(0, 4) : "USD",
    objective,
    originatingCountry: origin,
    countries: countries.length ? countries : ["JP", "US"],
    competitorNames,
    tier,
    rationale: (r.rationale as string)?.slice(0, 400) || "메모리 기반 기본값",
  };
}

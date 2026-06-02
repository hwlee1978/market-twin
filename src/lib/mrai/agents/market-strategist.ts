import { getLLMProvider } from "@/lib/llm";
import type { Locale } from "../types";

/**
 * L1 STRATEGIST — frames the user's question and decides what evidence
 * the analyst should fetch. Cheap (Haiku) because this is pure planning.
 *
 * Output is a structured plan the L2 Analyst consumes. The shape is
 * deliberately small so adding new evidence sources later (Market Twin
 * sim, HubSpot deals, calendar, etc.) is just one more boolean.
 */

export type { Locale };

export interface StrategistPlan {
  /** Semantic-search query for workspace memories; null = skip memory load. */
  memoryQuery: string | null;
  /** How many memories L2 should retrieve. */
  memoryCount: number;
  /** Whether to include HubSpot/CRM signals in evidence. */
  includeSignals: boolean;
  /** Whether to include recent conversation history. */
  includeHistory: boolean;
  /** Free-text guidance L3 should follow: format/length/tone. */
  answerGuidance: string;
  /** Confidence the strategist has that we have enough info to answer. */
  confidence: "low" | "medium" | "high";
}

const SYSTEM_KO = `당신은 Mr. AI의 L1 전략 에이전트입니다. 사용자 질문 → 답을 만들기 위해 어떤 evidence가 필요한지 JSON으로 계획을 세웁니다. 답 자체는 작성하지 않습니다.

출력 JSON schema:
{
  "memoryQuery": "메모리 검색용 짧은 쿼리 (한 문장 또는 null)",
  "memoryCount": 5-20 사이의 정수 (질문 복잡도에 따라),
  "includeSignals": true/false (HubSpot 등 외부 데이터 필요 여부),
  "includeHistory": true/false (이전 대화 흐름 참조 필요 여부),
  "answerGuidance": "L3가 답 작성할 때 따를 형식·길이·톤 지시. 1-2 문장.",
  "confidence": "low" | "medium" | "high" (현재 정보로 답할 수 있을 가능성)
}

규칙:
- 인사·간단 확인은 memoryCount 0, includeSignals false, answerGuidance "1-2 문장 짧게".
- 회사·제품·결정 관련 질문 → memoryQuery 채우고 memoryCount 10-15.
- 매출·deal·고객 관련 → includeSignals true.
- "어제 말한 거" / "방금" → includeHistory true.
- confidence는 사용자 질문이 모호하면 low.`;

const SYSTEM_EN = `You are Mr. AI's L1 strategy agent. Given the user's question, plan what evidence the analyst should fetch — as JSON only. Do NOT write the answer itself.

Output JSON schema:
{
  "memoryQuery": "short retrieval query (one sentence) or null",
  "memoryCount": integer 5-20 (depending on question complexity),
  "includeSignals": true/false (whether to fetch HubSpot/CRM signals),
  "includeHistory": true/false (whether to include recent conversation),
  "answerGuidance": "1-2 sentence guidance to L3 on format/length/tone.",
  "confidence": "low" | "medium" | "high"
}

Rules:
- Greetings/simple confirms → memoryCount 0, includeSignals false, answerGuidance "1-2 sentences short".
- Company/product/decision questions → fill memoryQuery, memoryCount 10-15.
- Revenue/deal/customer questions → includeSignals true.
- "what I said earlier" / "just now" → includeHistory true.
- confidence is low if the user's question is ambiguous.`;

export async function runStrategist(input: {
  userMessage: string;
  locale: Locale;
}): Promise<{ plan: StrategistPlan; usage: { input?: number; output?: number }; ms: number }> {
  const t0 = Date.now();
  const system = input.locale === "en" ? SYSTEM_EN : SYSTEM_KO;
  const prompt =
    input.locale === "en"
      ? `User question:\n"${input.userMessage}"\n\nReturn the plan JSON.`
      : `사용자 질문:\n"${input.userMessage}"\n\n계획 JSON을 반환하세요.`;

  // Cheap stage — Haiku is enough for planning. Override via env if needed.
  const provider = getLLMProvider({ provider: "anthropic", model: "claude-haiku-4-5-20251001" });
  const res = await provider.generate({
    system,
    prompt,
    temperature: 0.1,
    maxTokens: 400,
    cacheSystem: true,
    jsonSchema: {
      type: "object",
      required: ["memoryQuery", "memoryCount", "includeSignals", "includeHistory", "answerGuidance", "confidence"],
      properties: {
        memoryQuery: { type: ["string", "null"] },
        memoryCount: { type: "integer", minimum: 0, maximum: 30 },
        includeSignals: { type: "boolean" },
        includeHistory: { type: "boolean" },
        answerGuidance: { type: "string", maxLength: 400 },
        confidence: { type: "string", enum: ["low", "medium", "high"] },
      },
    },
  });

  const raw = (res.json as Partial<StrategistPlan>) ?? {};
  const plan: StrategistPlan = {
    memoryQuery: typeof raw.memoryQuery === "string" && raw.memoryQuery.trim() ? raw.memoryQuery : null,
    memoryCount: Math.max(0, Math.min(30, Math.floor(raw.memoryCount ?? 10))),
    includeSignals: Boolean(raw.includeSignals),
    includeHistory: raw.includeHistory ?? true,
    answerGuidance:
      typeof raw.answerGuidance === "string" && raw.answerGuidance.trim()
        ? raw.answerGuidance
        : input.locale === "en"
        ? "Short CEO-style answer, 3-6 sentences."
        : "CEO 톤으로 3-6 문장 짧게.",
    confidence: ["low", "medium", "high"].includes(String(raw.confidence)) ? (raw.confidence as "low" | "medium" | "high") : "medium",
  };

  return {
    plan,
    usage: { input: res.usage?.inputTokens, output: res.usage?.outputTokens },
    ms: Date.now() - t0,
  };
}

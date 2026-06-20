import { z } from "zod";
import { getLLMProvider } from "@/lib/llm";
import type { MarketProfile, ProjectInput } from "./schemas";
import type { EnsembleAggregate } from "./ensemble";

/**
 * Secondary-country risk generator.
 *
 * Twin of secondary-actions.ts — produces MergedRisk-shaped entries
 * for a Top-2 runner-up country so the Risks tab can render parallel
 * depth for both candidates. Same shape as the primary mergedRisks
 * (factor / description / severity / surfacedInSims) plus
 * personaCategory + scope so the existing renderer's metadata badges
 * work unchanged.
 *
 * surfacedInSims = 0 (single-pass), and scope is forced to
 * "country-specific" because this analysis is explicitly bounded to
 * the requested secondary country.
 */

const RISK_SCHEMA = z.object({
  factor: z.string(),
  description: z.string(),
  severity: z.enum(["low", "medium", "high"]),
  surfacedInSims: z.number().int().min(0).default(0),
  personaCategory: z.string().optional(),
});

const RESPONSE_SCHEMA = z.object({
  risks: z.array(RISK_SCHEMA).min(3).max(10),
});

export type SecondaryRisk = z.infer<typeof RISK_SCHEMA>;

export interface BuildSecondaryRisksOpts {
  input: ProjectInput;
  aggregate: EnsembleAggregate;
  country: string;
  secondaryProfile?: MarketProfile;
  locale: "ko" | "en";
}

export interface BuildSecondaryRisksResult {
  risks?: SecondaryRisk[];
  error?: string;
  inputTokens?: number;
  outputTokens?: number;
  costEstimateUsd?: number;
}

export async function buildSecondaryRisks(
  opts: BuildSecondaryRisksOpts,
): Promise<BuildSecondaryRisksResult> {
  const provider = getLLMProvider({ provider: "anthropic" });
  if (!provider) return { error: "anthropic provider unavailable" };

  const countryStats = opts.aggregate.countryStats?.find(
    (c) => c.country.toUpperCase() === opts.country.toUpperCase(),
  );
  const topObjections = ((countryStats?.detail?.topObjections ?? []) as Array<{ text: string }>)
    .slice(0, 5)
    .map((o) => o.text);
  const topTrustFactors = ((countryStats?.detail?.topTrustFactors ?? []) as Array<{ text: string }>)
    .slice(0, 5)
    .map((t) => t.text);
  const finalScore = countryStats?.finalScore;

  const profileBlock = opts.secondaryProfile
    ? buildProfileBlock(opts.secondaryProfile)
    : "(시장 분석 데이터 없음 — 페르소나 시그널만으로 추론)";

  const system =
    opts.locale === "en"
      ? `You are a D2C global-entry risk analyst. Given a SECONDARY (Top-2 tied) country's persona signal + market profile, list 5-8 concrete risks a Korean founder must mitigate to launch or scale in that market. Same depth and specificity as a primary mergedRisks block.

== Rules ==
- factor: one short phrase naming the risk (e.g. "Reddit AMA backlash", "FTC Green Guides 위반", "FBA 재고 과적 적자").
- description: 80-200 chars explaining *why* this risk is real for THIS product in THIS country, citing concrete vendors / regulations / behavior patterns.
- severity: high / medium / low. High = could derail launch (compliance breach, channel block, currency collapse). Medium = drags performance (CAC inflation, slow review accumulation). Low = friction.
- surfacedInSims: always 0 (single-pass secondary).
- personaCategory: short code from persona-objection taxonomy (e.g. "trust", "price", "fit", "channel_access") OR omit.
- Reference real entities: actual regulators (FTC, FDA, CPSC, MAFF), platforms (Reddit, TikTok, Note.com, 샤오훙슈), competitors named in the market profile.
- No generic risks ("competitive market", "regulatory risk"). Every entry must be specific enough that a junior PM can act on it next week.

Output VALID JSON only, no code fences:
{ "risks": [{ "factor": "...", "description": "...", "severity": "high", "surfacedInSims": 0, "personaCategory": "trust" }] }`
      : `당신은 D2C 글로벌 진출 리스크 분석가입니다. SECONDARY (Top 2 동등 후보) 국가의 페르소나 시그널과 시장 분석을 바탕으로, 한국 D2C 브랜드가 그 시장에서 launch/scale하기 위해 반드시 해결해야 할 구체적 리스크 5~8개를 작성하세요. Primary mergedRisks와 동일한 깊이와 구체성.

== 규칙 ==
- factor: 리스크를 한 줄로 명명 (예: "Reddit AMA 부정 반응", "FTC Green Guides 위반", "FBA 재고 과적으로 적자").
- description: 80~200자, 왜 이 리스크가 이 제품·이 국가에서 실제로 발생할 수 있는지 — 구체적 규제·플랫폼·경쟁사·행동 패턴 인용.
- severity: high / medium / low. High = launch 좌우 (compliance 위반, 채널 차단, 환율 급변). Medium = 성과 저해 (CAC 인플레, 리뷰 축적 저속). Low = 사소한 마찰.
- surfacedInSims: 항상 0 (secondary single-pass).
- personaCategory: 짧은 코드 (예: "trust", "price", "fit", "channel_access") 또는 생략.
- 실제 엔티티 인용: 실제 규제기관 (FTC·FDA·CPSC·식약처·公正取引委員会), 플랫폼 (Reddit, TikTok, Note.com, 샤오훙슈, 무신사 JP), 시장 분석에 명시된 경쟁사.
- 일반론 ("경쟁이 심함", "규제 리스크") 절대 금지. 모든 항목은 주니어 PM이 다음 주에 액션 가능할 정도로 구체적이어야 함.

JSON으로만 응답, code fence 없이:
{ "risks": [{ "factor": "...", "description": "...", "severity": "high", "surfacedInSims": 0, "personaCategory": "trust" }] }`;

  const userPrompt =
    opts.locale === "en"
      ? `== Workspace context ==
Product: ${opts.input.productName} (${opts.input.category})
Description: ${opts.input.description.slice(0, 600)}
(The description is the company's own positioning and may be exaggerated — derive risks from persona objections / market signals, and do NOT take promotional claims ("eco-friendly", "verified", "#1") at face value.)
Price: ${opts.input.basePriceCents / 100} ${opts.input.currency}
Origin: ${opts.input.originatingCountry}

== Secondary target country: ${opts.country.toUpperCase()} ==

Persona signals:
- Mean score: ${finalScore?.mean.toFixed(1) ?? "n/a"} (std ${finalScore?.std.toFixed(1) ?? "n/a"})
- Top objections (real persona voice):
${topObjections.length ? topObjections.map((o) => `  · ${o}`).join("\n") : "  (none)"}
- Top trust factors:
${topTrustFactors.length ? topTrustFactors.map((t) => `  · ${t}`).join("\n") : "  (none)"}

== ${opts.country.toUpperCase()} market profile (if available) ==
${profileBlock}

Now write 5-8 ${opts.country.toUpperCase()} market entry/scale risks as JSON.`
      : `== 워크스페이스 컨텍스트 ==
제품: ${opts.input.productName} (${opts.input.category})
설명: ${opts.input.description.slice(0, 600)}
(설명은 회사 자체 포지셔닝이라 과장이 섞일 수 있음 — 리스크는 페르소나 objection·시장 시그널로 도출하고, 설명의 홍보성 주장("친환경·검증됨·1위")을 사실로 받아들이지 말 것.)
가격: ${opts.input.basePriceCents / 100} ${opts.input.currency}
원산지: ${opts.input.originatingCountry}

== Secondary 타겟 국가: ${opts.country.toUpperCase()} ==

페르소나 시그널:
- 평균 점수: ${finalScore?.mean.toFixed(1) ?? "n/a"} (std ${finalScore?.std.toFixed(1) ?? "n/a"})
- 최상위 거부 요인 (실제 페르소나 voice):
${topObjections.length ? topObjections.map((o) => `  · ${o}`).join("\n") : "  (없음)"}
- 최상위 신뢰 요인:
${topTrustFactors.length ? topTrustFactors.map((t) => `  · ${t}`).join("\n") : "  (없음)"}

== ${opts.country.toUpperCase()} 시장 분석 (있을 때) ==
${profileBlock}

이제 ${opts.country.toUpperCase()} 시장 진입·확장 리스크 5~8개를 JSON으로 작성하세요.`;

  try {
    const res = await provider.generate({
      system,
      prompt: userPrompt,
      temperature: 0.3,
      maxTokens: 3000,
      cacheSystem: false,
    });
    const raw = (res.text ?? "").trim();
    if (!raw) return { error: "empty response" };

    const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(cleaned);
    const validated = RESPONSE_SCHEMA.safeParse(parsed);
    if (!validated.success) {
      return { error: `schema validation: ${validated.error.message}` };
    }

    const inputTokens = res.usage?.inputTokens ?? 0;
    const outputTokens = res.usage?.outputTokens ?? 0;
    const cost =
      Math.round(((inputTokens / 1_000_000) * 3 + (outputTokens / 1_000_000) * 15) * 1000) / 1000;

    return {
      risks: validated.data.risks,
      inputTokens,
      outputTokens,
      costEstimateUsd: cost,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "internal_error" };
  }
}

function buildProfileBlock(profile: MarketProfile): string {
  const lines: string[] = [];
  const ms = profile.marketSize;
  if (ms?.estimateUsd) lines.push(`TAM: ${ms.estimateUsd}`);
  if (ms?.growthTrend) lines.push(`Growth: ${ms.growthTrend}`);

  const competitors = profile.competitors ?? [];
  if (competitors.length) {
    lines.push(
      `Competitors: ${competitors
        .slice(0, 5)
        .map((c: { name: string; threatLevel?: string }) => `${c.name}(${c.threatLevel ?? "?"})`)
        .join(", ")}`,
    );
  }

  const reg = profile.regulatory;
  if (reg?.barriers?.length) {
    lines.push(
      `Regulatory barriers: ${reg.barriers
        .map((b: { name: string; severity: string; description?: string }) =>
          `${b.name}(${b.severity})${b.description ? ": " + b.description.slice(0, 100) : ""}`,
        )
        .join("; ")}`,
    );
  }
  if (reg?.requirements?.length) {
    lines.push(`Requirements: ${reg.requirements.slice(0, 5).join("; ")}`);
  }
  if (reg?.timeToCompliance) lines.push(`Time to compliance: ${reg.timeToCompliance}`);

  const cult = profile.culturalNotes;
  if (cult?.purchaseBehavior) lines.push(`Purchase behavior: ${cult.purchaseBehavior.slice(0, 200)}`);
  if (cult?.valuesAlignment) lines.push(`Values: ${cult.valuesAlignment.slice(0, 200)}`);

  const pricing = profile.pricingBenchmarks;
  if (pricing?.entryLevel || pricing?.mid || pricing?.premium) {
    lines.push(
      `Pricing benchmarks: entry ${pricing?.entryLevel ?? "n/a"}, mid ${pricing?.mid ?? "n/a"}, premium ${pricing?.premium ?? "n/a"}`,
    );
  }

  const gtm = profile.goToMarketStrategy;
  if (gtm?.risks?.length) {
    lines.push(`GTM risks (seed list): ${gtm.risks.slice(0, 5).join(" / ")}`);
  }

  return lines.length ? lines.join("\n") : "(no profile)";
}

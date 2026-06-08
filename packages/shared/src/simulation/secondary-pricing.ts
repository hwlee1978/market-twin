import { z } from "zod";
import { getLLMProvider } from "@/lib/llm";
import type { MarketProfile, ProjectInput } from "./schemas";
import type { EnsembleAggregate } from "./ensemble";

/**
 * Secondary-country pricing generator.
 *
 * When the orchestrator flags Top 2, the primary aggregate.pricing
 * only covers the score-winner's market. This module produces a
 * parallel pricing analysis for the runner-up country with the same
 * shape — recommended price, conversion curve, mid-50% range, margin
 * estimate — so the existing PricingTab/PDF can render the secondary
 * candidate with the same components.
 *
 * Single-pass Sonnet call, ~$0.10 — equivalent depth to a primary
 * pricing pass without re-spending the full ensemble compute.
 *
 * recommendedPriceP25/P75 collapse to a tight ±15% band around the
 * LLM's recommended price (single LLM = no cross-sim spread to
 * report); the UI displays this as a "secondary pricing" caveat so
 * users know it's a single-pass derivation, not 6-sim consensus.
 */

const CURVE_POINT_SCHEMA = z.object({
  priceCents: z.number().int().positive(),
  meanConversionProbability: z.number().min(0).max(1),
});

const RESPONSE_SCHEMA = z.object({
  recommendedPriceCents: z.number().int().positive(),
  curve: z.array(CURVE_POINT_SCHEMA).min(3).max(20),
  marginEstimate: z.string().min(1),
  marginEstimatePct: z.number().min(0).max(95).optional(),
  rationale: z.string().min(1),
});

export type SecondaryPricingCurvePoint = z.infer<typeof CURVE_POINT_SCHEMA>;

export interface SecondaryPricing {
  recommendedPriceCents: number;
  recommendedPriceP25: number;
  recommendedPriceP75: number;
  marginEstimate: string;
  marginEstimatePct?: number;
  curveRevenueMaxCents?: number | null;
  rationale: string;
  curve: Array<{
    priceCents: number;
    meanConversionProbability: number;
    sampleCount: number;
  }>;
}

export interface BuildSecondaryPricingOpts {
  input: ProjectInput;
  aggregate: EnsembleAggregate;
  /** Target country for the secondary pricing analysis (ISO-2). */
  country: string;
  /** Secondary country market profile — when present, the LLM grounds
   *  pricing in those competitor benchmarks / cultural notes. */
  secondaryProfile?: MarketProfile;
  locale: "ko" | "en";
}

export interface BuildSecondaryPricingResult {
  pricing?: SecondaryPricing;
  error?: string;
  inputTokens?: number;
  outputTokens?: number;
  costEstimateUsd?: number;
}

export async function buildSecondaryPricing(
  opts: BuildSecondaryPricingOpts,
): Promise<BuildSecondaryPricingResult> {
  const provider = getLLMProvider({ provider: "anthropic" });
  if (!provider) return { error: "anthropic provider unavailable" };

  const countryStats = opts.aggregate.countryStats?.find(
    (c) => c.country.toUpperCase() === opts.country.toUpperCase(),
  );
  const finalScore = countryStats?.finalScore;

  const primaryCurve = opts.aggregate.pricing?.curve ?? [];
  const primaryRec = opts.aggregate.pricing?.recommendedPriceCents;
  const profileBlock = opts.secondaryProfile
    ? buildProfileBlock(opts.secondaryProfile, opts.locale)
    : "(시장 분석 데이터 없음 — 페르소나 신호로 추론)";

  const baseDollars = (opts.input.basePriceCents / 100).toFixed(2);
  const currency = opts.input.currency;

  const system =
    opts.locale === "en"
      ? `You are a D2C pricing strategist. Given a SECONDARY (Top-2 tied) country's market profile and persona signal, produce a pricing analysis with the same shape as the primary country: recommended price, a conversion curve (8-15 price points), a margin estimate string, and a short rationale.

== Rules ==
- recommendedPriceCents: integer cents. Pick a single defensible point — psychological anchors are fine ($49.95 → 4995) but ground in competitor benchmarks when given.
- curve: 8-15 points spanning roughly 50% – 200% of the base price. Each point has priceCents (integer) and meanConversionProbability (0.0-1.0). The curve must be plausibly monotone-decreasing with some noise (not strictly monotonic).
- marginEstimate: one short prose line, e.g. "Estimated 42-48% gross margin at recommended price, factoring import duty and 3PL".
- marginEstimatePct: numeric gross margin percent at the recommended price (0-95).
- rationale: 1-2 sentences explaining the recommended price choice vs primary country.

Output VALID JSON only, no code fences:
{ "recommendedPriceCents": 4995, "curve": [{"priceCents": 2500, "meanConversionProbability": 0.42}, ...], "marginEstimate": "...", "marginEstimatePct": 45, "rationale": "..." }`
      : `당신은 D2C 가격 전략 전문가입니다. SECONDARY (Top-2 동등 후보) 국가의 시장 분석과 페르소나 시그널을 바탕으로, primary 국가와 동일한 shape의 가격 분석을 작성하세요: 권장 가격, 전환 곡선 (8~15 포인트), 마진 추정 문자열, 짧은 근거.

== 규칙 ==
- recommendedPriceCents: 정수 cents. 단일 방어 가능한 포인트 — 심리적 anchor ($49.95 → 4995) 허용하되 competitor 벤치마크가 주어지면 거기에 ground.
- curve: 8~15 포인트, 기본가의 약 50% ~ 200% 범위. 각 포인트 = priceCents (정수) + meanConversionProbability (0.0~1.0). 곡선은 그럴듯하게 단조감소 + 약간의 노이즈 (엄격히 monotonic 금지).
- marginEstimate: 짧은 한 줄 prose. 예: "권장 가격에서 예상 매출총이익률 42~48% (수입관세 + 3PL 비용 반영)".
- marginEstimatePct: 권장 가격에서의 매출총이익률 % (0~95).
- rationale: primary 국가 대비 권장 가격 선택 근거 1~2문장.

JSON으로만 응답, code fence 없이:
{ "recommendedPriceCents": 4995, "curve": [{"priceCents": 2500, "meanConversionProbability": 0.42}, ...], "marginEstimate": "...", "marginEstimatePct": 45, "rationale": "..." }`;

  const userPrompt = `== 워크스페이스 컨텍스트 ==
제품: ${opts.input.productName} (${opts.input.category})
설명: ${opts.input.description.slice(0, 600)}
(설명은 회사 자체 포지셔닝이라 과장이 섞일 수 있음 — 권장 가격은 페르소나 시그널·시장분석·경쟁 벤치마크로 도출하고, 설명의 "프리미엄·고급·혁신" 같은 프레이밍에 끌려가지 말 것.)
기본 가격: ${baseDollars} ${currency}
원산지: ${opts.input.originatingCountry}

== Secondary 타겟 국가: ${opts.country.toUpperCase()} ==

페르소나 시그널:
- 평균 점수: ${finalScore?.mean.toFixed(1) ?? "n/a"} (std ${finalScore?.std.toFixed(1) ?? "n/a"})

Primary 국가 권장가 (참고만 — secondary는 다를 수 있음):
${primaryRec ? `- $${(primaryRec / 100).toFixed(2)}` : "- n/a"}
${primaryCurve.length ? `- 곡선 포인트 ${primaryCurve.length}개, 첫 ${primaryCurve[0].priceCents}c~마지막 ${primaryCurve[primaryCurve.length - 1].priceCents}c` : ""}

== ${opts.country.toUpperCase()} 시장 분석 (있을 때) ==
${profileBlock}

이제 ${opts.country.toUpperCase()} 시장 권장 가격 + 전환 곡선 + 마진 추정을 JSON으로 작성하세요.`;

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

    const { recommendedPriceCents, curve, marginEstimate, marginEstimatePct, rationale } =
      validated.data;

    // Sort curve ascending by priceCents and de-dup near-identical
    // points (LLM occasionally emits two points within 1 cent).
    const sortedCurve = [...curve].sort((a, b) => a.priceCents - b.priceCents);
    const dedupedCurve: typeof sortedCurve = [];
    for (const p of sortedCurve) {
      const prev = dedupedCurve[dedupedCurve.length - 1];
      if (!prev || Math.abs(prev.priceCents - p.priceCents) > 5) {
        dedupedCurve.push(p);
      }
    }

    // Compute curve revenue max — same logic as primary
    // computeCurveRevenueMaxCents helper (without a circular import).
    let curveRevenueMaxCents: number | null = null;
    if (dedupedCurve.length >= 2) {
      let best = 0;
      let bestPrice = dedupedCurve[0].priceCents;
      for (const p of dedupedCurve) {
        const rev = p.priceCents * p.meanConversionProbability;
        if (rev > best) {
          best = rev;
          bestPrice = p.priceCents;
        }
      }
      curveRevenueMaxCents = bestPrice;
    }

    // Single-pass — no cross-sim spread. Use ±15% as the inferred
    // confidence band so the existing P25/P75 UI still has values.
    const p25 = Math.round(recommendedPriceCents * 0.85);
    const p75 = Math.round(recommendedPriceCents * 1.15);

    const inputTokens = res.usage?.inputTokens ?? 0;
    const outputTokens = res.usage?.outputTokens ?? 0;
    const cost =
      Math.round(((inputTokens / 1_000_000) * 3 + (outputTokens / 1_000_000) * 15) * 1000) / 1000;

    return {
      pricing: {
        recommendedPriceCents,
        recommendedPriceP25: p25,
        recommendedPriceP75: p75,
        marginEstimate,
        marginEstimatePct,
        curveRevenueMaxCents,
        rationale,
        curve: dedupedCurve.map((p) => ({
          priceCents: p.priceCents,
          meanConversionProbability: p.meanConversionProbability,
          sampleCount: 1, // single-pass — one LLM "sample" per point
        })),
      },
      inputTokens,
      outputTokens,
      costEstimateUsd: cost,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "internal_error" };
  }
}

function buildProfileBlock(profile: MarketProfile, locale: "ko" | "en"): string {
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

  const pricing = profile.pricingBenchmarks;
  if (pricing?.entryLevel || pricing?.mid || pricing?.premium) {
    lines.push(
      `Pricing benchmarks: entry ${pricing?.entryLevel ?? "n/a"}, mid ${pricing?.mid ?? "n/a"}, premium ${pricing?.premium ?? "n/a"}`,
    );
  }
  if (pricing?.yourPosition) lines.push(`Your position: ${pricing.yourPosition}`);

  const cult = profile.culturalNotes;
  if (cult?.purchaseBehavior) lines.push(`Purchase behavior: ${cult.purchaseBehavior.slice(0, 200)}`);

  const reg = profile.regulatory;
  if (reg?.barriers?.length) {
    lines.push(
      `Regulatory: ${reg.barriers.map((b: { name: string; severity: string }) => `${b.name}(${b.severity})`).join("; ")}`,
    );
  }
  void locale;
  return lines.length ? lines.join("\n") : "(no profile)";
}

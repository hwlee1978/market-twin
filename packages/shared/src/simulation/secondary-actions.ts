import { z } from "zod";
import { getLLMProvider } from "@/lib/llm";
import type { MarketProfile, ProjectInput } from "./schemas";
import type { EnsembleAggregate } from "./ensemble";

/**
 * Secondary-country action generator.
 *
 * When the orchestrator flags Top 2 (displayMode "top2" or
 * score-winner ≠ vote-winner), the primary mergedActions only cover
 * the winner. This module produces a parallel set of actions for the
 * runner-up country with the same shape (impact / effort /
 * surfacedInSims / specificity / actionCategory) so the existing
 * ActionsTab UI can render them with the same cards/matrix.
 *
 * Why a separate call instead of re-running the full ensemble
 * narrative: the ensemble pass is 6+ Sonnet calls (one per sim) and
 * costs ~$1-5; a single Sonnet pass with the same evidence pruned
 * to the secondary country is ~$0.10 and produces equivalent depth
 * for the runner-up's GTM actions.
 *
 * surfacedInSims is set to 0 on output (we don't have N independent
 * sim votes for the secondary), so the UI knows to label these
 * actions as "single LLM pass" rather than "cross-sim consensus".
 */

const ACTION_SCHEMA = z.object({
  action: z.string(),
  surfacedInSims: z.number().int().min(0).default(0),
  impact: z.number().int().min(1).max(3).optional(),
  effort: z.number().int().min(1).max(3).optional(),
  actionCategory: z.string().optional(),
});

const RESPONSE_SCHEMA = z.object({
  actions: z.array(ACTION_SCHEMA).min(3).max(10),
});

export type SecondaryAction = z.infer<typeof ACTION_SCHEMA>;

export interface BuildSecondaryActionsOpts {
  input: ProjectInput;
  aggregate: EnsembleAggregate;
  /** Target country for the secondary actions (ISO-2). */
  country: string;
  /** Optional secondary market profile — when present, the LLM grounds
   *  actions in those regulatory barriers / channel notes / cultural
   *  insights. Highly recommended. */
  secondaryProfile?: MarketProfile;
  locale: "ko" | "en";
}

export interface BuildSecondaryActionsResult {
  actions?: SecondaryAction[];
  error?: string;
  inputTokens?: number;
  outputTokens?: number;
  costEstimateUsd?: number;
}

export async function buildSecondaryActions(
  opts: BuildSecondaryActionsOpts,
): Promise<BuildSecondaryActionsResult> {
  const provider = getLLMProvider({ provider: "anthropic" });
  if (!provider) return { error: "anthropic provider unavailable" };

  // Pull country-specific stats from the aggregate so the LLM has
  // persona-level signal (top objections / trust factors / channel
  // mentions) to ground recommendations.
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
    ? buildProfileBlock(opts.secondaryProfile, opts.locale)
    : "(시장 분석 데이터 없음 — 가능한 만큼 페르소나 데이터로 추론)";

  const system =
    opts.locale === "en"
      ? `You are a D2C go-to-market strategist. Given a SECONDARY (Top-2 tied) country's persona signal and market profile, produce 5-8 concrete actions a Korean founder should take to enter or accelerate that market. Same depth and specificity as a primary recommendation.

== Rules ==
- Each action: one tight paragraph (80-200 chars) with (1) what to do, (2) which channel/platform/partner, (3) timing window (months), (4) measurable KPI.
- Reference real entities (Nordstrom, r/Sneakers, Wirecutter, Note.com, Ameba, 샤오훙슈 — whatever fits the country).
- Avoid generic advice ("build brand awareness"). Every action must name a vendor / publisher / channel / metric.
- impact: 1 (incremental polish) / 2 (meaningful channel or packaging choice) / 3 (pivotal — launch-defining).
- effort: 1 (days) / 2 (weeks) / 3 (months / new partner).
- actionCategory: short code (e.g. "channel_entry", "pr_seeding", "compliance", "pricing", "creative", "partnership").
- surfacedInSims: always 0 (these are single-pass secondary, not cross-sim).

Output VALID JSON only, no code fences:
{ "actions": [{ "action": "...", "impact": 2, "effort": 2, "actionCategory": "...", "surfacedInSims": 0 }] }`
      : `당신은 D2C 글로벌 진출 전략 전문가입니다. SECONDARY (Top 2 동등 후보) 국가의 페르소나 시그널과 시장 분석을 바탕으로, 한국 D2C 브랜드가 그 시장에 진입/가속할 수 있는 구체적 액션 5~8개를 작성하세요. Primary 추천과 동일한 깊이와 구체성.

== 규칙 ==
- 각 액션은 한 단락 (80~200자)에 (1) 무엇을 할지, (2) 어느 채널/플랫폼/파트너로, (3) 시점 (몇 월 / 몇 주차), (4) 측정 가능한 KPI 포함.
- 실제 채널/매체/플랫폼 명시 (예: Nordstrom, r/Sneakers, Wirecutter, Note.com, Ameba, 샤오훙슈, 무신사 JP — 국가별 적합한 것).
- 일반론 ("브랜드 인지도 구축") 절대 금지. 모든 액션은 vendor·publisher·채널·메트릭 이름 포함.
- impact: 1 (작음 — 마진성 개선) / 2 (의미 있음 — 채널·패키지 선택) / 3 (결정적 — launch 좌우).
- effort: 1 (며칠) / 2 (몇 주) / 3 (몇 달·신규 파트너).
- actionCategory: 짧은 코드 (예: "channel_entry", "pr_seeding", "compliance", "pricing", "creative", "partnership").
- surfacedInSims: 항상 0 (secondary는 single-pass — cross-sim 데이터 없음).

JSON으로만 응답, code fence 없이:
{ "actions": [{ "action": "...", "impact": 2, "effort": 2, "actionCategory": "...", "surfacedInSims": 0 }] }`;

  const userPrompt =
    opts.locale === "en"
      ? `== Workspace context ==
Product: ${opts.input.productName} (${opts.input.category})
Description: ${opts.input.description.slice(0, 600)}
(The description is the company's own positioning and may be exaggerated — derive actions from persona signals / market profile, and don't get pulled along by promotional framing.)
Price: ${opts.input.basePriceCents / 100} ${opts.input.currency}
Origin: ${opts.input.originatingCountry}

== Secondary target country: ${opts.country.toUpperCase()} ==

Persona signals:
- Mean score: ${finalScore?.mean.toFixed(1) ?? "n/a"} (std ${finalScore?.std.toFixed(1) ?? "n/a"})
- Top objections:
${topObjections.length ? topObjections.map((o) => `  · ${o}`).join("\n") : "  (none)"}
- Top trust factors:
${topTrustFactors.length ? topTrustFactors.map((t) => `  · ${t}`).join("\n") : "  (none)"}

== ${opts.country.toUpperCase()} market profile (if available) ==
${profileBlock}

Now write 5-8 ${opts.country.toUpperCase()} market entry/acceleration actions as JSON.`
      : `== 워크스페이스 컨텍스트 ==
제품: ${opts.input.productName} (${opts.input.category})
설명: ${opts.input.description.slice(0, 600)}
(설명은 회사 자체 포지셔닝이라 과장이 섞일 수 있음 — 액션은 페르소나 시그널·시장분석으로 도출하고, 설명의 홍보성 프레이밍에 끌려가지 말 것.)
가격: ${opts.input.basePriceCents / 100} ${opts.input.currency}
원산지: ${opts.input.originatingCountry}

== Secondary 타겟 국가: ${opts.country.toUpperCase()} ==

페르소나 시그널:
- 평균 점수: ${finalScore?.mean.toFixed(1) ?? "n/a"} (std ${finalScore?.std.toFixed(1) ?? "n/a"})
- 최상위 거부 요인:
${topObjections.length ? topObjections.map((o) => `  · ${o}`).join("\n") : "  (없음)"}
- 최상위 신뢰 요인:
${topTrustFactors.length ? topTrustFactors.map((t) => `  · ${t}`).join("\n") : "  (없음)"}

== ${opts.country.toUpperCase()} 시장 분석 (있을 때) ==
${profileBlock}

이제 ${opts.country.toUpperCase()} 시장 진출/가속 액션 5~8개를 JSON으로 작성하세요.`;

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
      actions: validated.data.actions,
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
  if (ms?.addressableSegment) lines.push(`Reach: ${ms.addressableSegment}`);

  const competitors = profile.competitors ?? [];
  if (competitors.length) {
    lines.push(
      `Competitors: ${competitors
        .slice(0, 5)
        .map((c: { name: string; threatLevel?: string }) => `${c.name}(${c.threatLevel ?? "?"})`)
        .join(", ")}`,
    );
  }

  const channels = profile.channels;
  if (channels?.primary?.length) {
    lines.push(`Primary channels: ${channels.primary.map((c: { name: string }) => c.name).join(", ")}`);
  }

  const reg = profile.regulatory;
  if (reg?.barriers?.length) {
    lines.push(
      `Regulatory: ${reg.barriers.map((b: { name: string; severity: string }) => `${b.name}(${b.severity})`).join("; ")}`,
    );
  }
  if (reg?.requirements?.length) {
    lines.push(`Requirements: ${reg.requirements.slice(0, 3).join("; ")}`);
  }

  const cult = profile.culturalNotes;
  if (cult?.purchaseBehavior) lines.push(`Purchase behavior: ${cult.purchaseBehavior.slice(0, 200)}`);

  const pricing = profile.pricingBenchmarks;
  if (pricing?.entryLevel || pricing?.mid || pricing?.premium) {
    lines.push(
      `Pricing benchmarks: entry ${pricing?.entryLevel ?? "n/a"}, mid ${pricing?.mid ?? "n/a"}, premium ${pricing?.premium ?? "n/a"}`,
    );
  }

  const gtm = profile.goToMarketStrategy;
  if (gtm?.keyMessage) lines.push(`GTM key message: ${gtm.keyMessage.slice(0, 200)}`);
  if (gtm?.differentiators?.length) {
    lines.push(`Differentiators: ${gtm.differentiators.slice(0, 4).join(" / ")}`);
  }
  if (gtm?.risks?.length) {
    lines.push(`GTM risks: ${gtm.risks.slice(0, 4).join(" / ")}`);
  }
  void locale;
  return lines.length ? lines.join("\n") : "(no profile)";
}

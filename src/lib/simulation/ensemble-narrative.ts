/**
 * LLM-driven merge of per-sim narrative outputs (overview / risks /
 * recommendations) into a single consensus narrative for the ensemble
 * report. Lives in its own module — and stays separate from the pure
 * `aggregateEnsemble` aggregator — because it needs an LLM call and
 * therefore must be async + tolerant of provider failure.
 *
 * Strategy: dedup risks and actions by *meaning* (not exact string),
 * count how many sims surfaced each one, return a ranked list. Single-
 * sim ensembles skip the LLM call and pass the per-sim narrative through
 * with surfacedInSims = 1 — wasting a $0.05 LLM call on one risk list
 * isn't worth it.
 */

import { z } from "zod";
import { COUNTRIES, getCountryLabel } from "@/lib/countries";
import { getLLMProvider } from "@/lib/llm";
import type {
  EnsembleSimSnapshot,
  EnsembleNarrative,
  CrossCountryDistribution,
} from "./ensemble";
import { categoryLabel } from "./taxonomy";
import { recountSurfacedInSims } from "./surfaced-recount";

const MERGED_RISK_SCHEMA = z.object({
  factor: z.string(),
  description: z.string(),
  severity: z.enum(["low", "medium", "high"]),
  surfacedInSims: z.number().int().min(1),
  /**
   * Scope tag emitted by the merge LLM. The merge prompt teaches the
   * model the three values + when each applies; the cross-country
   * distribution table is provided as the source of truth so the LLM
   * doesn't have to guess. Optional + lenient parse so a legacy or
   * confused output ("global", "all", "regional") doesn't drop the
   * whole risk.
   */
  scope: z
    .preprocess(
      (val) => {
        if (typeof val !== "string") return undefined;
        const s = val.trim().toLowerCase();
        if (s === "cross-market" || s === "cross_market" || s === "global") {
          return "cross-market";
        }
        if (
          s === "country-specific" ||
          s === "country_specific" ||
          s === "single-country" ||
          s === "single_country"
        ) {
          return "country-specific";
        }
        if (s === "narrow" || s === "select-market" || s === "regional") {
          return "narrow";
        }
        return undefined;
      },
      z.enum(["cross-market", "country-specific", "narrow"]).optional(),
    )
    .optional(),
  /** ISO country codes the risk materially applies to. Optional. */
  affectedCountries: z.array(z.string()).optional(),
  /**
   * Taxonomy code from the cross-country distribution table that this
   * risk maps to. Lets the renderer swap the sim-frequency meta line
   * for a persona-coverage metric pulled from the matrix. Lenient
   * parse: anything not a string just becomes undefined, and the
   * renderer falls back to surfacedInSims.
   */
  personaCategory: z.preprocess(
    (val) => (typeof val === "string" && val.trim() ? val.trim() : undefined),
    z.string().optional(),
  ),
});
/**
 * Concreteness audit on a single action. Computed heuristically post-LLM
 * (regex + keyword match) so we have a deterministic check on whether
 * the merge model actually followed the "be specific" rule. Fields are
 * booleans rather than a single score so the UI can show *why* an
 * action looks vague — e.g., "missing timeline".
 *
 * Scoring is plain count×25 (0/25/50/75/100). Below 50 = vague;
 * the UI surfaces a warning badge so users don't quote unactionable
 * "improve marketing in Japan"-style items.
 */
const ACTION_SPECIFICITY_SCHEMA = z.object({
  /** Mentions a specific channel/platform/medium (TikTok, Coupang, Naver Smart Store…). */
  hasChannel: z.boolean(),
  /** Contains a quantity — budget, %, count, units. */
  hasMetric: z.boolean(),
  /** Contains a deadline or time window (Q3, 30 days, by Aug…). */
  hasTimeline: z.boolean(),
  /** Names a measurable outcome (CTR, conversion, NPS, GMV…). */
  hasMeasurable: z.boolean(),
  /** Sum × 25 → 0/25/50/75/100. Convenience for UI sort and threshold display. */
  score: z.number().int().min(0).max(100),
});
export type ActionSpecificity = z.infer<typeof ACTION_SPECIFICITY_SCHEMA>;

const MERGED_ACTION_SCHEMA = z.object({
  action: z.string(),
  surfacedInSims: z.number().int().min(1),
  /**
   * Estimated revenue/positioning impact. 1 = small (incremental
   * polish), 2 = meaningful (channel choice, packaging), 3 = pivotal
   * (kills/saves the launch). Scored by the merge LLM at synthesis
   * time; falls back to 2 (medium) when the field is missing on
   * legacy narratives.
   */
  impact: z.number().int().min(1).max(3).optional(),
  /**
   * Implementation effort. 1 = days, 2 = weeks, 3 = months/needs new
   * partner. Used together with impact to bucket actions on the
   * Quick-Wins / Strategic / Marginal / Avoid 2x2 matrix.
   */
  effort: z.number().int().min(1).max(3).optional(),
  /**
   * Heuristic concreteness audit, attached post-merge. Optional because
   * legacy ensembles predate the audit; UI hides the badge when absent.
   */
  specificity: ACTION_SPECIFICITY_SCHEMA.optional(),
});
const MERGE_RESPONSE_SCHEMA = z.object({
  hotTake: z.string().max(200).optional(),
  executiveSummary: z.string(),
  mergedRisks: z.array(MERGED_RISK_SCHEMA).max(12),
  mergedActions: z.array(MERGED_ACTION_SCHEMA).max(10),
});

export interface MergeNarrativeOpts {
  snapshots: EnsembleSimSnapshot[];
  productName: string;
  bestCountry: string;
  consensusPercent: number;
  locale: "ko" | "en";
  /**
   * Cross-country category distribution computed by the deterministic
   * aggregator. Injected into the merge prompt as a reference table so
   * the LLM (a) tags risks with the right `scope` and (b) cites only
   * aggregator-computed counts instead of inventing "X명 중 Y명". When
   * absent (legacy snapshots without categorized arrays), the prompt
   * falls back to its old behavior.
   */
  crossCountryDistribution?: CrossCountryDistribution;
  /**
   * Candidate countries the project targets. Used by the prompt to
   * tell the LLM how many markets a "cross-market" risk should
   * implicitly apply to, even if the matrix only lists countries with
   * non-zero category counts.
   */
  candidateCountries?: string[];
}

export async function mergeNarrative(
  opts: MergeNarrativeOpts,
): Promise<EnsembleNarrative | undefined> {
  const allSims = opts.snapshots.filter(
    (s) => s.overview || s.risks || s.recommendations,
  );
  if (allSims.length === 0) return undefined;

  // Country-aligned filter — feed the merge step only sims whose own
  // bestCountry matches the ensemble's recommended country. Otherwise
  // the merged action / risk lists conflate plans for the WEAK-consensus
  // winner with plans for the runners-up, producing the nonsensical
  // "추천국 SG / 1순위 액션 = ZOZOTOWN 대만 입점" the user reported on
  // 2026-05-09. Falls back to the full pool when:
  //   - bestCountry isn't set (legacy / single-sim path handled below)
  //   - no aligned sim has narrative content (LLM bailed on synthesis)
  // so we always have at least something to merge.
  const recCountry = opts.bestCountry?.toUpperCase();
  const alignedSims = recCountry
    ? allSims.filter(
        (s) => (s.bestCountry ?? "").toUpperCase() === recCountry,
      )
    : [];
  const sims = alignedSims.length > 0 ? alignedSims : allSims;
  if (alignedSims.length > 0 && alignedSims.length < allSims.length) {
    console.log(
      `[ensemble narrative] filtered ${alignedSims.length}/${allSims.length} sims to bestCountry=${recCountry} for action/risk merge`,
    );
  }

  // Single-sim trivial path: nothing to merge, just promote the per-sim
  // narrative directly. Saves a redundant LLM call on hypothesis tier.
  if (sims.length === 1) {
    const s = sims[0];
    return {
      executiveSummary: s.overview?.headline ?? s.recommendations?.executiveSummary ?? "",
      mergedRisks: (s.risks ?? []).map((r) => ({
        factor: r.factor,
        description: r.description,
        severity: r.severity,
        surfacedInSims: 1,
      })),
      mergedActions: (s.recommendations?.actionPlan ?? []).map((action) => ({
        action,
        surfacedInSims: 1,
        specificity: assessActionSpecificity(action),
      })),
      overallRiskLevel: s.overview?.riskLevel ?? "medium",
    };
  }

  const overallRiskLevel = modeRiskLevel(sims);
  const totalPersonas = sims.reduce((sum, s) => sum + (s.personas?.length ?? 0), 0);
  const perSimPersonas = sims[0]?.personas?.length ?? 0;
  const prompt = buildMergePrompt(opts, sims, overallRiskLevel);

  // Synthesis-tier model — same one that produced the per-sim summaries.
  // Default provider chain (anthropic/openai/gemini env-driven) handles
  // it; we don't pin to a specific provider here since the merge isn't
  // part of the cross-model diversity story.
  const llm = getLLMProvider({ stage: "synthesis" });
  try {
    const t0 = Date.now();
    const res = await llm.generate({
      prompt,
      jsonSchema: zodToJsonShape(),
      temperature: 0.3,
      maxTokens: 4096,
    });
    const parsed = MERGE_RESPONSE_SCHEMA.safeParse(res.json);
    if (!parsed.success) {
      console.warn("[ensemble narrative] merge response failed schema validation:", parsed.error.flatten());
      return narrativeFromRawSnapshots(sims, overallRiskLevel);
    }
    console.log(
      `[ensemble narrative] merged ${sims.length} sims · ${parsed.data.mergedRisks.length} risks · ${parsed.data.mergedActions.length} actions · ${Date.now() - t0}ms`,
    );

    // Algorithmic surfacedInSims recount — the merge LLM consistently
    // under-counts (collapses items semantically but assigns
    // surfacedInSims=1 even when 4-5 sims independently surfaced the
    // same root cause). We don't trust its count: walk each merged
    // text and Jaccard-match against every per-sim raw item to compute
    // the true cross-sim support count.
    const perSimActionPlans: string[][] = sims.map(
      (s) => s.recommendations?.actionPlan ?? [],
    );
    const perSimRiskTexts: string[][] = sims.map((s) =>
      (s.risks ?? []).map((r) => `${r.factor} ${r.description}`),
    );

    const mergedRisks = parsed.data.mergedRisks.map((r) => {
      const merged = `${r.factor} ${r.description}`;
      const recount = recountSurfacedInSims(merged, perSimRiskTexts);
      if (recount !== r.surfacedInSims) {
        console.log(
          `[ensemble narrative] risk recount: LLM said ${r.surfacedInSims}, algorithm says ${recount} — using ${recount} ("${r.factor.slice(0, 40)}")`,
        );
      }
      // Strip hallucinated "N명 중 M명" / "N persona of M" count
      // citations the merge LLM tends to copy from per-sim outputs.
      // Per-sim risks reference 200-persona pools; the merged narrative
      // must reference the ensemble pool. The LLM is told this in the
      // prompt but ignores it 30%+ of the time, so we belt-and-braces
      // by deleting the offending phrase.
      const description = stripHallucinatedCounts(
        rewriteSimScaleReferences(r.description, perSimPersonas, totalPersonas),
      );
      return {
        ...r,
        description,
        surfacedInSims: recount,
        scope: r.scope,
        affectedCountries: r.affectedCountries,
        personaCategory: r.personaCategory,
      };
    });
    const mergedActions = parsed.data.mergedActions.map((a) => {
      const rewritten = rewriteSimScaleReferences(a.action, perSimPersonas, totalPersonas);
      const recount = recountSurfacedInSims(a.action, perSimActionPlans);
      if (recount !== a.surfacedInSims) {
        console.log(
          `[ensemble narrative] action recount: LLM said ${a.surfacedInSims}, algorithm says ${recount} — using ${recount} ("${a.action.slice(0, 40)}")`,
        );
      }
      return {
        ...a,
        action: rewritten,
        impact: a.impact,
        effort: a.effort,
        specificity: assessActionSpecificity(rewritten),
        surfacedInSims: recount,
      };
    });

    // Validate hotTake / executiveSummary against the recommended
    // country. The merge LLM occasionally hallucinates a country
    // mention that contradicts bestCountry — we saw "영국 시장은 ...
    // 최적의 선택" rendered above a key-finding line that read
    // "프랑스 진출이 합의 우위 (80% / STRONG)". When the narrative
    // names the WRONG country, drop it rather than ship the
    // contradiction; the rest of the report (per-country charts,
    // recommendation card, key findings) carries the correct signal.
    const hotTakeRewritten = parsed.data.hotTake
      ? rewriteSimScaleReferences(
          parsed.data.hotTake,
          perSimPersonas,
          totalPersonas,
        )
      : undefined;
    const execSummaryRewritten = rewriteSimScaleReferences(
      parsed.data.executiveSummary,
      perSimPersonas,
      totalPersonas,
    );
    const hotTakeOk =
      !hotTakeRewritten ||
      narrativeMatchesRecommendedCountry(
        hotTakeRewritten,
        opts.bestCountry,
        opts.locale,
      );
    const execSummaryOk = narrativeMatchesRecommendedCountry(
      execSummaryRewritten,
      opts.bestCountry,
      opts.locale,
    );
    if (!hotTakeOk) {
      console.warn(
        `[ensemble narrative] hotTake mentions wrong country (expected ${opts.bestCountry}); dropping. Original: "${hotTakeRewritten?.slice(0, 100)}"`,
      );
    }
    if (!execSummaryOk) {
      console.warn(
        `[ensemble narrative] executiveSummary mentions wrong country (expected ${opts.bestCountry}); replacing with safe template. Original: "${execSummaryRewritten.slice(0, 100)}"`,
      );
    }

    return {
      hotTake: hotTakeOk ? hotTakeRewritten : undefined,
      // When the LLM-emitted summary names the wrong country, swap it
      // for a template referencing the actual bestCountry. Leaving the
      // contradicting prose ("싱가포르를 1차 교두보..." above a key
      // finding that says "대만 진출이 합의 우위") is more confusing
      // than a brief safe summary; the surrounding charts + key
      // findings carry the detail anyway.
      executiveSummary: execSummaryOk
        ? execSummaryRewritten
        : safeExecutiveSummary(
            opts.bestCountry,
            opts.consensusPercent,
            opts.locale,
          ),
      mergedRisks,
      mergedActions,
      overallRiskLevel,
    };
  } catch (err) {
    // Don't let narrative merge failure kill the whole ensemble — the
    // chart sections are still useful on their own. Fall back to a
    // dumb per-sim merge so the report at least shows something.
    console.warn(`[ensemble narrative] merge LLM call failed, falling back to raw:`, err);
    return narrativeFromRawSnapshots(sims, overallRiskLevel);
  }
}

/**
 * Returns true when narrative prose either mentions the recommended
 * country (by code or label) or doesn't mention any country at all.
 * Returns false when prose names a DIFFERENT country than the
 * aggregate's bestCountry — that's the contradiction case worth
 * dropping (we caught the merge LLM saying "영국 시장은 ... 최적의
 * 선택" while bestCountry was FR).
 *
 * Detection is heuristic — we look for any candidate country code or
 * its KO/EN label as a whole word. False positives are tolerable
 * (some country labels are short Latin words) because the only
 * downside is dropping a hot take that turned out to be fine; the
 * UI's recommendation card carries the actual signal regardless.
 */
function narrativeMatchesRecommendedCountry(
  text: string,
  bestCountry: string,
  locale: "ko" | "en",
): boolean {
  if (!text) return true;
  const expected = bestCountry.toUpperCase();
  // Build the set of "wrong country" markers — every country except
  // the recommended one, both code + locale label.
  const wrongTokens: string[] = [];
  for (const c of COUNTRIES) {
    if (c.code === expected) continue;
    wrongTokens.push(c.code);
    wrongTokens.push(c.labelKo);
    wrongTokens.push(c.labelEn);
  }
  // Right tokens — expected country's code, KO label, EN label, plus a
  // localized helper if locale is provided.
  const rightTokens = [
    expected,
    getCountryLabel(expected, "ko"),
    getCountryLabel(expected, "en"),
    getCountryLabel(expected, locale),
  ].filter((s): s is string => !!s);

  const lower = text.toLowerCase();
  const mentionsRight = rightTokens.some((t) =>
    lower.includes(t.toLowerCase()),
  );
  if (mentionsRight) return true;
  // No right-country mention. Now check whether any wrong country
  // appears — if so, that's a contradiction. If neither right nor
  // wrong country appears, the prose is country-neutral and fine.
  const mentionsWrong = wrongTokens.some(
    (t) => t.length >= 2 && lower.includes(t.toLowerCase()),
  );
  return !mentionsWrong;
}

/**
 * Fallback executive summary when the LLM-emitted version named a
 * different country than the aggregate's bestCountry. Keeps the
 * section non-empty (the UI expects prose here) while avoiding the
 * contradiction the original wording would have rendered.
 */
function safeExecutiveSummary(
  bestCountry: string,
  consensusPercent: number,
  locale: "ko" | "en",
): string {
  const label = getCountryLabel(bestCountry, locale) || bestCountry;
  return locale === "ko"
    ? `${label} 진출이 ${consensusPercent}% 합의로 가장 유력합니다. 자세한 근거 — 시뮬 간 점수 분포, 페르소나 거부·신뢰 요인, 권장 액션 — 은 아래 섹션을 참고하세요.`
    : `${label} is the strongest pick at ${consensusPercent}% consensus. See the per-country score distribution, persona objections / trust factors, and recommended actions below for the underlying rationale.`;
}

function modeRiskLevel(sims: EnsembleSimSnapshot[]): "low" | "medium" | "high" {
  const counts: Record<string, number> = { low: 0, medium: 0, high: 0 };
  for (const s of sims) {
    const r = s.overview?.riskLevel;
    if (r) counts[r] = (counts[r] ?? 0) + 1;
  }
  // Tie-break upward — a deep ensemble with 50/50 medium/high should err
  // on the side of caution for risk surfacing.
  if (counts.high >= counts.medium && counts.high >= counts.low) return "high";
  if (counts.medium >= counts.low) return "medium";
  return "low";
}

function buildMergePrompt(
  opts: MergeNarrativeOpts,
  sims: EnsembleSimSnapshot[],
  overallRiskLevel: "low" | "medium" | "high",
): string {
  const isKo = opts.locale === "ko";
  // Total persona pool across the ensemble. Per-sim narratives reference
  // each sim's 200-persona pool ("89명, 전체 200명 중 44.5%"); the merged
  // narrative needs to be rewritten to either the ensemble total or to
  // percentage-only so the reader doesn't see "200명 중" on a 3000-persona
  // run. We pass this total into the prompt and add an explicit rewrite
  // rule below.
  const totalPersonas = sims.reduce((sum, s) => sum + (s.personas?.length ?? 0), 0);
  const perSimPersonas = sims[0]?.personas?.length ?? 0;

  const intro = isKo
    ? `${sims.length}개 독립 시뮬레이션의 결과를 통합 분석하세요. 같은 의미의 리스크/액션은 하나로 합치고 빈도(surfacedInSims)를 표기하세요. 모든 출력은 한국어로 작성하세요.`
    : `Synthesize ${sims.length} independent simulation results into one consensus narrative. Collapse semantically equivalent risks/actions into single entries with a frequency count (surfacedInSims). Write everything in English.`;

  const productLine = isKo
    ? `제품: ${opts.productName} · 추천 진출국: ${opts.bestCountry} (합의도 ${opts.consensusPercent}%)`
    : `Product: ${opts.productName} · Recommended market: ${opts.bestCountry} (consensus ${opts.consensusPercent}%)`;

  const scaleLine = isKo
    ? `규모: 총 ${totalPersonas.toLocaleString()}명 페르소나 (시뮬당 약 ${perSimPersonas}명 × ${sims.length}회).`
    : `Scale: ${totalPersonas.toLocaleString()} total personas (~${perSimPersonas} per sim × ${sims.length} sims).`;

  const riskLevelLine = isKo
    ? `종합 리스크 수준: ${overallRiskLevel.toUpperCase()} (per-sim 다수결 기준)`
    : `Overall risk level: ${overallRiskLevel.toUpperCase()} (mode of per-sim values)`;

  const simBlocks = sims
    .map((s, i) => {
      const provider = s.provider ? `[${s.provider}] ` : "";
      const headline = s.overview?.headline ?? "";
      const summary = s.recommendations?.executiveSummary ?? "";
      const risks = (s.risks ?? [])
        .map((r) => `  - [${r.severity}] ${r.factor}: ${r.description}`)
        .join("\n");
      const actions = (s.recommendations?.actionPlan ?? [])
        .map((a) => `  - ${a}`)
        .join("\n");
      return [
        `## Sim ${i + 1} ${provider}(best=${s.bestCountry ?? "?"})`,
        headline && `Headline: ${headline}`,
        summary && `Summary: ${summary}`,
        risks && `Risks:\n${risks}`,
        actions && `Actions:\n${actions}`,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

  const guidance = isKo
    ? `통합 결과 작성 지침:

0. **hotTake (필수, 최대 120자)**: "30초 핫테이크" — 분석 전체에서 가장 도발적이고 의사결정 가능한 한 줄 발견을 한국어로 작성. **점수가 아닌 액션**을 말하세요. 권장 진출 / 진출 회피 / 가격 재조정 / 채널 전략 등 명확한 결정을 한 줄에.
   ⚠ **국가 일치 (절대 위반 불가)**: 추천 진출국은 **${opts.bestCountry}**입니다. hotTake에서 다른 국가를 "최적", "1순위", "권장"으로 지칭하지 마세요 — sim 데이터의 합의는 ${opts.bestCountry}이고, 핫테이크는 그 합의를 요약하는 것이지 뒤집는 것이 아닙니다. 다른 국가를 언급해야 한다면 "차순위", "대안", "단, X는 별도 검토 가치"의 보조 framing만 허용.
   형식 예:
   - "❌ 미국 진출 보류 — 페르소나 73%가 가격 거부, CAC 흑자전환 8개월 이상 소요"
   - "🔥 베트남이 진짜다 — H&B 채널 미점유 + Z세대 매운맛 트렌드 동시 기회"
   - "⚠ 일본 진출은 가능하나 가격 -20% 필수 — 그렇지 않으면 Maruchan에 잠식"
   - "✓ 5개국 모두 STRONG — 다 가도 됨, US부터 시작해 6개월 후 확장"
   필수 요소: (a) 이모지 1개로 톤 시그널, (b) 명사 + 동사로 결정 표현, (c) — 뒤에 핵심 이유 1-2개 (숫자 포함). 미사여구 금지. 보고서 톤이 아닌 카톡 메시지 톤.

1. **executiveSummary**: 모든 시뮬의 합의 narrative를 2-4문장으로 통합. 추천 진출국 + 이유 + 핵심 우려사항을 포함. hotTake와 중복되지 않게 더 자세히.
   ⚠ **국가 일치 (절대 위반 불가)**: 추천 진출국은 **${opts.bestCountry}**입니다. executiveSummary에서 다른 국가를 "1차 교두보", "1순위", "최적", "권장 진출국"으로 단언하지 마세요. 합의는 ${opts.bestCountry}이고 이 섹션은 그 합의를 풀어쓰는 것이지 뒤집는 게 아닙니다. 대안 시장 언급은 "차순위로는 X도 검토 가능"의 보조 framing만 허용.

2. **mergedRisks**: 의미가 같은 리스크는 합치되, **구체성을 우선시하세요**. 같은 원인을 다룬 두 리스크가 있을 때:
   - 더 구체적이고 측정 가능한 쪽 (예: "Amazon US 미입점으로 첫 90일 매출 55% 손실")을 채택
   - 추상적인 쪽 (예: "유통 채널 리스크")은 버리거나, 구체적 표현으로 다시 쓰기
   - 합쳐진 description은 가장 자세한 sim의 표현을 기반으로 하되, 다른 sim에서 추가된 구체적 데이터(숫자, 페르소나 인용)가 있으면 통합
   - surfacedInSims는 의미적으로 같은 리스크를 언급한 sim 수
   - 정렬: severity (high > medium > low) → surfacedInSims 내림차순. 단순 frequency만으로 정렬하지 말 것.
   - 최대 12개. 추상적/일반론적 리스크는 제외 (예: "규제 리스크", "경쟁 강도" 같은 카테고리만 있는 항목).

   ⚠ **합치기 기준 (필수, under-merge 방지)**: 표면 표현이 달라도 **근본 원인(root cause)이 같으면 반드시 합쳐**. 같은 ${sims.length}개 sim이 같은 제품/시장을 분석했으면 4-8개 root cause로 수렴하는 게 정상이고, 거의 모든 항목이 surfacedInSims=1이면 under-merge한 것. 합쳐야 하는 예시:
     - "Amazon US 미입점" + "Amazon 채널 부재" + "DTC-only 모델로 Amazon 검색 노출 불가" → 모두 동일 root cause(US Amazon 채널 갭) → 1개, surfacedInSims=3
     - "리뷰 부족" + "Vine 프로그램 필요" + "초기 review velocity 부족" → 동일 root cause(리뷰 acquisition) → 1개
     - "FDA health-claim 위반 위험" + "심혈관 효과 마케팅 금지" + "polyphenol 효능 표현 규제" → 동일 root cause(health-claim 규제) → 1개
   📊 **Self-check**: 출력 후, mergedRisks 중 surfacedInSims=1인 비율이 ${sims.length >= 5 ? "60%" : "전체"} 이상이면 다시 검토해 의미적 중복을 더 찾으세요. ${sims.length}개 독립 sim이 동일 제품/시장에서 모두 서로 다른 root cause만 surface하는 건 비정상입니다.

3. **mergedActions**: 의미가 같은 액션은 합치되 **실행 가능한 구체성**을 우선시. 같은 의도의 두 액션 중 더 명확한 채널/타임라인/숫자를 가진 쪽을 채택. surfacedInSims 기록. 정렬: 권장 빈도 + 실행 우선순위. 최대 10개.

   ⚠ **합치기 mandate (anti-under-merge)**: 표현이 다르더라도 **같은 결과를 노리는 두 액션은 반드시 합쳐**. ${sims.length}개 sim이 같은 시장을 보고 있으면 4-7개의 큰 액션 줄기로 수렴이 정상이고, 거의 모든 항목이 surfacedInSims=1이면 under-merge한 것. 합쳐야 하는 예시:
     - "Amazon Vine 프로그램 활용해 30개 리뷰 확보" + "Vine 프로그램 + 초기 review acquisition 캠페인" + "리뷰 200개까지 review velocity 빌드업" → 같은 액션 줄기 (review acquisition) → 1개로 합치고 surfacedInSims=3
     - "FDA 식품시설 등록 + 통관 broker 계약" + "Q4 출시 전 import pathway 확보" → 같은 액션 줄기 (US import readiness) → 1개
     - "Instagram 인플루언서 30명 시딩 + 어필리에이트" + "TikTok 푸드 크리에이터 활용" + "20-200K follower 크리에이터 gifting" → 같은 줄기 (creator-led 미국 awareness) → 1개

   ⚠ **구체성 4요소 강제 (가능한 모두 포함)**: 각 액션은 다음 4가지를 가능하면 모두 포함하도록 다시 쓰세요. 원본 sim 결과에 정보가 있으면 그대로 가져오고, 없으면 다른 sim에서 보완. 4가지 모두 없으면 액션 자체를 버리고 더 구체적인 다른 항목으로 교체:
     (a) **채널/플랫폼/매체**: 쿠팡, 네이버 스마트스토어, 올리브영, TikTok 등 — 추상적 "디지털 마케팅"이 아닌 구체적 이름
     (b) **숫자**: 예산 (만원/USD), 비율 (%), 수량 (회/건/명), 임팩트 추정치 — 적어도 하나
     (c) **타임라인**: D+30, Q3, 90일 이내, 출시 전 8주 등 — 명확한 기한
     (d) **측정 가능 결과**: 전환율, GMV, CAC, 재구매율 등 추적할 KPI
   ❌ 거절: "일본에서 마케팅 강화", "현지화 개선", "브랜딩 차별화" 같은 추상 명령어. 이런 항목은 더 구체적인 액션으로 다시 쓰거나 빼세요. 사용자는 이걸 보고 다음주에 무엇을 할지 결정합니다 — "마케팅 강화하자"로는 결정이 안 됩니다.

   **각 액션마다 impact + effort 점수 부여 (필수)**:
   - **impact** (1-3): 1=점진적 개선 (포장 카피 미세조정 등), 2=의미 있는 차이 (채널 추가, 가격 5-10% 조정), 3=출시 자체를 좌우 (FDA 인증, 주력 채널 결정, 가격 ±20%+).
   - **effort** (1-3): 1=며칠 내 (콘텐츠 작성, A/B 테스트), 2=몇 주 (파트너 미팅, 패키지 재디자인), 3=수개월 또는 신규 파트너 필요 (인증, 유통망 신규 구축).
   - 두 점수 모두 정수. 모호한 액션이면 둘 다 2 (medium)로.
   - 사용자는 이 점수로 액션을 Quick-Wins (impact↑ effort↓) / Strategic (둘 다 ↑) / Marginal (둘 다 ↓) / Avoid (impact↓ effort↑) 4사분면에 배치합니다.

   ⚠ **점수에 variance 강제 (필수)**: 모든 액션을 effort=2, impact=2로 똑같이 매기는 건 lazy default — 실제로 액션 plan은 "당장 할 일 (며칠)" + "이번 분기 일 (몇 주)" + "장기 결정 (몇 개월)"이 섞여 있어야 자연스럽습니다.
     • 액션 ${Math.max(3, Math.ceil(0.3 * 10))}개 이상이면 **최소 1개의 effort=1 (Quick Win)**과 **최소 1개의 effort=3 (Strategic / 장기)**을 포함시키세요.
     • 액션 텍스트에 "즉시", "출시 후 30일", "다음 달", "next week"가 있으면 effort=1 가능성 큼.
     • 액션 텍스트에 "수개월", "Q3-Q4", "2027 상반기", "인증 취득"이 있으면 effort=3 가능성 큼.
     • impact도 마찬가지로 분산 — 모든 액션이 똑같이 "중요"한 plan은 plan이 아닙니다. 1개 정도는 결정적(3), 1-2개는 경미한 polish(1)로.

4. **숫자 표현 규칙 (필수)**: per-sim 출력의 숫자는 시뮬당 ${perSimPersonas}명 풀 기준입니다. 통합 narrative는 전체 ${totalPersonas.toLocaleString()}명 풀 기준으로 작성해야 합니다.
   - "X명, 전체 ${perSimPersonas}명 중 Y%" 같은 표현은 절대 그대로 옮기지 마세요.
   - 비율(Y%)만 유지하거나, 전체 풀로 환산해 다시 쓰세요. 예) "전체 페르소나의 44.5%" 또는 "${totalPersonas.toLocaleString()}명 중 약 ${Math.round(totalPersonas * 0.445).toLocaleString()}명 (44.5%)"
   - "200명 중", "out of 200" 같은 sim-level 카운트가 보이면 반드시 percentage-only로 바꾸거나 ensemble 총합으로 환산하세요.`
    : `Output guidance:

0. **hotTake (required, max 120 chars)**: A "30-second hot take" — the most provocative, action-oriented finding in one English sentence. **Talk action, not score.** Examples:
   - "❌ Skip US — 73% reject the price, CAC payback >8 mo"
   - "🔥 Vietnam is the play — uncrowded H&B channel + Gen-Z spice trend"
   - "⚠ Japan works only at -20% price — otherwise Maruchan eats your share"
   - "✓ All 5 markets STRONG — go everywhere, lead with US"
   Must have: (a) one emoji for tone, (b) noun-verb decision phrasing, (c) "—" then the 1-2 key reasons with numbers. No fluff. Sound like a Slack DM, not a consulting deck.

1. **executiveSummary**: 2-4 sentence consensus across all sims. Cover the recommended market, why, and the central concern. Distinct from hotTake — go deeper.

2. **mergedRisks**: collapse semantic duplicates, but **prefer specific over generic**. When two risks point at the same cause:
   - Keep the more concrete + quantified version ("Amazon US absence costs 55% of first-90-day revenue") over the abstract one ("distribution channel risk").
   - Discard or rewrite vague/category-only risks like "regulatory risk" or "competition intensity".
   - Build the merged description from the most-detailed sim's wording; fold in concrete numbers / persona quotes from other sims when present.
   - surfacedInSims = number of sims that mentioned a semantically equivalent risk.
   - Sort by severity (high > medium > low), then surfacedInSims descending. Do not rank by frequency alone.
   - Max 12. Drop entries that are pure category labels with no specific cause.

   ⚠ **Aggressive merging required (anti-under-merge)**: surface wording differs but **same root cause → must merge**. With ${sims.length} sims analysing the same product/market, expect 4-8 root causes; if nearly every output has surfacedInSims=1, you under-merged. Examples that MUST collapse:
     - "Amazon US absence" + "No Amazon presence" + "DTC-only model can't reach Amazon search" → same root cause (US Amazon channel gap) → 1 entry, surfacedInSims=3
     - "Lack of reviews" + "Need Vine program" + "Early review velocity gap" → same root cause (review acquisition) → 1 entry
     - "FDA health-claim violation risk" + "Cannot market cardiovascular benefits" + "Polyphenol efficacy claims regulated" → same root cause (health-claim regulation) → 1 entry
   📊 **Self-check**: after generating mergedRisks, if more than ${sims.length >= 5 ? "60%" : "all"} of entries have surfacedInSims=1, re-examine for missed semantic duplicates. Independent sims of the same product/market do not produce 12 unique root causes — that's a merge failure, not real diversity.

3. **mergedActions**: collapse semantic duplicates, prefer the action with the most actionable specificity (concrete channel / timeline / numbers). Set surfacedInSims to count. Sort by frequency + execution priority. Max 10.

   ⚠ **Aggressive merging mandate (anti-under-merge)**: different wording but **same outcome → must merge**. With ${sims.length} sims targeting the same market, expect 4-7 major action streams; if nearly every output has surfacedInSims=1, you under-merged. Examples that MUST collapse:
     - "Use Amazon Vine to secure 30 reviews" + "Vine program + early review-acquisition push" + "Build review velocity to 200" → same stream (review acquisition) → 1 entry, surfacedInSims=3
     - "FDA food-facility registration + customs broker engagement" + "Lock import pathway before Q4 launch" → same stream (US import readiness) → 1 entry
     - "Seed 30 Instagram creators + affiliate program" + "TikTok food creator activation" + "Gift 20-200K-follower creators with COA card" → same stream (creator-led US awareness) → 1 entry

   ⚠ **Concreteness — every action SHOULD ideally contain all 4 of**: rewrite each action so it includes as many of the four as possible. Pull data from the source sim's outputs; cross-reference other sims to fill gaps. If none of the four are present, drop the action and surface a more specific one instead:
     (a) **channel/platform/medium**: a named one — Coupang, Naver Smart Store, Olive Young, TikTok, Amazon — NOT abstract "digital marketing"
     (b) **a number**: budget (KRW / USD), percent, count, target uplift — at least one quantitative anchor
     (c) **timeline**: D+30, Q3, within 90 days, 8 weeks before launch — explicit horizon
     (d) **measurable outcome**: conversion rate, GMV, CAC, repeat-purchase rate — a KPI that can be tracked
   ❌ Reject: "strengthen Japan marketing", "improve localisation", "differentiate branding". Rewrite or drop. The user reads this list to decide what to do next week — "strengthen marketing" doesn't survive that test.

   **Required: score impact + effort per action**:
   - **impact** (1-3): 1=incremental polish (caption tweak), 2=meaningful change (added channel, ±5-10% price), 3=launch-defining (FDA cert, pivotal channel choice, ±20%+ price).
   - **effort** (1-3): 1=days (content, A/B test), 2=weeks (partner meeting, package redesign), 3=months or needs new partner (certification, building new distribution).
   - Both integers. Use 2 (medium) for ambiguous calls.
   - Users will plot actions on a Quick-Wins (impact↑ effort↓) / Strategic (both↑) / Marginal (both↓) / Avoid (impact↓ effort↑) 2x2.

   ⚠ **Force variance in the scores**: rating every action effort=2 / impact=2 is a lazy default — a real action plan mixes "do this week" + "do this quarter" + "long-term bet". Distribute accordingly:
     • With 3+ actions, include **at least one effort=1 (Quick Win)** and **at least one effort=3 (Strategic / long-term)**.
     • Cues for effort=1: "immediately", "within 30 days", "next week", "A/B test now".
     • Cues for effort=3: "months", "Q3-Q4", "first half 2027", "obtain certification".
     • Same with impact — at least one action should be 3 (launch-defining) and 1-2 should be 1 (minor polish).

4. **Number-rewrite rule (mandatory)**: per-sim outputs reference each sim's ${perSimPersonas}-persona pool. The merged narrative must reference the ensemble-wide pool of ${totalPersonas.toLocaleString()}.
   - Never copy phrases like "X out of ${perSimPersonas}" or "Y, ${perSimPersonas}명 중" verbatim.
   - Either keep percentages only, or rescale the absolute count to the full pool. Example: "44.5% of all personas" or "${Math.round(totalPersonas * 0.445).toLocaleString()} of ${totalPersonas.toLocaleString()} personas (44.5%)".
   - If you see any "out of 200", "200명 중", or similar sim-level counts, rewrite to percentage-only or ensemble total.`;

  const distributionBlock = formatCrossCountryDistribution(
    opts.crossCountryDistribution,
    opts.candidateCountries ?? [],
    isKo,
  );

  const sections = [
    intro,
    productLine,
    scaleLine,
    riskLevelLine,
    "",
    "## Per-sim outputs",
    simBlocks,
  ];
  if (distributionBlock) {
    sections.push("", distributionBlock);
  }
  sections.push("", guidance);
  return sections.join("\n");
}

/**
 * Format the deterministic cross-country distribution into a prompt
 * block that the merge LLM treats as the source of truth for risk
 * attribution. Shows the matrix at the top (categories × countries
 * with rates) plus an explicit ruleset binding each category's
 * `scope` to the row's pre-computed scope tag.
 *
 * Returns empty string when the distribution is missing (legacy
 * snapshots without categorized arrays) — the caller falls back to
 * the old behavior.
 */
function formatCrossCountryDistribution(
  dist: CrossCountryDistribution | undefined,
  candidateCountries: string[],
  isKo: boolean,
): string {
  if (!dist || (dist.objections.length === 0 && dist.trustFactors.length === 0)) {
    return "";
  }

  const formatRow = (
    row: CrossCountryDistribution["objections"][number],
    taxonomy: "objection" | "trust",
  ): string => {
    const label = categoryLabel(taxonomy, row.category, isKo ? "ko" : "en");
    const scopeTag =
      row.scope === "cross-market"
        ? "cross-market"
        : row.scope === "country-specific"
          ? `country-specific (${row.dominantCountry ?? "?"})`
          : "narrow";
    const top = row.perCountry
      .filter((c) => c.count > 0)
      .slice(0, 12)
      .map((c) => `${c.country} ${c.ratePct.toFixed(1)}%`)
      .join(" · ");
    const sample = row.representativeDetail
      ? ` · 대표 표현: "${row.representativeDetail.slice(0, 80)}"`
      : "";
    return [
      `  - [${row.category}] ${label} — overall ${row.totalRatePct.toFixed(1)}% (${row.totalPersonas} personas)`,
      `      scope=${scopeTag}, ${row.countriesAboveBaseline}/${dist.countryCount} countries above baseline`,
      `      ${top}${sample}`,
    ].join("\n");
  };

  const objLines = dist.objections.map((r) => formatRow(r, "objection")).join("\n");
  const trustLines = dist.trustFactors.map((r) => formatRow(r, "trust")).join("\n");

  const candidates =
    candidateCountries.length > 0 ? candidateCountries.join(", ") : "(unknown)";

  if (isKo) {
    return [
      "## Cross-country signal coverage (aggregator-computed — 출처: 카테고리화된 페르소나 응답)",
      `Total personas across ${dist.countryCount} markets · candidate countries: ${candidates}`,
      "",
      "### Objection categories",
      objLines || "  (no categorized objections in this ensemble)",
      "",
      "### Trust-factor categories",
      trustLines || "  (no categorized trust factors in this ensemble)",
      "",
      "**위 분포는 합산 카운트의 진실 소스입니다.** mergedRisks를 작성할 때:",
      "  - 각 risk에 `scope` 필드를 반드시 채우세요. 위 표의 카테고리에 매핑되면 표의 scope를 그대로 사용하세요.",
      "    · `cross-market` — 다수 시장에서 동일하게 surface (위 표 표기). 본문은 \"전체 후보 시장 공통\" 또는 비교 가능한 표현으로. 단일 국가명을 risk factor에 포함하지 마세요.",
      "    · `country-specific` — 위 표가 country-specific으로 명시한 카테고리만 단일 국가 risk로 surface 가능. dominantCountry가 표에 있으면 그 국가만 명시.",
      "    · `narrow` — 일부 시장에서만 surface. affectedCountries 필드에 해당 국가 코드 배열을 채우세요.",
      "  - **카운트 인용 금지 (필수)**: \"X명 중 Y명\", \"X persona of Y\", \"몇 명이 응답\" 같은 문구를 risk 본문에 절대 포함하지 마세요. 위 표가 정확한 카운트와 비율을 이미 제공합니다. 본문에는 표가 가진 비율(\"전체 페르소나의 44%\", \"12개 시장 모두 41-51%\") 만 인용하세요.",
      "  - **단일 국가 부착 금지**: 표의 scope=cross-market인 카테고리를 단일 국가 risk로 부착하지 마세요. 12개 시장 모두 비슷한 비율로 surface하는 우려를 \"대만 17명 중 5명\" 식으로 단일 국가에 귀속하면 합의 신호를 왜곡합니다.",
      "  - **affectedCountries**: country-specific이면 [\"TW\"] 형태로 1개, narrow이면 [\"TW\", \"SG\", ...]로 다국가, cross-market이면 비워두세요 (renderer가 후보 국가 전체로 확장).",
      "  - **personaCategory** (필수, 매핑 가능 시): 위 표의 카테고리 중 이 risk의 root-cause인 코드 1개를 emit하세요 (예: `channel_access`, `regulatory_friction`, `size_fit`). 표의 row와 정확히 일치해야 renderer가 페르소나 커버리지(\"12개 시장 평균 44%\")를 표시할 수 있습니다. risk가 페르소나 우려가 아닌 외부 변수(환율·결제 인프라·내부 운영)면 비워두세요.",
    ].join("\n");
  }
  return [
    "## Cross-country signal coverage (aggregator-computed — sourced from categorized persona reactions)",
    `Total personas across ${dist.countryCount} markets · candidate countries: ${candidates}`,
    "",
    "### Objection categories",
    objLines || "  (no categorized objections in this ensemble)",
    "",
    "### Trust-factor categories",
    trustLines || "  (no categorized trust factors in this ensemble)",
    "",
    "**This distribution is the truth source for cross-market counts.** When writing mergedRisks:",
    "  - Always populate the `scope` field. If a risk maps to a category in the table above, copy its scope verbatim.",
    "    · `cross-market` — universal across markets (per the table). Phrase the risk as \"applies to all candidate markets\" / \"market-wide concern\". Do NOT name a single country in the risk factor.",
    "    · `country-specific` — only valid when the table tags scope=country-specific. Name the dominantCountry only.",
    "    · `narrow` — confined to a few markets. Populate `affectedCountries` with their codes.",
    "  - **Do NOT cite counts** (\"X out of Y personas\", \"5 of 17 reported\") in risk descriptions. The table already provides exact counts and rates — quote percentages from it (\"44% of all personas\", \"all 12 markets 41-51%\") instead.",
    "  - **Do NOT attribute cross-market signals to a single country**. Labelling a concern that surfaces at near-equal rates in 12 markets as \"Taiwan personas reported X\" buries the real consensus signal under a hallucinated single-country risk.",
    "  - **affectedCountries**: country-specific → 1-element array like [\"TW\"]; narrow → multi-element array; cross-market → leave empty (renderer expands to all candidates).",
    "  - **personaCategory** (required when mappable): emit one taxonomy code from the table above that names this risk's root-cause category (e.g. `channel_access`, `regulatory_friction`, `size_fit`). Must match a row in the table exactly so the renderer can show persona-coverage (\"mean 44% across 12 markets\") in place of the sim count. Leave undefined when the risk is non-persona (FX, payment infrastructure, internal ops).",
  ].join("\n");
}

function narrativeFromRawSnapshots(
  sims: EnsembleSimSnapshot[],
  overallRiskLevel: "low" | "medium" | "high",
): EnsembleNarrative {
  // Fallback when the LLM merge fails — concatenate the highest-frequency
  // sim's risks/actions. Better than empty sections, worse than a real merge.
  const best = sims[0];
  const totalPersonas = sims.reduce((sum, s) => sum + (s.personas?.length ?? 0), 0);
  const perSim = best?.personas?.length ?? 0;
  return {
    executiveSummary: rewriteSimScaleReferences(
      best?.overview?.headline ?? best?.recommendations?.executiveSummary ?? "",
      perSim,
      totalPersonas,
    ),
    mergedRisks: (best?.risks ?? []).slice(0, 12).map((r) => ({
      factor: r.factor,
      description: rewriteSimScaleReferences(r.description, perSim, totalPersonas),
      severity: r.severity,
      surfacedInSims: 1,
    })),
    mergedActions: (best?.recommendations?.actionPlan ?? []).slice(0, 10).map((action) => {
      const rewritten = rewriteSimScaleReferences(action, perSim, totalPersonas);
      return {
        action: rewritten,
        surfacedInSims: 1,
        specificity: assessActionSpecificity(rewritten),
      };
    }),
    overallRiskLevel,
  };
}

/**
 * Strip count-citation phrases the merge LLM hallucinates from per-sim
 * outputs ("X명 중 Y명이 ... 응답", "Y of X personas reported ..."). The
 * counts come from a single sim's country slice and are wildly wrong at
 * ensemble scale (real rates run 5-50× higher because the same theme
 * repeats across 25 sims). The aggregator's cross-country distribution
 * — injected separately into the prompt and rendered alongside the
 * narrative — carries the honest counts, so the safest fix is to delete
 * the LLM's invented numbers from prose entirely.
 *
 * Patterns it removes (idempotent — safe to run on text without them):
 *  · KO: "X명 중 Y명이 ...", "X명 중 Y명만"
 *  · EN: "Y of X personas", "Y out of X personas/respondents"
 *
 * Leaves untouched: percentages (44.5%) and absolute counts that
 * rewriteSimScaleReferences already rescaled to ensemble totals.
 */
function stripHallucinatedCounts(text: string): string {
  if (!text) return text;
  let out = text;
  out = out.replace(
    /(?:[A-Z]{2}\s*페르소나\s*)?\d+\s*명\s*중\s*\d+\s*명(?:이|만|은|는)?\s*(?:'[^']+'|"[^"]+")?\s*(?:[가-힣]+(?:\s|$))*?/g,
    "",
  );
  out = out.replace(
    /\d+\s+of\s+\d+\s+(?:personas?|respondents?|consumers?)\b[^.,;]*/gi,
    "",
  );
  out = out.replace(/\s{2,}/g, " ").trim();
  // Tidy stray punctuation left behind ("해, ." or "—,")
  out = out.replace(/\s+([.,;])/g, "$1");
  out = out.replace(/[—,]\s*(?=[.,;])/g, "");
  return out;
}

/**
 * Defensive sanitizer for narrative text — per-sim outputs say things like
 * "전체 200명 중 44.5%" or "89 out of 200" because each sim runs against a
 * 200-persona pool. The merged narrative must read as ensemble-wide, so we
 * regex-rewrite any literal sim-pool reference to either a percentage-only
 * phrase or the full ensemble total. Runs *after* the LLM merge as a
 * belt-and-braces layer in case the model ignores the prompt directive.
 *
 * Scope: only triggers when the merged narrative has at least one sim
 * worth of mismatch (perSim > 0 and totalPersonas > perSim). Single-sim
 * ensembles correctly say "200명 중" because that IS the full pool.
 */
export function rewriteSimScaleReferences(
  text: string,
  perSim: number,
  totalPersonas: number,
): string {
  if (!text || perSim <= 0 || totalPersonas <= perSim) return text;
  let out = text;
  const psStr = String(perSim);
  // KO: "(전체 )?{perSim}명 중 X명" → "전체 페르소나의 (X / perSim) → percent"
  // and "{perSim}명 중 Y%" → "전체 페르소나의 Y%"
  out = out.replace(
    new RegExp(`(?:전체\\s*)?${psStr}\\s*명\\s*중\\s*([\\d.]+\\s*%)`, "g"),
    "전체 페르소나의 $1",
  );
  out = out.replace(
    new RegExp(`(?:전체\\s*)?${psStr}\\s*명\\s*중\\s*(\\d+)\\s*명`, "g"),
    (_m, n: string) => {
      const pct = (parseInt(n, 10) / perSim) * 100;
      const scaled = Math.round((pct / 100) * totalPersonas);
      return `전체 ${totalPersonas.toLocaleString()}명 중 ${scaled.toLocaleString()}명`;
    },
  );
  // EN: "X out of {perSim}" → "of all personas"
  out = out.replace(
    new RegExp(`\\b(\\d+)\\s+out\\s+of\\s+${psStr}\\b`, "gi"),
    (_m, n: string) => {
      const pct = (parseInt(n, 10) / perSim) * 100;
      const scaled = Math.round((pct / 100) * totalPersonas);
      return `${scaled.toLocaleString()} of ${totalPersonas.toLocaleString()}`;
    },
  );
  // EN: "of 200 (Y%)" residue
  out = out.replace(
    new RegExp(`\\bof\\s+${psStr}\\s+\\(([\\d.]+\\s*%)\\)`, "gi"),
    "of all personas ($1)",
  );
  return out;
}

/**
 * Heuristic concreteness audit on an action string. Runs after the LLM
 * merge as a deterministic check — the prompt asks the model to be
 * specific, but we don't trust it to self-score. Each dimension is a
 * regex/keyword match; a positive hit elevates the score by 25 (max 100).
 *
 * Why heuristic, not another LLM call:
 *   1. Cost: free, runs on every action
 *   2. Determinism: same string → same score, easier to debug
 *   3. Robustness: even when the merge LLM ignores the rule, we still
 *      flag generic outputs in the UI
 *
 * Misses are acceptable (false-positives where score = 100 but action
 * is fluff); the goal is to catch the WORST cases — "improve marketing
 * in Japan" type — and surface a "vague" badge on those. Bilingual
 * (KR + EN) since the merge runs in either locale.
 */
export function assessActionSpecificity(action: string): ActionSpecificity {
  const text = action.toLowerCase();

  // Named action anchors — channels, regulators, certifications, named
  // documents. Originally just channels, but actions like "FDA food
  // facility registration" or "commission an SGS COA" are highly
  // concrete (named third party + specific deliverable) yet would score
  // 0 on a channel-only check. Broadened to "things you can name as
  // the target of the action". Mixing KR+global since actions are
  // bilingual.
  const channelTokens = [
    // ── Channels (Korean / regional) ──
    "쿠팡", "네이버", "11번가", "카카오", "카카오톡", "카카오톡채널", "라인", "인스타", "유튜브", "틱톡",
    "올리브영", "다이소", "이마트", "롯데", "신세계", "지마켓", "옥션", "당근", "무신사", "29cm",
    "스마트스토어", "브랜드스토어", "라방", "라이브커머스", "쿠캣", "포카리", "마켓컬리", "오아시스",
    // ── Channels (generic) ──
    "리테일", "도매", "자체몰", "공식몰", "dtc",
    // ── Channels (global) ──
    "amazon", "tiktok", "instagram", "facebook", "youtube", "google ads", "meta", "shopee",
    "lazada", "qoo10", "rakuten", "etsy", "shopify", "tmall", "taobao", "wechat", "douyin",
    "wholefoods", "costco", "walmart", "target", "sephora", "ulta", "kickstarter", "indiegogo",
    "linkedin", "reddit", "x.com", "twitter", "threads", "naver",
    // ── Regulators (named regulatory bodies anchor concrete actions) ──
    "fda", "usda", "epa", "ftc", "fcc", "kfda", "mfds", "mhlw", "pmda", "efsa", "ema",
    "mhra", "fsa", "anvisa", "nmpa", "tga", "cfia", "health canada", "kotra", "식약처", "한국식품의약품안전처",
    // ── Certifications & accredited test labs ──
    "coa", "ukca", "ce mark", "ce-mark", "nop", "usda organic", "nsf", "sgs", "eurofins",
    "bureau veritas", "bvqi", "brc", "brcgs", "iso 22000", "iso 9001", "halal", "kosher",
    "vegan society", "b corp", "fair trade", "rainforest alliance", "gmp", "haccp",
    "non-gmo", "noprohibited", "specialty food association", "kosher certification",
    // ── Trade & customs anchors ──
    "customs broker", "import permit", "export licence", "export license", "hs code",
    "bill of lading", "incoterms",
    // ── Named programs / accelerators / events ──
    "amazon vine", "vine program", "fancy food show", "natural products expo",
    "specialty food", "shopify capital",
  ];
  const hasChannel = channelTokens.some((t) => text.includes(t));

  // Metrics — any digit + currency/quantity unit, or % anywhere.
  const hasMetric =
    /[0-9][\d,.]*\s*(?:원|만원|억원|만|천만|krw|usd|\$|€|￥|jpy|cny|%|개|건|회|배|x|만건|뷰|view|impression|click|gmv|이상|미만|이내)/i.test(
      action,
    ) ||
    /(?:^|\s)[0-9][\d,.]*\s*%/.test(action) ||
    /\b[0-9][\d,.]*\s*[kKmM](?:\s|$)/.test(action);

  // Timeline — explicit deadline or duration.
  const hasTimeline =
    /(?:Q[1-4]|FY?\d{2,4}|H[12]|d-?\d|d\+\d|\d+\s*(?:일|주|개월|년|month|months|week|weeks|day|days|year|years|qtr|quarter|q1|q2|q3|q4)|by\s+\w+\s*\d{2,4}|within\s+\d|next\s+\d|by\s+(?:end\s+of\s+)?(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec))/i.test(
      action,
    ) ||
    /(?:오는|이내|까지|내|개월\s*이내|주\s*이내|일\s*이내)/.test(action);

  // Measurable — names a tracked metric (conversion / lift / retention etc.)
  const hasMeasurable =
    /(?:전환율|클릭률|구매전환|장바구니|이탈률|체류|검색량|점유율|재구매|재방문|신규|매출|gmv|arpu|aov|ltv|cac|roi|roas|ctr|cvr|cpa|cpm|cpc|nps|csat|retention|conversion|engagement|recall|awareness|net\s*promoter|repeat|reach|impressions|sessions|signups?|installs?)/i.test(
      action,
    );

  const hits = [hasChannel, hasMetric, hasTimeline, hasMeasurable].filter(Boolean).length;
  return {
    hasChannel,
    hasMetric,
    hasTimeline,
    hasMeasurable,
    score: hits * 25,
  };
}

// react-pdf doesn't accept Zod schemas directly in its jsonSchema slot;
// give the LLM a hand-rolled JSON-shape hint that mirrors the Zod shape.
// Kept inline so the schema and the hint stay in sync visually.
function zodToJsonShape() {
  return {
    type: "object",
    properties: {
      hotTake: { type: "string" },
      executiveSummary: { type: "string" },
      mergedRisks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            factor: { type: "string" },
            description: { type: "string" },
            severity: { type: "string", enum: ["low", "medium", "high"] },
            surfacedInSims: { type: "integer", minimum: 1 },
          },
          required: ["factor", "description", "severity", "surfacedInSims"],
        },
      },
      mergedActions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            action: { type: "string" },
            surfacedInSims: { type: "integer", minimum: 1 },
            impact: { type: "integer", minimum: 1, maximum: 3 },
            effort: { type: "integer", minimum: 1, maximum: 3 },
          },
          // impact + effort moved to required so JSON-mode providers
          // enforce emission. Zod schema downstream still treats them
          // as optional for legacy backward-compat — if the LLM somehow
          // skips, validation passes but the 2x2 matrix won't render.
          required: ["action", "surfacedInSims", "impact", "effort"],
        },
      },
    },
    required: ["executiveSummary", "mergedRisks", "mergedActions"],
  };
}

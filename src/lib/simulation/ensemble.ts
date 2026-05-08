/**
 * Ensemble aggregation — collapses N independent sim results into a single
 * confidence-graded recommendation. Same fixture × N draws → bestCountry
 * distribution + per-segment best country + per-country score statistics.
 *
 * The aggregate output is persisted once into ensembles.aggregate_result
 * when the last sim completes; the result page reads it directly without
 * recomputing.
 */

import type { CountryScore, Overview, Risk, Recommendation, PricingResult, MarketProfile } from "./schemas";
import {
  computePricingSensitivity as computePricingSensitivityShared,
  computeCurveRevenueMaxCents,
} from "./pricing-sensitivity";
import {
  tokenize,
  overlapCoefficient,
  clusterStrings,
  isBareAdjectiveSignal,
  isGenericLaunchConcern,
  isGenericPriceObjection,
  isGenericTrustFactor,
  isPersonaMismatchNoise,
} from "./surfaced-recount";

/* ────────────────────────────────── stats helpers ─── */
function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
}
function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}
function std(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

/* ────────────────────────────────── public types ─── */
export interface EnsembleSimSnapshot {
  simulationId: string;
  index: number;
  bestCountry: string | null;
  countries: CountryScore[];
  /** Persona-aggregate-level intent per country, used for transparency. */
  personaIntentByCountry: Record<string, { n: number; meanIntent: number }>;
  /**
   * Which LLM provider drove this sim. Set for multi-LLM ensembles
   * (deep tier round-robins anthropic/openai/gemini) so the aggregator
   * can surface cross-model agreement. Single-provider ensembles leave
   * this undefined and skip the providerBreakdown section.
   */
  provider?: string;
  /**
   * If the synthesis stage failed over to a backup provider (Gemini
   * 503 → Anthropic, etc.), this records the actual provider that
   * produced the synthesis. The `provider` field above stays the
   * nominal provider so the deep-tier round-robin attribution is
   * intact at the orchestration level. Read by the aggregator's
   * providerBreakdown so cross-model agreement reflects who really
   * wrote the synthesis.
   */
  synthesisProvider?: string;
  /**
   * Synthesis-stage narrative outputs from this sim. Carried into the
   * aggregator so a downstream LLM merge step can dedup risks across
   * sims and surface the consensus narrative — without these, the
   * ensemble report would be charts-only and lose all of the executive
   * summary / risks / action plan that single-sim reports surface.
   * All optional because legacy snapshots may not have them.
   */
  overview?: Overview;
  risks?: Risk[];
  recommendations?: Recommendation;
  pricing?: PricingResult;
  /**
   * Per-persona records. Heavy field — 200 entries × ~30 fields each
   * — but keeping only what we need for aggregation downstream:
   * intent, country, voice, ageRange, profession, gender, incomeBand.
   * Aggregator consumes this and emits PersonasAggregate; we don't
   * keep the raw array on the persisted EnsembleAggregate.
   */
  personas?: Array<{
    country: string;
    purchaseIntent: number;
    voice?: string;
    ageRange?: string;
    profession?: string;
    gender?: string;
    incomeBand?: string;
    /** Free-text reasons the persona would trust the product. Used by
        the channel-mention extractor (Amazon / TikTok / etc.). */
    trustFactors?: string[];
    /** Free-text barriers / hesitations. Same channel-extractor input. */
    objections?: string[];
    /** Ad-stage reaction (curiosity + wouldClick). Optional for legacy. */
    adReaction?: {
      curiosity: number;
      wouldClick: boolean;
    };
  }>;
  /** Creative asset scoring from this sim (optional — sim may have skipped). */
  creative?: Array<{
    assetName: string;
    score: number;
    strengths: string[];
    weaknesses: string[];
  }>;
}

export interface CountryStats {
  country: string;
  finalScore: {
    mean: number;
    median: number;
    /** Across-sim std — captures cross-run variance. Often 0 when the
     *  per-sim medians collapse to the same number (clear-winner cases
     *  with low LLM temperature). */
    std: number;
    min: number;
    max: number;
    range: number;
    /** Mean of within-sim std across sims — captures LLM-roll noise
     *  inside each sim. Surfaces real uncertainty even when across-sim
     *  std is 0. Absent when no sim emitted finalScoreStd (legacy data). */
    withinSimStdMean?: number;
    /** Combined std via law of total variance: sqrt(E[withinVar] + Var[means]).
     *  This is the "true" noise level of the ensemble's recommended score.
     *  Falls back to across-sim std when within-sim data is absent. */
    combinedStd?: number;
  };
  demandScore: { mean: number; median: number };
  cacEstimateUsd: { mean: number; median: number };
  /** First-emitted LLM cacRationale across sims for this country —
   *  shown on the Decision-aid CAC card so the user can audit the
   *  channel-mix arithmetic. Optional: legacy sims pre-channel-cost-
   *  grounding don't carry it. */
  cacRationale?: string;
  competitionScore: { mean: number; median: number };
  /**
   * Per-component score decomposition averaged across sims. Six
   * dimensions answer "what's driving the finalScore?" — UI shows them
   * as a radar chart in the Countries tab. Optional: legacy sims
   * predating the components prompt won't carry per-component data,
   * and we'd rather render a simpler card than a half-empty radar.
   */
  components?: {
    marketSize: { mean: number; median: number };
    culturalFit: { mean: number; median: number };
    channelMatch: { mean: number; median: number };
    priceCompat: { mean: number; median: number };
    competition: { mean: number; median: number };
    regulatory: { mean: number; median: number };
  };
  /**
   * Drilldown payload — same shape as the single-sim Country tab so the
   * ensemble UI can render identical detail panels (rationale, top
   * objections, persona-side summary). Optional because legacy ensembles
   * (created before this field landed) won't have it.
   */
  detail?: {
    /** Up to 3 rationales sampled from per-sim CountryScore.rationale. */
    rationaleSamples: string[];
    /** Top 5 objections across personas in this country. */
    topObjections: Array<{ text: string; count: number }>;
    /**
     * Top 5 trust factors mentioned by personas in this country —
     * the in-country positive counterpart to topObjections. Used by
     * the "trust vs objection" report page to show what convinces
     * vs what blocks side-by-side. Optional for legacy ensembles
     * predating the field.
     */
    topTrustFactors?: Array<{ text: string; count: number }>;
    persona: {
      count: number;
      meanIntent: number;
      highIntent: number;
      lowIntent: number;
    };
    /**
     * 2-stage funnel from ad impression to purchase, computed across
     * the ensemble's personas in this country who emitted adReaction.
     * Null when none did (legacy sims pre-dating the field).
     *
     *   curiosityMean: 0-100 mean of adReaction.curiosity
     *   clickRatePct: % with wouldClick=true
     *   buyRatePct: % with purchaseIntent ≥ 60 (kept consistent
     *              with highIntent threshold elsewhere... 60 vs 70:
     *              the funnel uses the slightly looser threshold so
     *              it matches the buy-stage in marketing language)
     *   sample: how many personas in this country contributed
     */
    funnel?: {
      curiosityMean: number;
      clickRatePct: number;
      buyRatePct: number;
      sample: number;
    } | null;
  };
}

export interface SegmentRec {
  /** Internal id used by UI for translation lookup, e.g. "volume" / "cac" / "competition" / "overall". */
  id: "volume" | "cac" | "competition" | "overall";
  /** Korean label for backwards compat — UI should prefer `id` for i18n. */
  labelKo: string;
  bestCountry: string;
  bestValue: number;
  alternative?: { country: string; value: number };
}

export interface ProviderConsensus {
  provider: string;
  simCount: number;
  /** This provider's pick distribution across its sims. */
  bestCountryDistribution: Array<{ country: string; count: number; percent: number }>;
  /**
   * Of this provider's sims, what percent chose the SAME country as the
   * overall ensemble winner. 100 = perfect alignment with the cross-model
   * consensus, 0 = total disagreement. Useful "did this LLM agree with the
   * room?" signal.
   */
  agreementWithOverallPercent: number;
}

export interface EnsembleAggregate {
  /** Number of sims successfully aggregated. */
  simCount: number;
  /** Total effective personas across all sims. */
  effectivePersonas: number;

  bestCountryDistribution: Array<{ country: string; count: number; percent: number }>;
  /** Top recommendation: most frequent bestCountry across sims. */
  recommendation: {
    country: string;
    consensusPercent: number;
    confidence: "STRONG" | "MODERATE" | "WEAK";
  };

  countryStats: CountryStats[];
  segments: SegmentRec[];

  /**
   * Cross-model breakdown — only populated when sims came from multiple
   * providers (deep tier). Single-provider ensembles leave this undefined.
   */
  providerBreakdown?: ProviderConsensus[];

  /**
   * Consensus narrative produced by an LLM merge step over the per-sim
   * overview/risks/recommendations. Optional because the merge runs
   * AFTER aggregateEnsemble() in the orchestration layer and is allowed
   * to fail silently (the chart sections are still useful on their own).
   */
  narrative?: EnsembleNarrative;

  /** Persona-level summary across all sims. Optional for legacy ensembles. */
  personas?: PersonasAggregate;

  /**
   * Reference data sources cited in any sim's overview._sources. Pulled
   * from the first sim's overview because every sim in an ensemble runs
   * against the same project fixture. Optional for legacy ensembles.
   */
  sources?: string[];

  /** Pricing curve consensus across all sims. */
  pricing?: PricingAggregate;

  /** Creative asset scores aggregated across sims, when sims supplied any. */
  creative?: CreativeAggregate;

  /** Overall ensemble variance health — quick visual cue for the UI. */
  varianceAssessment: {
    maxFinalScoreRange: number;
    meanFinalScoreRange: number;
    label: "low" | "moderate" | "high";
    note: string;
  };

  /**
   * Deep market profile for the recommended country — competitors,
   * channels, cultural notes, regulatory, pricing benchmarks, GTM
   * strategy. Generated by a separate LLM call after the
   * recommendation is finalized. Optional because the call can fail
   * (treated as non-fatal) and because legacy ensembles predate it.
   */
  marketProfile?: MarketProfile;

  /**
   * Quality audit rollup. Per-sim audits live in simulation_quality;
   * this is the ensemble-level summary the result-page hero reads
   * to show a single confidence score + systemic warning list.
   * Optional because legacy ensembles (created before audit shipped)
   * don't have it.
   */
  quality?: {
    confidenceScore: number;
    simCount: number;
    quarantinedCount: number;
    systemicWarnings: Array<{
      code: string;
      severity: string;
      message: string;
      simShare: number;
    }>;
  };
}

/**
 * Persona-level summary aggregated across all sims. We DON'T store the
 * full persona array here (25 sims × 200 personas = 2-3 MB easily); the
 * raw rows live in simulation_results. This struct carries everything
 * the dashboard / PDF persona section needs without re-querying.
 */
export interface PersonasAggregate {
  total: number;
  byCountry: Array<{
    country: string;
    count: number;
    meanIntent: number;
    medianIntent: number;
  }>;
  /** Histogram bins of purchaseIntent (0-100), 10 bins of width 10. */
  intentHistogram: Array<{ binStart: number; binEnd: number; count: number }>;
  intentMean: number;
  intentMedian: number;
  highIntentCount: number; // intent >= 70
  lowIntentCount: number; // intent < 35
  /**
   * Notable verbatim quotes. We keep a small handful (3-5) per polarity
   * — enough for the report to feel grounded without ballooning the
   * jsonb. Picked by intent score (top positive, lowest negative) and
   * deduped naively on the first 60 chars to avoid the same hot take
   * showing up multiple times across sims.
   */
  topPositiveVoices: Array<{
    text: string;
    country: string;
    intent: number;
    profession?: string;
    ageRange?: string;
  }>;
  topNegativeVoices: Array<{
    text: string;
    country: string;
    intent: number;
    profession?: string;
    ageRange?: string;
  }>;
  /** Demographic distributions — useful for the report and any ad-targeting follow-up. */
  ageDistribution: Array<{ bucket: string; count: number }>;
  /**
   * Top professions by count + mean purchase intent within that profession.
   * meanIntent surfaces "which jobs love or hate this product" — a signal
   * that's invisible in the headline aggregate. Optional: legacy
   * aggregates from before the meanIntent field was added carry only
   * { profession, count }; the UI/PDF treats meanIntent as undefined
   * gracefully.
   */
  professionTopN: Array<{ profession: string; count: number; meanIntent?: number }>;

  /**
   * Segment-level intent breakdown. Each cut (gender / age / income)
   * shows mean purchase intent and the country that segment most often
   * picks as their #1 choice. Populated only when the underlying field
   * is present on enough personas — segments with <10 members get
   * dropped because the means become noisy. Optional because legacy
   * ensembles (created before E1) don't have it.
   */
  segmentBreakdown?: {
    byGender: SegmentBreakdownRow[];
    byAge: SegmentBreakdownRow[];
    byIncome: SegmentBreakdownRow[];
  };

  /**
   * Brand / channel mentions extracted from persona free-text fields
   * (voice, trustFactors, objections). Top 15 by mention count, sorted
   * descending. Drives the "where is the customer ALREADY shopping"
   * channel-strategy view — high-mention channels are existing
   * touchpoints; high-intent + high-mention is a launch priority.
   * Optional because legacy ensembles (created before E2) don't have it.
   */
  channelMentions?: ChannelMentionRow[];

  /**
   * Behavioral archetypes — rule-based clustering of personas into
   * decision-relevant segments. Five archetypes: Champion / Curious /
   * Conditional / Skeptic / Walker. Each carries demographic +
   * decision-pattern stats so the report can answer "who do I sell
   * to first?" with substance instead of bare percentages.
   * Optional for legacy ensembles.
   */
  archetypes?: PersonaArchetype[];
}

export interface PersonaArchetype {
  /** Internal id used for translation lookup. */
  id: "champion" | "curious" | "conditional" | "skeptic" | "walker";
  /** Display label (locale-agnostic — UI translates the id). */
  label: string;
  count: number;
  /** Share of all personas, 0-1. */
  share: number;
  /** Mean purchaseIntent within this archetype. */
  meanIntent: number;
  /** Mean adReaction.curiosity (0-100), null when archetype lacks adReaction signal. */
  meanCuriosity: number | null;
  /** Top profession + age + income in this archetype (mode of bucket). */
  topProfession: string | null;
  topAgeBucket: string | null;
  topIncomeBucket: string | null;
  /** Top trust factor + top objection (most-mentioned within the archetype). */
  topTrustFactor: string | null;
  topObjection: string | null;
  /** One representative quote — the highest-conviction voice in the archetype. */
  representativeQuote: {
    text: string;
    country: string;
    intent: number;
    profession?: string;
  } | null;
}

export interface SegmentBreakdownRow {
  /** The segment label (e.g. "female", "25-34", "$50k–$80k"). */
  bucket: string;
  count: number;
  meanIntent: number;
  /** Country that most personas in this segment had as their highest-intent target market. */
  topCountry: string;
  /** Share of this segment whose top market is `topCountry`. */
  topCountryShare: number;
}

export interface ChannelMentionRow {
  /** Brand / channel name as displayed (e.g. "Amazon", "TikTok"). */
  channel: string;
  /** Persona count that mentioned this channel in voice / trust / objections. */
  mentions: number;
  /** Share of all personas that mentioned it (rounded percent). */
  share: number;
  /** Mean intent of personas who mentioned this channel — a high number
      means the channel correlates with conversion-ready audience. */
  meanIntent: number;
}

/**
 * Pricing aggregate — collapses per-sim pricing curves into one consensus
 * curve, plus the median recommended price across sims.
 */
export interface PricingAggregate {
  recommendedPriceCents: number;
  recommendedPriceMedian: number;
  recommendedPriceP25: number;
  recommendedPriceP75: number;
  /** Across-sim std of recommendedPriceCents. Often 0 when LLMs
   *  converge on a psychological-anchor price ($49.95, $99) regardless
   *  of persona seed. */
  recommendedPriceAcrossSimStd?: number;
  /** Mean of within-sim recommendedPriceStd across sims — captures
   *  per-sim LLM-roll noise. Surfaces real uncertainty even when
   *  across-sim std is 0. Absent when no sim emitted the field. */
  recommendedPriceWithinSimStdMean?: number;
  /** Combined std via law of total variance — true ensemble noise. */
  recommendedPriceCombinedStd?: number;
  /** Number of sims whose pricing all-converged on the same value
   *  (used by UI to show "all N sims converged on $X" instead of a
   *  zero-width range). */
  recommendedPriceUnanimousAt?: number | null;
  marginEstimate: string; // mode of per-sim values
  /** Median of per-sim marginEstimatePct (typical gross margin %).
   *  Drives the Decision-aid break-even 3-scenario table. Optional —
   *  legacy sims didn't emit a numeric margin. */
  marginEstimatePct?: number;
  /**
   * Curve-derived revenue maximum — the price point in the consensus
   * curve where (price × meanConversionProbability) is highest.
   * Independent of the LLM's claimed recommendedPriceCents; serves as
   * a sanity check. When the two diverge (>10% apart), the LLM was
   * inconsistent with its own curve — the report flags this for the
   * user. Null when the curve has fewer than 2 points.
   */
  curveRevenueMaxCents?: number | null;
  /**
   * Whether the LLM's recommendedPriceCents agrees with the curve-
   * derived revenue max. True when within ±10% of each other; false
   * when they diverge meaningfully (LLM picked a different point than
   * its own data would suggest); null when curve is too sparse to
   * compute or this is a legacy aggregate.
   */
  recommendationMatchesCurve?: boolean | null;
  /**
   * Pricing range metadata propagated from per-sim results. Captures
   * which window the LLM was told to sample (default 0.5x-2.0x base,
   * or wider/narrower based on persona sensitivity + competitor
   * anchors). Surfaced in the UI/PDF so users see WHY the curve
   * spans the prices it does. Optional for legacy aggregates.
   */
  range?: {
    minCents: number;
    maxCents: number;
    rationale: string[];
  };
  /**
   * Competitor retail prices that anchored the pricing analysis,
   * extracted from user-provided URLs at sim time. Picked from the
   * first sim's pricing.competitorPrices since extraction is per-
   * project (same URLs, same answers). Optional / empty when no
   * competitor URLs were provided or extraction yielded nothing.
   */
  competitorPrices?: Array<{
    url: string;
    priceCents: number;
    productName?: string;
    sourceCurrency?: string;
  }>;
  /**
   * Consensus curve: average conversion probability at each price point
   * across all sims, sorted ascending by price. Sims may have slightly
   * different price grids — we bucket nearest-cent-rounded prices to
   * keep the curve dense without over-binning.
   */
  curve: Array<{
    priceCents: number;
    meanConversionProbability: number;
    sampleCount: number;
  }>;
  /**
   * Sensitivity analysis derived deterministically from the consensus
   * curve — no extra LLM call. Surfaces the "where does demand break"
   * thresholds and the elasticity the user needs to make a pricing
   * call. All cent fields are null when the curve doesn't span enough
   * range to determine the threshold (e.g., conversion never drops
   * below 50% across the sampled range).
   */
  sensitivity?: {
    /** Highest price at which mean conversion ≥ 0.5. The "comfort zone" cap. */
    comfortCeilingCents: number | null;
    /** The price (right side of the steepest-drop interval) — the demand knee. */
    inflectionCents: number | null;
    /** Lowest price at which mean conversion ≤ 0.1. Effective rejection floor. */
    rejectionFloorCents: number | null;
    /** Elasticity at the recommended price: %ΔConversion / %ΔPrice. Negative. */
    elasticityAtRec: number | null;
    /**
     * What-if at base ×1.1 and ×0.9. Each entry: (conversion, revenueIndex).
     * revenueIndex normalised to base = 1.0 so values are interpretable as
     * "+15% revenue" etc. Null when the curve doesn't cover that price.
     */
    ifPriceUp10Pct: { conversionPct: number; revenueIndexDelta: number } | null;
    ifPriceDown10Pct: { conversionPct: number; revenueIndexDelta: number } | null;
  };
}

/** Creative asset aggregate — only present when sims provided creative scoring. */
export interface CreativeAggregate {
  assets: Array<{
    assetName: string;
    meanScore: number;
    /** Strengths/weaknesses surfaced, deduped, with frequency. */
    topStrengths: Array<{ point: string; surfacedInSims: number }>;
    topWeaknesses: Array<{ point: string; surfacedInSims: number }>;
  }>;
}

export interface EnsembleNarrative {
  /**
   * One-sentence "30-second hot take" — the most provocative, action-
   * oriented finding the analysis surfaced. Distinct from executiveSummary
   * which is comprehensive; this is the headline a busy founder reads
   * first. Format: short, punchy, opinion-bearing. Examples:
   *   - "❌ 미국 안 가는 게 낫다 — 페르소나 73%가 가격 거부"
   *   - "🔥 베트남이 진짜다 — H&B 채널 미점유 + Z세대 매운맛 트렌드"
   * Optional because legacy ensembles (created before this field landed)
   * don't have it.
   */
  hotTake?: string;
  /** Unified executive summary across all sims (LLM-merged). */
  executiveSummary: string;
  /**
   * Risks deduped across sims with a frequency count: how many of the N
   * sims surfaced this risk (or a semantically equivalent one). The LLM
   * merge collapses near-duplicates so "Amazon 미입점" and "Amazon 진출
   * 안 됨" become one line with count 2.
   */
  mergedRisks: Array<{
    factor: string;
    description: string;
    severity: "low" | "medium" | "high";
    /** Number of sims that surfaced this risk (after semantic dedup). */
    surfacedInSims: number;
  }>;
  /**
   * Action items deduped across sims, in rough priority order (most
   * frequently mentioned first when the LLM can rank them).
   *
   * impact / effort: 1-3 each, scored by the merge-narrative LLM. Used
   * by the dashboard's priority matrix to plot actions on the
   * Quick-Wins / Strategic / Marginal / Avoid 2x2. Optional because
   * legacy narratives (created before this field) don't have them —
   * the UI falls back to (2, 2) "medium" placement so all actions
   * still render somewhere.
   */
  mergedActions: Array<{
    action: string;
    surfacedInSims: number;
    impact?: number;
    effort?: number;
    /**
     * Heuristic concreteness audit attached post-merge by
     * ensemble-narrative. Optional for legacy narratives.
     */
    specificity?: {
      hasChannel: boolean;
      hasMetric: boolean;
      hasTimeline: boolean;
      hasMeasurable: boolean;
      score: number;
    };
  }>;
  /** Aggregate riskLevel across sims — defaults to mode of per-sim values. */
  overallRiskLevel: "low" | "medium" | "high";
}

/* ────────────────────────────────── main aggregator ─── */
export function aggregateEnsemble(
  sims: EnsembleSimSnapshot[],
): EnsembleAggregate {
  const simCount = sims.length;
  if (simCount === 0) {
    return emptyAggregate();
  }

  // ── bestCountry distribution ──
  const bestFreq = new Map<string, number>();
  for (const s of sims) {
    const k = s.bestCountry ?? "?";
    bestFreq.set(k, (bestFreq.get(k) ?? 0) + 1);
  }
  const bestCountryDistribution = [...bestFreq.entries()]
    .map(([country, count]) => ({
      country,
      count,
      percent: Math.round((count / simCount) * 100),
    }))
    .sort((a, b) => b.count - a.count);

  const winner = bestCountryDistribution[0];
  const consensusPercent = winner ? Math.round((winner.count / simCount) * 100) : 0;
  const confidence: "STRONG" | "MODERATE" | "WEAK" =
    consensusPercent >= 80 ? "STRONG" : consensusPercent >= 50 ? "MODERATE" : "WEAK";

  // ── per-country stats ──
  type Bucket = {
    final: number[];
    /** Per-sim within-sim std of finalScore (computed at runner aggregate
     *  step). Used by ensemble to combine within-sim and across-sim
     *  variance via law of total variance. */
    finalStds: number[];
    demand: number[];
    cac: number[];
    /** First-emitted cacRationale across sims for this country (channel
     *  mix arithmetic shown by the LLM). Surfaced on the Decision-aid
     *  CAC card. */
    cacRationales: string[];
    comp: number[];
    rationales: string[];
    /** Per-component samples — only populated for sims that emitted them. */
    components: {
      marketSize: number[];
      culturalFit: number[];
      channelMatch: number[];
      priceCompat: number[];
      competition: number[];
      regulatory: number[];
    };
  };
  const newBucket = (): Bucket => ({
    final: [],
    finalStds: [],
    demand: [],
    cac: [],
    cacRationales: [],
    comp: [],
    rationales: [],
    components: {
      marketSize: [],
      culturalFit: [],
      channelMatch: [],
      priceCompat: [],
      competition: [],
      regulatory: [],
    },
  });
  const buckets = new Map<string, Bucket>();
  for (const s of sims) {
    for (const c of s.countries) {
      const key = c.country.toUpperCase();
      const b = buckets.get(key) ?? newBucket();
      b.final.push(c.finalScore);
      // Within-sim std emitted by runner.aggregateCountryScores since
      // 2026-05-06. Older sims lack the field — skip rather than push 0
      // so downstream knows the difference between "no data" and "true 0".
      const stdField = (c as { finalScoreStd?: number }).finalScoreStd;
      if (typeof stdField === "number" && Number.isFinite(stdField)) {
        b.finalStds.push(stdField);
      }
      b.demand.push(c.demandScore);
      b.cac.push(c.cacEstimateUsd);
      const rationaleField = (c as { cacRationale?: string }).cacRationale;
      if (typeof rationaleField === "string" && rationaleField.trim().length > 0) {
        b.cacRationales.push(rationaleField.trim());
      }
      b.comp.push(c.competitionScore);
      if (typeof c.rationale === "string" && c.rationale.trim().length > 0) {
        b.rationales.push(c.rationale.trim());
      }
      if (c.components) {
        b.components.marketSize.push(c.components.marketSize);
        b.components.culturalFit.push(c.components.culturalFit);
        b.components.channelMatch.push(c.components.channelMatch);
        b.components.priceCompat.push(c.components.priceCompat);
        b.components.competition.push(c.components.competition);
        b.components.regulatory.push(c.components.regulatory);
      }
      buckets.set(key, b);
    }
  }

  // Per-country drilldown payload — built from the same persona pool the
  // single-sim Country tab uses (intent stats + objection top-N) plus a
  // small sample of per-sim rationales so the drilldown can show one
  // representative justification without LLM-merging.
  const personasByCountry = new Map<string, NonNullable<EnsembleSimSnapshot["personas"]>[number][]>();
  for (const s of sims) {
    for (const p of s.personas ?? []) {
      const key = (p.country ?? "?").toUpperCase();
      const arr = personasByCountry.get(key) ?? [];
      arr.push(p);
      personasByCountry.set(key, arr);
    }
  }

  const countryStats: CountryStats[] = [...buckets.entries()]
    .map(([country, b]) => {
      const inCountry = personasByCountry.get(country) ?? [];
      const intents = inCountry.map((p) => p.purchaseIntent);
      // Objections aggregated across personas in this country. Each
      // persona phrases the same concern with different wording, so
      // exact-text dedup over-fragments — every concern shows count=1.
      // Use fuzzy token-overlap clustering instead: "Nicorette 패치 대비
      // $20 비용 부담" and "Nicorette 패치/껌 대비 비용이 비쌈" cluster.
      //
      // Pass per-objection personaIdx so clusterStrings counts unique
      // personas per cluster, not raw instance count. Without this the
      // top cluster could exceed persona.count (e.g. 250 instances /
      // 148 personas = 169%) since each persona contributes 2-5
      // objections to the pool.
      const allObjections: string[] = [];
      const objectionPersonaIds: number[] = [];
      for (let pi = 0; pi < inCountry.length; pi++) {
        const p = inCountry[pi];
        for (const o of p.objections ?? []) {
          const t = o.trim();
          // Drop persona-mismatch noise ("non-smoker, this isn't for
          // me") and generic contextless price grumbles ("가격이
          // 높음" / "expensive") at source. Mismatch isn't a market
          // blocker (just out-of-target personas), and generic price
          // grumbles surface in 90%+ of personas across every country
          // for any premium product — they drown out the actually
          // differentiating blockers (climate fit, scene alignment,
          // category-specific concerns) that the report is supposed
          // to surface. Specific price objections with a competitor
          // anchor or recurring-purchase frame ("Allbirds 대비 비쌈",
          // "월 구독료 부담") survive isGenericPriceObjection's
          // length + anchor checks.
          if (
            t &&
            !isPersonaMismatchNoise(t) &&
            !isGenericPriceObjection(t) &&
            !isGenericLaunchConcern(t) &&
            !isBareAdjectiveSignal(t)
          ) {
            allObjections.push(t);
            objectionPersonaIds.push(pi);
          }
        }
      }
      const topObjections = clusterStrings(allObjections, 0.5, {
        personaIds: objectionPersonaIds,
      })
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
      const allTrust: string[] = [];
      const trustPersonaIds: number[] = [];
      for (let pi = 0; pi < inCountry.length; pi++) {
        const p = inCountry[pi];
        for (const t of p.trustFactors ?? []) {
          const tt = t.trim();
          // Same source-side filter logic as objections — drop generic
          // category-default trust signals ("편안한 착용감" / "good
          // quality") that the LLM emits as a safe slot-filler for
          // every persona regardless of profile. They absorb 99% of
          // the cluster and bury the actually differentiating trust
          // factors (brand positioning, certifications, channel
          // claims). Specific trust factors with a brand / cert /
          // channel anchor survive isGenericTrustFactor's checks.
          if (tt && !isGenericTrustFactor(tt) && !isBareAdjectiveSignal(tt)) {
            allTrust.push(tt);
            trustPersonaIds.push(pi);
          }
        }
      }
      const topTrustFactors = clusterStrings(allTrust, 0.5, {
        personaIds: trustPersonaIds,
      })
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
      // Rationale samples — pick the 3 longest unique strings as a proxy
      // for "most informative". Cheap, deterministic, no LLM call needed.
      const rationaleSeen = new Set<string>();
      const rationaleSamples = b.rationales
        .filter((r) => {
          const k = r.slice(0, 80);
          if (rationaleSeen.has(k)) return false;
          rationaleSeen.add(k);
          return true;
        })
        .sort((a, b) => b.length - a.length)
        .slice(0, 3);
      // Components are aggregated only when at least one sim emitted them
      // (avoid showing a radar of all-zeros for legacy data). Threshold of
      // 1 — even a single signal is better than dropping the section.
      const hasComponents = b.components.marketSize.length > 0;
      const components = hasComponents
        ? {
            marketSize: {
              mean: round1(mean(b.components.marketSize)),
              median: round1(median(b.components.marketSize)),
            },
            culturalFit: {
              mean: round1(mean(b.components.culturalFit)),
              median: round1(median(b.components.culturalFit)),
            },
            channelMatch: {
              mean: round1(mean(b.components.channelMatch)),
              median: round1(median(b.components.channelMatch)),
            },
            priceCompat: {
              mean: round1(mean(b.components.priceCompat)),
              median: round1(median(b.components.priceCompat)),
            },
            competition: {
              mean: round1(mean(b.components.competition)),
              median: round1(median(b.components.competition)),
            },
            regulatory: {
              mean: round1(mean(b.components.regulatory)),
              median: round1(median(b.components.regulatory)),
            },
          }
        : undefined;
      // Within-sim std of finalScore — populated by runner.ts since
      // 2026-05-06. Combine with across-sim std via law of total variance:
      //   Var_total = E[Var_within] + Var[Mean_across]
      // so combinedStd is the "true" ensemble noise level. Falls back to
      // across-sim std when no sim carries within-sim data (legacy).
      const withinStds = b.finalStds ?? [];
      const acrossStd = std(b.final);
      const withinSimStdMean =
        withinStds.length > 0 ? mean(withinStds) : undefined;
      const combinedStd =
        withinSimStdMean !== undefined
          ? Math.sqrt(
              mean(withinStds.map((s) => s * s)) + acrossStd * acrossStd,
            )
          : undefined;
      return {
        country,
        finalScore: {
          mean: round1(mean(b.final)),
          median: round1(median(b.final)),
          std: round1(acrossStd),
          min: round1(Math.min(...b.final)),
          max: round1(Math.max(...b.final)),
          range: round1(Math.max(...b.final) - Math.min(...b.final)),
          withinSimStdMean:
            withinSimStdMean !== undefined ? round1(withinSimStdMean) : undefined,
          combinedStd: combinedStd !== undefined ? round1(combinedStd) : undefined,
        },
        demandScore: { mean: round1(mean(b.demand)), median: round1(median(b.demand)) },
        cacEstimateUsd: { mean: round2(mean(b.cac)), median: round2(median(b.cac)) },
        // Take the first sim's cacRationale as the representative — they
        // mostly agree on assumed channel mix for the same country/category,
        // and showing one clean breakdown is more useful than concatenating
        // 15 versions. Empty when no sim emitted (legacy data).
        cacRationale: b.cacRationales[0],
        competitionScore: { mean: round1(mean(b.comp)), median: round1(median(b.comp)) },
        components,
        detail: {
          rationaleSamples,
          topObjections,
          topTrustFactors,
          persona: {
            count: inCountry.length,
            meanIntent: intents.length > 0 ? Math.round(mean(intents)) : 0,
            highIntent: inCountry.filter((p) => p.purchaseIntent >= 70).length,
            lowIntent: inCountry.filter((p) => p.purchaseIntent < 35).length,
          },
          funnel: (() => {
            const withAd = inCountry.filter((p) => !!p.adReaction);
            if (withAd.length === 0) return null;
            const curiositySum = withAd.reduce(
              (s, p) => s + (p.adReaction?.curiosity ?? 0),
              0,
            );
            const clickCount = withAd.filter((p) => p.adReaction?.wouldClick === true).length;
            const buyCount = withAd.filter((p) => p.purchaseIntent >= 60).length;
            return {
              curiosityMean: Math.round((curiositySum / withAd.length) * 10) / 10,
              clickRatePct: Math.round((clickCount / withAd.length) * 100),
              buyRatePct: Math.round((buyCount / withAd.length) * 100),
              sample: withAd.length,
            };
          })(),
        },
      };
    })
    .sort((a, b) => b.finalScore.median - a.finalScore.median);

  // ── per-segment best country ──
  const segments: SegmentRec[] = [
    pickSegment(buckets, "volume", "속도 우선 (highest demand)", "demand", "high"),
    pickSegment(buckets, "cac", "비용 효율 (lowest CAC)", "cac", "low"),
    pickSegment(buckets, "competition", "경쟁 회피 (lowest competition)", "comp", "low"),
    pickSegment(buckets, "overall", "종합 점수 (highest finalScore)", "final", "high"),
  ];

  // ── effective personas across all sims ──
  let effectivePersonas = 0;
  for (const s of sims) {
    for (const v of Object.values(s.personaIntentByCountry)) effectivePersonas += v.n;
  }

  // ── variance assessment ──
  const ranges = countryStats.map((c) => c.finalScore.range);
  const maxR = Math.max(...ranges);
  const meanR = mean(ranges);
  let label: "low" | "moderate" | "high" = "low";
  let note = "Single-sim answer would have been reliable.";
  if (maxR > 30) {
    label = "high";
    note = "Same fixture produces very different country scores per run. Trust the ensemble; single sim alone would be unreliable.";
  } else if (maxR > 15) {
    label = "moderate";
    note = "Moderate run-to-run variance. Ensemble adds meaningful confidence.";
  }

  // ── provider breakdown (only when sims span 2+ providers) ──
  const providerBreakdown = computeProviderBreakdown(sims, winner?.country ?? null);

  // ── personas / pricing / creative aggregates ──
  const personas = computePersonasAggregate(sims);
  const pricing = computePricingAggregate(sims);
  const creative = computeCreativeAggregate(sims);

  // ── reference data sources (stashed on overview by runner) ──
  // All sims in an ensemble run against the same project fixture, so the
  // sources list is identical across sims — pull from the first one that
  // has it. _sources is deliberately untyped on Overview because runner.ts
  // tacks it on after schema parsing for persistence.
  let sources: string[] | undefined;
  for (const s of sims) {
    const ov = s.overview as { _sources?: unknown } | undefined;
    if (ov?._sources && Array.isArray(ov._sources) && ov._sources.length > 0) {
      sources = ov._sources.filter((x): x is string => typeof x === "string");
      break;
    }
  }

  return {
    simCount,
    effectivePersonas,
    bestCountryDistribution,
    recommendation: {
      country: winner?.country ?? "?",
      consensusPercent,
      confidence,
    },
    countryStats,
    segments,
    providerBreakdown,
    personas,
    sources,
    pricing,
    creative,
    varianceAssessment: {
      maxFinalScoreRange: round1(maxR),
      meanFinalScoreRange: round1(meanR),
      label,
      note,
    },
  };
}

function computePersonasAggregate(
  sims: EnsembleSimSnapshot[],
): PersonasAggregate | undefined {
  const all: NonNullable<EnsembleSimSnapshot["personas"]>[number][] = [];
  for (const s of sims) {
    if (s.personas) all.push(...s.personas);
  }
  if (all.length === 0) return undefined;

  const intents = all.map((p) => p.purchaseIntent);
  const intentMean = round1(mean(intents));
  const intentMedian = round1(median(intents));
  const highIntentCount = all.filter((p) => p.purchaseIntent >= 70).length;
  const lowIntentCount = all.filter((p) => p.purchaseIntent < 35).length;

  // Histogram in 10-wide bins. We include 100 in the [90, 100] bin so the
  // top end isn't a singleton.
  const bins: PersonasAggregate["intentHistogram"] = [];
  for (let i = 0; i < 100; i += 10) {
    const top = i + 10;
    const inBin = all.filter((p) => {
      const v = p.purchaseIntent;
      return top === 100 ? v >= i && v <= 100 : v >= i && v < top;
    }).length;
    bins.push({ binStart: i, binEnd: top, count: inBin });
  }

  // Per-country aggregates.
  const byCountryMap = new Map<string, number[]>();
  for (const p of all) {
    const k = (p.country ?? "?").toUpperCase();
    const arr = byCountryMap.get(k) ?? [];
    arr.push(p.purchaseIntent);
    byCountryMap.set(k, arr);
  }
  const byCountry = [...byCountryMap.entries()]
    .map(([country, arr]) => ({
      country,
      count: arr.length,
      meanIntent: round1(mean(arr)),
      medianIntent: round1(median(arr)),
    }))
    .sort((a, b) => b.count - a.count);

  // Top voices, deduped on first 60 chars (cheap dedup; if two personas
  // really did say the same thing in different sims, that's signal too).
  const withVoice = all.filter((p) => p.voice && p.voice.trim().length > 0);
  const seen = new Set<string>();
  const dedup = (
    arr: typeof withVoice,
    take: number,
  ): PersonasAggregate["topPositiveVoices"] => {
    const out: PersonasAggregate["topPositiveVoices"] = [];
    for (const p of arr) {
      const key = (p.voice ?? "").slice(0, 60);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        text: p.voice ?? "",
        country: p.country,
        intent: p.purchaseIntent,
        profession: p.profession,
        ageRange: p.ageRange,
      });
      if (out.length >= take) break;
    }
    return out;
  };
  const topPositiveVoices = dedup(
    [...withVoice].sort((a, b) => b.purchaseIntent - a.purchaseIntent),
    5,
  );
  // Reset dedup so positives don't poison negatives (a low-intent voice
  // might share a phrase with a high-intent one).
  seen.clear();
  const topNegativeVoices = dedup(
    [...withVoice].sort((a, b) => a.purchaseIntent - b.purchaseIntent),
    5,
  );

  // Demographics — ageRange comes through as freeform LLM strings ("25-34",
  // "22-30", "30s", "30대" etc.). Same normalisation as the segment view
  // so the histogram and the segment table speak the same buckets.
  const ageBucketMap = new Map<string, number>();
  for (const p of all) {
    const bucket = normaliseAge(p.ageRange);
    if (!bucket) continue;
    ageBucketMap.set(bucket, (ageBucketMap.get(bucket) ?? 0) + 1);
  }
  const ageOrder = ["<20", "20-29", "30-39", "40-49", "50-59", "60+"];
  const ageDistribution = [...ageBucketMap.entries()]
    .map(([bucket, count]) => ({ bucket, count }))
    .sort((a, b) => ageOrder.indexOf(a.bucket) - ageOrder.indexOf(b.bucket));

  // Per-profession aggregation: count + mean intent. The mean lets the
  // PDF show "Designers loved it (78), Engineers skeptical (52)" — a
  // signal the headline aggregate hides.
  const profStats = new Map<string, { count: number; intentSum: number }>();
  for (const p of all) {
    if (!p.profession) continue;
    const cur = profStats.get(p.profession) ?? { count: 0, intentSum: 0 };
    cur.count += 1;
    cur.intentSum += p.purchaseIntent ?? 0;
    profStats.set(p.profession, cur);
  }
  const professionTopN = [...profStats.entries()]
    .map(([profession, s]) => ({
      profession,
      count: s.count,
      meanIntent: Math.round(s.intentSum / s.count),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  // Segment cuts. Each cut buckets personas by a demographic field, then
  // collapses to one row per bucket: count + mean intent + the country
  // members of that bucket most often choose as #1. The "country choice"
  // here is the persona's own country field — we treat that as their
  // primary market interest because the schema doesn't have a per-
  // persona target-market preference. Buckets with <10 personas get
  // dropped (means too noisy to be actionable).
  const segmentBreakdown = {
    byGender: bucketIntoSegments(all, (p) => normaliseGender(p.gender)),
    byAge: bucketIntoSegments(all, (p) => normaliseAge(p.ageRange)),
    byIncome: bucketIntoSegments(all, (p) => normaliseIncome(p.incomeBand)),
  };

  const channelMentions = extractChannelMentions(all);
  const archetypes = computeArchetypes(all);

  return {
    total: all.length,
    byCountry,
    intentHistogram: bins,
    intentMean,
    intentMedian,
    highIntentCount,
    lowIntentCount,
    topPositiveVoices,
    topNegativeVoices,
    ageDistribution,
    professionTopN,
    segmentBreakdown,
    channelMentions,
    archetypes,
  };
}

/**
 * Persona archetype clustering — rule-based, no ML.
 *
 * The five buckets are picked to map cleanly to GTM decisions:
 *   - Champion: high intent + curious + would click → primary acquisition target
 *   - Curious: high curiosity but low intent → ad-budget audience, conversion gap
 *   - Conditional: middle intent → the persuadable middle, where copy/price moves the needle
 *   - Skeptic: low intent + multiple objections → don't waste cycles
 *   - Walker: low curiosity + low intent → pass them by entirely
 *
 * Personas without adReaction (legacy) get bucketed by intent alone:
 *   - intent ≥ 70 → champion
 *   - intent 50-69 → conditional
 *   - intent 35-49 → skeptic
 *   - intent < 35 → walker
 *
 * Returns archetypes sorted by count descending, dropping any whose
 * count is < 3 (too small to be a real segment).
 */
function computeArchetypes(
  personas: NonNullable<EnsembleSimSnapshot["personas"]>,
): PersonaArchetype[] {
  type Slot = NonNullable<EnsembleSimSnapshot["personas"]>[number];
  const buckets: Record<PersonaArchetype["id"], Slot[]> = {
    champion: [],
    curious: [],
    conditional: [],
    skeptic: [],
    walker: [],
  };

  for (const p of personas) {
    const intent = p.purchaseIntent;
    const ar = p.adReaction;
    if (ar) {
      // Full 5-bucket logic when we have curiosity/click signal.
      if (intent >= 70 && ar.wouldClick) buckets.champion.push(p);
      else if (ar.curiosity >= 60 && intent < 50) buckets.curious.push(p);
      else if (intent >= 50 && intent < 70) buckets.conditional.push(p);
      else if (intent < 35 && ar.curiosity < 40) buckets.walker.push(p);
      else buckets.skeptic.push(p);
    } else {
      // Intent-only fallback for legacy personas.
      if (intent >= 70) buckets.champion.push(p);
      else if (intent >= 50) buckets.conditional.push(p);
      else if (intent >= 35) buckets.skeptic.push(p);
      else buckets.walker.push(p);
    }
  }

  const total = personas.length;
  const labels: Record<PersonaArchetype["id"], string> = {
    champion: "Champion",
    curious: "Curious",
    conditional: "Conditional",
    skeptic: "Skeptic",
    walker: "Walker",
  };

  const out: PersonaArchetype[] = [];
  for (const id of Object.keys(buckets) as PersonaArchetype["id"][]) {
    const slot = buckets[id];
    if (slot.length < 3) continue;
    const intents = slot.map((p) => p.purchaseIntent);
    const meanIntent = Math.round(intents.reduce((a, b) => a + b, 0) / intents.length);
    const curiosities = slot
      .map((p) => p.adReaction?.curiosity)
      .filter((c): c is number => typeof c === "number");
    const meanCuriosity =
      curiosities.length > 0
        ? Math.round(curiosities.reduce((a, b) => a + b, 0) / curiosities.length)
        : null;

    // Top demographic in bucket — simple mode of bucket field.
    const modeOf = <T extends string>(items: Array<T | undefined | null>): T | null => {
      const m = new Map<T, number>();
      for (const it of items) {
        if (!it) continue;
        m.set(it, (m.get(it) ?? 0) + 1);
      }
      const arr = [...m.entries()].sort((a, b) => b[1] - a[1]);
      return arr[0]?.[0] ?? null;
    };
    const topProfession = modeOf(slot.map((p) => p.profession));
    const topAgeBucket = modeOf(slot.map((p) => normaliseAge(p.ageRange)));
    const topIncomeBucket = modeOf(slot.map((p) => normaliseIncome(p.incomeBand)));

    // Top trust factor / objection — concatenate then count.
    const topTrustFactor = modeOf(slot.flatMap((p) => p.trustFactors ?? []));
    const topObjection = modeOf(slot.flatMap((p) => p.objections ?? []));

    // Representative quote — sort within bucket by intent (desc for
    // positive archetypes, asc for negatives) so the most "convicted"
    // voice in the segment surfaces. Falls back to any non-empty quote.
    const positiveSign = id === "champion" || id === "conditional" || id === "curious";
    const sorted = [...slot].sort((a, b) =>
      positiveSign ? b.purchaseIntent - a.purchaseIntent : a.purchaseIntent - b.purchaseIntent,
    );
    const repPersona = sorted.find(
      (p) => typeof p.voice === "string" && p.voice.trim().length >= 8,
    );
    const representativeQuote = repPersona?.voice
      ? {
          text: repPersona.voice,
          country: repPersona.country,
          intent: repPersona.purchaseIntent,
          profession: repPersona.profession,
        }
      : null;

    out.push({
      id,
      label: labels[id],
      count: slot.length,
      share: total > 0 ? slot.length / total : 0,
      meanIntent,
      meanCuriosity,
      topProfession,
      topAgeBucket,
      topIncomeBucket,
      topTrustFactor,
      topObjection,
      representativeQuote,
    });
  }

  // Sort by count desc — the largest archetype is usually the one the
  // user should focus on first.
  return out.sort((a, b) => b.count - a.count);
}

/**
 * Curated brand / channel dictionary. Each entry maps a canonical
 * display name to a list of substring patterns we'll match (case-
 * insensitive). Patterns intentionally include common Korean / Latin
 * variants and stylised spellings so the same channel matches whether
 * the persona writes "Amazon US" or "Amazon.com" or "아마존".
 *
 * Add new entries here as fixtures surface them — the goal isn't an
 * exhaustive list of every brand on Earth, just the high-frequency
 * D2C / retail / social touchpoints relevant to K-product expansion.
 */
const CHANNEL_DICTIONARY: Array<{ display: string; patterns: string[] }> = [
  { display: "Amazon", patterns: ["amazon", "아마존"] },
  { display: "TikTok Shop", patterns: ["tiktok shop", "tiktokshop", "틱톡샵", "틱톡 샵"] },
  { display: "TikTok", patterns: ["tiktok", "틱톡"] },
  { display: "Instagram", patterns: ["instagram", "인스타그램", "인스타", "ig "] },
  { display: "Sephora", patterns: ["sephora", "세포라"] },
  { display: "Ulta", patterns: ["ulta beauty", "ulta"] },
  { display: "YesStyle", patterns: ["yesstyle", "예스스타일"] },
  { display: "Stylevana", patterns: ["stylevana", "스타일바나"] },
  { display: "Olive Young", patterns: ["olive young", "oliveyoung", "올리브영"] },
  { display: "Style Korean", patterns: ["stylekorean", "style korean"] },
  { display: "Watsons", patterns: ["watsons", "왓슨스"] },
  { display: "Reddit", patterns: ["reddit", "레딧", "/r/"] },
  { display: "YouTube", patterns: ["youtube", "youtuber", "유튜브", "유튜버"] },
  { display: "Cosme.com", patterns: ["cosme.com", "cosme.net", "@cosme", "atcosme"] },
  { display: "Rakuten", patterns: ["rakuten", "라쿠텐"] },
  { display: "Shopee", patterns: ["shopee", "쇼피"] },
  { display: "Lazada", patterns: ["lazada", "라자다"] },
  { display: "Boots", patterns: ["boots uk", "boots.com", "boots "] },
  { display: "Cult Beauty", patterns: ["cult beauty", "cultbeauty"] },
  { display: "Beauty Bay", patterns: ["beauty bay", "beautybay"] },
  { display: "Qoo10", patterns: ["qoo10", "큐텐"] },
  { display: "Coupang", patterns: ["coupang", "쿠팡"] },
  { display: "Naver", patterns: ["naver shopping", "네이버 쇼핑", "스마트스토어", "네이버"] },
  { display: "11st", patterns: ["11번가", "11st"] },
  { display: "Walmart", patterns: ["walmart", "월마트"] },
  { display: "Target", patterns: ["target.com", "target store"] },
  { display: "Influencer", patterns: ["influencer", "인플루언서", "blogger", "블로거"] },
];

function extractChannelMentions(personas: RawPersona[]): ChannelMentionRow[] {
  const total = personas.length;
  if (total === 0) return [];

  // For each channel, count how many personas mention it (1 mention per
  // persona, even if the same channel appears in voice + trustFactors).
  // Also track the intent of each mentioning persona so we can compute
  // a per-channel mean intent — high mean intent + high mention count
  // = the channel where conversion-ready buyers already live.
  const stats = new Map<string, { mentions: number; intentSum: number }>();

  for (const p of personas) {
    const haystack = [
      p.voice ?? "",
      ...(p.trustFactors ?? []),
      ...(p.objections ?? []),
    ]
      .join(" \n ")
      .toLowerCase();
    if (!haystack.trim()) continue;

    const matched = new Set<string>();
    for (const entry of CHANNEL_DICTIONARY) {
      if (matched.has(entry.display)) continue;
      for (const pat of entry.patterns) {
        if (haystack.includes(pat)) {
          matched.add(entry.display);
          break;
        }
      }
    }
    for (const channel of matched) {
      const cur = stats.get(channel) ?? { mentions: 0, intentSum: 0 };
      cur.mentions += 1;
      cur.intentSum += p.purchaseIntent;
      stats.set(channel, cur);
    }
  }

  return [...stats.entries()]
    .map(([channel, s]) => ({
      channel,
      mentions: s.mentions,
      share: Math.round((s.mentions / total) * 100),
      meanIntent: round1(s.intentSum / s.mentions),
    }))
    .sort((a, b) => b.mentions - a.mentions)
    .slice(0, 15);
}

const SEGMENT_MIN_COUNT = 10;

interface RawPersona {
  country: string;
  purchaseIntent: number;
  voice?: string;
  ageRange?: string;
  profession?: string;
  gender?: string;
  incomeBand?: string;
  trustFactors?: string[];
  objections?: string[];
}

function bucketIntoSegments(
  personas: RawPersona[],
  bucketFn: (p: RawPersona) => string | null,
): SegmentBreakdownRow[] {
  const buckets = new Map<string, RawPersona[]>();
  for (const p of personas) {
    const key = bucketFn(p);
    if (!key) continue;
    const arr = buckets.get(key) ?? [];
    arr.push(p);
    buckets.set(key, arr);
  }
  const rows: SegmentBreakdownRow[] = [];
  for (const [bucket, members] of buckets.entries()) {
    if (members.length < SEGMENT_MIN_COUNT) continue;
    const meanIntent = round1(mean(members.map((m) => m.purchaseIntent)));
    // Top country = the most-frequently-listed home country among this
    // bucket's personas. Tie-break alphabetical for stability.
    const countryCounts = new Map<string, number>();
    for (const m of members) {
      countryCounts.set(m.country, (countryCounts.get(m.country) ?? 0) + 1);
    }
    const topEntry = [...countryCounts.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    )[0];
    const topCountry = topEntry?.[0] ?? "?";
    const topCountryShare = topEntry
      ? Math.round((topEntry[1] / members.length) * 100)
      : 0;
    rows.push({
      bucket,
      count: members.length,
      meanIntent,
      topCountry,
      topCountryShare,
    });
  }
  // Sort by count desc so the largest segment is first.
  rows.sort((a, b) => b.count - a.count);
  return rows;
}

function normaliseGender(g: string | undefined): string | null {
  if (!g) return null;
  const t = g.trim().toLowerCase();
  if (!t) return null;
  // LLM occasionally returns "F", "Female", "여성", "female", etc. Keep
  // the canonical pair so segments don't fragment across labels.
  if (t.startsWith("f") || t.includes("female") || t.includes("여")) return "female";
  if (t.startsWith("m") || t.includes("male") || t.includes("남")) return "male";
  if (t.includes("non") || t.includes("nb") || t.includes("기타") || t.includes("other"))
    return "other";
  return null;
}

// LLM ageRange comes through as freeform: "27", "25-34", "30s", "30대",
// "22-30", "32-42" etc. If we don't normalise to a fixed bucket set, every
// slightly different range becomes its own row and the segment view turns
// into a 30-row mush. Strategy: collapse everything to decade buckets
// (20-29 / 30-39 / 40-49 / 50-59 / 60+). For ranges, use the midpoint to
// pick the bucket so "22-30" and "25-30" both land in 20-29.
function normaliseAge(a: string | undefined): string | null {
  if (!a) return null;
  const t = a.trim();
  if (!t) return null;
  let center: number | null = null;
  // Range: "22-30", "25–34" etc.
  const rangeMatch = t.match(/^\s*(\d{1,2})\s*[-–~]\s*(\d{1,2})\s*$/);
  if (rangeMatch) {
    const lo = parseInt(rangeMatch[1], 10);
    const hi = parseInt(rangeMatch[2], 10);
    if (Number.isFinite(lo) && Number.isFinite(hi)) center = (lo + hi) / 2;
  }
  if (center == null) {
    // "30s" / "30대" — already decade-shaped.
    const decadeMatch = t.match(/^(\d{1,2})\s*(s|대)$/i);
    if (decadeMatch) {
      const d = parseInt(decadeMatch[1], 10);
      if (Number.isFinite(d)) center = d + 5;
    }
  }
  if (center == null) {
    // Single integer "27".
    const num = parseInt(t, 10);
    if (Number.isFinite(num) && num > 0 && num < 120) center = num;
  }
  if (center == null) return null;
  if (center < 20) return "<20";
  if (center < 30) return "20-29";
  if (center < 40) return "30-39";
  if (center < 50) return "40-49";
  if (center < 60) return "50-59";
  return "60+";
}

// LLM-emitted incomeBand strings are extremely freeform — every persona
// gets a slightly different label like "연 ¥3.5M-¥5M (~$25-36k USD)" or
// "$52k-$78k (이커머스 큐레이터)". Without bucketing, ~95% of values are
// singletons and the 10-person noise floor wipes out the entire panel.
// Strategy: extract the first $X(k) figure (works on the vast majority
// because non-USD personas include a (~$xx USD) parenthetical), then
// bucket into 5 coarse USD bands so groups consistently clear the floor.
function normaliseIncome(i: string | undefined): string | null {
  if (!i) return null;
  const t = i.trim();
  if (!t) return null;
  let kUsd: number | null = null;
  const kMatch = t.match(/\$\s*(\d{1,4})(?:\s*[-–~to]+\s*\$?\s*\d{1,4})?\s*[kK]/);
  if (kMatch) {
    kUsd = parseInt(kMatch[1], 10);
  } else {
    // Try plain dollar amount with comma like "$45,000"
    const fullMatch = t.match(/\$\s*(\d{1,3}),(\d{3})/);
    if (fullMatch) kUsd = Math.round((parseInt(fullMatch[1], 10) * 1000 + parseInt(fullMatch[2], 10)) / 1000);
  }
  if (kUsd == null) return null;
  if (kUsd < 30) return "<$30k";
  if (kUsd < 60) return "$30-60k";
  if (kUsd < 100) return "$60-100k";
  if (kUsd < 150) return "$100-150k";
  return "$150k+";
}

function computePricingAggregate(
  sims: EnsembleSimSnapshot[],
): PricingAggregate | undefined {
  const present = sims.filter((s) => s.pricing);
  if (present.length === 0) return undefined;

  const recs = present.map((s) => s.pricing!.recommendedPriceCents);
  const sortedRecs = [...recs].sort((a, b) => a - b);
  const p25 = sortedRecs[Math.floor(sortedRecs.length * 0.25)] ?? sortedRecs[0];
  const p75 = sortedRecs[Math.floor(sortedRecs.length * 0.75)] ?? sortedRecs[sortedRecs.length - 1];

  // Variance breakdown — across-sim, within-sim (LLM rolls), and the
  // combined "true noise" via law of total variance. Lets the UI show
  // honest uncertainty even when LLMs converge on identical psychological
  // anchor prices ($49.95) across all sims.
  const acrossSimStd = std(recs);
  type PricingWithStd = NonNullable<EnsembleSimSnapshot["pricing"]> & {
    recommendedPriceStd?: number;
  };
  const withinStds = present
    .map((s) => (s.pricing as PricingWithStd).recommendedPriceStd)
    .filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  const recommendedPriceWithinSimStdMean =
    withinStds.length > 0 ? mean(withinStds) : undefined;
  const recommendedPriceCombinedStd =
    recommendedPriceWithinSimStdMean !== undefined
      ? Math.sqrt(
          mean(withinStds.map((s) => s * s)) + acrossSimStd * acrossSimStd,
        )
      : undefined;
  // When all sims landed on the exact same recommended price, capture
  // it so the UI can render "All N sims converged on $X" instead of a
  // confusing zero-width "$X – $X" range. Also fires for the single-sim
  // case (hypothesis tier) — there the UI suppresses the "all sims"
  // framing via simCount === 1, but we still need the value here so the
  // legacy mid-50% bullet ("$X – $X") doesn't reappear.
  const allSame = recs.length >= 1 && recs.every((r) => r === recs[0]);
  const recommendedPriceUnanimousAt = allSame ? recs[0] : null;

  // Mode of margin estimates.
  const marginCounts = new Map<string, number>();
  for (const s of present) {
    const m = s.pricing!.marginEstimate;
    marginCounts.set(m, (marginCounts.get(m) ?? 0) + 1);
  }
  const marginEstimate =
    [...marginCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

  // Median of numeric margin %s — drives the break-even 3-scenario
  // table. Filtered to numeric values; absent when no sim emitted.
  type PricingWithMarginPct = NonNullable<EnsembleSimSnapshot["pricing"]> & {
    marginEstimatePct?: number;
  };
  const marginPcts = present
    .map((s) => (s.pricing as PricingWithMarginPct).marginEstimatePct)
    .filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  const marginEstimatePct =
    marginPcts.length > 0 ? Math.round(median(marginPcts)) : undefined;

  // Bucket curve points proportionally — sims pick slightly different
  // price grids (e.g. $134.09 vs $134.39) which exact-match bucketing
  // leaves as separate points, producing a noisy curve. We compute a
  // bucket width from the actual price range so ~15-20 buckets span
  // the curve, collapsing nearby points.
  const allPricePoints = present.flatMap((s) =>
    s.pricing!.curve.map((p) => p.priceCents),
  );
  let bucketSize = 1;
  if (allPricePoints.length > 1) {
    const minP = Math.min(...allPricePoints);
    const maxP = Math.max(...allPricePoints);
    const range = maxP - minP;
    // Target ~15 buckets across the range. Rounded to a "nice" power-of-10
    // multiplier so bucket boundaries are readable (e.g. snap to nearest
    // ₩1,000 / $0.10 / etc.). Floor at 1 cent so we never divide by zero.
    bucketSize = Math.max(1, Math.round(range / 15));
    // Snap to a nice round multiple — biggest power of 10 that fits.
    const magnitude = Math.pow(10, Math.floor(Math.log10(bucketSize)));
    bucketSize = Math.max(magnitude, Math.round(bucketSize / magnitude) * magnitude);
  }

  const curveBuckets = new Map<number, { sum: number; count: number }>();
  for (const s of present) {
    for (const point of s.pricing!.curve) {
      const key = Math.round(point.priceCents / bucketSize) * bucketSize;
      const cur = curveBuckets.get(key) ?? { sum: 0, count: 0 };
      cur.sum += point.conversionProbability;
      cur.count += 1;
      curveBuckets.set(key, cur);
    }
  }
  const curve = [...curveBuckets.entries()]
    .map(([priceCents, v]) => ({
      priceCents,
      meanConversionProbability:
        Math.round((v.sum / v.count) * 1000) / 1000,
      sampleCount: v.count,
    }))
    .sort((a, b) => a.priceCents - b.priceCents);

  const recommendedPriceCents = median(recs);

  // Curve-derived revenue max — independent verification of the LLM's
  // claimed recommendation. We compute argmax(price × conversion) on
  // the consensus curve. If the LLM's "recommended" sits far from this
  // point, it likely anchored on the base price instead of actually
  // optimising. Also useful for the report sensitivity matrix.
  // Compute curve revenue max via the shared helper — uses a monotonic-
  // decreasing envelope to ignore high-price noise bumps the LLM
  // occasionally produces. See pricing-sensitivity.ts for details.
  const curveRevenueMaxCents = computeCurveRevenueMaxCents(curve);
  let recommendationMatchesCurve: boolean | null = null;
  if (curveRevenueMaxCents != null && recommendedPriceCents > 0) {
    const ratio = curveRevenueMaxCents / recommendedPriceCents;
    // Within ±10% counts as "agrees with curve". Wider gap means
    // the LLM is making a different call than its own data supports.
    recommendationMatchesCurve = ratio >= 0.9 && ratio <= 1.1;
  }

  // Range + competitor metadata are project-level (same across sims);
  // pull from the first sim that emitted them.
  type PricingWithMeta = NonNullable<EnsembleSimSnapshot["pricing"]> & {
    range?: { minCents: number; maxCents: number; rationale: string[] };
    competitorPrices?: Array<{
      url: string;
      priceCents: number;
      productName?: string;
      sourceCurrency?: string;
    }>;
  };
  const firstWithMeta = present.find(
    (s) => (s.pricing as PricingWithMeta | undefined)?.range,
  );
  const range = (firstWithMeta?.pricing as PricingWithMeta | undefined)?.range;
  const firstWithCompetitors = present.find(
    (s) => ((s.pricing as PricingWithMeta | undefined)?.competitorPrices ?? []).length > 0,
  );
  const competitorPrices = (firstWithCompetitors?.pricing as PricingWithMeta | undefined)
    ?.competitorPrices;

  return {
    recommendedPriceCents,
    recommendedPriceMedian: recommendedPriceCents,
    recommendedPriceP25: p25,
    recommendedPriceP75: p75,
    recommendedPriceAcrossSimStd: Math.round(acrossSimStd),
    recommendedPriceWithinSimStdMean:
      recommendedPriceWithinSimStdMean !== undefined
        ? Math.round(recommendedPriceWithinSimStdMean)
        : undefined,
    recommendedPriceCombinedStd:
      recommendedPriceCombinedStd !== undefined
        ? Math.round(recommendedPriceCombinedStd)
        : undefined,
    recommendedPriceUnanimousAt,
    marginEstimate,
    marginEstimatePct,
    curve,
    curveRevenueMaxCents,
    recommendationMatchesCurve,
    range,
    competitorPrices,
    sensitivity: computePricingSensitivityShared(curve, recommendedPriceCents),
  };
}

function computeCreativeAggregate(
  sims: EnsembleSimSnapshot[],
): CreativeAggregate | undefined {
  const present = sims.filter((s) => s.creative && s.creative.length > 0);
  if (present.length === 0) return undefined;

  // Cluster assets by name similarity instead of exact-key bucketing.
  // The LLM emits a wide variety of names for the same underlying
  // concept ("Cherry Cola" / "체리콜라" / "체리 콜라" / "Cherry Cola 팟
  // 패키지 — 레드·블랙 클래식 컬러"). Lowercasing alone left them as
  // separate keys and the dashboard showed 5 product variants as ~25
  // entries.
  //
  // Approach: tokenise each name (KO+EN, with Hangul bigrams for
  // morphology resilience) and union-find pairs with overlap-coefficient
  // ≥ 0.5. Threshold high enough to keep distinct flavors separate
  // ("Cherry Cola" vs "Peachy Plum" share no content tokens) but loose
  // enough to merge naming variations of the same concept.
  type AssetEntry = {
    assetName: string;
    score: number;
    strengths: string[];
    weaknesses: string[];
    tokens: Set<string>;
  };
  const entries: AssetEntry[] = [];
  for (const s of present) {
    for (const a of s.creative!) {
      entries.push({
        assetName: a.assetName,
        score: a.score,
        strengths: a.strengths,
        weaknesses: a.weaknesses,
        tokens: tokenize(a.assetName),
      });
    }
  }
  // Union-find by overlap-coefficient ≥ 0.5 on tokenised names.
  const parent = entries.map((_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      if (overlapCoefficient(entries[i].tokens, entries[j].tokens) >= 0.5) {
        union(i, j);
      }
    }
  }
  // Bucket by cluster root.
  const byCluster = new Map<
    number,
    {
      names: Map<string, number>; // name → frequency for picking display
      scores: number[];
      strengths: Map<string, number>;
      weaknesses: Map<string, number>;
    }
  >();
  for (let i = 0; i < entries.length; i++) {
    const root = find(i);
    const e = entries[i];
    const cur = byCluster.get(root) ?? {
      names: new Map<string, number>(),
      scores: [] as number[],
      strengths: new Map<string, number>(),
      weaknesses: new Map<string, number>(),
    };
    cur.names.set(e.assetName, (cur.names.get(e.assetName) ?? 0) + 1);
    cur.scores.push(e.score);
    for (const x of e.strengths) cur.strengths.set(x, (cur.strengths.get(x) ?? 0) + 1);
    for (const x of e.weaknesses) cur.weaknesses.set(x, (cur.weaknesses.get(x) ?? 0) + 1);
    byCluster.set(root, cur);
  }

  return {
    assets: [...byCluster.values()]
      .map((a) => ({
        // Display name = most-frequent variant in the cluster, ties
        // broken by shortest (concise > verbose for headlines).
        assetName: [...a.names.entries()].sort((x, y) => {
          if (y[1] !== x[1]) return y[1] - x[1];
          return x[0].length - y[0].length;
        })[0][0],
        meanScore: round1(mean(a.scores)),
        topStrengths: [...a.strengths.entries()]
          .map(([point, n]) => ({ point, surfacedInSims: n }))
          .sort((a, b) => b.surfacedInSims - a.surfacedInSims)
          .slice(0, 6),
        topWeaknesses: [...a.weaknesses.entries()]
          .map(([point, n]) => ({ point, surfacedInSims: n }))
          .sort((a, b) => b.surfacedInSims - a.surfacedInSims)
          .slice(0, 6),
      }))
      .sort((a, b) => b.meanScore - a.meanScore),
  };
}

function computeProviderBreakdown(
  sims: EnsembleSimSnapshot[],
  overallWinner: string | null,
): ProviderConsensus[] | undefined {
  // Group by the provider that ACTUALLY produced the synthesis (which
  // determines bestCountry), not the provider the orchestrator ASSIGNED.
  // When a Gemini 503 spike forced failover to Anthropic, that sim's
  // bestCountry reflects Anthropic's judgment, so cross-model agreement
  // must attribute it to Anthropic. Falls back to `provider` for
  // snapshots created before synthesisProvider was tracked.
  const effectiveProvider = (s: EnsembleSimSnapshot) =>
    s.synthesisProvider ?? s.provider;

  // Only meaningful when sims actually span multiple providers. A 1-provider
  // ensemble would just duplicate the top-level distribution, which adds
  // visual noise without insight.
  const present = new Set(
    sims.map(effectiveProvider).filter((p): p is string => typeof p === "string" && p.length > 0),
  );
  if (present.size < 2) return undefined;

  const byProvider = new Map<string, EnsembleSimSnapshot[]>();
  for (const s of sims) {
    const p = effectiveProvider(s) ?? "unknown";
    const arr = byProvider.get(p) ?? [];
    arr.push(s);
    byProvider.set(p, arr);
  }

  const out: ProviderConsensus[] = [];
  for (const [provider, group] of byProvider.entries()) {
    const dist = new Map<string, number>();
    for (const s of group) {
      const k = s.bestCountry ?? "?";
      dist.set(k, (dist.get(k) ?? 0) + 1);
    }
    const distribution = [...dist.entries()]
      .map(([country, count]) => ({
        country,
        count,
        percent: Math.round((count / group.length) * 100),
      }))
      .sort((a, b) => b.count - a.count);
    const aligned = overallWinner
      ? group.filter((s) => s.bestCountry === overallWinner).length
      : 0;
    out.push({
      provider,
      simCount: group.length,
      bestCountryDistribution: distribution,
      agreementWithOverallPercent: Math.round((aligned / group.length) * 100),
    });
  }
  // Anchor the order so the UI is stable across re-renders.
  out.sort((a, b) => a.provider.localeCompare(b.provider));
  return out;
}

/* ────────────────────────────────── internals ─── */
type BucketKey = "final" | "demand" | "cac" | "comp";

function pickSegment(
  buckets: Map<string, { final: number[]; demand: number[]; cac: number[]; comp: number[] }>,
  id: SegmentRec["id"],
  labelKo: string,
  bucketKey: BucketKey,
  direction: "high" | "low",
): SegmentRec {
  const ranked = [...buckets.entries()]
    .map(([country, b]) => ({ country, value: median(b[bucketKey]) }))
    .sort((a, b) => (direction === "high" ? b.value - a.value : a.value - b.value));
  const top = ranked[0];
  const second = ranked[1];
  return {
    id,
    labelKo,
    bestCountry: top?.country ?? "?",
    bestValue: round1(top?.value ?? 0),
    alternative: second
      ? { country: second.country, value: round1(second.value) }
      : undefined,
  };
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}
function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

function emptyAggregate(): EnsembleAggregate {
  return {
    simCount: 0,
    effectivePersonas: 0,
    bestCountryDistribution: [],
    recommendation: { country: "?", consensusPercent: 0, confidence: "WEAK" },
    countryStats: [],
    segments: [],
    varianceAssessment: { maxFinalScoreRange: 0, meanFinalScoreRange: 0, label: "low", note: "" },
  };
}

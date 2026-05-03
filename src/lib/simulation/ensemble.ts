/**
 * Ensemble aggregation — collapses N independent sim results into a single
 * confidence-graded recommendation. Same fixture × N draws → bestCountry
 * distribution + per-segment best country + per-country score statistics.
 *
 * The aggregate output is persisted once into ensembles.aggregate_result
 * when the last sim completes; the result page reads it directly without
 * recomputing.
 */

import type { CountryScore, Overview, Risk, Recommendation, PricingResult } from "./schemas";

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
   * — but keeping only what we need for aggregation downstream
   * (intent, country, voice, age, occupation). Aggregator consumes
   * this and emits PersonasAggregate; we don't keep the raw array on
   * the persisted EnsembleAggregate.
   */
  personas?: Array<{
    country: string;
    purchaseIntent: number;
    voice?: string;
    age?: number;
    occupation?: string;
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
  finalScore: { mean: number; median: number; std: number; min: number; max: number; range: number };
  demandScore: { mean: number; median: number };
  cacEstimateUsd: { mean: number; median: number };
  competitionScore: { mean: number; median: number };
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
    occupation?: string;
    age?: number;
  }>;
  topNegativeVoices: Array<{
    text: string;
    country: string;
    intent: number;
    occupation?: string;
    age?: number;
  }>;
  /** Demographic distributions — useful for the report and any ad-targeting follow-up. */
  ageDistribution: Array<{ bucket: string; count: number }>;
  occupationTopN: Array<{ occupation: string; count: number }>;
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
  marginEstimate: string; // mode of per-sim values
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
   */
  mergedActions: Array<{
    action: string;
    surfacedInSims: number;
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
  type Bucket = { final: number[]; demand: number[]; cac: number[]; comp: number[] };
  const buckets = new Map<string, Bucket>();
  for (const s of sims) {
    for (const c of s.countries) {
      const key = c.country.toUpperCase();
      const b = buckets.get(key) ?? { final: [], demand: [], cac: [], comp: [] };
      b.final.push(c.finalScore);
      b.demand.push(c.demandScore);
      b.cac.push(c.cacEstimateUsd);
      b.comp.push(c.competitionScore);
      buckets.set(key, b);
    }
  }
  const countryStats: CountryStats[] = [...buckets.entries()]
    .map(([country, b]) => ({
      country,
      finalScore: {
        mean: round1(mean(b.final)),
        median: round1(median(b.final)),
        std: round1(std(b.final)),
        min: round1(Math.min(...b.final)),
        max: round1(Math.max(...b.final)),
        range: round1(Math.max(...b.final) - Math.min(...b.final)),
      },
      demandScore: { mean: round1(mean(b.demand)), median: round1(median(b.demand)) },
      cacEstimateUsd: { mean: round2(mean(b.cac)), median: round2(median(b.cac)) },
      competitionScore: { mean: round1(mean(b.comp)), median: round1(median(b.comp)) },
    }))
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
        occupation: p.occupation,
        age: p.age,
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

  // Demographics — 10-year age buckets, top occupations.
  const ageBucketMap = new Map<string, number>();
  for (const p of all) {
    if (typeof p.age !== "number" || p.age <= 0) continue;
    const decade = Math.floor(p.age / 10) * 10;
    const key = `${decade}s`;
    ageBucketMap.set(key, (ageBucketMap.get(key) ?? 0) + 1);
  }
  const ageDistribution = [...ageBucketMap.entries()]
    .map(([bucket, count]) => ({ bucket, count }))
    .sort((a, b) => parseInt(a.bucket) - parseInt(b.bucket));

  const occMap = new Map<string, number>();
  for (const p of all) {
    if (!p.occupation) continue;
    occMap.set(p.occupation, (occMap.get(p.occupation) ?? 0) + 1);
  }
  const occupationTopN = [...occMap.entries()]
    .map(([occupation, count]) => ({ occupation, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

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
    occupationTopN,
  };
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

  // Mode of margin estimates.
  const marginCounts = new Map<string, number>();
  for (const s of present) {
    const m = s.pricing!.marginEstimate;
    marginCounts.set(m, (marginCounts.get(m) ?? 0) + 1);
  }
  const marginEstimate =
    [...marginCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

  // Bucket curve points by nearest cent. Sims may pick slightly different
  // price grids; we collapse exact-match prices and average the conversion
  // probability across sims that hit that price.
  const curveBuckets = new Map<number, { sum: number; count: number }>();
  for (const s of present) {
    for (const point of s.pricing!.curve) {
      const key = point.priceCents;
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

  return {
    recommendedPriceCents: median(recs),
    recommendedPriceMedian: median(recs),
    recommendedPriceP25: p25,
    recommendedPriceP75: p75,
    marginEstimate,
    curve,
  };
}

function computeCreativeAggregate(
  sims: EnsembleSimSnapshot[],
): CreativeAggregate | undefined {
  const present = sims.filter((s) => s.creative && s.creative.length > 0);
  if (present.length === 0) return undefined;

  // Group per-asset across sims. We key by lowercased assetName so a sim
  // that varied case doesn't fragment the bucket.
  const byAsset = new Map<
    string,
    {
      assetName: string;
      scores: number[];
      strengths: Map<string, number>;
      weaknesses: Map<string, number>;
    }
  >();
  for (const s of present) {
    for (const a of s.creative!) {
      const key = a.assetName.toLowerCase();
      const cur = byAsset.get(key) ?? {
        assetName: a.assetName,
        scores: [] as number[],
        strengths: new Map<string, number>(),
        weaknesses: new Map<string, number>(),
      };
      cur.scores.push(a.score);
      for (const x of a.strengths) cur.strengths.set(x, (cur.strengths.get(x) ?? 0) + 1);
      for (const x of a.weaknesses) cur.weaknesses.set(x, (cur.weaknesses.get(x) ?? 0) + 1);
      byAsset.set(key, cur);
    }
  }

  return {
    assets: [...byAsset.values()]
      .map((a) => ({
        assetName: a.assetName,
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
  // Only meaningful when sims actually span multiple providers. A 1-provider
  // ensemble would just duplicate the top-level distribution, which adds
  // visual noise without insight.
  const present = new Set(
    sims.map((s) => s.provider).filter((p): p is string => typeof p === "string" && p.length > 0),
  );
  if (present.size < 2) return undefined;

  const byProvider = new Map<string, EnsembleSimSnapshot[]>();
  for (const s of sims) {
    const p = s.provider ?? "unknown";
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

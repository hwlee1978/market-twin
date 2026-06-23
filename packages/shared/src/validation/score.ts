/**
 * Score a simulation ensemble against a ground truth fixture.
 *
 * Composite score is a weighted sum of five sub-metrics. Weights live in
 * the calibration framework so changes are visible in git history with
 * provenance.
 *
 * Sub-metrics:
 *   - top3Hit            : fraction of sim Top-3 that overlaps truth Top-3
 *   - rankCorrelation    : Spearman ρ between sim finalScore ranks and truth
 *                          revenue/share ranks (clipped to [0,1] for scoring)
 *   - rejectRecall       : fraction of truth-rejected markets that sim
 *                          flagged as low (finalScore < REJECT_THRESHOLD)
 *   - confidenceCalibration : how well sim consensus tracks correctness
 *   - trendMatch         : fraction of truth trend signals that sim's
 *                          implied trajectory matches (best-effort, optional)
 */

import {
  type GroundTruth,
  type EvidenceMetric,
} from "./schema";
import { spearmanRho } from "./stats";

const RANK_METRICS: ReadonlySet<EvidenceMetric> = new Set(["revenue_rank_overseas"]);
const SHARE_METRICS: ReadonlySet<EvidenceMetric> = new Set(["market_share_pct", "trade_data_export_usd", "revenue_absolute_usd"]);
const REJECT_METRICS: ReadonlySet<EvidenceMetric> = new Set([
  "market_entry_status",
  "consumer_acceptance",
  "regulatory_barrier",
]);

/** Sim country result, as emitted into the DB. Mirror of CountryRow. */
export interface SimCountryRow {
  country: string;
  finalScore: number;
  /** Optional — only present in newer schema. */
  components?: {
    marketSize?: number;
    competition?: number;
    regulatory?: number;
    [k: string]: number | undefined;
  };
}

/**
 * Per-sim aggregate: an ensemble run's averaged country scores plus its
 * best-country vote distribution.
 */
export interface SimAggregate {
  /** Ensemble id (prefix or full) for traceability. */
  ensembleId: string;
  /** Per country: mean finalScore across the ensemble's sims. */
  perCountryMeanScore: Record<string, number>;
  /** Per country: votes won as bestCountry (count, legacy Phase D vote mode). */
  bestCountryVotes: Record<string, number>;
  /**
   * Phase E winner — country picked by mean rank across sims, tie-broken
   * by mean score (ensemble.ts:919-967). May differ from the mode of
   * bestCountryVotes when sim-level winners spike high in one sim but
   * rank consistently lower elsewhere. When provided, scoring prefers
   * this over the vote mode. Optional for backward compatibility with
   * callers that haven't been updated to read recommendation.country.
   */
  pickedWinner?: string | null;
  /**
   * Consensus percent (0-100) for the picked winner — Phase E uses
   * "% of sims where the winner landed in Top-3", which is softer than
   * strict #1-vote share. When pickedWinner is supplied, this is the
   * matching confidence metric. Falls back to vote-share when absent.
   */
  pickedWinnerConsensusPercent?: number | null;
  /** Number of completed sims that contributed. */
  totalSims: number;
}

export interface SubScores {
  top3Hit: number;            // 0-1
  rankCorrelation: number;    // 0-1 (Spearman clipped to [0,1])
  rejectRecall: number;       // 0-1, or NaN if no reject evidence
  confidenceCalibration: number; // 0-1
  trendMatch: number;         // 0-1, or NaN if no trend evidence
}

export interface ScoreReport {
  productSlug: string;
  ensembleId: string;
  composite: number;       // 0-100
  sub: SubScores;
  /** Human-readable explanation per sub-metric. */
  rationale: Record<keyof SubScores, string>;
  /** Per-sim score, exposed for bootstrap CI computation upstream. */
  perSimScores?: number[];
}

/** Composite weights — keep aligned with [validation/README.md]. */
const WEIGHTS = {
  top3Hit: 0.30,
  rankCorrelation: 0.25,
  rejectRecall: 0.20,
  confidenceCalibration: 0.15,
  trendMatch: 0.10,
} as const;

/** Below this finalScore a country is treated as "sim recommends NO-GO". */
const REJECT_THRESHOLD = 50;

/**
 * Score a single ensemble against a single product's ground truth.
 *
 * Handles the messy reality: a metric may have no truth rows (e.g., the
 * product has no documented rejection markets). Sub-scores returned as NaN
 * are dropped from the composite and the remaining weights are renormalized.
 */
export function scoreEnsemble(
  productSlug: string,
  agg: SimAggregate,
  truth: GroundTruth,
): ScoreReport {
  const sub: SubScores = {
    top3Hit: computeTop3Hit(agg, truth),
    rankCorrelation: computeRankCorrelation(agg, truth),
    rejectRecall: computeRejectRecall(agg, truth),
    confidenceCalibration: computeConfidenceCalibration(agg, truth),
    trendMatch: computeTrendMatch(agg, truth),
  };
  const composite = compositeWithRenorm(sub) * 100;
  const rationale: Record<keyof SubScores, string> = {
    top3Hit: explainTop3(agg, truth, sub.top3Hit),
    rankCorrelation: explainRankCorr(sub.rankCorrelation),
    rejectRecall: explainReject(agg, truth, sub.rejectRecall),
    confidenceCalibration: explainConfidence(agg, truth, sub.confidenceCalibration),
    trendMatch: explainTrend(agg, truth, sub.trendMatch),
  };
  return { productSlug, ensembleId: agg.ensembleId, composite, sub, rationale };
}

/* ---------- Sub-metric implementations ---------- */

function topNByScore(perCountry: Record<string, number>, n: number): string[] {
  return Object.entries(perCountry)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([c]) => c);
}

function computeTop3Hit(agg: SimAggregate, truth: GroundTruth): number {
  const truthRanks = truth.evidence
    .filter((e) => RANK_METRICS.has(e.metric))
    .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999))
    .slice(0, 3)
    .map((e) => e.country);
  if (truthRanks.length === 0) return NaN;
  const simTop3 = topNByScore(agg.perCountryMeanScore, 3);
  const overlap = simTop3.filter((c) => truthRanks.includes(c)).length;
  return overlap / Math.min(3, truthRanks.length);
}

function computeRankCorrelation(agg: SimAggregate, truth: GroundTruth): number {
  // Build truth rank vector: prefer revenue_rank_overseas where given.
  const truthByCountry = new Map<string, number>();
  const rankRows = truth.evidence.filter((e) => RANK_METRICS.has(e.metric));
  for (const e of rankRows) {
    if (typeof e.rank === "number") truthByCountry.set(e.country, e.rank);
  }
  // Augment with share metrics for countries without explicit rank, using
  // inverse order (higher share = lower rank number). This is a fallback
  // only when ranks are sparse.
  if (truthByCountry.size < 3) {
    const shareRows = truth.evidence
      .filter((e) => SHARE_METRICS.has(e.metric) && !truthByCountry.has(e.country))
      .sort((a, b) => (Number(b.value) || 0) - (Number(a.value) || 0));
    let nextRank = truthByCountry.size + 1;
    for (const e of shareRows) {
      truthByCountry.set(e.country, nextRank++);
    }
  }
  // Need at least 3 countries in common between truth and sim to compute ρ.
  const shared = [...truthByCountry.keys()].filter(
    (c) => c in agg.perCountryMeanScore,
  );
  if (shared.length < 3) return NaN;
  // Truth rank as-is; sim "rank" derived from descending finalScore (negate
  // so higher score → smaller rank, matching truth direction).
  const truthVec = shared.map((c) => truthByCountry.get(c)!);
  const simVec = shared.map((c) => -agg.perCountryMeanScore[c]);
  const rho = spearmanRho(truthVec, simVec);
  // Clip to [0,1] for scoring — negative correlation gets a floor of 0
  // (worse than random doesn't get extra penalty here; the failure mode
  // classifier handles persistent-miss separately).
  return Math.max(0, rho);
}

function computeRejectRecall(agg: SimAggregate, truth: GroundTruth): number {
  const rejectCountries = new Set<string>();
  for (const e of truth.evidence) {
    if (!REJECT_METRICS.has(e.metric)) continue;
    if (e.metric === "market_entry_status" && e.value === "rejected") rejectCountries.add(e.country);
    if (e.metric === "consumer_acceptance" && e.value === "weak") rejectCountries.add(e.country);
    if (e.metric === "regulatory_barrier" && e.value === "blocker") rejectCountries.add(e.country);
  }
  if (rejectCountries.size === 0) return NaN;
  let hit = 0;
  for (const c of rejectCountries) {
    const score = agg.perCountryMeanScore[c];
    if (score == null) continue; // sim never scored this country
    if (score < REJECT_THRESHOLD) hit++;
  }
  return hit / rejectCountries.size;
}

function computeConfidenceCalibration(agg: SimAggregate, truth: GroundTruth): number {
  // Phase F.0.5 fix (2026-05-17): use Phase E picker winner instead of vote
  // mode. Earlier scoring read bestCountryVotes mode, which is the Phase D
  // pre-mean-rank metric. When Phase E winner picker (mean rank, tie-break
  // mean score) disagrees with vote mode (single-sim spikes inflating a
  // country's vote count without consistent rank), confidenceCalibration
  // was effectively scoring an output the runner didn't actually ship.
  // boj-relief-sun was the first observed mismatch: vote picked VN 50%
  // while mean-rank correctly picked US 69.5 (truth top).
  //
  // When agg.pickedWinner is supplied, score it against the truth top.
  // Consensus = fraction of sims where the picked winner placed in Top-3
  // (matches Phase E winner picker's confidence definition — see
  // ensemble.ts top3Hits). Falls back to vote mode for older callers.
  const totalVotes = Object.values(agg.bestCountryVotes).reduce((a, b) => a + b, 0);
  if (totalVotes === 0) return NaN;
  const truthTop = truth.evidence
    .filter((e) => e.metric === "revenue_rank_overseas" && e.rank === 1)
    .map((e) => e.country)[0];
  if (!truthTop) return NaN;
  let winner: string;
  let consensus: number;
  if (agg.pickedWinner) {
    winner = agg.pickedWinner;
    // Phase E winner's consensus is "% of sims where winner landed in Top-3"
    // (ensemble.ts:944-953). Fall back to vote share only if upstream caller
    // didn't pass the consensus metric.
    consensus = agg.pickedWinnerConsensusPercent != null
      ? agg.pickedWinnerConsensusPercent / 100
      : (agg.bestCountryVotes[winner] ?? 0) / totalVotes;
  } else {
    const top = Object.entries(agg.bestCountryVotes).sort((a, b) => b[1] - a[1])[0];
    winner = top[0];
    consensus = top[1] / totalVotes;
  }
  const correct = winner === truthTop;
  if (correct) return consensus;
  return 1 - consensus;
}

function computeTrendMatch(_agg: SimAggregate, _truth: GroundTruth): number {
  // Trend match is hard to compute without time-series sims. For MVP we
  // count it as NaN unless the truth has explicit growth_trajectory rows AND
  // we add per-country trend output to the sim schema. Returning NaN drops
  // the metric from composite via renormalization.
  return NaN;
}

/* ---------- Composite + renormalization ---------- */

function compositeWithRenorm(sub: SubScores): number {
  let weightedSum = 0;
  let usedWeight = 0;
  for (const [k, w] of Object.entries(WEIGHTS) as [keyof SubScores, number][]) {
    const v = sub[k];
    if (Number.isFinite(v)) {
      weightedSum += v * w;
      usedWeight += w;
    }
  }
  return usedWeight === 0 ? 0 : weightedSum / usedWeight;
}

/* ---------- Rationale strings ---------- */

function explainTop3(agg: SimAggregate, truth: GroundTruth, score: number): string {
  if (Number.isNaN(score)) return "no rank evidence in ground truth";
  const truthTop3 = truth.evidence
    .filter((e) => RANK_METRICS.has(e.metric))
    .sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999))
    .slice(0, 3)
    .map((e) => e.country);
  const simTop3 = topNByScore(agg.perCountryMeanScore, 3);
  return `truth=${truthTop3.join(",")} vs sim=${simTop3.join(",")} → ${(score * 100).toFixed(0)}%`;
}

function explainRankCorr(score: number): string {
  if (Number.isNaN(score)) return "insufficient overlap between truth ranks and sim countries";
  return `Spearman ρ clipped to ${score.toFixed(2)}`;
}

function explainReject(agg: SimAggregate, truth: GroundTruth, score: number): string {
  if (Number.isNaN(score)) return "no reject-market evidence in ground truth";
  const rejects = truth.evidence
    .filter((e) =>
      (e.metric === "market_entry_status" && e.value === "rejected") ||
      (e.metric === "consumer_acceptance" && e.value === "weak") ||
      (e.metric === "regulatory_barrier" && e.value === "blocker"),
    )
    .map((e) => e.country);
  const passed = rejects.filter((c) => (agg.perCountryMeanScore[c] ?? 100) < REJECT_THRESHOLD);
  return `${passed.length}/${rejects.length} reject markets correctly scored < ${REJECT_THRESHOLD}`;
}

function explainConfidence(agg: SimAggregate, _truth: GroundTruth, score: number): string {
  if (Number.isNaN(score)) return "no top-rank truth or no votes";
  const total = Object.values(agg.bestCountryVotes).reduce((a, b) => a + b, 0);
  const top = Object.entries(agg.bestCountryVotes).sort((a, b) => b[1] - a[1])[0];
  return `top vote ${top?.[0]} ${((top?.[1] ?? 0) / total * 100).toFixed(0)}% consensus → score ${score.toFixed(2)}`;
}

function explainTrend(_agg: SimAggregate, _truth: GroundTruth, _score: number): string {
  return "trend metric deferred — requires sim trend output";
}

/* ---------- Build-vs-build delta (for paired tests upstream) ---------- */

export interface BuildPair {
  productSlug: string;
  scoreA: number;
  scoreB: number;
}

/** Pair scores by productSlug for paired t-test consumption. */
export function alignForPairedTest(
  reportsA: ScoreReport[],
  reportsB: ScoreReport[],
): BuildPair[] {
  const a = new Map(reportsA.map((r) => [r.productSlug, r.composite]));
  const b = new Map(reportsB.map((r) => [r.productSlug, r.composite]));
  const pairs: BuildPair[] = [];
  for (const slug of a.keys()) {
    if (b.has(slug)) pairs.push({ productSlug: slug, scoreA: a.get(slug)!, scoreB: b.get(slug)! });
  }
  return pairs;
}

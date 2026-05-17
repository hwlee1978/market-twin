/**
 * Failure mode classifier.
 *
 * Outcome-level "맞춤/틀림" alone doesn't tell us what to fix. A confident
 * wrong answer is structurally different from a low-confidence wrong one,
 * and a country that misses across three products is a systemic bias rather
 * than a per-product flaw.
 *
 * This module groups errors into modes the team has names for:
 *
 *   - confident_wrong      Top vote ≥ STRONG consensus but truth disagrees.
 *                          Often signals LLM training-data leakage in the
 *                          OPPOSITE direction (model echoes a stale fact),
 *                          or a systematic bias (resp. defect #1, #7).
 *
 *   - weak_correct         Top vote correct but consensus WEAK. Lucky hit,
 *                          not reasoning. Don't credit calibration with it.
 *
 *   - persistent_miss      Same country mis-scored across ≥3 products in the
 *                          dataset. Marks a systemic country/region defect
 *                          (e.g., defect #1 EU under-rating, #7 CN mass-avg).
 *
 *   - model_disagreement   (deferred — needs per-provider sim views) ensemble
 *                          model 1위가 갈리는 sim. Counted at the benchmark
 *                          runner level, not here.
 *
 *   - drift_regression     Composite or per-sub-metric drops vs previous build
 *                          on the same product. Detected by comparing two
 *                          ScoreReport sets.
 *
 * Each finding carries a severity (critical/warning/info) and a recommendation
 * string. Findings are advisory — the human reader picks which to act on.
 */

import type { GroundTruth } from "./schema";
import type { ScoreReport, SimAggregate } from "./score";

export type FailureMode =
  | "confident_wrong"
  | "weak_correct"
  | "persistent_miss"
  | "drift_regression";

export interface FailureFinding {
  mode: FailureMode;
  severity: "critical" | "warning" | "info";
  productSlug?: string;
  countries?: string[];
  message: string;
  recommendation?: string;
}

/** Consensus thresholds for classifying top-vote share. */
const STRONG_CONSENSUS = 0.5;
const WEAK_CONSENSUS = 0.35;

/* ---------- Per-product classifiers (single ensemble run) ---------- */

function getTopVote(agg: SimAggregate): { country: string; share: number } | null {
  const total = Object.values(agg.bestCountryVotes).reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  // Phase F.0.5 fix (2026-05-17): prefer Phase E picker winner over vote
  // mode. Same rationale as score.ts confidenceCalibration — the runner
  // ships `recommendation.country` (mean rank winner), so failure-mode
  // classification must score *that* country, not the vote mode that may
  // disagree. Consensus comes from pickedWinnerConsensusPercent (Top-3
  // hit rate) when supplied. boj-relief-sun was the first observed
  // mismatch where vote=VN (wrong) but picker=US (truth top).
  if (agg.pickedWinner) {
    const share = agg.pickedWinnerConsensusPercent != null
      ? agg.pickedWinnerConsensusPercent / 100
      : (agg.bestCountryVotes[agg.pickedWinner] ?? 0) / total;
    return { country: agg.pickedWinner, share };
  }
  const top = Object.entries(agg.bestCountryVotes).sort((a, b) => b[1] - a[1])[0];
  return { country: top[0], share: top[1] / total };
}

function getTruthTop1(truth: GroundTruth): string | null {
  return (
    truth.evidence
      .filter((e) => e.metric === "revenue_rank_overseas" && e.rank === 1)
      .map((e) => e.country)[0] ?? null
  );
}

export function classifyOne(
  agg: SimAggregate,
  truth: GroundTruth,
  productSlug: string,
): FailureFinding[] {
  const findings: FailureFinding[] = [];
  const topVote = getTopVote(agg);
  const truthTop = getTruthTop1(truth);
  if (!topVote || !truthTop) return findings;

  const correct = topVote.country === truthTop;
  const consensus = topVote.share;

  if (!correct && consensus >= STRONG_CONSENSUS) {
    findings.push({
      mode: "confident_wrong",
      severity: "critical",
      productSlug,
      countries: [topVote.country, truthTop],
      message: `Top vote ${topVote.country} ${(consensus * 100).toFixed(0)}% STRONG but truth top is ${truthTop}.`,
      recommendation: truth.leakageRisk.inTrainingData
        ? "Leakage-risk product: model may be echoing a stale/wrong public belief. Verify whether sim recommendation matches a widely-repeated-but-outdated meme about this market."
        : "No leakage pretext. Treat as systemic bias — inspect components.* for the wrongly-picked country to see which sub-score is inflating.",
    });
  } else if (correct && consensus < WEAK_CONSENSUS) {
    findings.push({
      mode: "weak_correct",
      severity: "warning",
      productSlug,
      countries: [topVote.country],
      message: `Top vote ${topVote.country} correct but consensus only ${(consensus * 100).toFixed(0)}% (< ${(WEAK_CONSENSUS * 100).toFixed(0)}%) — lucky hit, not earned.`,
      recommendation: "Don't credit recent calibration with this product's score. Re-run with seed variation to check stability.",
    });
  }
  return findings;
}

/* ---------- Dataset-wide classifier ---------- */

export interface DatasetEntry {
  productSlug: string;
  agg: SimAggregate;
  truth: GroundTruth;
}

/**
 * Persistent-miss: a country whose sim-rank deviates from its truth-rank
 * (where defined) by ≥ 3 positions across at least 3 products. The
 * heuristic mirrors the manual "결함 #1 EU under-rating across 3/3 products"
 * pattern from the validation memory.
 */
export function classifyDataset(entries: DatasetEntry[]): FailureFinding[] {
  const findings: FailureFinding[] = [];
  if (entries.length < 3) return findings;

  // For each country, count how many products show a large sim-vs-truth gap.
  const missCountByCountry = new Map<string, { products: string[]; gaps: number[] }>();

  for (const { productSlug, agg, truth } of entries) {
    const truthRanks = new Map<string, number>();
    for (const e of truth.evidence) {
      if (e.metric === "revenue_rank_overseas" && typeof e.rank === "number") {
        truthRanks.set(e.country, e.rank);
      }
    }
    // Sim rank = order by descending mean finalScore among truth countries only,
    // so the ranking lives in the same space as truth.
    const truthCountries = [...truthRanks.keys()];
    const simSubset = truthCountries
      .filter((c) => c in agg.perCountryMeanScore)
      .map((c) => ({ c, s: agg.perCountryMeanScore[c] }))
      .sort((a, b) => b.s - a.s);
    simSubset.forEach((row, i) => {
      const simRank = i + 1;
      const truthRank = truthRanks.get(row.c);
      if (truthRank == null) return;
      const gap = simRank - truthRank;
      if (gap >= 3) {
        const entry = missCountByCountry.get(row.c) ?? { products: [], gaps: [] };
        entry.products.push(productSlug);
        entry.gaps.push(gap);
        missCountByCountry.set(row.c, entry);
      }
    });
  }

  for (const [country, info] of missCountByCountry) {
    if (info.products.length >= 3) {
      const avgGap = info.gaps.reduce((a, b) => a + b, 0) / info.gaps.length;
      findings.push({
        mode: "persistent_miss",
        severity: "critical",
        countries: [country],
        message: `Country ${country} mis-ranked by ${avgGap.toFixed(1)} positions on average across ${info.products.length} products (${info.products.join(", ")}).`,
        recommendation: `Treat as systemic country-level bias, not per-product noise. Likely a grounding gap (Tavily/Sonar misses ${country} signals) or a persona pool calibration miss. See validation memory defects #1 (EU/CN under-rating) and #7 (CN mass-average) for the precedent.`,
      });
    }
  }
  return findings;
}

/* ---------- Drift / regression classifier (two-build comparison) ---------- */

export interface DriftInput {
  /** Score reports for a product from build A. */
  before: ScoreReport;
  /** Score reports for the same product from build B. */
  after: ScoreReport;
}

/** Threshold for flagging composite drop as drift (in composite-score points). */
const DRIFT_COMPOSITE_DROP = 5;

export function classifyDrift(pairs: DriftInput[]): FailureFinding[] {
  const findings: FailureFinding[] = [];
  for (const { before, after } of pairs) {
    if (before.productSlug !== after.productSlug) continue;
    const delta = after.composite - before.composite;
    if (delta <= -DRIFT_COMPOSITE_DROP) {
      findings.push({
        mode: "drift_regression",
        severity: "critical",
        productSlug: before.productSlug,
        message: `Composite dropped ${(-delta).toFixed(1)} pts (${before.composite.toFixed(1)} → ${after.composite.toFixed(1)}).`,
        recommendation:
          "Diff the components.* mean per country between the two ensembles. Then check which calibration anchor changed between commits — if the answer is 'none', it's noise; re-run to confirm.",
      });
    }
  }
  return findings;
}

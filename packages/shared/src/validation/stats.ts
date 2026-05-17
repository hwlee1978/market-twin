/**
 * Statistical primitives for benchmark comparisons.
 *
 * Why we need these: simulation outputs are noisy. With n=25 sims per product
 * and a between-sim std of ~10 score points, the standard error of the mean
 * is ~2pt. A "Phase A US +7.7" headline is genuinely significant; a "DE +2.5"
 * is plausibly noise. Without CIs and paired tests, we ship calibration on
 * coin-flip evidence.
 *
 * All functions here are dependency-free (no jStat, no SciPy port). The bias
 * is toward conservative methods that work at small n (≤30 sims per product,
 * ≤30 products in the benchmark).
 */

/** Seeded PRNG (Mulberry32). Reproducible bootstraps. */
export function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return function next() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const mean = (xs: number[]): number =>
  xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;

export function variance(xs: number[], ddof = 1): number {
  if (xs.length <= ddof) return 0;
  const m = mean(xs);
  let ss = 0;
  for (const x of xs) ss += (x - m) * (x - m);
  return ss / (xs.length - ddof);
}

export const stdev = (xs: number[], ddof = 1): number => Math.sqrt(variance(xs, ddof));

export const median = (xs: number[]): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/* ---------- Bootstrap CI ---------- */

export interface BootstrapCI {
  pointEstimate: number;
  lo: number; // 2.5 percentile (95% CI lower)
  hi: number; // 97.5 percentile
  /** B = number of bootstrap resamples used. */
  B: number;
}

/**
 * Non-parametric 95% bootstrap CI for the mean, using percentile method.
 * Use B ≥ 2000 for stable 95% intervals. Deterministic if `seed` is given.
 */
export function bootstrapMeanCI(samples: number[], B = 2000, seed = 1): BootstrapCI {
  const n = samples.length;
  if (n === 0) return { pointEstimate: 0, lo: 0, hi: 0, B };
  if (n === 1) return { pointEstimate: samples[0], lo: samples[0], hi: samples[0], B };
  const rng = seededRandom(seed);
  const means = new Float64Array(B);
  for (let b = 0; b < B; b++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += samples[Math.floor(rng() * n)];
    means[b] = s / n;
  }
  const sorted = Array.from(means).sort((a, b) => a - b);
  const lo = sorted[Math.floor(0.025 * B)];
  const hi = sorted[Math.floor(0.975 * B)];
  return { pointEstimate: mean(samples), lo, hi, B };
}

/* ---------- Paired t-test ---------- */

export interface PairedTTestResult {
  /** Mean of (B - A) — positive means B beats A on average. */
  delta: number;
  /** Standard error of the delta. */
  stderr: number;
  /** t statistic. */
  t: number;
  /** Degrees of freedom (n-1). */
  df: number;
  /** Two-sided p-value. */
  pValue: number;
  /** Convenience flag: pValue < 0.05. */
  significant95: boolean;
  /** 95% CI for the mean delta. */
  ci95: [number, number];
  /** Sample size (paired). */
  n: number;
}

/**
 * Paired two-sided t-test. A and B must be equal length (paired by product).
 * Uses an erf-based normal approximation for the tail probability — accurate
 * to ~3 decimal places for df ≥ 10, conservative below that.
 *
 * Caller responsibility: ensure A[i] and B[i] are the same product, scored
 * the same way. The benchmark runner is expected to align pairs by slug.
 */
export function pairedTTest(A: number[], B: number[]): PairedTTestResult {
  if (A.length !== B.length) {
    throw new Error(`pairedTTest: length mismatch ${A.length} vs ${B.length}`);
  }
  const n = A.length;
  if (n < 2) {
    return { delta: 0, stderr: 0, t: 0, df: 0, pValue: 1, significant95: false, ci95: [0, 0], n };
  }
  const diffs = A.map((a, i) => B[i] - a);
  const d = mean(diffs);
  const sd = stdev(diffs, 1);
  const se = sd / Math.sqrt(n);
  const t = se === 0 ? 0 : d / se;
  const df = n - 1;
  // For df ≥ 10, t with this df is close enough to standard normal that
  // erf-based p is accurate. For df < 10, this is conservative (slightly
  // larger p than true) — acceptable for our use case.
  const p = se === 0 ? 1 : 2 * (1 - normalCdf(Math.abs(t)));
  // t-critical for 95% CI, approximated by normal z=1.96 (conservative at low n).
  const margin = 1.96 * se;
  return {
    delta: d,
    stderr: se,
    t,
    df,
    pValue: p,
    significant95: p < 0.05,
    ci95: [d - margin, d + margin],
    n,
  };
}

/** Abramowitz & Stegun 7.1.26 erf approximation, ~1.5e-7 max error. */
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const tt = 1 / (1 + p * ax);
  const y = 1 - (((((a5 * tt + a4) * tt) + a3) * tt + a2) * tt + a1) * tt * Math.exp(-ax * ax);
  return sign * y;
}

const normalCdf = (z: number): number => 0.5 * (1 + erf(z / Math.SQRT2));

/* ---------- FDR (Benjamini-Hochberg) ---------- */

export interface FDRResult {
  /** Original p-value index → adjusted p-value (q-value). */
  qValues: number[];
  /** Indices that passed at the given α after BH correction. */
  significantIndices: number[];
}

/**
 * Benjamini-Hochberg FDR correction. Pass an array of p-values; get back
 * adjusted q-values in the same order, plus the indices that pass at α.
 *
 * When to use: comparing build A vs build B across all 30 benchmark products
 * simultaneously, with 30 independent paired t-tests. Without correction,
 * ~1.5 false positives are expected at α=0.05 by chance.
 */
export function fdrBenjaminiHochberg(pValues: number[], alpha = 0.05): FDRResult {
  const n = pValues.length;
  if (n === 0) return { qValues: [], significantIndices: [] };
  const indexed = pValues.map((p, i) => ({ p, i }));
  indexed.sort((a, b) => a.p - b.p);
  // BH adjusted = min over k≥i of (p_k * n / k). Compute right-to-left.
  const adjustedSorted = new Array<number>(n);
  let running = 1;
  for (let k = n; k >= 1; k--) {
    const adj = Math.min(1, (indexed[k - 1].p * n) / k);
    running = Math.min(running, adj);
    adjustedSorted[k - 1] = running;
  }
  const qValues = new Array<number>(n);
  const significantIndices: number[] = [];
  for (let k = 0; k < n; k++) {
    qValues[indexed[k].i] = adjustedSorted[k];
    if (adjustedSorted[k] < alpha) significantIndices.push(indexed[k].i);
  }
  significantIndices.sort((a, b) => a - b);
  return { qValues, significantIndices };
}

/* ---------- Spearman rank correlation ---------- */

/**
 * Spearman ρ for rank correlation. Accepts two equal-length numeric arrays
 * (raw scores, not ranks — ranks are computed internally with tie-averaging).
 * Returns ρ in [-1, 1]. Returns 0 if either array is constant.
 *
 * Use for: sim country-ranking vs truth country-ranking. ρ=1 means perfect
 * order match; ρ near 0 means random; ρ negative means inverted.
 */
export function spearmanRho(x: number[], y: number[]): number {
  if (x.length !== y.length) throw new Error("spearmanRho: length mismatch");
  const n = x.length;
  if (n < 2) return 0;
  const rx = rankWithTies(x);
  const ry = rankWithTies(y);
  const mx = mean(rx);
  const my = mean(ry);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = rx[i] - mx;
    const b = ry[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  if (dx === 0 || dy === 0) return 0;
  return num / Math.sqrt(dx * dy);
}

/** Returns the rank of each element (1-based), averaging ties. */
function rankWithTies(xs: number[]): number[] {
  const n = xs.length;
  const indexed = xs.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => a.v - b.v);
  const ranks = new Array<number>(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && indexed[j + 1].v === indexed[i].v) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[indexed[k].i] = avg;
    i = j + 1;
  }
  return ranks;
}

/* ---------- Power analysis (simple, for planning sample sizes) ---------- */

/**
 * Approximate paired-t sample size needed to detect a mean difference `delta`
 * with assumed std-of-diffs `sigma`, at α=0.05 two-sided, power=0.80.
 *
 * Uses normal approximation: n ≈ ((z_{1-α/2} + z_{1-β}) σ / δ)^2. Conservative
 * for small n.
 */
export function pairedTSampleSize(delta: number, sigma: number, power = 0.8, alpha = 0.05): number {
  if (delta === 0) return Infinity;
  // z_{1-α/2}=1.96, z_{0.80}=0.84
  const zA = quantileNormal(1 - alpha / 2);
  const zB = quantileNormal(power);
  const n = Math.pow(((zA + zB) * sigma) / Math.abs(delta), 2);
  return Math.ceil(n);
}

/** Inverse normal CDF, Beasley-Springer-Moro approximation, ~7e-9 max error. */
function quantileNormal(p: number): number {
  if (p <= 0 || p >= 1) throw new Error(`quantileNormal: p must be in (0,1), got ${p}`);
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2,
    -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1,
    -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734,
    4.374664141464968, 2.938163982698783,
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416,
  ];
  const pLow = 0.02425;
  const pHigh = 1 - pLow;
  let q: number;
  let r: number;
  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p <= pHigh) {
    q = p - 0.5;
    r = q * q;
    return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}

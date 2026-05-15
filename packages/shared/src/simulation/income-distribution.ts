/**
 * Per-country income bracket distributions for persona sampling.
 *
 * Phase B fix for "동남아 편향" identified in the 5th Buldak validation run
 * (2026-05-15). Before this module, persona generation let the LLM freely
 * emit incomeBand text bounded only by "realistic for the persona's country".
 * Result: 40% of generated personas (1,941 / 4,800) landed in the <$30k
 * bracket regardless of target country, because the LLM defaults toward
 * "typical consumer = working/middle class" without weighing country median
 * income properly. That global low-income skew artificially crushed CAC for
 * developing markets (VN $17 vs US $80) and inflated their finalScores.
 *
 * Fix: pre-assign each persona slot an income bracket sampled from the
 * country's actual income distribution (World Bank household income
 * distribution, OECD per-capita statistics, national stat office data —
 * see source notes below). The persona prompt then constrains incomeBand
 * text to match the assigned bracket. LLM still picks the specific number
 * + currency formatting; we just bound the bracket.
 *
 * The 5 brackets are global USD anchor points — same boundaries the report
 * UI already groups by, so cross-country comparison stays consistent. For
 * low-income markets (VN, ID, MX, IN) the upper brackets correspond to
 * relative wealth (small but real elite class); for high-income markets
 * (US, GB, DE) the lower brackets correspond to real working class.
 */

import { INCOME_BRACKET_SLACK } from "./calibration/income-bracket-slack";

export type IncomeBracket = "low" | "lower_mid" | "mid" | "upper_mid" | "high";

/** USD annual income ranges for each bracket — global anchor scale. */
export const INCOME_BRACKET_USD_RANGES: Record<
  IncomeBracket,
  { minUsd: number; maxUsd: number | null; label: string }
> = {
  low: { minUsd: 0, maxUsd: 30_000, label: "<$30k" },
  lower_mid: { minUsd: 30_000, maxUsd: 60_000, label: "$30-60k" },
  mid: { minUsd: 60_000, maxUsd: 100_000, label: "$60-100k" },
  upper_mid: { minUsd: 100_000, maxUsd: 150_000, label: "$100-150k" },
  high: { minUsd: 150_000, maxUsd: null, label: "$150k+" },
};

/**
 * Country → income bracket distribution (must sum to 1.0).
 *
 * Sources (approximate distributions, rounded to 2 decimal places):
 *   - OECD Income Distribution Database (developed markets)
 *   - World Bank Global Consumption Database (developing markets)
 *   - National stat offices (US Census, ONS UK, Destatis DE, etc.) cross-
 *     referenced for household income percentiles
 *
 * Numbers reflect HOUSEHOLD income distribution shape, not per-capita —
 * matches how the persona prompt interprets incomeBand (household for
 * homemakers / retirees, individual for working professionals).
 *
 * Update cadence: review annually or when major economic shifts hit a
 * candidate market (e.g., a developing market crosses into middle-income
 * tier on World Bank classification).
 */
export const COUNTRY_INCOME_DISTRIBUTIONS: Record<
  string,
  Record<IncomeBracket, number>
> = {
  // ─── Developed Asia ───────────────────────────────────────────
  KR: { low: 0.2, lower_mid: 0.3, mid: 0.28, upper_mid: 0.15, high: 0.07 },
  JP: { low: 0.22, lower_mid: 0.33, mid: 0.28, upper_mid: 0.12, high: 0.05 },
  HK: { low: 0.15, lower_mid: 0.22, mid: 0.28, upper_mid: 0.2, high: 0.15 },
  SG: { low: 0.12, lower_mid: 0.22, mid: 0.3, upper_mid: 0.2, high: 0.16 },
  TW: { low: 0.22, lower_mid: 0.32, mid: 0.28, upper_mid: 0.12, high: 0.06 },

  // ─── Developing Asia ──────────────────────────────────────────
  CN: { low: 0.4, lower_mid: 0.3, mid: 0.18, upper_mid: 0.08, high: 0.04 },
  TH: { low: 0.5, lower_mid: 0.28, mid: 0.15, upper_mid: 0.05, high: 0.02 },
  VN: { low: 0.58, lower_mid: 0.25, mid: 0.12, upper_mid: 0.03, high: 0.02 },
  ID: { low: 0.55, lower_mid: 0.27, mid: 0.13, upper_mid: 0.03, high: 0.02 },
  MY: { low: 0.38, lower_mid: 0.32, mid: 0.2, upper_mid: 0.07, high: 0.03 },
  PH: { low: 0.55, lower_mid: 0.28, mid: 0.12, upper_mid: 0.03, high: 0.02 },
  IN: { low: 0.62, lower_mid: 0.22, mid: 0.1, upper_mid: 0.04, high: 0.02 },

  // ─── North America ────────────────────────────────────────────
  US: { low: 0.18, lower_mid: 0.24, mid: 0.28, upper_mid: 0.18, high: 0.12 },
  CA: { low: 0.18, lower_mid: 0.26, mid: 0.28, upper_mid: 0.17, high: 0.11 },
  MX: { low: 0.5, lower_mid: 0.28, mid: 0.15, upper_mid: 0.05, high: 0.02 },

  // ─── Europe ───────────────────────────────────────────────────
  GB: { low: 0.2, lower_mid: 0.28, mid: 0.27, upper_mid: 0.15, high: 0.1 },
  DE: { low: 0.2, lower_mid: 0.28, mid: 0.28, upper_mid: 0.15, high: 0.09 },
  FR: { low: 0.22, lower_mid: 0.28, mid: 0.27, upper_mid: 0.14, high: 0.09 },
  IT: { low: 0.25, lower_mid: 0.3, mid: 0.25, upper_mid: 0.13, high: 0.07 },
  ES: { low: 0.28, lower_mid: 0.3, mid: 0.24, upper_mid: 0.12, high: 0.06 },
  NL: { low: 0.18, lower_mid: 0.27, mid: 0.28, upper_mid: 0.16, high: 0.11 },

  // ─── Oceania ──────────────────────────────────────────────────
  AU: { low: 0.18, lower_mid: 0.26, mid: 0.28, upper_mid: 0.17, high: 0.11 },
  NZ: { low: 0.2, lower_mid: 0.28, mid: 0.27, upper_mid: 0.15, high: 0.1 },

  // ─── MENA ─────────────────────────────────────────────────────
  AE: { low: 0.2, lower_mid: 0.25, mid: 0.25, upper_mid: 0.18, high: 0.12 },
  SA: { low: 0.28, lower_mid: 0.3, mid: 0.22, upper_mid: 0.12, high: 0.08 },

  // ─── South America ────────────────────────────────────────────
  BR: { low: 0.45, lower_mid: 0.3, mid: 0.15, upper_mid: 0.07, high: 0.03 },
};

/**
 * Fallback distribution when a candidate country isn't in the table. Mirrors
 * the pre-Phase-B global empirical distribution (~40% low, ~25% lower-mid).
 * Conservative — if we encounter an unmapped market, behave like the old
 * un-calibrated sampler rather than picking arbitrarily.
 */
const FALLBACK_DISTRIBUTION: Record<IncomeBracket, number> = {
  low: 0.4,
  lower_mid: 0.25,
  mid: 0.2,
  upper_mid: 0.1,
  high: 0.05,
};

const BRACKET_ORDER: IncomeBracket[] = [
  "low",
  "lower_mid",
  "mid",
  "upper_mid",
  "high",
];

/**
 * Deterministically samples an income bracket for a country using a
 * provided 0-1 random value. Pre-sampled randomness lets callers seed
 * the picker for reproducibility (use a hash of slot index + seed).
 *
 * Uses cumulative distribution lookup: walk the brackets in order,
 * subtract each bracket's probability from `rand`, return the first
 * bracket whose share covers `rand`. Falls back to `high` if floating-
 * point error leaves a tiny residual.
 */
export function sampleIncomeBracket(
  country: string,
  rand: number,
): IncomeBracket {
  const dist =
    COUNTRY_INCOME_DISTRIBUTIONS[country.toUpperCase()] ?? FALLBACK_DISTRIBUTION;
  let r = Math.max(0, Math.min(1, rand));
  for (const b of BRACKET_ORDER) {
    const p = dist[b];
    if (r <= p) return b;
    r -= p;
  }
  return "high";
}

/**
 * Phase B v2 (2026-05-15): Parses `incomeBand` text and returns the
 * approximate USD annual income (midpoint when range, single value when
 * scalar). Returns null when no USD figure is found in the text.
 *
 * Why this exists: Phase B v1 set `slot.incomeBracket` and injected the
 * constraint into the persona prompt, but the runner's pool-reuse layer
 * pulled cached personas (generated before Phase B) by `country|profession`
 * key alone — completely bypassing the bracket. Result: the 6th Buldak
 * validation showed <$30k still at 40% of personas, no bracket effect at
 * all. v2 fixes this by validating each pool-hit persona's incomeBand
 * against the slot bracket; mismatched personas get demoted to misses
 * (regenerated fresh with the bracket constraint enforced).
 *
 * Heuristic patterns this matches (covers the prompt examples):
 *   "$130-160k", "$34-42k USD", "(~$43-57k USD)", "(~$3-6k USD)",
 *   "$1.5-7k USD", "$130k", "USD 75k", "$74,000"
 */
export function parseIncomeBandUsd(incomeBand: string): number | null {
  if (!incomeBand) return null;
  const text = incomeBand.replace(/[,]/g, ""); // strip thousand-sep commas

  // Pattern 1: ranges like "$30-60k", "$3-6k USD", "$1.5-7k"
  const rangeK = text.match(/\$\s*(\d+(?:\.\d+)?)\s*[-–~]\s*(\d+(?:\.\d+)?)\s*k/i);
  if (rangeK) {
    const lo = parseFloat(rangeK[1]) * 1000;
    const hi = parseFloat(rangeK[2]) * 1000;
    return (lo + hi) / 2;
  }

  // Pattern 2: ranges in absolute dollars "$30000-60000"
  const rangeAbs = text.match(/\$\s*(\d{4,7})\s*[-–~]\s*(\d{4,7})\b/);
  if (rangeAbs) {
    return (parseInt(rangeAbs[1], 10) + parseInt(rangeAbs[2], 10)) / 2;
  }

  // Pattern 3: single value with k suffix "$74k" or "$74k USD"
  const singleK = text.match(/\$\s*(\d+(?:\.\d+)?)\s*k\b/i);
  if (singleK) {
    return parseFloat(singleK[1]) * 1000;
  }

  // Pattern 4: single absolute value "$74000"
  const singleAbs = text.match(/\$\s*(\d{4,7})\b/);
  if (singleAbs) {
    return parseInt(singleAbs[1], 10);
  }

  return null;
}

/**
 * Phase B v2: Returns true when the persona's incomeBand text falls within
 * the assigned bracket's USD range. Used by the runner to validate pool-
 * cached personas before reuse — mismatched personas are regenerated.
 *
 * Slack tolerance lives in calibration/income-bracket-slack.ts.
 *
 * Returns true (accept) when:
 *   - bracket is undefined (Phase B not applied — accept all)
 *   - incomeBand has no parseable USD figure (can't validate, give benefit
 *     of the doubt rather than mass-regenerate the entire pool)
 *   - parsed USD falls within bracket range with slack
 */
export function incomeBandMatchesBracket(
  incomeBand: string,
  bracket: IncomeBracket | undefined,
): boolean {
  if (!bracket) return true;
  const usd = parseIncomeBandUsd(incomeBand);
  if (usd == null) return true; // unparseable — don't reject
  const range = INCOME_BRACKET_USD_RANGES[bracket];
  const slack = INCOME_BRACKET_SLACK.value.slack;
  const minOk = range.minUsd === 0 ? 0 : range.minUsd * (1 - slack);
  const maxOk = range.maxUsd == null ? Infinity : range.maxUsd * (1 + slack);
  return usd >= minOk && usd <= maxOk;
}

/**
 * Renders the bracket constraint string injected into the persona prompt.
 * Locale-aware so KO sims get Korean-format hints and EN sims get English.
 * Includes the USD range so the LLM can convert to local currency for the
 * incomeBand text (e.g., a VN persona in the "mid" bracket emits "₫150M-
 * 250M (~$60-100k USD)").
 */
export function renderIncomeBracketHint(
  bracket: IncomeBracket,
  locale: "ko" | "en",
): string {
  const range = INCOME_BRACKET_USD_RANGES[bracket];
  if (locale === "ko") {
    return `소득 구간: ${range.label} USD 연소득. 현지 통화로 변환한 incomeBand 텍스트가 이 USD 범위에 들어와야 함.`;
  }
  return `Income bracket: ${range.label} USD annual. The emitted incomeBand text (in local currency) must convert to this USD range.`;
}

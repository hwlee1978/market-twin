/**
 * Dynamic pricing-range computation for the pricing curve prompt.
 *
 * Default 0.5x-2.0x of base price was too rigid — for an inelastic
 * persona profile the LLM should be allowed to explore higher prices
 * (premium positioning), and competitor prices should pull the range
 * to cover the competitive market window. This helper picks a window
 * informed by:
 *
 *   - Persona price-sensitivity distribution (high/medium/low)
 *   - Competitor prices extracted from competitorUrls (if any)
 *   - Project base price (always within window)
 *
 * Returns { minCents, maxCents, rationale } where rationale is a
 * human-readable explanation surfaced in the prompt + the report.
 */

export interface PriceSensitivityCounts {
  low: number;
  medium: number;
  high: number;
}

export interface PricingRangeOpts {
  basePriceCents: number;
  priceSensitivity: PriceSensitivityCounts;
  /** Competitor prices in cents, when known. Empty array = no competitor data. */
  competitorPriceCents?: number[];
}

export interface PricingRange {
  minCents: number;
  maxCents: number;
  rationale: string[];
}

/** Default tier when sensitivity profile is uninformative. */
const DEFAULT_LOW_MULT = 0.5;
const DEFAULT_HIGH_MULT = 2.0;

export function computePricingRange(opts: PricingRangeOpts): PricingRange {
  const base = opts.basePriceCents;
  let lowMult = DEFAULT_LOW_MULT;
  let highMult = DEFAULT_HIGH_MULT;
  const rationale: string[] = [];

  // Persona sensitivity → adjust upper bound. Lower bound stays at
  // 0.5x in the default case; price floors are rarely below half of
  // base for any product category, and going lower invites the LLM
  // to explore implausibly cheap territory.
  const total =
    opts.priceSensitivity.low +
    opts.priceSensitivity.medium +
    opts.priceSensitivity.high;
  if (total > 0) {
    const lowShare = opts.priceSensitivity.low / total;
    const highShare = opts.priceSensitivity.high / total;
    if (lowShare >= 0.55) {
      // Inelastic profile — premium pricing is viable. Expand upward.
      highMult = 3.0;
      rationale.push(
        `low price sensitivity (${Math.round(lowShare * 100)}% inelastic) — upper bound extended to 3.0x base`,
      );
    } else if (highShare >= 0.50) {
      // Elastic profile — most personas resist higher prices.
      // Narrow upper bound so the curve doesn't waste samples on
      // prices that nobody would pay anyway.
      highMult = 1.5;
      rationale.push(
        `high price sensitivity (${Math.round(highShare * 100)}% elastic) — upper bound narrowed to 1.5x base`,
      );
    }
  }

  let min = Math.round(base * lowMult);
  let max = Math.round(base * highMult);

  // Competitor prices — extend the window so it ALWAYS covers the
  // competitive market. ±10% padding outside the min/max competitor
  // so the LLM can sample on either side of competitive prices.
  if (opts.competitorPriceCents && opts.competitorPriceCents.length > 0) {
    const competitors = opts.competitorPriceCents.filter((p) => p > 0);
    if (competitors.length > 0) {
      const minComp = Math.min(...competitors);
      const maxComp = Math.max(...competitors);
      const minWithPad = Math.round(minComp * 0.9);
      const maxWithPad = Math.round(maxComp * 1.1);
      if (minWithPad < min) {
        min = minWithPad;
        rationale.push(
          `extended lower bound to cover competitor low (${minComp})`,
        );
      }
      if (maxWithPad > max) {
        max = maxWithPad;
        rationale.push(
          `extended upper bound to cover competitor high (${maxComp})`,
        );
      }
    }
  }

  // Sanity floor: never below 1 cent, never invert min > max.
  min = Math.max(1, min);
  if (max <= min) max = min + 1;

  return { minCents: min, maxCents: max, rationale };
}

/**
 * Per-category LTV multipliers — used by the Investment + ROI page to
 * surface dual single-purchase + LTV-adjusted break-even.
 *
 * The table moved to calibration/ltv-multipliers.ts so the provenance
 * and review cadence are explicit. This file re-exports the helpers so
 * existing callers (`@/lib/simulation/ltv`) keep working.
 */

export {
  CATEGORY_LTV_MULTIPLIER,
  getLTVMultiplier,
  getLTVRationale,
} from "./calibration/ltv-multipliers";

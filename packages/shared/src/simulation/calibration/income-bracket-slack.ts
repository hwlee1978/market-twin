/**
 * Tolerance applied to income-bracket boundary checks when validating
 * pool-cached personas against their assigned slot bracket. Without
 * slack the bracket boundaries are too brittle and almost every cached
 * persona fails (a $61k persona is "lower_mid" arithmetically but the
 * LLM may have emitted "$60-65k" range that overlaps "mid").
 */

import { calibrated } from "./provenance";

export const INCOME_BRACKET_SLACK = calibrated(
  {
    /** Multiplicative slack on bracket min/max boundaries.
     *  e.g., a 'lower_mid' bracket of $30-60k accepts $25.5k-$69k personas. */
    slack: 0.15,
  },
  {
    source: "TUNING_ANCHOR",
    rationale:
      "Tested 0.10 (too brittle, ~30% of cached personas regenerated which defeats the pool's reuse purpose) and 0.20 (too loose, mid-bracket personas accepted into low-bracket slots). 0.15 keeps regen rate under 10% while still rejecting clearly-out-of-bracket cached personas. Replace with bracket-specific slack (low brackets need more slack because LLM income text is often vague at the low end) once we have data on regen rates per bracket.",
    informedByRuns: [
      "Buldak 6th run (Phase B v2 verification) — pool reuse rate target",
    ],
    holdoutProducts: [],
    lastReviewed: "2026-05-15",
    reviewBy: "2026-08-15",
  },
);

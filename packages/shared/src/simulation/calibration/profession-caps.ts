/**
 * Per-archetype caps for diet-restricted personas in the food category.
 *
 * Lives here (not buried in profession-pool.ts) so it's obvious this cap
 * was set from validation observation, not from external prevalence data.
 * The natural-frequency claim ("~1-2% of food buyers are restricted") is
 * an estimate — when better data lands (national dietary survey, food
 * category MR study), this should become DATA_DERIVED and the cap should
 * track the actual prevalence rather than an eyeballed compromise.
 */

import { calibrated } from "./provenance";

export const FOOD_DIET_RESTRICTED_CAPS = calibrated(
  {
    /** Max occurrences per simulation per archetype. With 25 sims at this
     *  cap, max prevalence is ~2% of 200-persona reports. */
    perSimCap: 2,
    /** Archetype names this cap applies to (KO + EN locale variants). */
    archetypesKo: [
      "비건·식물성 식단 실천자",
      "글루텐프리·알레르기 관리 소비자",
      "다이어터 (피트니스 진지)",
    ],
    archetypesEn: [
      "Vegan / plant-based eater",
      "Gluten-free / allergy management consumer",
      "Serious dieter (fitness-driven)",
    ],
  },
  {
    source: "TUNING_ANCHOR",
    rationale:
      "Validation runs each surfaced ~167 personas (~3.5%) per restricted-diet archetype, pulling mean intent down by ~5pt and burying the actual product fit signal. Cap=2 brings prevalence to ~2% — closer to the assumed 1-2% natural frequency in K-Food buyer populations. The 1-2% claim is a domain estimate; replace with a real dietary survey when one is available.",
    informedByRuns: [
      "Buldak (1st run, 2026-05-14)",
      "Shin Ramyun (2nd run, 2026-05-14)",
      "COSRX (3rd run, 2026-05-14) — beauty side, same pattern",
    ],
    holdoutProducts: [],
    lastReviewed: "2026-05-14",
    reviewBy: "2026-08-14",
  },
);

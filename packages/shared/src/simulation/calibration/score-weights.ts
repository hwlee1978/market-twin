/**
 * Weights used to mechanically recompute finalScore from LLM-emitted
 * components. Lives here (not in runner.ts) so the provenance is loud:
 * these numbers were chosen from validation output, not derived from
 * external data, and any future revision must come with a holdout test.
 */

import { calibrated } from "./provenance";

export const FINAL_SCORE_WEIGHTS = calibrated(
  {
    marketSize: 0.3,
    culturalFit: 0.15,
    channelMatch: 0.15,
    priceCompat: 0.1,
    competition: 0.15,
    regulatory: 0.15,
  },
  {
    source: "TUNING_ANCHOR",
    rationale:
      "5th Buldak validation (2026-05-15) showed LLM-self-weighted finalScore systematically under-weighted marketSize (US marketSize=82 → finalScore=61). The 30% marketSize floor restores the absolute-market-value signal that LLM prose averaging buried. Other components split the remaining 70% roughly evenly. Weights sum to 1.00.",
    informedByRuns: [
      "Buldak ensemble 10dbb41a (5th run, 2026-05-15)",
      "Shin Ramyun (2nd run, 2026-05-14) — same EU/CN under-weight pattern",
    ],
    holdoutProducts: [],
    lastReviewed: "2026-05-15",
    reviewBy: "2026-08-15",
  },
);

export const REGULATORY_HARD_FLOOR = calibrated(
  {
    /** Components with regulatory below this value trigger the cap. */
    regulatoryThreshold: 30,
    /** Maximum finalScore allowed when the threshold trips — preserves the
     *  prompt's "launch-blocker shouldn't average away" guidance. */
    finalScoreCap: 35,
  },
  {
    source: "DOMAIN_RULE",
    rationale:
      "Mirrors the existing prompt language that a regulatory <25-30 should pull finalScore sharply down. The threshold (30) and cap (35) are interpretive choices made to operationalize that prompt rule into deterministic post-processing. Domain rule, not data: 'a launch blocker isn't averaged away' is a business judgement.",
    lastReviewed: "2026-05-15",
    reviewBy: "2027-01-15",
  },
);

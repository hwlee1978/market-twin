/**
 * Cross-check that every TUNING_ANCHOR's declared `holdoutProducts` exists in
 * the ground truth dataset AND is marked `split: "HOLDOUT"` there. Likewise,
 * every product marked HOLDOUT in ground truth should appear in at least
 * one anchor's holdoutProducts (otherwise the holdout is decorative).
 *
 * This is the load-bearing check that keeps the dataset and calibration
 * provenance honest. Without it, a tuning anchor can claim "verified against
 * holdout" while pointing to a product that's actually in TUNING split, or
 * a holdout product can drift to TUNING and silently leak.
 */

import { COMPETITION_RUBRIC_BANDS } from "@/lib/simulation/calibration/competition-rubric";
import { INCOME_BRACKET_SLACK } from "@/lib/simulation/calibration/income-bracket-slack";
import { CATEGORY_LTV_MULTIPLIER } from "@/lib/simulation/calibration/ltv-multipliers";
import { FOOD_DIET_RESTRICTED_CAPS } from "@/lib/simulation/calibration/profession-caps";
import { FINAL_SCORE_WEIGHTS, REGULATORY_HARD_FLOOR } from "@/lib/simulation/calibration/score-weights";
import { PROVIDER_WEIGHTS } from "@/lib/simulation/calibration/provider-weights";
import type { CalibrationConstant } from "@/lib/simulation/calibration/provenance";
import type { LoadedTruth } from "./loader";

interface AnchorRef {
  name: string;
  anchor: CalibrationConstant<unknown>;
}

const ALL_ANCHORS: AnchorRef[] = [
  { name: "FINAL_SCORE_WEIGHTS", anchor: FINAL_SCORE_WEIGHTS },
  { name: "REGULATORY_HARD_FLOOR", anchor: REGULATORY_HARD_FLOOR },
  { name: "INCOME_BRACKET_SLACK", anchor: INCOME_BRACKET_SLACK },
  { name: "COMPETITION_RUBRIC_BANDS", anchor: COMPETITION_RUBRIC_BANDS },
  { name: "CATEGORY_LTV_MULTIPLIER", anchor: CATEGORY_LTV_MULTIPLIER },
  { name: "FOOD_DIET_RESTRICTED_CAPS", anchor: FOOD_DIET_RESTRICTED_CAPS },
  { name: "PROVIDER_WEIGHTS", anchor: PROVIDER_WEIGHTS },
];

export interface SyncFinding {
  severity: "critical" | "warning" | "info";
  message: string;
}

export function auditCalibrationSync(truths: LoadedTruth[]): SyncFinding[] {
  const findings: SyncFinding[] = [];
  const truthSlugs = new Set(truths.map((t) => t.slug));
  const holdoutSlugs = new Set(truths.filter((t) => t.truth.split === "HOLDOUT").map((t) => t.slug));
  const referencedAsHoldout = new Set<string>();

  for (const { name, anchor } of ALL_ANCHORS) {
    if (anchor.meta.source !== "TUNING_ANCHOR") continue;
    const declared = anchor.meta.holdoutProducts ?? [];
    if (declared.length === 0) {
      findings.push({
        severity: "warning",
        message: `${name} declares no holdoutProducts. Effects on holdout are untested — tighten before next tuning revision.`,
      });
      continue;
    }
    for (const slug of declared) {
      referencedAsHoldout.add(slug);
      if (!truthSlugs.has(slug)) {
        findings.push({
          severity: "critical",
          message: `${name}.holdoutProducts references '${slug}' which has no ground truth file. Either add validation/ground-truth/${slug}.json or remove the reference.`,
        });
      } else if (!holdoutSlugs.has(slug)) {
        findings.push({
          severity: "critical",
          message: `${name}.holdoutProducts references '${slug}' but its ground truth split is TUNING, not HOLDOUT. The anchor is overfitting against tuning data while pretending to verify against holdout.`,
        });
      }
    }
  }

  // Every HOLDOUT product should be referenced by at least one anchor —
  // otherwise it's decoration not a check.
  for (const slug of holdoutSlugs) {
    if (!referencedAsHoldout.has(slug)) {
      findings.push({
        severity: "warning",
        message: `Ground truth '${slug}' is split=HOLDOUT but no calibration anchor lists it as a holdout. The holdout designation is decorative until at least one anchor commits to validating against it.`,
      });
    }
  }

  return findings;
}

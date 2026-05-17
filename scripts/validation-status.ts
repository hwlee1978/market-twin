/**
 * Validation dataset status report. Loads all ground truth, validates schema,
 * prints coverage + flags governance gaps.
 *
 * Usage: tsx scripts/validation-status.ts
 */

import { loadAllGroundTruth, summarizeCoverage } from "@/lib/validation/loader";
import { auditCalibrationSync } from "@/lib/validation/calibration-sync";

async function main() {
  let items;
  try {
    items = await loadAllGroundTruth();
  } catch (err) {
    console.error("FATAL:", (err as Error).message);
    process.exit(1);
    return;
  }

  console.log(`\n══ Loaded ${items.length} ground truth product(s)\n`);
  for (const item of items) {
    const t = item.truth;
    const evCount = t.evidence.length;
    const highConfRows = t.evidence.filter((e) => e.confidence === "high").length;
    const leakFlag = t.leakageRisk.inTrainingData ? " ⚠ leak" : "";
    console.log(
      `  ${item.slug.padEnd(30)}  ${t.category.padEnd(10)}  ${t.split.padEnd(7)}  $${t.priceUsd.toString().padStart(5)}  ${evCount} ev (${highConfRows} high)${leakFlag}`,
    );
  }

  const cov = summarizeCoverage(items);
  console.log("\n┌── Coverage ──");
  console.log(`  Total: ${cov.total}`);
  console.log(`  Splits: TUNING=${cov.bySplit.TUNING}, HOLDOUT=${cov.bySplit.HOLDOUT}`);
  console.log(`  Leakage-high-risk: ${cov.leakageHighRiskCount}/${cov.total}`);
  console.log("\n  By category:");
  for (const [k, v] of Object.entries(cov.byCategory).sort()) {
    console.log(`    ${k.padEnd(12)} ${v}`);
  }
  console.log("\n  By price band:");
  for (const [k, v] of Object.entries(cov.byPriceBand)) {
    console.log(`    ${k.padEnd(10)} ${v}`);
  }

  // Governance flags
  const flags: string[] = [];
  if (cov.bySplit.HOLDOUT === 0) flags.push("CRITICAL: zero HOLDOUT products — any tuning is unverifiable.");
  if (cov.bySplit.HOLDOUT < cov.total * 0.2) flags.push(`HOLDOUT share ${((cov.bySplit.HOLDOUT / cov.total) * 100).toFixed(0)}% < 20% target`);
  if (cov.leakageHighRiskCount === cov.total)
    flags.push("All products are leakage-high-risk. Confident-correct scores are weak evidence — add a launched-within-12-months product.");
  const catCounts = Object.values(cov.byCategory);
  const maxCat = Math.max(...catCounts);
  if (maxCat / cov.total > 0.5) flags.push(`Category imbalance: largest category ${maxCat}/${cov.total} > 50%`);
  if (cov.total < 10) flags.push(`Dataset size ${cov.total} < v1 target (10). Statistical power is limited.`);

  if (flags.length) {
    console.log("\n┌── Governance flags ──");
    for (const f of flags) console.log(`  ⚠  ${f}`);
  } else {
    console.log("\n  ✓ No governance flags");
  }

  // Calibration anchor ↔ ground truth sync
  const syncFindings = auditCalibrationSync(items);
  console.log("\n┌── Calibration anchor sync ──");
  if (syncFindings.length === 0) {
    console.log("  ✓ All anchors' holdoutProducts align with ground truth splits");
  } else {
    const critical = syncFindings.filter((f) => f.severity === "critical");
    const warnings = syncFindings.filter((f) => f.severity === "warning");
    for (const f of critical) console.log(`  ✗ CRIT  ${f.message}`);
    for (const f of warnings) console.log(`  ⚠ WARN  ${f.message}`);
    if (critical.length) {
      console.log("\n  Exit 1 — critical sync findings must be resolved before benchmarks are trustworthy.");
      process.exitCode = 1;
    }
  }
  console.log();
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});

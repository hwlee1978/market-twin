/**
 * Validate all ground-truth fixtures parse cleanly + summarize by category/split.
 *   npx tsx scripts/check-fixtures.ts
 */
import { loadAllGroundTruth } from "@/lib/validation/loader";

(async () => {
  try {
    const all = await loadAllGroundTruth();
    console.log(`✓ ${all.length} fixtures parsed cleanly\n`);

    const byCategory = new Map<string, number>();
    const bySplit = new Map<string, number>();
    const byLeakage = new Map<string, number>();
    for (const t of all) {
      byCategory.set(t.truth.category, (byCategory.get(t.truth.category) ?? 0) + 1);
      bySplit.set(t.truth.split, (bySplit.get(t.truth.split) ?? 0) + 1);
      const lk = t.truth.leakageRisk.inTrainingData ? "leaked" : "low-leak";
      byLeakage.set(lk, (byLeakage.get(lk) ?? 0) + 1);
    }

    console.log("By category:");
    for (const [k, v] of [...byCategory.entries()].sort()) {
      console.log(`  ${k.padEnd(12)} ${v}`);
    }
    console.log("\nBy split:");
    for (const [k, v] of bySplit.entries()) console.log(`  ${k.padEnd(12)} ${v}`);
    console.log("\nBy leakage:");
    for (const [k, v] of byLeakage.entries()) console.log(`  ${k.padEnd(12)} ${v}`);

    console.log("\nProducts by category:");
    const groups = new Map<string, string[]>();
    for (const t of all) {
      const key = t.truth.category;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(t.slug);
    }
    for (const [k, slugs] of [...groups.entries()].sort()) {
      console.log(`\n  [${k}] (${slugs.length})`);
      for (const s of slugs.sort()) console.log(`    - ${s}`);
    }
  } catch (err) {
    console.error("✗ Validation failed:", (err as Error).message);
    process.exit(1);
  }
})();

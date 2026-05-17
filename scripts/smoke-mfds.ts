/**
 * Standalone smoke for the MFDS anchor.
 * Verifies brand-ingredients × MFDS reg join produces useful per-fixture
 * blocks BEFORE wiring into orchestrator.
 *
 *   npx tsx --env-file=.env.local scripts/smoke-mfds.ts
 *
 * Requires the prefetched dataset:
 *   npx tsx --env-file=.env.local scripts/prefetch-mfds-regulations.ts
 */

import { buildMfdsAnchor, lookupMfdsForFixture } from "../packages/shared/src/market-research/mfds";

const FIXTURES = [
  "boj-relief-sun",         // expected: BoJ Relief Sun, UV filter list — should produce a block
  "anua-heartleaf-toner",   // expected: skincare, no brand-ingredients entry — empty
  "cosrx-snail-mucin",      // expected: skincare, no brand-ingredients entry — empty
  "kgc-everytime-redginseng", // expected: health functional food, irrelevant — empty
  "lg-oled-tv-c-series",    // expected: K-Tech, irrelevant — empty
];

console.log("=== MFDS smoke test (Phase F.3 narrow scope) ===\n");

for (const slug of FIXTURES) {
  console.log(`──── ${slug} ────`);
  const lookup = lookupMfdsForFixture(slug);
  if (!lookup) {
    console.log("  (no brand-ingredients entry — skip, returns empty block)\n");
    continue;
  }
  console.log(`  product: ${lookup.productKo}`);
  console.log(`  matched ingredients: ${lookup.matched.length}`);
  console.log(`  unmatched ingredients: ${lookup.unmatchedIngredients.length}`);
  const { block } = buildMfdsAnchor(slug, { locale: "ko" });
  if (block) {
    console.log("\n" + block + "\n");
  } else {
    console.log("  (block empty)\n");
  }
}

console.log("=== smoke complete ===");

/**
 * End-to-end smoke: buildDartFullAnchor on 8 fixtures.
 * Expected:
 *   - 8 fixtures with manual entry: show "manual regions=N" (from JSON)
 *   - 0 fixtures without manual: would fall through to auto-region
 *     (but all 8 currently have manual entries — auto is dead code in fixture
 *     scope; auto fires only for new user products without manual)
 *
 *   npx tsx --env-file=.env.local scripts/smoke-dart-full-anchor.ts
 */

import { buildDartFullAnchor } from "@/lib/market-research/dart";

const FIXTURES = [
  { slug: "bibigo-mandu",              candidates: ["US", "CN", "JP", "GB", "DE", "AU"] },
  { slug: "shin-ramyun",               candidates: ["US", "CN", "JP", "VN", "GB"] },
  { slug: "buldak",                    candidates: ["US", "CN", "ID", "VN"] },
  { slug: "cosrx-snail-mucin",         candidates: ["US", "CN", "JP", "GB", "DE", "TH", "VN", "MX", "MY"] },
  { slug: "jinro-chamisul",            candidates: ["JP", "VN", "US", "TW", "TH"] },
  { slug: "kgc-everytime-redginseng",  candidates: ["CN", "TW", "US", "JP", "HK"] },
  { slug: "binggrae-melona",           candidates: ["US", "JP", "ID", "CN", "GB", "DE", "TH", "VN", "MX", "MY"] },
  { slug: "lg-oled-tv-c-series",       candidates: ["US", "DE", "GB", "JP", "CA"] },
];

async function main() {
  console.log("=== buildDartFullAnchor smoke (Phase 7 wire) ===\n");
  for (const fx of FIXTURES) {
    console.log(`──── ${fx.slug} ────`);
    const r = await buildDartFullAnchor(fx.slug, fx.candidates, { locale: "ko" });
    const manualCount = r.region?.regions.length ?? 0;
    const autoCount = r.autoRegion?.rows.length ?? 0;
    const rev = r.financials?.revenueKrw ?? 0;
    console.log(
      `  scale=${(rev / 1e12).toFixed(2)}T  manual=${manualCount}  auto=${autoCount}  blockLen=${r.block.length}`,
    );
  }
  console.log("\n=== single new-product scenario: bibigo-mandu but manual disabled ===");
  // Simulate "new user product without manual entry" by passing an unknown slug
  // that still matches corp_code via DART path (impossible — slug is required key).
  // For a real new product, the orchestrator would skip the DART path entirely
  // unless the corp_code is known. This smoke confirms fixture path works.
}

main().catch((e) => { console.error(e); process.exit(1); });

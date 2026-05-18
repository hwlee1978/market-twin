/**
 * Smoke test for DART region parser across 8 fixture parent corps.
 * Validates feasibility prediction: multi-segment → ✓ region table extracted,
 * single-segment → null gracefully returned.
 *
 *   npx tsx --env-file=.env.local scripts/smoke-dart-region-parser.ts
 */

import { fetchDartRegionSegment } from "@/lib/market-research/dart-region-parser";

const FIXTURES = [
  { slug: "bibigo-mandu",              corp: "00635134", name: "CJ제일제당",   predict: "✓" },
  { slug: "shin-ramyun",               corp: "00108241", name: "농심",         predict: "?" },
  { slug: "buldak",                    corp: "00126955", name: "삼양식품",     predict: "?" },
  { slug: "cosrx-snail-mucin",         corp: "00356370", name: "LG생활건강",   predict: "✓" },
  { slug: "jinro-chamisul",            corp: "00150244", name: "하이트진로",   predict: "✗" },
  { slug: "kgc-everytime-redginseng",  corp: "00244455", name: "KT&G",         predict: "✓" },
  { slug: "binggrae-melona",           corp: "00124726", name: "빙그레",       predict: "✗" },
  { slug: "lg-oled-tv-c-series",       corp: "00401731", name: "LG전자",       predict: "✓" },
];

async function main() {
  const apiKey = process.env.DART_API_KEY;
  if (!apiKey) {
    console.error("DART_API_KEY required");
    process.exit(1);
  }
  console.log("=== DART region parser smoke ===\n");
  let success = 0;
  let nullReturn = 0;
  for (const fx of FIXTURES) {
    process.stdout.write(`  ${fx.slug.padEnd(28)} (${fx.name.padEnd(10)} predict=${fx.predict}) ... `);
    const t0 = Date.now();
    const result = await fetchDartRegionSegment(fx.corp, apiKey);
    const ms = Date.now() - t0;
    if (!result) {
      console.log(`null (${ms}ms)`);
      nullReturn++;
      continue;
    }
    success++;
    console.log(`✓ ${result.rows.length} regions, total ${(result.totalRevenueKrw / 1e12).toFixed(2)}T KRW (${ms}ms)`);
    for (const r of result.rows) {
      console.log(`    ${r.regionKo.padEnd(20)} (${(r.regionEn ?? "—").padEnd(28)}) ${(r.revenueKrw / 1e12).toFixed(2)}T KRW`);
    }
  }
  console.log("");
  console.log(`Summary: ${success} extracted / ${nullReturn} null / ${FIXTURES.length} total`);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });

/**
 * Smoke for LLM narrative extractor — focus on single-segment brands
 * (빙그레, 농심, 삼양, 하이트진로) and KGC (KT&G parent).
 *
 *   npx tsx --env-file=.env.local scripts/smoke-dart-narrative.ts
 */

import { extractBrandNarrative, renderNarrativeBlock } from "@/lib/market-research/dart-narrative-extractor";

const FIXTURES = [
  { slug: "binggrae-melona",          corpCode: "00124726", name: "빙그레" },
  { slug: "shin-ramyun",              corpCode: "00108241", name: "농심" },
  { slug: "buldak",                   corpCode: "00126955", name: "삼양식품" },
  { slug: "jinro-chamisul",           corpCode: "00150244", name: "하이트진로" },
  { slug: "kgc-everytime-redginseng", corpCode: "00244455", name: "케이티앤지" },
];

const CANDIDATE_COUNTRIES = ["US", "CN", "JP", "VN", "TH", "ID", "MY", "PH", "IN", "RU", "GB", "DE", "AU"];

async function main() {
  console.log("=== DART narrative LLM smoke (Phase 4-5) ===\n");
  for (const fx of FIXTURES) {
    console.log(`──── ${fx.slug} (${fx.name}) ────`);
    const t0 = Date.now();
    const result = await extractBrandNarrative(fx.slug, fx.corpCode, fx.name, { force: true });
    const ms = Date.now() - t0;
    if (!result) {
      console.log(`  null (${ms}ms)`);
      continue;
    }
    console.log(`  extracted ${result.countries.length} countries in ${ms}ms`);
    for (const c of result.countries) {
      console.log(`    ${c.iso2} ${c.nameKo} | ${c.presence} | ${c.confidence} | ${c.evidence.slice(0, 100)}`);
    }
    console.log("\n  rendered block:");
    console.log(renderNarrativeBlock(result, CANDIDATE_COUNTRIES, { locale: "ko" }));
    console.log("");
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

/**
 * Smoke test: corp_code lookup by company name.
 *   npx tsx --env-file=.env.local scripts/smoke-dart-corp-lookup.ts
 */

import { lookupCorpCodeByName, loadCorpIndex } from "@/lib/market-research/dart-corp-lookup";

const TESTS = [
  "오리온",
  "롯데웰푸드",
  "롯데제과",          // legacy name, now 롯데웰푸드
  "아모레퍼시픽",
  "L&P코스메틱",
  "엘앤피코스메틱",
  "농심",
  "삼양식품",
  "빙그레",
  "하이트진로",
  "CJ제일제당",
  "LG생활건강",
  "LG전자",
  "KT&G",
  "정관장",            // brand, not corp
  "메디힐",            // brand, not corp
];

async function main() {
  console.log("Loading corp index (first call may take ~10s)...");
  const t0 = Date.now();
  const index = await loadCorpIndex();
  console.log(`Loaded in ${Date.now() - t0}ms`);
  if (!index) {
    console.error("Index load failed");
    process.exit(1);
  }
  console.log(`Total entries: ${index._meta.totalEntries}, listed: ${index._meta.listedEntries}\n`);

  for (const q of TESTS) {
    const t1 = Date.now();
    const r = await lookupCorpCodeByName(q);
    const ms = Date.now() - t1;
    if (r) {
      console.log(`  ${q.padEnd(20)} → ${r.corpCode} "${r.corpNameKo}" stock=${r.stockCode} (${ms}ms)`);
    } else {
      console.log(`  ${q.padEnd(20)} → null (${ms}ms)`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

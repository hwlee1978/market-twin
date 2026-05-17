/**
 * Standalone smoke test for the KOTRA module.
 * Validates the 3-endpoint client + per-fixture category-keyword filtering
 * BEFORE wiring it into a full ensemble run. Cheap (~10 calls, free tier).
 *
 *   npx tsx scripts/smoke-kotra.ts
 *
 * Reads DATAGOKR_API_KEY from .env.local automatically (via dotenv).
 */

import { config as loadEnv } from "dotenv";
import {
  buildKotraNationalAnchor,
  fetchKotraCountryList,
  fetchKotraSuccessCases,
} from "../packages/shared/src/market-research/kotra";

loadEnv({ path: ".env.local" });

interface Fixture {
  slug: string;
  productName: string;
  category: string;
  candidateCountries: string[];
}

const FIXTURES: Fixture[] = [
  {
    slug: "kgc-everytime",
    productName: "정관장 홍삼정 에브리타임",
    category: "건강기능식품",
    candidateCountries: ["US", "CN", "JP", "TW", "HK"],
  },
  {
    slug: "binggrae-melona",
    productName: "빙그레 메로나",
    category: "아이스크림",
    candidateCountries: ["US", "VN", "JP", "PH", "TH"],
  },
  {
    slug: "lg-oled",
    productName: "LG OLED TV C 시리즈",
    category: "가전",
    candidateCountries: ["US", "DE", "GB", "JP", "CA"],
  },
  {
    slug: "bibigo-mandu",
    productName: "비비고 왕교자",
    category: "냉동식품",
    candidateCountries: ["US", "CN", "JP", "DE", "AU"],
  },
];

async function run() {
  console.log("=== KOTRA smoke test (Phase F.1-C) ===\n");

  console.log("[1/3] natnList — supported countries");
  const list = await fetchKotraCountryList();
  console.log(`  → ${list.length} countries`);
  console.log(`  sample: ${list.slice(0, 5).map((c) => `${c.iso2}(${c.nameKo})`).join(", ")}\n`);

  console.log("[2/3] natnInfo — per-fixture anchor blocks\n");
  for (const fx of FIXTURES) {
    console.log(`──── ${fx.slug} (${fx.productName}) ────`);
    console.log(`  category: ${fx.category}`);
    console.log(`  candidates: ${fx.candidateCountries.join(", ")}`);
    const { block, bundles } = await buildKotraNationalAnchor(
      fx.candidateCountries,
      {
        categoryKeywords: [fx.category, fx.productName],
        locale: "ko",
        maxPerCountry: 4,
      },
    );
    const total = bundles.reduce((n, b) => n + b.koreanCompanies.length, 0);
    console.log(`  → ${bundles.length}/${fx.candidateCountries.length} countries with data, ${total} Korean companies total`);
    if (block) {
      console.log("\n" + block + "\n");
    } else {
      console.log("  (empty block)\n");
    }
  }

  console.log("[3/3] compSucsCase — sample lookup (미국)");
  const cases = await fetchKotraSuccessCases("미국", { numOfRows: 3 });
  console.log(`  → ${cases.length} cases`);
  for (const c of cases) {
    console.log(`    ${c.companyName} (${c.industry || "—"}) bodyHtml=${c.bodyHtml.length}c`);
  }
  console.log("\n=== smoke test complete ===");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

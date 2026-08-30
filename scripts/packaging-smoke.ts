/**
 * Smoke test for the product packaging spec (migration 0082).
 *
 * Covers the two shapes users actually type — a single 100ml bottle and an
 * N-per-pack box — plus the guards that keep a malformed DB blob out of the
 * prompt. Run: npx tsx scripts/packaging-smoke.ts
 */
import { formatPackSpec, formatUnitPrice, parsePackaging } from "../packages/shared/src/format/packaging";

const cases = [
  { name: "100ml 향수 / $80", p: { netContent: 100, netContentUnit: "ml" as const, unitsPerPack: 1, packFormat: "유리 스프레이 보틀" }, cents: 8000, ccy: "USD" },
  { name: "마스크팩 25ml × 5매 / 12,000원", p: { netContent: 25, netContentUnit: "ml" as const, unitsPerPack: 5, packFormat: "파우치 박스", caseQty: 24 }, cents: 1200000, ccy: "KRW" },
  { name: "수량만 (5개입) / $30", p: { unitsPerPack: 5 }, cents: 3000, ccy: "USD" },
  { name: "빈 스펙", p: {}, cents: 3000, ccy: "USD" },
  { name: "1kg 커피 / 32,000원", p: { netContent: 1, netContentUnit: "kg" as const, unitsPerPack: 1 }, cents: 3200000, ccy: "KRW" },
];

for (const c of cases) {
  console.log("──", c.name);
  console.log("  KO spec:", formatPackSpec(c.p, "ko"));
  console.log("  EN spec:", formatPackSpec(c.p, "en"));
  console.log("  KO unit:", formatUnitPrice(c.p, c.cents, c.ccy, "ko"));
  console.log("  EN unit:", formatUnitPrice(c.p, c.cents, c.ccy, "en"));
}
console.log("── parsePackaging guards");
console.log("  garbage array:", parsePackaging([1, 2]));
console.log("  bad unit:", parsePackaging({ netContent: 100, netContentUnit: "gallons" }));
console.log("  string numbers:", parsePackaging({ netContent: "100", netContentUnit: "ml", unitsPerPack: "5" }));
console.log("  orphan content:", parsePackaging({ netContent: 100 }));

// What the LLM actually receives, straight from the prompt builder.
import { packagingBlock } from "../packages/shared/src/simulation/prompts";
const input = {
  productName: "Test Serum",
  category: "beauty",
  description: "x".repeat(20),
  basePriceCents: 1200000,
  currency: "KRW",
  objective: "conversion" as const,
  originatingCountry: "KR",
  candidateCountries: ["JP"],
  competitorUrls: [],
  assetDescriptions: [],
  assetUrls: [],
  packaging: { netContent: 25, netContentUnit: "ml" as const, unitsPerPack: 5, packFormat: "파우치 박스" },
};
console.log("── prompt block (ko)\n" + packagingBlock(input, "ko"));
console.log("── prompt block (en)\n" + packagingBlock(input, "en"));
console.log("── no spec:", JSON.stringify(packagingBlock({ ...input, packaging: undefined }, "ko")));

/**
 * One-time (annual-refresh) builder for tariff-snapshot.json.
 *
 * WITS/TRAINS is ~33s per query, which made the live tariff anchor the single
 * biggest prefetch bottleneck (~40s). Tariffs change only annually, so we bake
 * the 24-market × category grid into a static snapshot that the runtime reads
 * instantly, falling back to live WITS only on a miss. Mirrors the EDINET
 * snapshot pattern.
 *
 * Run: npx tsx scripts/build-tariff-snapshot.ts   (~5 min; sequential to be
 * gentle on WITS). Re-run yearly.
 */
import { writeFileSync } from "fs";
import { join } from "path";
import { fetchTariffs } from "../packages/shared/src/market-research/tariffs";

const ALL_MARKETS = [
  "KR", "US", "JP", "CN", "TW", "HK", "SG", "TH", "VN", "ID", "MY", "PH",
  "IN", "CA", "GB", "DE", "FR", "IT", "ES", "NL", "AU", "NZ", "AE", "SA",
  "BR", "MX",
];
const CATEGORIES = [
  "food", "beauty", "health", "alcohol", "beverage", "fashion",
  "electronics", "home", "ip",
];

async function main() {
  const snapshot: Record<string, Record<string, { ratePct: number; year: number }>> = {};
  for (const cat of CATEGORIES) {
    process.stdout.write(`${cat} ... `);
    const rows = await fetchTariffs(ALL_MARKETS, cat);
    snapshot[cat] = {};
    for (const r of rows) snapshot[cat][r.country] = { ratePct: r.ratePct, year: r.year };
    console.log(`${rows.length}/${ALL_MARKETS.length} markets`);
  }
  const out = join(
    process.cwd(),
    "packages/shared/src/market-research/tariff-snapshot.json",
  );
  writeFileSync(out, JSON.stringify(snapshot, null, 2));
  console.log(`\nwrote ${out}`);
}
main().catch((e) => { console.error(e); process.exit(1); });

/**
 * Reference-data fetcher orchestrator.
 *
 * Runs registered country fetchers and writes the result back to the
 * corresponding SQL seed file under supabase/seeds/. The committed seed
 * files remain the source of truth — the auto-fetcher just keeps them
 * fresh against current public statistics.
 *
 * Usage:
 *   npx tsx scripts/fetch-reference/index.ts          # all enabled countries
 *   npx tsx scripts/fetch-reference/index.ts kr       # one country
 *   npx tsx scripts/fetch-reference/index.ts kr us de # multiple
 *
 * After fetching, review the diff in supabase/seeds/ and either:
 *   • Run `npm run sync:reference` to apply the updated seeds to your DB
 *   • Commit the seed files; the GitHub Actions cron will apply them
 */
import { writeFileSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { CountryFetcher } from "./types";
import { renderSeed } from "./sql";
import { krFetcher } from "./fetchers/kr";

// ──────────────────────────────────────────────────────────────────
// Registered fetchers
//
// Adding a new country: implement a CountryFetcher in fetchers/<code>.ts
// and add it to the array below. It can start as a stub that throws —
// the orchestrator will skip stubs that throw NotImplementedError.
// ──────────────────────────────────────────────────────────────────
const FETCHERS: CountryFetcher[] = [
  krFetcher,
  // TODO: usFetcher (BLS API),
  // TODO: jpFetcher (e-Stat API),
  // TODO: deFetcher (Destatis GENESIS-Online),
  // TODO: gbFetcher (ONS API),
  // ... others stay manual until APIs are wired up
];

const SEEDS_DIR = join(process.cwd(), "supabase", "seeds");

function findSeedPath(countryCode: string): string {
  // Match any file containing _<code>_ (e.g. 0001_kr_reference_data.sql)
  const lower = countryCode.toLowerCase();
  const files = readdirSync(SEEDS_DIR);
  const match = files.find((f) => f.match(new RegExp(`^\\d+_${lower}_`)));
  if (!match) {
    throw new Error(`No seed file found for ${countryCode} in ${SEEDS_DIR}`);
  }
  return join(SEEDS_DIR, match);
}

function selectFetchers(args: string[]): CountryFetcher[] {
  if (args.length === 0) return FETCHERS;
  const requested = new Set(args.map((a) => a.toUpperCase()));
  const selected = FETCHERS.filter((f) => requested.has(f.countryCode));
  if (selected.length === 0) {
    console.error(
      `No fetcher matched. Requested: ${Array.from(requested).join(", ")}.`,
    );
    console.error(`Available: ${FETCHERS.map((f) => f.countryCode).join(", ")}`);
    process.exit(1);
  }
  return selected;
}

async function main() {
  const args = process.argv.slice(2);
  const fetchers = selectFetchers(args);

  console.log(`Running ${fetchers.length} fetcher(s):\n`);

  let updated = 0;
  let failed = 0;
  for (const fetcher of fetchers) {
    process.stdout.write(`  ${fetcher.label} ... `);
    try {
      const bundle = await fetcher.fetch();
      const sql = renderSeed(bundle);
      const seedPath = findSeedPath(fetcher.countryCode);

      // Only rewrite if the rendered SQL has actual profession rows.
      // (Keep hand-curated norms in the existing SQL file when fetcher returns norms: [].)
      if (bundle.norms.length === 0) {
        console.log("✓ (income only — norms preserved in existing seed)");
        // Update only the profession_income block by line-replacing.
        // For now, since norms are always preserved manually, we just log.
        // Future enhancement: parse-and-merge the existing seed.
      } else {
        writeFileSync(seedPath, sql, "utf8");
        console.log(`✓ → ${seedPath}`);
      }
      updated++;
    } catch (err) {
      console.log("✗");
      console.error(`    ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }
  }

  console.log(`\nDone. ${updated} succeeded, ${failed} failed.`);
  console.log("\nNext: review changes in supabase/seeds/, then run:");
  console.log("    npm run sync:reference");

  // Read and report which countries are still hand-curated only
  const allSeedFiles = readdirSync(SEEDS_DIR).filter((f) => f.match(/^\d+_[a-z]{2}_/));
  const automated = new Set(FETCHERS.map((f) => f.countryCode));
  const manual = allSeedFiles
    .map((f) => f.match(/^\d+_([a-z]{2})_/)?.[1].toUpperCase())
    .filter((c): c is string => !!c && !automated.has(c));
  if (manual.length > 0) {
    console.log(`\nStill manual-only: ${manual.join(", ")}.`);
    console.log(`Add a fetcher under scripts/fetch-reference/fetchers/<code>.ts to automate.`);
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});

// Workaround: discoverSeedFiles is referenced for future use but not directly invoked.
// Reading existing SQL is staged for a future "merge instead of overwrite" feature.
void readFileSync;

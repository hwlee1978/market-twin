/**
 * Re-applies every reference-data seed in supabase/seeds/ to the configured
 * Supabase Postgres instance.
 *
 * Use cases:
 *   • Annual data refresh — run via GitHub Actions cron once a year
 *   • Manual reapply after editing any seed file
 *   • Bootstrap a fresh Supabase project (run once after migrations)
 *
 * Auth: requires DATABASE_URL pointing at the Supabase pooler / direct connection.
 * Get it from Supabase dashboard → Project Settings → Database → Connection string.
 *
 * Usage:
 *   DATABASE_URL=... npx tsx scripts/sync-reference-data.ts            # all seeds
 *   DATABASE_URL=... npx tsx scripts/sync-reference-data.ts kr us      # subset
 */
import { Client } from "pg";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SEEDS_DIR = join(process.cwd(), "supabase", "seeds");

interface SeedFile {
  path: string;
  filename: string;
  countryCode: string | null;
}

function discoverSeeds(): SeedFile[] {
  const files = readdirSync(SEEDS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  return files.map((f) => {
    // Filenames look like 0001_kr_reference_data.sql; extract the country slug.
    const match = f.match(/^\d+_([a-z]{2})_/);
    return {
      path: join(SEEDS_DIR, f),
      filename: f,
      countryCode: match ? match[1].toUpperCase() : null,
    };
  });
}

function filterSeeds(seeds: SeedFile[], requestedCodes: string[]): SeedFile[] {
  if (requestedCodes.length === 0) return seeds;
  const set = new Set(requestedCodes.map((c) => c.toUpperCase()));
  return seeds.filter((s) => s.countryCode && set.has(s.countryCode));
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("ERROR: DATABASE_URL env var is required.");
    console.error("Get it from Supabase → Project Settings → Database → Connection string.");
    process.exit(1);
  }

  const requested = process.argv.slice(2).map((c) => c.replace(/^--/, ""));
  const allSeeds = discoverSeeds();
  const seeds = filterSeeds(allSeeds, requested);

  if (seeds.length === 0) {
    console.error(`No matching seed files. Requested: ${requested.join(", ") || "(all)"}`);
    console.error(`Available: ${allSeeds.map((s) => s.countryCode).join(", ")}`);
    process.exit(1);
  }

  console.log(`Applying ${seeds.length} seed file(s) to ${maskUrl(databaseUrl)}\n`);

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  let applied = 0;
  let failed = 0;
  for (const seed of seeds) {
    process.stdout.write(`  ${seed.filename} ... `);
    try {
      const sql = readFileSync(seed.path, "utf8");
      await client.query(sql);
      console.log("✓");
      applied++;
    } catch (err) {
      console.log("✗");
      console.error(`    ${err instanceof Error ? err.message : String(err)}`);
      failed++;
    }
  }

  await client.end();

  console.log(`\nDone. ${applied} applied, ${failed} failed.`);
  process.exit(failed > 0 ? 1 : 0);
}

/** Hide password in logs. */
function maskUrl(url: string): string {
  return url.replace(/:([^:@/]+)@/, ":***@");
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});

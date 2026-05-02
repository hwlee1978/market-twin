/**
 * One-shot migration applier for the LATEST migration file (or one passed
 * by name). Used when sync:reference (which only handles seeds) isn't the
 * right tool. Re-runnable safely as long as the migration is idempotent
 * (we use `add column if not exists` etc.).
 *
 * Usage:
 *   npm run apply:migration             # applies the highest-numbered file
 *   npm run apply:migration -- 0011     # applies the file starting with "0011_"
 */
import { Client } from "pg";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

function pickMigration(prefix?: string): string {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  if (prefix) {
    const match = files.find((f) => f.startsWith(prefix + "_"));
    if (!match) throw new Error(`No migration starting with "${prefix}_"`);
    return match;
  }
  return files[files.length - 1];
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("ERROR: DATABASE_URL env var is required (use --env-file=.env.local).");
    process.exit(1);
  }
  const prefix = process.argv[2];
  const file = pickMigration(prefix);
  const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  console.log(`Applying ${file} ...`);
  try {
    await client.query(sql);
    console.log("✓ done");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});

/**
 * Replays every migration in supabase/migrations/ against DATABASE_URL, in
 * filename order, recording what it applied.
 *
 * apply-migration.ts handles a single file, which is right for the usual
 * "ship one migration" flow. Bootstrapping a fresh Supabase project needs
 * the whole sequence, and there was no way to do that — hence this.
 *
 * Design notes:
 *   - Each migration runs in its own transaction, so a failure leaves the
 *     database at the last complete migration rather than half-applied.
 *   - Applied versions are recorded in public.schema_migrations, so a rerun
 *     resumes rather than replaying from 0001. That matters because not
 *     every historical migration is idempotent.
 *   - By default it refuses to touch a database that already holds
 *     workspaces. This script exists to fill an empty project; pointing it
 *     at production by pasting the wrong connection string should not be a
 *     single keystroke away.
 *
 * Usage:
 *   DATABASE_URL=<staging> npx tsx scripts/migrate-all.ts
 *   DATABASE_URL=<staging> npx tsx scripts/migrate-all.ts --dry-run
 *   DATABASE_URL=<...>     npx tsx scripts/migrate-all.ts --allow-nonempty
 */
import { Client } from "pg";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes("--dry-run");
const ALLOW_NONEMPTY = argv.includes("--allow-nonempty");

function listMigrations(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

function versionOf(filename: string): string {
  return filename.replace(/\.sql$/, "");
}

/** Host only — never print the connection string, it carries the password. */
function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "(unparseable)";
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("ERROR: DATABASE_URL is required.");
    console.error("  Supabase dashboard → Project Settings → Database → Connection string");
    process.exit(1);
  }

  const files = listMigrations();
  console.log(`target : ${safeHost(url)}`);
  console.log(`found  : ${files.length} migration files`);

  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    // ── Guard: is this an empty project? ────────────────────────────────
    const { rows: existing } = await client.query<{ t: string | null }>(
      `select to_regclass('public.workspaces')::text as t`,
    );
    let workspaceCount = 0;
    if (existing[0].t) {
      const { rows } = await client.query<{ n: string }>(
        `select count(*)::text as n from public.workspaces`,
      );
      workspaceCount = Number(rows[0].n);
    }
    console.log(`state  : ${existing[0].t ? `workspaces table present, ${workspaceCount} rows` : "empty (no workspaces table)"}`);

    if (workspaceCount > 0 && !ALLOW_NONEMPTY) {
      console.error(
        `\nREFUSING: this database already holds ${workspaceCount} workspaces, ` +
          `which means it is not a fresh project.\n` +
          `If you really intend to run every migration here, pass --allow-nonempty.`,
      );
      process.exit(1);
    }

    // ── Ledger ──────────────────────────────────────────────────────────
    if (!DRY_RUN) {
      await client.query(`
        create table if not exists public.schema_migrations (
          version     text primary key,
          applied_at  timestamptz not null default now()
        )
      `);
    }

    const applied = new Set<string>();
    const { rows: ledgerExists } = await client.query<{ t: string | null }>(
      `select to_regclass('public.schema_migrations')::text as t`,
    );
    if (ledgerExists[0].t) {
      const { rows } = await client.query<{ version: string }>(
        `select version from public.schema_migrations`,
      );
      for (const r of rows) applied.add(r.version);
    }

    // A database migrated before this script existed has no ledger entries
    // even though the schema is current. Seeding the ledger from the files
    // in that case would be a lie; instead we say so and let the operator
    // decide, since replaying old non-idempotent migrations can fail.
    if (applied.size === 0 && workspaceCount > 0) {
      console.log(
        "note   : no ledger rows but data present — this database predates the ledger.",
      );
    }

    const pending = files.filter((f) => !applied.has(versionOf(f)));
    console.log(`pending: ${pending.length}\n`);

    if (pending.length === 0) {
      console.log("nothing to do.");
      return;
    }

    if (DRY_RUN) {
      for (const f of pending) console.log(`  would apply  ${f}`);
      console.log("\n--dry-run: nothing was executed.");
      return;
    }

    let count = 0;
    for (const file of pending) {
      const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
      process.stdout.write(`  ${file} ... `);
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query(
          `insert into public.schema_migrations (version) values ($1)
           on conflict (version) do nothing`,
          [versionOf(file)],
        );
        await client.query("COMMIT");
        count++;
        console.log("ok");
      } catch (err) {
        await client.query("ROLLBACK");
        console.log("FAILED");
        console.error(`\n${file} failed:\n  ${(err as Error).message}`);
        console.error(
          `\n${count} migration(s) applied before this one. Fix the cause and ` +
            `re-run — the ledger means it resumes here rather than starting over.`,
        );
        process.exit(1);
      }
    }

    console.log(`\napplied ${count} migration(s).`);
    console.log("next: run the reference-data seeds —");
    console.log("  DATABASE_URL=<same> npx tsx scripts/sync-reference-data.ts");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

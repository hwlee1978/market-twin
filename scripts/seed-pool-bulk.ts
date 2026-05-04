/**
 * Bulk pool seeder — fills the persona pool for many countries × all
 * categories in one shot. Wraps the existing seed-pool.ts logic by
 * spawning it sequentially per (category, countries) pair so progress
 * is observable and a partial failure leaves earlier work intact.
 *
 * Usage:
 *   npm run seed:pool:bulk -- <workspace_id> [perCountryPerCategory=125]
 *     [countries=AU,BR,CA,...]
 *     [categories=beauty,saas,food,health,fashion,electronics,home,ip]
 *
 * Default: 125 personas per country per category × 8 categories = ~1000
 * total per country. With 14 default empty/under-filled countries this
 * generates ~14,000 personas, costing roughly $10-20 in Haiku tokens
 * and ~30-45 minutes of wall time.
 *
 * Run after `inspect:pool` to confirm which countries are empty:
 *   npm run inventory:pool
 */
import { spawn } from "node:child_process";
import { Client } from "pg";

const ALL_CATEGORIES = [
  "beauty",
  "saas",
  "food",
  "health",
  "fashion",
  "electronics",
  "home",
  "ip",
] as const;

const DEFAULT_TARGET_COUNTRIES = [
  "AU", "BR", "CA", "CN", "ES", "IN", "IT", "KR", "MX", "MY", "NL", "PH", "SA", "TW",
];

async function main() {
  const [, , workspaceId, perCountryArg, countriesArg, categoriesArg] = process.argv;
  if (!workspaceId) {
    console.error(
      "Usage: npm run seed:pool:bulk -- <workspace_id> [perCountryPerCategory=125] [countries] [categories]",
    );
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("ERROR: DATABASE_URL env var is required.");
    process.exit(1);
  }

  const perCountryPerCategory = perCountryArg ? Number.parseInt(perCountryArg, 10) : 125;
  const countries = (countriesArg ?? DEFAULT_TARGET_COUNTRIES.join(","))
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const categories = (categoriesArg ?? ALL_CATEGORIES.join(","))
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const totalPersonas = perCountryPerCategory * countries.length * categories.length;
  console.log(`Bulk seed plan:`);
  console.log(`  workspace      : ${workspaceId.slice(0, 8)}…`);
  console.log(`  countries (${countries.length.toString().padStart(2)})  : ${countries.join(", ")}`);
  console.log(`  categories (${categories.length})  : ${categories.join(", ")}`);
  console.log(`  per country/cat: ${perCountryPerCategory}`);
  console.log(`  ─────`);
  console.log(`  total personas : ${totalPersonas.toLocaleString()}`);
  console.log(`  est. invocations: ${categories.length}`);
  console.log(`  est. cost      : $${(totalPersonas * 0.001).toFixed(2)} (rough Haiku)`);
  console.log(`  est. wall time : ${Math.round((totalPersonas / 12) * 3 / 60)}–${Math.round((totalPersonas / 12) * 5 / 60)} min`);
  console.log(``);

  // Snapshot current pool counts so we can show before/after diff.
  const before = await poolCounts(countries);
  console.log(`Pool counts BEFORE:`);
  for (const cc of countries) console.log(`  ${cc}: ${before[cc] ?? 0}`);
  console.log(``);

  const t0 = Date.now();
  const failures: Array<{ category: string; reason: string }> = [];
  for (let i = 0; i < categories.length; i++) {
    const cat = categories[i];
    const tag = `[${i + 1}/${categories.length}] ${cat}`;
    console.log(`\n${tag} → seeding ${countries.length} countries × ${perCountryPerCategory} personas …`);
    try {
      await runSeedOnce(workspaceId, cat, countries, perCountryPerCategory);
      console.log(`${tag} ✓ done`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`${tag} ✗ failed:`, msg);
      failures.push({ category: cat, reason: msg });
    }
  }

  const after = await poolCounts(countries);
  console.log(`\n══════════ DONE ══════════`);
  console.log(`Total wall time: ${((Date.now() - t0) / 60_000).toFixed(1)} min`);
  console.log(`\nPool counts AFTER (delta in parens):`);
  for (const cc of countries) {
    const b = before[cc] ?? 0;
    const a = after[cc] ?? 0;
    console.log(`  ${cc}: ${a.toString().padStart(5)}  (+${(a - b).toString().padStart(4)})`);
  }
  if (failures.length > 0) {
    console.log(`\n⚠ ${failures.length} category invocations failed:`);
    for (const f of failures) console.log(`  - ${f.category}: ${f.reason}`);
    process.exit(1);
  }
}

async function poolCounts(countries: string[]): Promise<Record<string, number>> {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    const r = await c.query<{ country: string; n: string }>(
      "select upper(country) as country, count(*)::text as n from public.personas where upper(country) = any($1) group by upper(country)",
      [countries],
    );
    const out: Record<string, number> = {};
    for (const row of r.rows) out[row.country] = Number(row.n);
    return out;
  } finally {
    await c.end();
  }
}

function runSeedOnce(
  workspaceId: string,
  category: string,
  countries: string[],
  perCountry: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    // Spawn the existing seed-pool.ts so we reuse all of its logic
    // (slot planning, locale-filter, profession-aware prompts) without
    // refactoring it into an importable function.
    const args = [
      "tsx",
      "--env-file=.env.local",
      "scripts/seed-pool.ts",
      workspaceId,
      category,
      countries.join(","),
      String(perCountry),
    ];
    const child = spawn("npx", args, { stdio: "inherit", shell: process.platform === "win32" });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`seed-pool exited with code ${code}`));
    });
    child.on("error", reject);
  });
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});

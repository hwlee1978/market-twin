/**
 * Auto-run sims for every ground truth fixture that doesn't yet have a
 * fresh ensemble, then score the whole dataset against truth.
 *
 * Flow per fixture:
 *   1. Ensure a `projects` row exists for the product (create from ground
 *      truth if missing). Description is generated from the schema fields
 *      *only* — no `evidence` or `knownFacts` leak through, so the sim
 *      cannot description-echo its way to the right answer (defect #6).
 *   2. Spawn `scripts/smoke-ensemble-e2e.ts` as a subprocess at the chosen
 *      tier. Subprocess inherits env from .env.local already.
 *   3. After all subprocesses complete, invoke `scripts/benchmark.ts
 *      --single` to score everything end-to-end.
 *
 * Usage:
 *   tsx --env-file=.env.local scripts/benchmark-run.ts [tier=decision] [slug ...]
 *
 *   tsx --env-file=.env.local scripts/benchmark-run.ts                      # all fixtures, decision tier
 *   tsx --env-file=.env.local scripts/benchmark-run.ts decision bibigo-mandu binggrae-melona
 *   tsx --env-file=.env.local scripts/benchmark-run.ts deep-3               # all fixtures, cheap multi-LLM
 *
 * Tier comparison vs existing baselines:
 *   Existing 10dbb41a/4fc8bfef/22357286/79934f1f are *deep* tier (25 sims,
 *   3 providers). Decision tier (5 sims, anthropic-only) and deep-3 tier
 *   (3 sims × 3 providers) produce per-product scores in the same shape
 *   but with different variance characteristics. Cross-tier paired t-tests
 *   are still meaningful; just don't expect identical absolute numbers.
 */

import { Client } from "pg";
import { spawn } from "node:child_process";
import { loadAllGroundTruth, type LoadedTruth } from "@/lib/validation/loader";

// Hard-coded to the workspace that owns the existing 4 baseline projects
// (이현우팀). Same workspace_id keeps everything in one place and lets
// reused benchmarks share the persona pool.
const TARGET_WORKSPACE = "0c8e774f-356a-4bf2-ba3d-8bfb41e6d019";

const KNOWN_TIERS = ["hypothesis", "decision", "decision_plus", "deep", "deep_pro", "deep-3"] as const;
type Tier = typeof KNOWN_TIERS[number];

/**
 * Generate a description from ground truth that the LLM can reason about
 * without short-circuiting via memorized market facts. Hard rule: no value
 * from `evidence` or `knownFacts` enters the description string.
 */
function safeDescriptionFrom(t: LoadedTruth): string {
  const { product, category, priceUsd, originCountry } = t.truth;
  return [
    `${product}.`,
    `${category} product originating from ${originCountry}, suggested retail price USD ${priceUsd.toFixed(2)}.`,
    `Looking to identify which export markets to prioritize.`,
  ].join(" ");
}

interface ProjectRow {
  id: string;
  product_name: string;
}

async function ensureProject(c: Client, ownerUserId: string, t: LoadedTruth): Promise<ProjectRow> {
  // Match by product_name. Existing rows for the 4 baseline products use
  // the verbatim name as in `t.truth.product`.
  const { rows: existing } = await c.query<ProjectRow>(
    `select id::text, product_name from public.projects
      where workspace_id = $1 and product_name = $2
      order by created_at desc limit 1`,
    [TARGET_WORKSPACE, t.truth.product],
  );
  if (existing.length) {
    return existing[0];
  }
  // Insert. Treat alcohol/appliances as their own categories so the LTV
  // multiplier dispatcher routes correctly; fall back to schema categories
  // the DB enum allows.
  const dbCategory = t.truth.category === "appliances"
    ? "electronics"
    : t.truth.category === "alcohol"
    ? "food"
    : t.truth.category;
  const description = safeDescriptionFrom(t);
  const basePriceCents = Math.round(t.truth.priceUsd * 100);
  const { rows: ins } = await c.query<ProjectRow>(
    `insert into public.projects (
        workspace_id, created_by, name, product_name, category, description,
        base_price_cents, currency, objective, originating_country, candidate_countries,
        status
     )
     values ($1, $2, $3, $4, $5, $6, $7, 'USD', 'launch_decision', $8, $9, 'draft')
     returning id::text, product_name`,
    [
      TARGET_WORKSPACE,
      ownerUserId,
      `Benchmark: ${t.truth.product}`,
      t.truth.product,
      dbCategory,
      description,
      basePriceCents,
      t.truth.originCountry,
      t.truth.candidateCountries,
    ],
  );
  return ins[0];
}

async function findOwner(c: Client): Promise<string> {
  const { rows } = await c.query<{ user_id: string }>(
    `select user_id::text from public.workspace_members
      where workspace_id = $1 and role = 'owner' limit 1`,
    [TARGET_WORKSPACE],
  );
  if (!rows.length) throw new Error(`Workspace ${TARGET_WORKSPACE} has no owner — cannot create projects.`);
  return rows[0].user_id;
}

function runSubprocess(cmd: string, args: string[]): Promise<{ code: number; stdout: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], shell: true });
    let out = "";
    child.stdout.on("data", (b: Buffer) => {
      const s = b.toString();
      out += s;
      process.stdout.write(s);
    });
    child.stderr.on("data", (b: Buffer) => {
      process.stderr.write(b.toString());
    });
    child.on("close", (code) => resolve({ code: code ?? 1, stdout: out }));
  });
}

function extractEnsembleId(stdout: string): string | null {
  // smoke-ensemble-e2e prints "Ensemble: <8-char-hex>" + later prints full UUID.
  // We capture the 8-char prefix because that's what benchmark.ts accepts.
  const m = stdout.match(/Ensemble:\s+([0-9a-f]{8})/i);
  return m ? m[1] : null;
}

async function main() {
  const args = process.argv.slice(2);
  let tier: Tier = "decision";
  const slugs: string[] = [];
  for (const a of args) {
    if ((KNOWN_TIERS as readonly string[]).includes(a)) tier = a as Tier;
    else slugs.push(a);
  }

  const truths = await loadAllGroundTruth();
  const target = slugs.length ? truths.filter((t) => slugs.includes(t.slug)) : truths;
  if (!target.length) {
    console.error("No matching fixtures.");
    process.exit(1);
  }

  console.log(`\n══ Benchmark run · tier=${tier} · ${target.length} fixtures`);
  for (const t of target) console.log(`   ${t.slug}  (${t.truth.product})`);

  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const ownerUserId = await findOwner(c);
  const planned: Array<{ slug: string; project: ProjectRow }> = [];
  for (const t of target) {
    const project = await ensureProject(c, ownerUserId, t);
    planned.push({ slug: t.slug, project });
    console.log(`   ✓ project ${project.id.slice(0, 8)}  ${t.slug}`);
  }
  await c.end();

  const ensembleSpecs: string[] = [];
  for (const { slug, project } of planned) {
    console.log(`\n${"=".repeat(72)}\nSimulating: ${slug}  (${project.id.slice(0, 8)})\n${"=".repeat(72)}`);
    const { code, stdout } = await runSubprocess(
      "npx",
      ["tsx", "--env-file=.env.local", "scripts/smoke-ensemble-e2e.ts", project.id.slice(0, 8), tier],
    );
    if (code !== 0) {
      console.error(`✗ ${slug} smoke ensemble failed (exit ${code}).`);
      continue;
    }
    const ensId = extractEnsembleId(stdout);
    if (!ensId) {
      console.warn(`⚠️  Could not extract ensemble id from output for ${slug}; benchmark step will fall back to product-name lookup.`);
    } else {
      ensembleSpecs.push(`${slug}=${ensId}`);
    }
  }

  // Final scoring step
  console.log(`\n${"=".repeat(72)}\nSCORING\n${"=".repeat(72)}`);
  if (ensembleSpecs.length === planned.length) {
    await runSubprocess(
      "npx",
      ["tsx", "--env-file=.env.local", "scripts/benchmark.ts", "--single", ...ensembleSpecs],
    );
  } else {
    // Fallback: auto-resolve latest ensembles by product name
    await runSubprocess(
      "npx",
      ["tsx", "--env-file=.env.local", "scripts/benchmark.ts", "--single"],
    );
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});

/**
 * Spawn ensembles for ground-truth fixtures (Haiku-only benchmark mode).
 *
 *   npx tsx --env-file=.env.local scripts/spawn-benchmark.ts [options]
 *
 * For each fixture under validation/ground-truth/, this script:
 *   1. Finds or creates a project row in DB (matched by product_name within workspace)
 *   2. Inserts an ensembles row (tier=decision, anthropic-only, status=running)
 *   3. Inserts N pending simulation rows (model_provider=anthropic)
 *   4. Calls runEnsembleOrchestration() inline — same path as the Vercel route,
 *      minus the HTTP shell
 *
 * Required env vars:
 *   DATABASE_URL                      Postgres connection
 *   SUPABASE_SERVICE_ROLE_KEY         (used by createServiceClient internally)
 *   NEXT_PUBLIC_SUPABASE_URL          (used by createServiceClient internally)
 *   ANTHROPIC_API_KEY                 sims call Claude
 *   TAVILY_API_KEY                    (optional) market grounding
 *
 * Recommended env override for Haiku-only benchmark (see [[benchmark_haiku_override]]):
 *   LLM_PROVIDER=anthropic            forces single-provider mode in this script
 *   LLM_PERSONAS_MODEL=claude-haiku-4-5-20251001
 *   LLM_SYNTHESIS_MODEL=claude-haiku-4-5-20251001
 *
 * CLI flags:
 *   --workspace-id <uuid>             REQUIRED — workspace to write projects into
 *   --tier hypothesis|decision         default: decision
 *   --fixtures slug1,slug2,...        run only these fixtures (default: all NEW
 *                                     fixtures not yet linked to a completed
 *                                     ensemble for the same workspace)
 *   --concurrency N                   default: 3 (parallel ensembles)
 *   --include-existing                also re-spawn fixtures that already have a
 *                                     completed ensemble — useful for re-baseline
 *   --dry-run                         print plan only, no DB writes
 */

import { Client } from "pg";
import { loadAllGroundTruth, type LoadedTruth } from "@/lib/validation/loader";
import {
  runEnsembleOrchestration,
  TIER_PRESETS,
  type ProviderName,
  type OrchestrationSimRow,
  type Tier,
} from "@/lib/simulation/orchestrator";
import { createServiceClient } from "@/lib/supabase/admin";
import type { ProjectInput } from "@/lib/simulation/schemas";

interface CliArgs {
  workspaceId: string;
  tier: Tier;
  fixturesFilter: string[] | null;
  concurrency: number;
  includeExisting: boolean;
  dryRun: boolean;
}

function parseArgs(): CliArgs {
  const out: CliArgs = {
    workspaceId: "",
    tier: "decision",
    fixturesFilter: null,
    concurrency: 3,
    includeExisting: false,
    dryRun: false,
  };
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--workspace-id") out.workspaceId = args[++i];
    else if (a === "--tier") out.tier = args[++i] as Tier;
    else if (a === "--fixtures") out.fixturesFilter = args[++i].split(",").map((s) => s.trim()).filter(Boolean);
    else if (a === "--concurrency") out.concurrency = Math.max(1, Number.parseInt(args[++i], 10));
    else if (a === "--include-existing") out.includeExisting = true;
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--help" || a === "-h") {
      console.log(`Usage: npx tsx --env-file=.env.local scripts/spawn-benchmark.ts \\
  --workspace-id <uuid> [--tier decision] [--fixtures slug1,slug2] \\
  [--concurrency 3] [--include-existing] [--dry-run]`);
      process.exit(0);
    }
  }
  if (!out.workspaceId) {
    console.error("ERROR: --workspace-id <uuid> is required.");
    process.exit(1);
  }
  if (!(out.tier in TIER_PRESETS)) {
    console.error(`ERROR: --tier must be one of ${Object.keys(TIER_PRESETS).join(", ")}`);
    process.exit(1);
  }
  return out;
}

/** Map fixture category enum → project.category free-string. */
function mapCategoryForProject(fixtureCategory: string): string {
  // Project.category is free-text — pass through fixture's enum value
  return fixtureCategory;
}

async function findExistingProject(
  pg: Client,
  workspaceId: string,
  productName: string,
): Promise<string | null> {
  const { rows } = await pg.query<{ id: string }>(
    `select id::text from public.projects
      where workspace_id = $1::uuid and product_name = $2
      order by created_at desc
      limit 1`,
    [workspaceId, productName],
  );
  return rows[0]?.id ?? null;
}

async function findExistingCompletedEnsemble(
  pg: Client,
  workspaceId: string,
  productName: string,
): Promise<string | null> {
  const { rows } = await pg.query<{ id: string }>(
    `select e.id::text
       from public.ensembles e
       join public.projects p on p.id = e.project_id
      where e.workspace_id = $1::uuid
        and p.product_name = $2
        and e.status = 'completed'
      order by e.completed_at desc
      limit 1`,
    [workspaceId, productName],
  );
  return rows[0]?.id ?? null;
}

async function createProject(
  pg: Client,
  workspaceId: string,
  fixture: LoadedTruth,
): Promise<string> {
  const projectName = `[Benchmark] ${fixture.slug}`;
  const { rows } = await pg.query<{ id: string }>(
    `insert into public.projects
        (workspace_id, name, product_name, category, description,
         base_price_cents, currency, objective, originating_country,
         candidate_countries, status)
      values ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'draft')
      returning id::text`,
    [
      workspaceId,
      projectName,
      fixture.truth.product,
      mapCategoryForProject(fixture.truth.category),
      `Ground-truth fixture: ${fixture.slug}. Source: validation/ground-truth/${fixture.slug}.json`,
      Math.round(fixture.truth.priceUsd * 100),
      "USD",
      "validate_market_entry",
      fixture.truth.originCountry,
      fixture.truth.candidateCountries,
    ],
  );
  return rows[0].id;
}

async function spawnEnsembleForFixture(
  pg: Client,
  workspaceId: string,
  tier: Tier,
  projectId: string,
  fixture: LoadedTruth,
): Promise<{ ensembleId: string; simRows: OrchestrationSimRow[] }> {
  const preset = TIER_PRESETS[tier];
  // Single-provider Anthropic mode when LLM_PROVIDER=anthropic is set —
  // matches [[benchmark_haiku_override]] scout strategy.
  const forceAnthropic = process.env.LLM_PROVIDER === "anthropic";
  const providers = forceAnthropic ? (["anthropic"] as const) : preset.llmProviders;

  // Insert ensemble row
  const { rows: ensRows } = await pg.query<{ id: string }>(
    `insert into public.ensembles
        (project_id, workspace_id, tier, parallel_sims, per_sim_personas,
         llm_providers, status)
      values ($1::uuid, $2::uuid, $3, $4, $5, $6, 'running')
      returning id::text`,
    [
      projectId,
      workspaceId,
      tier,
      preset.parallelSims,
      preset.perSimPersonas,
      Array.from(new Set(providers)),
    ],
  );
  const ensembleId = ensRows[0].id;

  // Insert N pending sim rows
  const simRows: OrchestrationSimRow[] = [];
  for (let i = 0; i < preset.parallelSims; i++) {
    const provider = providers[i % providers.length] as ProviderName;
    const { rows: simRowsResp } = await pg.query<{ id: string }>(
      `insert into public.simulations
          (project_id, workspace_id, status, persona_count, current_stage,
           ensemble_id, ensemble_index, model_provider)
        values ($1::uuid, $2::uuid, 'pending', $3, 'validating', $4::uuid, $5, $6)
        returning id::text`,
      [
        projectId,
        workspaceId,
        preset.perSimPersonas,
        ensembleId,
        i,
        provider,
      ],
    );
    simRows.push({ id: simRowsResp[0].id, index: i, provider });
  }

  return { ensembleId, simRows };
}

async function processFixture(
  pg: Client,
  fixture: LoadedTruth,
  args: CliArgs,
): Promise<{ slug: string; status: "spawned" | "skipped" | "failed"; ensembleId?: string; error?: string }> {
  const productName = fixture.truth.product;

  // Skip if already has a completed ensemble (unless --include-existing)
  if (!args.includeExisting) {
    const existing = await findExistingCompletedEnsemble(pg, args.workspaceId, productName);
    if (existing) {
      return { slug: fixture.slug, status: "skipped", ensembleId: existing };
    }
  }

  if (args.dryRun) {
    console.log(`  [DRY-RUN] would spawn ${args.tier} ensemble for: ${fixture.slug}`);
    return { slug: fixture.slug, status: "spawned" };
  }

  // Find or create project
  let projectId = await findExistingProject(pg, args.workspaceId, productName);
  if (!projectId) {
    projectId = await createProject(pg, args.workspaceId, fixture);
    console.log(`  📁 created project ${projectId.slice(0, 8)} for ${fixture.slug}`);
  } else {
    console.log(`  📁 reusing project ${projectId.slice(0, 8)} for ${fixture.slug}`);
  }

  // Spawn ensemble + sim rows
  const { ensembleId, simRows } = await spawnEnsembleForFixture(
    pg,
    args.workspaceId,
    args.tier,
    projectId,
    fixture,
  );
  console.log(`  🚀 ensemble ${ensembleId.slice(0, 8)} created with ${simRows.length} sim rows`);

  // Run orchestration inline (same code path as Vercel route)
  const projectInput: ProjectInput = {
    productName,
    category: mapCategoryForProject(fixture.truth.category),
    description: `Ground-truth fixture: ${fixture.slug}`,
    basePriceCents: Math.round(fixture.truth.priceUsd * 100),
    currency: "USD",
    objective: "validate_market_entry" as ProjectInput["objective"],
    originatingCountry: fixture.truth.originCountry,
    candidateCountries: fixture.truth.candidateCountries,
    competitorUrls: [],
    assetDescriptions: [],
    assetUrls: [],
  };

  try {
    await runEnsembleOrchestration({
      ensembleId,
      productName,
      workspaceId: args.workspaceId,
      projectId,
      projectInput,
      locale: "ko",
      tier: args.tier,
      notifyEmail: null,
      simRows,
    });
    return { slug: fixture.slug, status: "spawned", ensembleId };
  } catch (err) {
    return {
      slug: fixture.slug,
      status: "failed",
      ensembleId,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function runWithConcurrency<T, R>(
  items: T[],
  worker: (item: T, index: number) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function pump() {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => pump()));
  return results;
}

(async () => {
  const args = parseArgs();
  console.log("Spawn Benchmark — config:");
  console.log(`  workspace:   ${args.workspaceId}`);
  console.log(`  tier:        ${args.tier} (${TIER_PRESETS[args.tier].parallelSims} sims × ${TIER_PRESETS[args.tier].perSimPersonas} personas)`);
  console.log(`  fixtures:    ${args.fixturesFilter ? args.fixturesFilter.join(", ") : "all (new only)"}`);
  console.log(`  concurrency: ${args.concurrency}`);
  console.log(`  dry-run:     ${args.dryRun}`);
  console.log(`  LLM mode:    ${process.env.LLM_PROVIDER === "anthropic" ? "Anthropic-only (Haiku override eligible)" : "Multi-LLM per tier preset"}`);
  console.log(`  Personas:    ${process.env.LLM_PERSONAS_MODEL ?? "default"}`);
  console.log(`  Synthesis:   ${process.env.LLM_SYNTHESIS_MODEL ?? "default"}\n`);

  if (!process.env.DATABASE_URL) {
    console.error("ERROR: DATABASE_URL env var is required.");
    process.exit(1);
  }

  const all = await loadAllGroundTruth();
  let toSpawn = all;
  if (args.fixturesFilter) {
    const wanted = new Set(args.fixturesFilter);
    toSpawn = all.filter((t) => wanted.has(t.slug));
    const missing = [...wanted].filter((s) => !all.some((t) => t.slug === s));
    if (missing.length > 0) {
      console.warn(`⚠ unknown fixture slugs (ignored): ${missing.join(", ")}`);
    }
  }
  console.log(`Found ${all.length} total fixtures, processing ${toSpawn.length}.\n`);

  const pg = new Client({ connectionString: process.env.DATABASE_URL });
  await pg.connect();

  // Verify service-role client wiring before we burn LLM tokens
  if (!args.dryRun) {
    try {
      const admin = createServiceClient();
      const { error } = await admin.from("workspaces").select("id").eq("id", args.workspaceId).maybeSingle();
      if (error) {
        console.error(`ERROR: service-role check failed: ${error.message}`);
        process.exit(1);
      }
    } catch (err) {
      console.error(`ERROR: createServiceClient threw: ${(err as Error).message}`);
      console.error("  Likely missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env var.");
      process.exit(1);
    }
  }

  const tStart = Date.now();
  const results = await runWithConcurrency(
    toSpawn,
    async (fixture, idx) => {
      console.log(`\n[${idx + 1}/${toSpawn.length}] ${fixture.slug}`);
      try {
        return await processFixture(pg, fixture, args);
      } catch (err) {
        return {
          slug: fixture.slug,
          status: "failed" as const,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
    args.concurrency,
  );

  await pg.end();

  const wallMin = ((Date.now() - tStart) / 60000).toFixed(1);
  console.log(`\n${"=".repeat(72)}`);
  console.log(`Done in ${wallMin}min.`);
  const spawned = results.filter((r) => r.status === "spawned").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const failed = results.filter((r) => r.status === "failed").length;
  console.log(`  Spawned: ${spawned}`);
  console.log(`  Skipped (already had completed ensemble): ${skipped}`);
  console.log(`  Failed:  ${failed}`);
  if (failed > 0) {
    console.log(`\nFailures:`);
    for (const r of results) {
      if (r.status === "failed") {
        console.log(`  - ${r.slug}: ${r.error?.slice(0, 200) ?? "(no msg)"}`);
      }
    }
  }
  console.log(`\nNext: npm run benchmark -- --compare-latest --products ${results.filter((r) => r.status === "spawned").map((r) => r.slug).join(",")}`);
})();

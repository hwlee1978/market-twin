/**
 * E2E smoke for the ensemble pipeline. Picks an existing project, mimics
 * what the run-ensemble API does (insert ensemble + sim rows, run sims,
 * aggregate + persist), then prints the URL to view the result and
 * download the PDF in the dev server.
 *
 * Bypasses HTTP auth via service-role client; everything else hits the
 * same library code paths the production endpoint uses.
 *
 * Usage:
 *   npm run smoke:ensemble-e2e -- <project_id_prefix> [tier=hypothesis]
 *
 * Examples:
 *   npm run smoke:ensemble-e2e -- 8de9f248                  # hypothesis 1×200
 *   npm run smoke:ensemble-e2e -- 8de9f248 decision         # 5×200
 */
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { runSimulation } from "../src/lib/simulation/runner";
import {
  aggregateEnsemble,
  type EnsembleSimSnapshot,
} from "../src/lib/simulation/ensemble";
import type {
  CountryScore,
  ProjectInput,
} from "../src/lib/simulation/schemas";

const TIER_PRESETS = {
  hypothesis: { parallelSims: 1, perSimPersonas: 200, llmProviders: ["anthropic"] as const },
  decision: { parallelSims: 5, perSimPersonas: 200, llmProviders: ["anthropic"] as const },
  deep: {
    parallelSims: 25,
    perSimPersonas: 200,
    llmProviders: ["anthropic", "openai", "gemini"] as const,
  },
  // Cheap dev variant: 3 sims, one per provider — exercises the multi-LLM
  // round-robin without burning a 25-sim deep run. Reuses the "deep" tier
  // label because the ensembles_tier_check DB constraint only allows the
  // three production tier names. Not exposed in the UI.
  "deep-3": {
    parallelSims: 3,
    perSimPersonas: 200,
    llmProviders: ["anthropic", "openai", "gemini"] as const,
    storedTier: "deep" as const,
  },
} as const;
type Tier = keyof typeof TIER_PRESETS;
type ProviderName = "anthropic" | "openai" | "gemini";

function admin() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

async function main() {
  const args = process.argv.slice(2);
  const prefix = args[0];
  const tier = ((args[1] ?? "hypothesis") as Tier);
  if (!prefix) {
    console.error("Usage: smoke-ensemble-e2e -- <project_id_prefix> [tier]");
    process.exit(1);
  }
  if (!(tier in TIER_PRESETS)) {
    console.error(`Unknown tier: ${tier}`);
    process.exit(1);
  }
  const preset = TIER_PRESETS[tier];

  const sb = admin();
  // Lookup project by id prefix. Supabase JS doesn't support text-cast on
  // uuid columns, so we pull a small recent batch and filter client-side.
  const { data: candidates, error: lookupErr } = await sb
    .from("projects")
    .select(
      "id, workspace_id, product_name, category, description, base_price_cents, currency, objective, originating_country, candidate_countries, competitor_urls, asset_descriptions, asset_urls",
    )
    .order("created_at", { ascending: false })
    .limit(50);
  if (lookupErr) throw lookupErr;
  const matches = (candidates ?? []).filter((c) => (c.id as string).startsWith(prefix));
  if (matches.length === 0) {
    console.error(`No project matches prefix ${prefix}`);
    process.exit(1);
  }
  if (matches.length > 1) {
    console.error(`Ambiguous prefix — matched: ${matches.map((c) => (c.id as string).slice(0, 8)).join(", ")}`);
    process.exit(1);
  }
  const project = matches[0];

  // Service-role inserts need a non-null created_by; pick the workspace owner.
  const { data: owner } = await sb
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", project.workspace_id)
    .eq("role", "owner")
    .limit(1)
    .single();
  if (!owner) {
    console.error("Workspace has no owner — cannot attribute ensemble.");
    process.exit(1);
  }

  console.log(`\nProject: ${project.product_name} (${project.id.slice(0, 8)})`);
  console.log(`Tier: ${tier} · ${preset.parallelSims}×${preset.perSimPersonas}`);
  console.log(`Markets: ${(project.candidate_countries ?? []).join(", ")}`);

  // 1. Create ensemble row. For dev-only tier variants ("deep-3") use the
  //    storedTier override so we satisfy the DB tier check constraint while
  //    still surfacing the actual variant name to the user.
  const dbTier = (preset as { storedTier?: string }).storedTier ?? tier;
  const { data: ensemble, error: ensErr } = await sb
    .from("ensembles")
    .insert({
      project_id: project.id,
      workspace_id: project.workspace_id,
      created_by: owner.user_id,
      tier: dbTier,
      parallel_sims: preset.parallelSims,
      per_sim_personas: preset.perSimPersonas,
      llm_providers: preset.llmProviders,
      status: "running",
    })
    .select("id")
    .single();
  if (ensErr || !ensemble) throw ensErr ?? new Error("ensemble insert failed");
  const ensembleId = ensemble.id as string;
  console.log(`\nEnsemble: ${ensembleId.slice(0, 8)}`);

  // 2. Create N pending sim rows. Round-robin provider assignment for
  //    multi-LLM tiers so the smoke test exercises the same code path the
  //    deep tier uses in production.
  const simRows: Array<{ id: string; index: number; provider: ProviderName }> = [];
  for (let i = 0; i < preset.parallelSims; i++) {
    const provider = preset.llmProviders[i % preset.llmProviders.length] as ProviderName;
    const { data: sim, error: simErr } = await sb
      .from("simulations")
      .insert({
        project_id: project.id,
        workspace_id: project.workspace_id,
        status: "pending",
        persona_count: preset.perSimPersonas,
        current_stage: "validating",
        ensemble_id: ensembleId,
        ensemble_index: i,
        model_provider: provider,
      })
      .select("id")
      .single();
    if (simErr || !sim) throw simErr ?? new Error("sim insert failed");
    simRows.push({ id: sim.id as string, index: i, provider });
  }
  await sb.from("projects").update({ status: "running" }).eq("id", project.id);

  const projectInput: ProjectInput = {
    productName: project.product_name,
    category: project.category ?? "other",
    description: project.description ?? "",
    basePriceCents: project.base_price_cents ?? 0,
    currency: project.currency ?? "USD",
    objective: project.objective as ProjectInput["objective"],
    originatingCountry: project.originating_country ?? "KR",
    candidateCountries: project.candidate_countries ?? [],
    competitorUrls: project.competitor_urls ?? [],
    assetDescriptions: project.asset_descriptions ?? [],
    assetUrls: project.asset_urls ?? [],
  };

  // 3. Run sims in parallel.
  const t0 = Date.now();
  console.log(`\nRunning ${preset.parallelSims} sim(s) in parallel...`);
  await Promise.allSettled(
    simRows.map(async ({ id: simId, index, provider }) => {
      try {
        await runSimulation({
          simulationId: simId,
          projectInput,
          personaCount: preset.perSimPersonas,
          locale: "ko",
          seedOverride: `${ensembleId}-${index}`,
          provider,
        });
        console.log(`  ✓ sim ${index} (${simId.slice(0, 8)}) [${provider}] done`);
      } catch (err) {
        console.error(`  ✗ sim ${index} [${provider}] failed:`, err);
        await sb
          .from("simulations")
          .update({
            status: "failed",
            current_stage: "failed",
            error_message: err instanceof Error ? err.message : String(err),
          })
          .eq("id", simId);
      }
    }),
  );

  // 4. Aggregate + persist (mirrors aggregateAndPersist in route.ts).
  type EnsembleSimRow = {
    id: string;
    ensemble_index: number | null;
    best_country: string | null;
    status: string;
    model_provider: string | null;
    simulation_results:
      | { countries: unknown[]; personas: unknown[] }
      | { countries: unknown[]; personas: unknown[] }[]
      | null;
  };
  const { data: rawRows, error: rowsErr } = await sb
    .from("simulations")
    .select(
      `id, ensemble_index, best_country, status, model_provider,
       simulation_results ( countries, personas )`,
    )
    .eq("ensemble_id", ensembleId);
  if (rowsErr) throw rowsErr;
  const rows = (rawRows ?? []) as unknown as EnsembleSimRow[];
  const completed = rows.filter((r) => r.status === "completed");
  const snapshots: EnsembleSimSnapshot[] = completed.flatMap((r) => {
    const result = Array.isArray(r.simulation_results)
      ? r.simulation_results[0]
      : r.simulation_results;
    if (!result) return [];
    const personas = (result.personas ?? []) as Array<{ country?: string; purchaseIntent?: number }>;
    const intentByCountry: Record<string, { n: number; meanIntent: number }> = {};
    const sums: Record<string, { n: number; total: number }> = {};
    for (const p of personas) {
      const c = (p.country ?? "?").toUpperCase();
      if (!sums[c]) sums[c] = { n: 0, total: 0 };
      sums[c].n += 1;
      sums[c].total += typeof p.purchaseIntent === "number" ? p.purchaseIntent : 0;
    }
    for (const [c, v] of Object.entries(sums)) {
      intentByCountry[c] = { n: v.n, meanIntent: v.n > 0 ? v.total / v.n : 0 };
    }
    return [
      {
        simulationId: r.id,
        index: r.ensemble_index ?? 0,
        bestCountry: r.best_country ?? null,
        countries: (result.countries ?? []) as CountryScore[],
        personaIntentByCountry: intentByCountry,
        provider: r.model_provider ?? undefined,
      },
    ];
  });
  const aggregate = aggregateEnsemble(snapshots);
  const finalStatus = snapshots.length === 0 ? "failed" : "completed";
  await sb
    .from("ensembles")
    .update({
      status: finalStatus,
      aggregate_result: aggregate,
      completed_at: new Date().toISOString(),
      error_message: snapshots.length === 0 ? "no completed sims to aggregate" : null,
    })
    .eq("id", ensembleId);

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\nDone in ${elapsed}s · status=${finalStatus} · ${snapshots.length}/${preset.parallelSims} sims completed`);
  if (aggregate && snapshots.length > 0) {
    console.log(
      `Recommendation: ${aggregate.recommendation.country} · ${aggregate.recommendation.consensusPercent}% (${aggregate.recommendation.confidence})`,
    );
  }
  console.log(`\nView in browser:`);
  console.log(`  http://localhost:3000/ko/projects/${project.id}/results?ensemble=${ensembleId}`);
  console.log(`Download PDF directly:`);
  console.log(`  http://localhost:3000/api/ensembles/${ensembleId}/pdf?locale=ko`);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});

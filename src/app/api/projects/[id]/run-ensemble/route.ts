import { NextResponse, after } from "next/server";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { runSimulation } from "@/lib/simulation/runner";
import type { ProjectInput } from "@/lib/simulation/schemas";
import { aggregateEnsemble, type EnsembleSimSnapshot } from "@/lib/simulation/ensemble";
import type { CountryScore } from "@/lib/simulation/schemas";

// Each individual sim still fits in 800s (Vercel Pro + Fluid Compute);
// the ensemble route itself returns immediately and orchestrates via after().
export const maxDuration = 800;
export const dynamic = "force-dynamic";

/**
 * Tier presets — single source of truth for how each tier maps to
 * (parallel sims × per-sim personas). Keeps the wizard, billing logic,
 * and runner aligned without each computing the math separately.
 */
const TIER_PRESETS = {
  hypothesis: { parallelSims: 1, perSimPersonas: 200, llmProviders: ["anthropic"] },
  decision: { parallelSims: 5, perSimPersonas: 200, llmProviders: ["anthropic"] },
  deep: { parallelSims: 25, perSimPersonas: 200, llmProviders: ["anthropic"] },
} as const;
type Tier = keyof typeof TIER_PRESETS;

const RunSchema = z.object({
  tier: z.enum(["hypothesis", "decision", "deep"]).default("decision"),
  notifyEmail: z.string().email().optional(),
  locale: z.enum(["ko", "en"]).default("ko"),
});

/**
 * POST /api/projects/:id/run-ensemble
 *
 * Spawns N parallel simulations of the same project, each drawing a
 * different persona sample, then aggregates them into a confidence-
 * graded recommendation when all complete. Returns ensembleId immediately
 * so the client can poll status.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await ctx.params;
  const wsCtx = await getOrCreatePrimaryWorkspace();
  if (!wsCtx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (wsCtx.status !== "active") {
    return NextResponse.json({ error: `workspace_${wsCtx.status}` }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = RunSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { tier, notifyEmail, locale } = parsed.data;
  const preset = TIER_PRESETS[tier as Tier];

  // Workspace ownership check on the project.
  const supabase = await createClient();
  const { data: project, error: projectErr } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .eq("workspace_id", wsCtx.workspaceId)
    .single();
  if (projectErr || !project) {
    return NextResponse.json({ error: "project not found" }, { status: 404 });
  }

  const admin = createServiceClient();

  // 1. Create the ensemble row up front so the client gets a stable ID
  //    to poll against, even before any individual sim has been queued.
  const { data: ensemble, error: ensErr } = await admin
    .from("ensembles")
    .insert({
      project_id: project.id,
      workspace_id: project.workspace_id,
      created_by: wsCtx.userId,
      tier,
      parallel_sims: preset.parallelSims,
      per_sim_personas: preset.perSimPersonas,
      llm_providers: preset.llmProviders,
      status: "running",
      notify_email: notifyEmail ?? null,
    })
    .select("id")
    .single();
  if (ensErr || !ensemble) {
    return NextResponse.json(
      { error: ensErr?.message ?? "failed to create ensemble" },
      { status: 500 },
    );
  }

  // 2. Create N pending sim rows linked to the ensemble. Insertion order
  //    determines ensemble_index, which feeds the seed override so each sim
  //    draws a different persona sample.
  const simRows: Array<{ id: string; index: number }> = [];
  for (let i = 0; i < preset.parallelSims; i++) {
    const { data: sim, error: simErr } = await admin
      .from("simulations")
      .insert({
        project_id: project.id,
        workspace_id: project.workspace_id,
        status: "pending",
        persona_count: preset.perSimPersonas,
        current_stage: "validating",
        ensemble_id: ensemble.id,
        ensemble_index: i,
      })
      .select("id")
      .single();
    if (simErr || !sim) {
      // Mark ensemble failed; partial cleanup of already-created sims is
      // best-effort (cascade on ensemble delete cleans them up if needed).
      await admin
        .from("ensembles")
        .update({
          status: "failed",
          error_message: simErr?.message ?? "failed to create sim row",
        })
        .eq("id", ensemble.id);
      return NextResponse.json(
        { error: simErr?.message ?? "failed to create simulation" },
        { status: 500 },
      );
    }
    simRows.push({ id: sim.id, index: i });
  }

  await admin.from("projects").update({ status: "running" }).eq("id", project.id);

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

  // 3. Schedule all N sims in parallel via after(). Each runs independently;
  //    the LAST one to complete triggers aggregation. Vercel keeps the
  //    function alive (up to maxDuration) for after() continuations, so
  //    this is the correct lifecycle — fire-and-await would block the HTTP
  //    response until all sims finish.
  after(async () => {
    const ensembleId = ensemble.id;
    await Promise.allSettled(
      simRows.map(async ({ id: simId, index }) => {
        try {
          await runSimulation({
            simulationId: simId,
            projectInput,
            personaCount: preset.perSimPersonas,
            locale,
            seedOverride: `${ensembleId}-${index}`,
          });
        } catch (err) {
          console.error(`[ensemble ${ensembleId}] sim ${simId} failed:`, err);
          await admin
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

    // 4. All sims settled — aggregate and persist.
    try {
      await aggregateAndPersist(ensembleId);
    } catch (err) {
      console.error(`[ensemble ${ensembleId}] aggregation failed:`, err);
      await admin
        .from("ensembles")
        .update({
          status: "failed",
          error_message: err instanceof Error ? err.message : String(err),
          completed_at: new Date().toISOString(),
        })
        .eq("id", ensembleId);
    }
  });

  return NextResponse.json({
    ensembleId: ensemble.id,
    simulationIds: simRows.map((r) => r.id),
    tier,
    parallelSims: preset.parallelSims,
    perSimPersonas: preset.perSimPersonas,
  });
}

/**
 * Pulls the persisted simulation_results for every sim in the ensemble,
 * runs the aggregator, and stores the result on the ensemble row. Called
 * once after all sims have settled (success or failure).
 */
async function aggregateAndPersist(ensembleId: string) {
  const admin = createServiceClient();

  type EnsembleSimRow = {
    id: string;
    ensemble_index: number | null;
    best_country: string | null;
    status: string;
    simulation_results:
      | { countries: unknown[]; personas: unknown[] }
      | { countries: unknown[]; personas: unknown[] }[]
      | null;
  };
  const { data: rawRows, error } = await admin
    .from("simulations")
    .select(
      `id, ensemble_index, best_country, status,
       simulation_results ( countries, personas )`,
    )
    .eq("ensemble_id", ensembleId);
  if (error || !rawRows) {
    throw new Error(`Failed to load ensemble sims: ${error?.message}`);
  }
  const rows = rawRows as unknown as EnsembleSimRow[];

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
      },
    ];
  });

  const aggregate = aggregateEnsemble(snapshots);
  const finalStatus = snapshots.length === 0 ? "failed" : "completed";

  await admin
    .from("ensembles")
    .update({
      status: finalStatus,
      aggregate_result: aggregate,
      completed_at: new Date().toISOString(),
      error_message:
        snapshots.length === 0
          ? "no completed sims to aggregate"
          : null,
    })
    .eq("id", ensembleId);
}

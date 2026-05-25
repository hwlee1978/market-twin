import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { mergeNarrative } from "@/lib/simulation/ensemble-narrative";
import { withLLMContext } from "@/lib/llm-context";
import type {
  EnsembleAggregate,
  EnsembleSimSnapshot,
} from "@/lib/simulation/ensemble";
import type { CountryScore } from "@/lib/simulation/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/ensembles/:id/regenerate-narrative
 *
 * Re-runs the mergeNarrative LLM step on the ensemble's persisted
 * per-sim snapshots and overwrites aggregate.narrative. No sims are
 * re-executed — same cost as a single narrative-merge call (~$0.10).
 *
 * Why this exists: when the narrative prompt is upgraded (e.g. Top-2
 * tie awareness landed 2026-05-25), already-completed ensembles still
 * carry the older "전 시뮬이 X 지목 (합의도 96%)" prose that contradicts
 * the new Top-2 framing every UI surface shows. This endpoint lets
 * the user regenerate the prose against the current prompt without
 * paying for a full re-aggregation.
 */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  const wsCtx = await getOrCreatePrimaryWorkspace();
  if (!wsCtx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = await createClient();
  const { data: ensemble, error } = await supabase
    .from("ensembles")
    .select("id, project_id, status, aggregate_result, workspace_id")
    .eq("id", id)
    .eq("workspace_id", wsCtx.workspaceId)
    .single();
  if (error || !ensemble) {
    return NextResponse.json({ error: "ensemble not found" }, { status: 404 });
  }
  if (ensemble.status !== "completed" || !ensemble.aggregate_result) {
    return NextResponse.json(
      { error: "ensemble not ready", status: ensemble.status },
      { status: 409 },
    );
  }

  const aggregate = ensemble.aggregate_result as EnsembleAggregate;

  // Project context — productName + locale heuristic
  const { data: project } = await supabase
    .from("projects")
    .select("product_name, candidate_countries")
    .eq("id", ensemble.project_id)
    .single();
  if (!project?.product_name) {
    return NextResponse.json({ error: "project not found" }, { status: 404 });
  }

  // Reload per-sim snapshots from the simulations + simulation_results
  // tables — mergeNarrative reads s.overview / risks / recommendations
  // / personas count / bestCountry / provider per sim. We rebuild a
  // minimal EnsembleSimSnapshot[] (skipping the per-persona compaction
  // the orchestrator does for full aggregation — mergeNarrative only
  // needs the count, not per-persona detail).
  const admin = createServiceClient();
  type SimRow = {
    id: string;
    ensemble_index: number | null;
    best_country: string | null;
    status: string;
    model_provider: string | null;
    synthesis_provider: string | null;
    simulation_results: Array<{
      countries?: unknown;
      personas?: unknown;
      overview?: unknown;
      risks?: unknown;
      recommendations?: unknown;
    }> | null;
  };
  const { data: rawRows, error: simErr } = await admin
    .from("simulations")
    .select(
      `id, ensemble_index, best_country, status, model_provider, synthesis_provider,
       simulation_results ( countries, personas, overview, risks, recommendations )`,
    )
    .eq("ensemble_id", id);
  if (simErr || !rawRows) {
    return NextResponse.json(
      { error: `failed to load sims: ${simErr?.message}` },
      { status: 500 },
    );
  }
  const rows = rawRows as unknown as SimRow[];
  const completed = rows.filter((r) => r.status === "completed");
  const snapshots: EnsembleSimSnapshot[] = completed.flatMap((r) => {
    const result = Array.isArray(r.simulation_results)
      ? r.simulation_results[0]
      : r.simulation_results;
    if (!result) return [];
    const personas = (result.personas ?? []) as Array<{
      country?: string;
      purchaseIntent?: number;
    }>;
    return [
      {
        simulationId: r.id,
        index: r.ensemble_index ?? 0,
        bestCountry: r.best_country ?? null,
        countries: (result.countries ?? []) as CountryScore[],
        // mergeNarrative reads personas.length only — empty array w/
        // the same length as the source is sufficient. Skip the
        // expensive per-persona shape coercion the orchestrator does.
        personas: personas.map(() => ({
          country: "?",
          purchaseIntent: 0,
        })) as EnsembleSimSnapshot["personas"],
        personaIntentByCountry: {},
        provider: r.model_provider ?? undefined,
        synthesisProvider:
          r.synthesis_provider ?? r.model_provider ?? undefined,
        overview: result.overview as EnsembleSimSnapshot["overview"],
        risks: result.risks as EnsembleSimSnapshot["risks"],
        recommendations:
          result.recommendations as EnsembleSimSnapshot["recommendations"],
      },
    ];
  });

  if (snapshots.length === 0) {
    return NextResponse.json(
      { error: "no completed sims to merge" },
      { status: 422 },
    );
  }

  // Top-2 detection — mirrors the orchestrator's logic. Without
  // this, the regenerated narrative would still ignore the Top-2
  // framing this very endpoint exists to fix.
  const recExt = aggregate.recommendation as unknown as {
    displayMode?: string;
    secondary?: { country?: string; gapToPrimary?: number };
  };
  const top2Info =
    recExt.displayMode === "top2" && recExt.secondary?.country
      ? (() => {
          const primary = aggregate.recommendation.country;
          const secondary = recExt.secondary!.country!;
          const primaryVotePct =
            aggregate.bestCountryDistribution?.find((b) => b.country === primary)
              ?.percent ?? 0;
          const secondaryVotePct =
            aggregate.bestCountryDistribution?.find((b) => b.country === secondary)
              ?.percent ?? 0;
          return {
            primary,
            secondary,
            primaryVotePct,
            secondaryVotePct,
            gapToPrimary: recExt.secondary!.gapToPrimary ?? 0,
          };
        })()
      : undefined;

  // Locale heuristic from the existing narrative — preserves user's
  // original language without forcing them to choose.
  const sampleText =
    (aggregate.narrative?.executiveSummary ?? "") +
    (aggregate.recommendation?.country ?? "");
  const locale: "ko" | "en" = /[ㄱ-힝]/.test(sampleText) ? "ko" : "en";

  let narrative;
  try {
    narrative = await withLLMContext(
      {
        workspaceId: wsCtx.workspaceId,
        stageLabel: "regenerate-narrative",
        ensembleId: id,
      },
      () =>
        mergeNarrative({
          snapshots,
          productName: project.product_name,
          bestCountry: aggregate.recommendation.country,
          consensusPercent: aggregate.recommendation.consensusPercent,
          locale,
          crossCountryDistribution: aggregate.crossCountryDistribution,
          candidateCountries: project.candidate_countries ?? undefined,
          top2: top2Info,
        }),
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "narrative merge failed" },
      { status: 502 },
    );
  }
  if (!narrative) {
    return NextResponse.json(
      { error: "narrative merge returned empty" },
      { status: 502 },
    );
  }

  const updatedAggregate = { ...aggregate, narrative };
  const { error: updateErr } = await admin
    .from("ensembles")
    .update({ aggregate_result: updatedAggregate })
    .eq("id", id);
  if (updateErr) {
    return NextResponse.json(
      { error: `failed to persist: ${updateErr.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    top2Applied: !!top2Info,
    executiveSummary: narrative.executiveSummary,
    risksCount: narrative.mergedRisks.length,
    actionsCount: narrative.mergedActions.length,
  });
}

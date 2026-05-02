import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

/**
 * GET /api/ensembles/:id/result
 *
 * Returns the persisted aggregate_result blob (bestCountry distribution,
 * per-segment recs, country stats, variance assessment). Returns 409 if
 * the ensemble is still running — caller should poll status until status
 * == "completed" before requesting the result.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const wsCtx = await getOrCreatePrimaryWorkspace();
  if (!wsCtx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = await createClient();
  const { data: ensemble, error } = await supabase
    .from("ensembles")
    .select(
      "id, project_id, status, tier, parallel_sims, per_sim_personas, llm_providers, aggregate_result, created_at, completed_at, error_message",
    )
    .eq("id", id)
    .eq("workspace_id", wsCtx.workspaceId)
    .single();
  if (error || !ensemble) {
    return NextResponse.json({ error: "ensemble not found" }, { status: 404 });
  }

  if (ensemble.status !== "completed" && ensemble.status !== "failed") {
    return NextResponse.json(
      { error: "ensemble not ready", status: ensemble.status },
      { status: 409 },
    );
  }
  if (!ensemble.aggregate_result) {
    return NextResponse.json(
      { error: "aggregate not computed", status: ensemble.status },
      { status: 409 },
    );
  }

  return NextResponse.json({
    id: ensemble.id,
    project_id: ensemble.project_id,
    status: ensemble.status,
    tier: ensemble.tier,
    parallel_sims: ensemble.parallel_sims,
    per_sim_personas: ensemble.per_sim_personas,
    llm_providers: ensemble.llm_providers,
    created_at: ensemble.created_at,
    completed_at: ensemble.completed_at,
    aggregate: ensemble.aggregate_result,
  });
}

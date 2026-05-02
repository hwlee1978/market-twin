import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

/**
 * GET /api/ensembles/:id/status
 *
 * Lightweight progress poll — returns the ensemble's overall status and
 * a per-sim breakdown so the UI can render a multi-bar progress display
 * (5 bars for decision tier, 25 for deep, etc.). Does NOT include the
 * aggregate result — that's a separate endpoint to keep this poll cheap.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const wsCtx = await getOrCreatePrimaryWorkspace();
  if (!wsCtx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = await createClient();
  const { data: ensemble, error: ensErr } = await supabase
    .from("ensembles")
    .select("id, status, tier, parallel_sims, per_sim_personas, created_at, completed_at, error_message")
    .eq("id", id)
    .eq("workspace_id", wsCtx.workspaceId)
    .single();
  if (ensErr || !ensemble) {
    return NextResponse.json({ error: "ensemble not found" }, { status: 404 });
  }

  const { data: sims } = await supabase
    .from("simulations")
    .select("id, status, current_stage, ensemble_index, started_at, completed_at")
    .eq("ensemble_id", id)
    .order("ensemble_index", { ascending: true });

  const simsList = sims ?? [];
  const counts = {
    total: simsList.length,
    completed: simsList.filter((s) => s.status === "completed").length,
    running: simsList.filter((s) => s.status === "running").length,
    pending: simsList.filter((s) => s.status === "pending").length,
    failed: simsList.filter((s) => s.status === "failed").length,
    cancelled: simsList.filter((s) => s.status === "cancelled").length,
  };

  return NextResponse.json({
    id: ensemble.id,
    status: ensemble.status,
    tier: ensemble.tier,
    parallel_sims: ensemble.parallel_sims,
    per_sim_personas: ensemble.per_sim_personas,
    counts,
    sims: simsList,
    error_message: ensemble.error_message,
    created_at: ensemble.created_at,
    completed_at: ensemble.completed_at,
  });
}

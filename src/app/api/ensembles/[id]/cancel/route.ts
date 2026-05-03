import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

/**
 * POST /api/ensembles/:id/cancel — user-facing cancel for an in-flight
 * ensemble run.
 *
 * Marks the ensemble row + every still-active child sim as cancelled.
 * Single-sim runner already polls its own row's status at each stage
 * boundary and aborts on 'cancelled', so flipping the child rows here
 * is enough to short-circuit the parallel loop. Already-completed sims
 * are left alone — the user might still want their partial results.
 */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const wsCtx = await getOrCreatePrimaryWorkspace();
  if (!wsCtx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;

  // Workspace ownership via RLS-bound client.
  const supabase = await createClient();
  const { data: ensemble, error: lookupErr } = await supabase
    .from("ensembles")
    .select("id, status")
    .eq("id", id)
    .eq("workspace_id", wsCtx.workspaceId)
    .single();
  if (lookupErr || !ensemble) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // No-op for terminal states. Still 200 so the client doesn't surface
  // an error when the user races the natural completion.
  if (ensemble.status !== "pending" && ensemble.status !== "running") {
    return NextResponse.json({ ok: true, alreadyTerminal: ensemble.status });
  }

  // Service role for the writes — we already proved workspace ownership above.
  const admin = createServiceClient();
  const { error: ensUpdateErr } = await admin
    .from("ensembles")
    .update({
      status: "cancelled",
      error_message: "Cancelled by user",
      completed_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (ensUpdateErr) {
    return NextResponse.json({ error: ensUpdateErr.message }, { status: 500 });
  }

  // Cancel every still-active child sim. Completed/failed/cancelled rows
  // are left alone so the user retains any partial output.
  const { error: simUpdateErr, count } = await admin
    .from("simulations")
    .update({ status: "cancelled", current_stage: "cancelled" }, { count: "exact" })
    .eq("ensemble_id", id)
    .in("status", ["pending", "running"]);
  if (simUpdateErr) {
    return NextResponse.json({ error: simUpdateErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, simsCancelled: count ?? 0 });
}

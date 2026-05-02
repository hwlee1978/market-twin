import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

/**
 * POST /api/simulations/:id/cancel — user-facing cancel.
 *
 * Marks an in-flight simulation as cancelled IF it belongs to the caller's
 * workspace and is still pending/running. Cancellation is best-effort: the
 * runner checks status at each stage boundary and aborts early, but an
 * already-fired LLM call will complete naturally — we just stop firing the
 * next one and skip persisting the result. The runner's final completion
 * update is gated on `status != 'cancelled'` so cancellation persists.
 */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const wsCtx = await getOrCreatePrimaryWorkspace();
  if (!wsCtx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;

  // Authorisation: scope to caller's workspace using their RLS-bound client.
  // If the row doesn't exist for this workspace, .single() fails and we 404.
  const supabase = await createClient();
  const { data: sim, error: lookupErr } = await supabase
    .from("simulations")
    .select("id, status")
    .eq("id", id)
    .eq("workspace_id", wsCtx.workspaceId)
    .single();
  if (lookupErr || !sim) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Only cancel if still in-flight. Already-completed/failed/cancelled rows
  // are no-ops — return 200 with the existing status so the client can
  // refresh its view without an error toast.
  if (sim.status !== "pending" && sim.status !== "running") {
    return NextResponse.json({ ok: true, alreadyTerminal: sim.status });
  }

  // Use service role for the update so RLS doesn't get in the way of writing
  // to a row the user already proved they own via the read above.
  const admin = createServiceClient();
  const { error: updateErr } = await admin
    .from("simulations")
    .update({ status: "cancelled", current_stage: "cancelled" })
    .eq("id", id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

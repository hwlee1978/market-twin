import { NextResponse, after } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { ADMIN_PERMISSIONS, getAdminContext, recordAuditLog } from "@/lib/admin";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/simulations/:id/cancel
 * Marks a simulation as cancelled. Used to clear stuck "running" rows that the
 * runner couldn't update (typically when a serverless function got terminated
 * mid-flight on Vercel).
 */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const adminCtx = await getAdminContext();
  if (!adminCtx) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!ADMIN_PERMISSIONS.cancelSimulation(adminCtx.role)) {
    return NextResponse.json({ error: "insufficient_role" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const admin = createServiceClient();

  const { data: sim, error } = await admin
    .from("simulations")
    .update({ status: "cancelled", current_stage: "cancelled" })
    .eq("id", id)
    .select("id, workspace_id, project_id")
    .single();

  if (error || !sim) {
    return NextResponse.json({ error: error?.message ?? "not found" }, { status: 404 });
  }

  after(async () => {
    await recordAuditLog({
      actorId: adminCtx.userId,
      workspaceId: sim.workspace_id,
      action: "simulation.cancel",
      resourceType: "simulation",
      resourceId: sim.id,
    });
  });

  return NextResponse.json({ ok: true });
}

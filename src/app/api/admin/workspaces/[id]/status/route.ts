import { NextResponse, after } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { ADMIN_PERMISSIONS, getAdminContext, recordAuditLog } from "@/lib/admin";

export const dynamic = "force-dynamic";

const Body = z.object({
  status: z.enum(["active", "suspended", "archived"]),
  reason: z.string().optional(),
});

/**
 * PATCH /api/admin/workspaces/:id/status
 * Updates workspace lifecycle status. Audit-logged with optional reason.
 */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const adminCtx = await getAdminContext();
  if (!adminCtx) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!ADMIN_PERMISSIONS.suspendWorkspace(adminCtx.role)) {
    return NextResponse.json({ error: "insufficient_role" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await ctx.params;
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("workspaces")
    .update({ status: parsed.data.status })
    .eq("id", id)
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "not found" }, { status: 404 });
  }

  after(async () => {
    await recordAuditLog({
      actorId: adminCtx.userId,
      workspaceId: id,
      action: `workspace.${parsed.data.status}`,
      resourceType: "workspace",
      resourceId: id,
      metadata: parsed.data.reason ? { reason: parsed.data.reason } : undefined,
    });
  });

  return NextResponse.json({ ok: true });
}

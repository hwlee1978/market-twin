import { NextResponse, after } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { getAdminContext, recordAuditLog } from "@/lib/admin";

export const dynamic = "force-dynamic";

const Body = z.object({
  status: z.enum(["new", "reviewed", "archived"]),
});

/**
 * PATCH /api/admin/beta-feedback/:id/status
 * Triage state for a public beta-feedback row. Any admin may triage (low
 * sensitivity); audit-logged. Service role bypasses the table's RLS lock.
 */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const adminCtx = await getAdminContext();
  if (!adminCtx) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await ctx.params;
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("beta_public_feedback")
    .update({ status: parsed.data.status })
    .eq("id", id)
    .select("id")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "not found" },
      { status: 404 },
    );
  }

  after(async () => {
    await recordAuditLog({
      actorId: adminCtx.userId,
      action: `beta_feedback.${parsed.data.status}`,
      resourceType: "beta_feedback",
      resourceId: id,
    });
  });

  return NextResponse.json({ ok: true });
}

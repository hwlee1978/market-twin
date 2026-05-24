import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getMyRoleInWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

const Body = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  companyName: z.string().trim().max(120).nullable().optional(),
  industry: z.string().trim().max(80).nullable().optional(),
  country: z.string().trim().max(40).nullable().optional(),
  emailNotifications: z.boolean().optional(),
});

/**
 * PATCH /api/workspaces/:id
 *
 * Updates editable workspace fields. v0.2: a user may own multiple
 * workspaces, so we check membership in this specific workspace rather
 * than equality with their "primary" one.
 */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const role = await getMyRoleInWorkspace(id);
  if (!role) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (role !== "owner" && role !== "admin") {
    return NextResponse.json({ error: "insufficient_role" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) update.name = parsed.data.name;
  if (parsed.data.companyName !== undefined) update.company_name = parsed.data.companyName;
  if (parsed.data.industry !== undefined) update.industry = parsed.data.industry;
  if (parsed.data.country !== undefined) update.country = parsed.data.country;
  if (parsed.data.emailNotifications !== undefined)
    update.email_notifications = parsed.data.emailNotifications;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: true });
  }

  // Use admin client so RLS doesn't trip on workspaces (which has no UPDATE
  // policy in v0.1 — only the API path goes through, and we already checked
  // membership above via getOrCreatePrimaryWorkspace).
  const admin = createServiceClient();
  const { error } = await admin.from("workspaces").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Verify with the user-scoped client to confirm RLS read permission still
  // works for the caller (catches policy regressions early).
  const supabase = await createClient();
  const { data: ws } = await supabase
    .from("workspaces")
    .select("id, name, company_name, industry, country, email_notifications")
    .eq("id", id)
    .single();

  return NextResponse.json({ ok: true, workspace: ws });
}

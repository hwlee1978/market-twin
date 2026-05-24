import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const PatchBody = z.object({
  selected: z.boolean().optional(),
});

/**
 * PATCH /api/mrai/channel-recommendations/:id — toggle `selected` so
 * the user can activate a channel for future content drafts.
 */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const wsCtx = await getOrCreatePrimaryWorkspace();
  if (!wsCtx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const raw = await req.json().catch(() => ({}));
  const parsed = PatchBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const admin = createServiceClient();
  const patch: Record<string, unknown> = {};
  if (parsed.data.selected !== undefined) patch.selected = parsed.data.selected;

  const { data, error } = await admin
    .from("mrai_channel_recommendations")
    .update(patch)
    .eq("id", id)
    .eq("workspace_id", wsCtx.workspaceId)
    .select("id, selected")
    .single();
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "not_found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, recommendation: data });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const wsCtx = await getOrCreatePrimaryWorkspace();
  if (!wsCtx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const admin = createServiceClient();
  const { error } = await admin
    .from("mrai_channel_recommendations")
    .delete()
    .eq("id", id)
    .eq("workspace_id", wsCtx.workspaceId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

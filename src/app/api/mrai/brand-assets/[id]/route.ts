import { NextResponse } from "next/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const wsCtx = await getOrCreatePrimaryWorkspace();
  if (!wsCtx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("mrai_brand_assets")
    .select("storage_path")
    .eq("id", id)
    .eq("workspace_id", wsCtx.workspaceId)
    .maybeSingle<{ storage_path: string }>();
  if (!row) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const svc = createServiceClient();
  // Delete row first, then the blob (so a dangling blob is recoverable
  // but a stale row pointing nowhere is impossible).
  const { error: delErr } = await svc
    .from("mrai_brand_assets")
    .delete()
    .eq("id", id)
    .eq("workspace_id", wsCtx.workspaceId);
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }
  await svc.storage.from("mrai-content").remove([row.storage_path]);
  return NextResponse.json({ ok: true });
}

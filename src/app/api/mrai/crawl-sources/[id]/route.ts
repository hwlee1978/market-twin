import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const UpdateSchema = z.object({
  enabled: z.boolean().optional(),
  url: z.string().url().max(1000).optional(),
  label: z.string().trim().max(120).nullable().optional(),
  brand_filter: z.string().trim().max(120).nullable().optional(),
  fetch_interval_hours: z.number().int().min(1).max(720).optional(),
});

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const wsCtx = await getOrCreatePrimaryWorkspace();
  if (!wsCtx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  // If URL changed, clear the cached snapshot so the next fetch treats
  // it as fresh (otherwise the diff would compare old URL's text to
  // new URL's text and produce garbage memories).
  const patch: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.url) {
    patch.last_snapshot = null;
    patch.last_snapshot_hash = null;
    patch.last_error = null;
    patch.fail_count = 0;
  }
  const { data, error } = await supabase
    .from("mrai_crawl_sources")
    .update(patch)
    .eq("id", id)
    .eq("workspace_id", wsCtx.workspaceId)
    .select("*")
    .single();
  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "update_failed" },
      { status: 500 },
    );
  }
  return NextResponse.json({ source: data });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const wsCtx = await getOrCreatePrimaryWorkspace();
  if (!wsCtx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const svc = createServiceClient();
  const { error } = await svc
    .from("mrai_crawl_sources")
    .delete()
    .eq("id", id)
    .eq("workspace_id", wsCtx.workspaceId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

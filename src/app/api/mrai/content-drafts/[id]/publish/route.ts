import { NextResponse } from "next/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/mrai/content-drafts/[id]/publish
 *
 * Converts a draft → live publication on its marketing channel. All
 * metrics start at 0; growth happens on the daily cron tick (02:00 KST)
 * or via manual /api/mrai/publications/[id]/tick.
 *
 * Idempotent — re-publishing the same draft creates a NEW publication
 * row (so the user can republish strategically). Use DELETE on the
 * publication to "unpublish".
 */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const wsCtx = await getOrCreatePrimaryWorkspace();
  if (!wsCtx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = await createClient();
  const { data: draft, error: dErr } = await supabase
    .from("mrai_content_drafts")
    .select("id, marketing_channel_id")
    .eq("id", id)
    .eq("workspace_id", wsCtx.workspaceId)
    .single<{ id: string; marketing_channel_id: string | null }>();
  if (dErr || !draft) {
    return NextResponse.json({ error: "draft_not_found" }, { status: 404 });
  }
  if (!draft.marketing_channel_id) {
    return NextResponse.json({ error: "draft_has_no_channel" }, { status: 400 });
  }

  const svc = createServiceClient();
  const publishedAt = new Date().toISOString();

  const { data: pub, error: pubErr } = await svc
    .from("mrai_content_publications")
    .insert({
      workspace_id: wsCtx.workspaceId,
      content_draft_id: id,
      marketing_channel_id: draft.marketing_channel_id,
      published_at: publishedAt,
      metrics_history: [],
      total_views: 0,
      total_likes: 0,
      total_comments: 0,
      total_shares: 0,
      total_saves: 0,
      total_impressions: 0,
      status: "published",
    })
    .select("*")
    .single();
  if (pubErr || !pub) {
    return NextResponse.json(
      { error: pubErr?.message ?? "publish_failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({ publication: pub });
}

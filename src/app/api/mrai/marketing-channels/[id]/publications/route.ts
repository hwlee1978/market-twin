import { NextResponse } from "next/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/mrai/marketing-channels/[id]/publications
 *
 * Lists virtual-publish events for this channel. Empty until Sprint 2
 * (content-drafter) starts publishing drafts into the space.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const wsCtx = await getOrCreatePrimaryWorkspace();
  if (!wsCtx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = await createClient();
  // Verify the channel belongs to this workspace before reading
  // publications (RLS would also enforce, but this gives a 404 vs 200 [] split).
  const { data: channel } = await supabase
    .from("mrai_marketing_channels")
    .select("id")
    .eq("id", id)
    .eq("workspace_id", wsCtx.workspaceId)
    .maybeSingle();
  if (!channel) {
    return NextResponse.json({ error: "channel_not_found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("mrai_content_publications")
    .select(
      `id, published_at, total_likes, total_clicks, total_shares,
       total_comments, total_impressions, status,
       draft:mrai_content_drafts!content_draft_id(body_text, hashtags, cta_text, image_url)`,
    )
    .eq("marketing_channel_id", id)
    .eq("workspace_id", wsCtx.workspaceId)
    .order("published_at", { ascending: false })
    .limit(20);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ publications: data ?? [] });
}

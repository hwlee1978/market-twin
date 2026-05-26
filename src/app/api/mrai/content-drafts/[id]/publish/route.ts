import { NextResponse } from "next/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { computeTickDelta } from "@/lib/mrai/content/engagement-engine";

export const dynamic = "force-dynamic";

/**
 * POST /api/mrai/content-drafts/[id]/publish
 *
 * Converts a draft → live publication on its marketing channel. Runs
 * Day-0 engagement tick immediately so the user sees initial numbers
 * (views/likes/comments/shares/followers) the moment they hit publish.
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
    .select("id, marketing_channel_id, body_text")
    .eq("id", id)
    .eq("workspace_id", wsCtx.workspaceId)
    .single<{ id: string; marketing_channel_id: string | null; body_text: string }>();
  if (dErr || !draft) {
    return NextResponse.json({ error: "draft_not_found" }, { status: 404 });
  }
  if (!draft.marketing_channel_id) {
    return NextResponse.json({ error: "draft_has_no_channel" }, { status: 400 });
  }

  // Latest simulation for this draft drives engagement rates. If absent,
  // we publish with placeholder zero rates — the user can run a sim
  // afterward and the next cron tick will use it.
  const { data: sim } = await supabase
    .from("mrai_content_simulations")
    .select("like_rate, click_rate, share_rate, save_rate, comment_rate")
    .eq("content_draft_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Channel's market → audience count for reach calculation
  const { data: channel } = await supabase
    .from("mrai_marketing_channels")
    .select("id, market_country, follower_count")
    .eq("id", draft.marketing_channel_id)
    .single<{ id: string; market_country: string | null; follower_count: number }>();
  if (!channel) {
    return NextResponse.json({ error: "channel_not_found" }, { status: 404 });
  }

  let audienceTotal = 1000;
  if (channel.market_country) {
    const { count } = await supabase
      .from("personas")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", wsCtx.workspaceId)
      .eq("country", channel.market_country);
    audienceTotal = Math.max(count ?? 0, 100) * 5; // 5× spillover beyond persona pool
  }

  // Day-0 tick — apply the first ~35% of total reach right away
  const day0 = computeTickDelta({
    audienceTotal,
    likeRate: sim?.like_rate ?? 0,
    clickRate: sim?.click_rate ?? 0,
    shareRate: sim?.share_rate ?? 0,
    saveRate: sim?.save_rate ?? 0,
    commentRate: sim?.comment_rate ?? 0,
    daysSincePublish: 0,
    prevCumulativePct: 0,
  });

  const svc = createServiceClient();
  const publishedAt = new Date().toISOString();

  const { data: pub, error: pubErr } = await svc
    .from("mrai_content_publications")
    .insert({
      workspace_id: wsCtx.workspaceId,
      content_draft_id: id,
      marketing_channel_id: draft.marketing_channel_id,
      published_at: publishedAt,
      metrics_history: [day0],
      total_views: day0.new_views,
      total_likes: day0.new_likes,
      total_comments: day0.new_comments,
      total_shares: day0.new_shares,
      total_saves: day0.new_saves,
      total_impressions: day0.new_views,
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

  // Bump channel follower_count + append to follower_history
  const newFollowerTotal = channel.follower_count + day0.new_follows;
  await svc
    .from("mrai_marketing_channels")
    .update({
      follower_count: newFollowerTotal,
      // We append via RPC-style — but since this is a small jsonb we just
      // read + write. Concurrent ticks per channel are rare.
      follower_history: await appendFollowerSnapshot(
        svc,
        channel.id,
        newFollowerTotal,
        day0.new_follows,
      ),
    })
    .eq("id", channel.id);

  return NextResponse.json({
    publication: pub,
    day0,
    follower_count: newFollowerTotal,
  });
}

type ServiceClient = ReturnType<typeof createServiceClient>;

async function appendFollowerSnapshot(
  svc: ServiceClient,
  channelId: string,
  count: number,
  delta: number,
): Promise<Array<{ ts: string; count: number; delta: number }>> {
  const { data } = await svc
    .from("mrai_marketing_channels")
    .select("follower_history")
    .eq("id", channelId)
    .single();
  const row = data as { follower_history?: Array<{ ts: string; count: number; delta: number }> } | null;
  const prev = Array.isArray(row?.follower_history) ? row.follower_history : [];
  // Keep last 90 days
  return [...prev, { ts: new Date().toISOString(), count, delta }].slice(-90);
}

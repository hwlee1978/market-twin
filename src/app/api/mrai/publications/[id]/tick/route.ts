import { NextResponse } from "next/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  computeTickDelta,
  daysSince,
  type TickDelta,
} from "@/lib/mrai/content/engagement-engine";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/mrai/publications/[id]/tick
 *
 * Manually run a single engagement tick for one publication. Used by
 * the "🔄 시뮬 진행" button on the published post detail modal so the
 * user can advance growth without waiting for the daily cron.
 */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const wsCtx = await getOrCreatePrimaryWorkspace();
  if (!wsCtx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = await createClient();
  const { data: pubRow } = await supabase
    .from("mrai_content_publications")
    .select(
      "id, content_draft_id, marketing_channel_id, published_at, metrics_history, total_views, total_likes, total_comments, total_shares, total_saves",
    )
    .eq("id", id)
    .eq("workspace_id", wsCtx.workspaceId)
    .single();
  if (!pubRow) {
    return NextResponse.json({ error: "publication_not_found" }, { status: 404 });
  }
  const pub = pubRow as {
    id: string;
    content_draft_id: string;
    marketing_channel_id: string;
    published_at: string;
    metrics_history: TickDelta[];
    total_views: number;
    total_likes: number;
    total_comments: number;
    total_shares: number;
    total_saves: number;
  };

  const history = (pub.metrics_history ?? []) as TickDelta[];
  const last = history[history.length - 1];
  const lastDay = last?.day_n ?? -1;
  // Always advance by exactly one day (real-world feels weird otherwise
  // — clicking the button should always show some growth).
  const targetDay = lastDay + 1;

  const svc = createServiceClient();
  const { data: sim } = await svc
    .from("mrai_content_simulations")
    .select("like_rate, click_rate, share_rate, save_rate, comment_rate")
    .eq("content_draft_id", pub.content_draft_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const simRow = sim as {
    like_rate?: number;
    click_rate?: number;
    share_rate?: number;
    save_rate?: number;
    comment_rate?: number;
  } | null;

  const { data: channelRaw } = await svc
    .from("mrai_marketing_channels")
    .select("id, market_country, follower_count, follower_history")
    .eq("id", pub.marketing_channel_id)
    .single();
  const channel = channelRaw as {
    id: string;
    market_country: string | null;
    follower_count: number;
    follower_history: Array<{ ts: string; count: number; delta: number }>;
  } | null;
  if (!channel) {
    return NextResponse.json({ error: "channel_not_found" }, { status: 404 });
  }

  // Persona pool is global (shared across workspaces v0.1) — read the
  // total country pool and use it as the ceiling for follower growth.
  let personaPoolCap = 200;
  if (channel.market_country) {
    const { count } = await svc
      .from("personas")
      .select("id", { count: "exact", head: true })
      .eq("country", channel.market_country);
    personaPoolCap = Math.max(count ?? 0, 50);
  }

  const delta = computeTickDelta({
    followerCount: channel.follower_count ?? 0,
    personaPoolCap,
    likeRate: simRow?.like_rate ?? 0,
    clickRate: simRow?.click_rate ?? 0,
    shareRate: simRow?.share_rate ?? 0,
    saveRate: simRow?.save_rate ?? 0,
    commentRate: simRow?.comment_rate ?? 0,
    daysSincePublish: targetDay,
    prevCumulativePct: last?.cumulative_pct ?? 0,
  });

  await svc
    .from("mrai_content_publications")
    .update({
      metrics_history: [...history, delta].slice(-90),
      total_views: (pub.total_views ?? 0) + delta.new_views,
      total_likes: (pub.total_likes ?? 0) + delta.new_likes,
      total_comments: (pub.total_comments ?? 0) + delta.new_comments,
      total_shares: (pub.total_shares ?? 0) + delta.new_shares,
      total_saves: (pub.total_saves ?? 0) + delta.new_saves,
      total_impressions: (pub.total_views ?? 0) + delta.new_views,
    })
    .eq("id", pub.id);

  const newFollowerTotal = channel.follower_count + delta.new_follows;
  const prevHist = Array.isArray(channel.follower_history) ? channel.follower_history : [];
  await svc
    .from("mrai_marketing_channels")
    .update({
      follower_count: newFollowerTotal,
      follower_history: [
        ...prevHist,
        { ts: delta.ts, count: newFollowerTotal, delta: delta.new_follows },
      ].slice(-90),
    })
    .eq("id", channel.id);

  return NextResponse.json({
    delta,
    follower_count: newFollowerTotal,
    days_since_publish: daysSince(pub.published_at),
  });
}

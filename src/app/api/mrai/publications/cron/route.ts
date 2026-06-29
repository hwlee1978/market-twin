import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { computeTickDelta, daysSince, type TickDelta } from "@/lib/mrai/content/engagement-engine";
import { MRAI_CRON_ENABLED } from "@/lib/mrai/config/enabled";
import { assertCronAuth } from "@/lib/auth/cron-gate";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/mrai/publications/cron
 *
 * Daily engagement tick — runs the engagement-engine for every active
 * publication. Each tick:
 *   1. Compute days_since_publish
 *   2. Compute delta using engagement-engine (decay curve + jitter)
 *   3. Append delta to metrics_history
 *   4. Increment cumulative totals
 *   5. Apply new_follows to the channel's follower_count + history
 *
 * Stops ticking publications older than 30 days (engagement decays to
 * near-zero by then). Scheduled at 02:00 KST (= 17:00 UTC) via vercel.json.
 */
export async function GET(req: Request) {
  const gate = assertCronAuth(req);
  if (gate) return gate;

  // Skip if this deployment doesn't own Mr.AI (avoids the double-fire
  // between market-twin prod and market-twin-mrai beta).
  if (!MRAI_CRON_ENABLED) {
    return NextResponse.json({ skipped: "mrai_not_enabled_on_this_deployment" });
  }

  const svc = createServiceClient();
  // All published, < 30 days old
  const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data: pubs, error } = await svc
    .from("mrai_content_publications")
    .select(
      "id, workspace_id, content_draft_id, marketing_channel_id, published_at, metrics_history, total_views, total_likes, total_comments, total_shares, total_saves",
    )
    .eq("status", "published")
    .gte("published_at", cutoff);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results: Array<{ publication_id: string; status: string; new?: TickDelta; error?: string }> = [];

  for (const pub of pubs ?? []) {
    try {
      const history = (pub.metrics_history ?? []) as TickDelta[];
      const last = history[history.length - 1];
      const targetDay = daysSince(pub.published_at);
      const lastDay = last?.day_n ?? -1;
      if (targetDay <= lastDay) {
        results.push({ publication_id: pub.id, status: "skipped_already_ticked" });
        continue;
      }

      // Pull latest sim rates
      const { data: sim } = await svc
        .from("mrai_content_simulations")
        .select("like_rate, click_rate, share_rate, save_rate, comment_rate")
        .eq("content_draft_id", pub.content_draft_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      // Channel + audience
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
        results.push({ publication_id: pub.id, status: "channel_missing" });
        continue;
      }

      // Persona pool is global as of v0.1 — count by country only.
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
        likeRate: sim?.like_rate ?? 0,
        clickRate: sim?.click_rate ?? 0,
        shareRate: sim?.share_rate ?? 0,
        saveRate: sim?.save_rate ?? 0,
        commentRate: sim?.comment_rate ?? 0,
        daysSincePublish: targetDay,
        prevCumulativePct: last?.cumulative_pct ?? 0,
      });

      // Append + bump
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

      // Channel follower roll-up
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

      results.push({ publication_id: pub.id, status: "ticked", new: delta });
    } catch (e) {
      results.push({
        publication_id: pub.id,
        status: "failed",
        error: e instanceof Error ? e.message : "internal_error",
      });
    }
  }

  return NextResponse.json({
    swept: pubs?.length ?? 0,
    ok: results.filter((r) => r.status === "ticked").length,
    skipped: results.filter((r) => r.status.startsWith("skipped")).length,
    failed: results.filter((r) => r.status === "failed").length,
    results,
  });
}

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

/**
 * GET /api/mrai/seo/google/details
 *
 * Detailed breakdown for the SEOPerformancePanel expanded view:
 *   - top_queries: GSC queries sorted by clicks desc, 28d
 *   - top_pages:   GSC pages sorted by clicks desc, 28d
 *   - traffic_sources: GA4 source/medium sorted by sessions desc, 28d
 *   - daily_series: per-day rollup for sparkline (gsc clicks + ga4 sessions)
 */
export async function GET() {
  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const svc = createServiceClient();
  const end = new Date();
  const start = new Date(end.getTime() - 28 * 86_400_000);
  const startDate = start.toISOString().slice(0, 10);

  const [gscRows, ga4Rows] = await Promise.all([
    svc
      .from("mrai_gsc_daily")
      .select("date, query, page, clicks, impressions, ctr, avg_position")
      .eq("workspace_id", ctx.workspaceId)
      .gte("date", startDate),
    svc
      .from("mrai_ga4_daily")
      .select("date, source, medium, sessions, conversions")
      .eq("workspace_id", ctx.workspaceId)
      .gte("date", startDate),
  ]);

  const gsc = (gscRows.data ?? []) as Array<{
    date: string;
    query: string;
    page: string;
    clicks: number;
    impressions: number;
    ctr: number;
    avg_position: number;
  }>;
  const ga4 = (ga4Rows.data ?? []) as Array<{
    date: string;
    source: string;
    medium: string;
    sessions: number;
    conversions: number;
  }>;

  // Aggregate per query
  const queryAgg = new Map<string, { clicks: number; impressions: number; position_sum: number; n: number }>();
  for (const r of gsc) {
    if (!r.query) continue;
    const cur = queryAgg.get(r.query) ?? { clicks: 0, impressions: 0, position_sum: 0, n: 0 };
    cur.clicks += r.clicks;
    cur.impressions += r.impressions;
    cur.position_sum += r.avg_position * r.impressions;
    cur.n += r.impressions;
    queryAgg.set(r.query, cur);
  }
  const top_queries = Array.from(queryAgg.entries())
    .map(([query, v]) => ({
      query,
      clicks: v.clicks,
      impressions: v.impressions,
      ctr: v.impressions > 0 ? v.clicks / v.impressions : 0,
      avg_position: v.n > 0 ? v.position_sum / v.n : 0,
    }))
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 20);

  // Aggregate per page
  const pageAgg = new Map<string, { clicks: number; impressions: number }>();
  for (const r of gsc) {
    if (!r.page) continue;
    const cur = pageAgg.get(r.page) ?? { clicks: 0, impressions: 0 };
    cur.clicks += r.clicks;
    cur.impressions += r.impressions;
    pageAgg.set(r.page, cur);
  }
  const top_pages = Array.from(pageAgg.entries())
    .map(([page, v]) => ({ page, clicks: v.clicks, impressions: v.impressions }))
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 20);

  // Aggregate per source/medium
  const srcAgg = new Map<string, { sessions: number; conversions: number }>();
  for (const r of ga4) {
    const key = `${r.source} / ${r.medium}`;
    const cur = srcAgg.get(key) ?? { sessions: 0, conversions: 0 };
    cur.sessions += r.sessions;
    cur.conversions += r.conversions;
    srcAgg.set(key, cur);
  }
  const traffic_sources = Array.from(srcAgg.entries())
    .map(([key, v]) => {
      const [source, medium] = key.split(" / ");
      return { source, medium, sessions: v.sessions, conversions: v.conversions };
    })
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 15);

  // Daily series for sparkline
  const dailyAgg = new Map<string, { clicks: number; impressions: number; sessions: number }>();
  for (const r of gsc) {
    const cur = dailyAgg.get(r.date) ?? { clicks: 0, impressions: 0, sessions: 0 };
    cur.clicks += r.clicks;
    cur.impressions += r.impressions;
    dailyAgg.set(r.date, cur);
  }
  for (const r of ga4) {
    const cur = dailyAgg.get(r.date) ?? { clicks: 0, impressions: 0, sessions: 0 };
    cur.sessions += r.sessions;
    dailyAgg.set(r.date, cur);
  }
  const daily_series = Array.from(dailyAgg.entries())
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return NextResponse.json({
    top_queries,
    top_pages,
    traffic_sources,
    daily_series,
  });
}

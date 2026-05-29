import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { disconnectGoogle } from "@/lib/mrai/seo/google-oauth";

export const dynamic = "force-dynamic";

/**
 * GET  /api/mrai/seo/google/status  — connection state + recent rollup
 * DELETE  same path                — disconnect (deletes refresh token)
 *
 * The status endpoint feeds the SEOPerformancePanel: connection state,
 * last sync timestamps, last error if any, plus a small 28-day rollup
 * (clicks/impressions/sessions/conversions) for the panel's headline
 * numbers. Detailed per-query / per-source breakdown is fetched lazily
 * by separate endpoints.
 */
export async function GET() {
  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const svc = createServiceClient();
  const { data: oauth } = await svc
    .from("mrai_google_oauth")
    .select("google_email, connected_at, last_gsc_sync, last_ga4_sync, last_error, last_error_at, scopes")
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();

  if (!oauth) {
    return NextResponse.json({ connected: false });
  }

  const end = new Date();
  const start = new Date(end.getTime() - 28 * 86_400_000);
  const startDate = start.toISOString().slice(0, 10);

  const [gscAgg, ga4Agg, gscPrev, ga4Prev] = await Promise.all([
    svc
      .from("mrai_gsc_daily")
      .select("clicks, impressions")
      .eq("workspace_id", ctx.workspaceId)
      .gte("date", startDate),
    svc
      .from("mrai_ga4_daily")
      .select("sessions, conversions")
      .eq("workspace_id", ctx.workspaceId)
      .gte("date", startDate),
    // Previous 28-day window for trend %
    svc
      .from("mrai_gsc_daily")
      .select("clicks, impressions")
      .eq("workspace_id", ctx.workspaceId)
      .gte("date", new Date(start.getTime() - 28 * 86_400_000).toISOString().slice(0, 10))
      .lt("date", startDate),
    svc
      .from("mrai_ga4_daily")
      .select("sessions, conversions")
      .eq("workspace_id", ctx.workspaceId)
      .gte("date", new Date(start.getTime() - 28 * 86_400_000).toISOString().slice(0, 10))
      .lt("date", startDate),
  ]);

  const sum = <T extends Record<string, number>>(rows: T[] | null, key: keyof T) =>
    (rows ?? []).reduce((s, r) => s + Number(r[key] ?? 0), 0);

  return NextResponse.json({
    connected: true,
    email: oauth.google_email,
    connected_at: oauth.connected_at,
    last_gsc_sync: oauth.last_gsc_sync,
    last_ga4_sync: oauth.last_ga4_sync,
    last_error: oauth.last_error,
    last_error_at: oauth.last_error_at,
    scopes: oauth.scopes,
    rollup_28d: {
      gsc_clicks: sum(gscAgg.data as Array<{ clicks: number }> | null, "clicks"),
      gsc_impressions: sum(
        gscAgg.data as Array<{ impressions: number }> | null,
        "impressions",
      ),
      ga4_sessions: sum(ga4Agg.data as Array<{ sessions: number }> | null, "sessions"),
      ga4_conversions: sum(
        ga4Agg.data as Array<{ conversions: number }> | null,
        "conversions",
      ),
    },
    rollup_prev_28d: {
      gsc_clicks: sum(gscPrev.data as Array<{ clicks: number }> | null, "clicks"),
      gsc_impressions: sum(
        gscPrev.data as Array<{ impressions: number }> | null,
        "impressions",
      ),
      ga4_sessions: sum(ga4Prev.data as Array<{ sessions: number }> | null, "sessions"),
      ga4_conversions: sum(
        ga4Prev.data as Array<{ conversions: number }> | null,
        "conversions",
      ),
    },
  });
}

export async function DELETE() {
  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await disconnectGoogle(ctx.workspaceId);
  return NextResponse.json({ ok: true });
}

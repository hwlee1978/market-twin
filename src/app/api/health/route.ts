import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/health
 *
 * Public uptime-probe endpoint. No auth — meant for external uptime
 * monitors (UptimeRobot free plan, BetterUptime, etc.) that ping every
 * 5 min and alert on downtime. Intentionally minimal: returns only
 * { status, db } so a probe can never scrape internal counts.
 *
 * Heavier internal health (sims running / zombie counters / past_due
 * subscriptions) lives at /api/admin/health behind CRON_SECRET — keep
 * the two endpoints separate so this one can stay public-safe.
 *
 * DB check is a cheap `select 1` against a tiny table. We pick
 * `workspaces` because it always has at least the test row and the
 * read is RLS-free via service client. If the query throws or takes
 * more than ~2s, we return 503 so the monitor flags downtime.
 */
export async function GET() {
  const startedAt = Date.now();
  try {
    const admin = createServiceClient();
    // Race the query against a 2s wall clock so a stuck DB doesn't
    // hold the request open. UptimeRobot defaults to 30s timeout but
    // a fast-fail is friendlier to the monitor's alert latency.
    const dbPromise = admin
      .from("workspaces")
      .select("id", { count: "exact", head: true })
      .limit(1);
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("db_timeout")), 2000),
    );
    await Promise.race([dbPromise, timeout]);

    return NextResponse.json(
      { status: "ok", db: "ok", latencyMs: Date.now() - startedAt },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
  } catch (err) {
    const reason = err instanceof Error ? err.message : "unknown";
    return NextResponse.json(
      { status: "degraded", db: "error", reason, latencyMs: Date.now() - startedAt },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}

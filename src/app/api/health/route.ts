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
 * read is RLS-free via service client. If the query throws or exceeds
 * the budget below, we return 503 so the monitor flags downtime.
 *
 * The budget was 2s, which turned out to be a false-positive generator:
 * a cold function's TLS handshake plus a PostgREST round-trip can pass
 * two seconds while the database is perfectly healthy — see the note in
 * lib/monitoring/system-health.ts, where the same 2s race fired twice at
 * the top of the busiest cron hour. 5s still fails well inside
 * UptimeRobot's 30s timeout.
 */
const DB_BUDGET_MS = 5000;

export async function GET() {
  const startedAt = Date.now();
  try {
    const admin = createServiceClient();
    // abortSignal rather than Promise.race: race abandons the losing
    // query without cancelling it, leaving a connection held open on
    // every probe.
    const { error } = await admin
      .from("workspaces")
      .select("id", { count: "exact", head: true })
      .limit(1)
      .abortSignal(AbortSignal.timeout(DB_BUDGET_MS));
    if (error) throw new Error(error.message);

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

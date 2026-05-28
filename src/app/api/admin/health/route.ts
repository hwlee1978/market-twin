import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { assertCronAuth } from "@/lib/auth/cron-gate";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/health
 *
 * Lightweight system-health endpoint for ops monitoring. Returns
 * counts that signal trouble before users notice:
 *   - simsRunning: total in-flight; high + flat across pings = stuck
 *   - simsZombie: started >20min ago but still running; cron should
 *     keep this at 0
 *   - failedPaymentsLast24h: card declines + Toss renewal failures
 *   - subscriptionsPastDue: workspaces in past_due status, expanding
 *     window
 *
 * Auth: CRON_SECRET header — same as the cron jobs. Lets external
 * uptime monitors (UptimeRobot, BetterUptime, etc.) hit this with
 * a stable token without exposing internal counts to anonymous users.
 *
 * Response shape is stable so a log-aggregator can alert on numeric
 * thresholds:
 *   { status, simsRunning, simsZombie, failedPaymentsLast24h,
 *     subscriptionsPastDue, dbReachable }
 */
export async function GET(req: Request) {
  const gate = assertCronAuth(req);
  if (gate) return gate;

  const admin = createServiceClient();
  const now = new Date();
  const TWENTY_MIN_AGO = new Date(now.getTime() - 20 * 60 * 1000).toISOString();
  const ONE_DAY_AGO = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  type CountResult = { count: number | null; error: { message: string } | null };
  const [running, zombie, failedPayments, pastDue]: CountResult[] = await Promise.all([
    countQuery(admin, "simulations", (q) => q.eq("status", "running")),
    countQuery(admin, "simulations", (q) =>
      q.eq("status", "running").lt("started_at", TWENTY_MIN_AGO),
    ),
    countQuery(admin, "subscription_events", (q) =>
      q.eq("event", "payment_failed").gte("created_at", ONE_DAY_AGO),
    ),
    countQuery(admin, "subscriptions", (q) => q.eq("status", "past_due")),
  ]);

  const dbReachable =
    !running.error && !zombie.error && !failedPayments.error && !pastDue.error;

  // Status: ok / degraded / down
  let status: "ok" | "degraded" | "down" = "ok";
  if (!dbReachable) status = "down";
  else if ((zombie.count ?? 0) > 5 || (failedPayments.count ?? 0) > 10) status = "degraded";

  return NextResponse.json({
    status,
    timestamp: now.toISOString(),
    dbReachable,
    simsRunning: running.count ?? 0,
    simsZombie: zombie.count ?? 0,
    failedPaymentsLast24h: failedPayments.count ?? 0,
    subscriptionsPastDue: pastDue.count ?? 0,
  });
}

type Admin = ReturnType<typeof createServiceClient>;
type FilterFn<T> = (
  q: ReturnType<Admin["from"]>,
) => T;

async function countQuery(
  admin: Admin,
  table: string,
  filter: FilterFn<ReturnType<Admin["from"]>>,
): Promise<{ count: number | null; error: { message: string } | null }> {
  try {
    const builder = admin.from(table).select("id", { count: "exact", head: true });
    const filtered = filter(builder as unknown as ReturnType<Admin["from"]>) as unknown as {
      then: (
        resolve: (v: { count: number | null; error: { message: string } | null }) => void,
      ) => void;
    };
    return await new Promise((resolve) => {
      filtered.then(resolve);
    });
  } catch (err) {
    return { count: null, error: { message: err instanceof Error ? err.message : String(err) } };
  }
}

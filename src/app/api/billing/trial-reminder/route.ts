import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import {
  notifyTrialEndingSoon,
  notifyTrialEnded,
  defaultUpgradeUrl,
} from "@/lib/email/billing-notify";
import { assertCronAuth } from "@/lib/auth/cron-gate";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * GET /api/billing/trial-reminder
 *
 * Daily cron sweep that fires two reminder emails:
 *   1. D-1 reminder — trial_ends_at is between (now+23h, now+25h)
 *   2. Just-ended notice — trial_ends_at is between (now-25h, now-1h)
 *      and the workspace is still on free_trial (didn't upgrade)
 *
 * Idempotency: each row gets a `metadata->trial_reminder_sent` flag in
 * subscription_events. The cron skips rows that already have it. Cron
 * runs daily, but if it runs twice in 24h (e.g. backfill), we still
 * send each notice exactly once.
 *
 * Authenticated via CRON_SECRET so accidental browser hits don't fire
 * a wave of emails.
 */
export async function GET(req: Request) {
  const gate = assertCronAuth(req);
  if (gate) return gate;

  const admin = createServiceClient();
  const now = Date.now();
  const HOUR_MS = 60 * 60 * 1000;

  // Window 1: trial ending in ~24h. We pick (now+23h, now+25h) so a
  // daily cron always covers a 24h slice without missing or doubling
  // (provided the cron lands within ±1h of the same wall-clock time).
  const endingFrom = new Date(now + 23 * HOUR_MS).toISOString();
  const endingTo = new Date(now + 25 * HOUR_MS).toISOString();

  // Window 2: trial just ended (within the last 24h). We pick rows
  // still on free_trial — if the user upgraded, plan != free_trial
  // and the post-upgrade state already triggered payment_succeeded.
  const endedFrom = new Date(now - 25 * HOUR_MS).toISOString();
  const endedTo = new Date(now - HOUR_MS).toISOString();

  const [endingRes, endedRes] = await Promise.all([
    admin
      .from("subscriptions")
      .select("workspace_id, trial_ends_at")
      .eq("plan", "free_trial")
      .eq("status", "trialing")
      .gte("trial_ends_at", endingFrom)
      .lt("trial_ends_at", endingTo),
    admin
      .from("subscriptions")
      .select("workspace_id, trial_ends_at")
      .eq("plan", "free_trial")
      .eq("status", "trialing")
      .gte("trial_ends_at", endedFrom)
      .lt("trial_ends_at", endedTo),
  ]);

  let endingSent = 0;
  let endedSent = 0;

  for (const row of endingRes.data ?? []) {
    if (await alreadySent(admin, row.workspace_id, "trial_ending_reminder")) continue;
    void notifyTrialEndingSoon({
      workspaceId: row.workspace_id,
      daysLeft: 1,
      upgradeUrl: defaultUpgradeUrl("ko"), // locale resolved per-recipient inside the helper
    });
    await admin.from("subscription_events").insert({
      workspace_id: row.workspace_id,
      event: "trial_ending_reminder",
      metadata: { trial_ends_at: row.trial_ends_at, days_left: 1 },
    });
    endingSent++;
  }

  for (const row of endedRes.data ?? []) {
    if (await alreadySent(admin, row.workspace_id, "trial_ended_reminder")) continue;
    void notifyTrialEnded({
      workspaceId: row.workspace_id,
      upgradeUrl: defaultUpgradeUrl("ko"),
    });
    await admin
      .from("subscriptions")
      .update({ status: "canceled", trial_sims_limit: 0 })
      .eq("workspace_id", row.workspace_id);
    await admin.from("subscription_events").insert({
      workspace_id: row.workspace_id,
      event: "trial_ended_reminder",
      to_status: "canceled",
      metadata: { trial_ends_at: row.trial_ends_at },
    });
    endedSent++;
  }

  return NextResponse.json({
    endingSent,
    endedSent,
    endingMatched: endingRes.data?.length ?? 0,
    endedMatched: endedRes.data?.length ?? 0,
  });
}

async function alreadySent(
  admin: ReturnType<typeof createServiceClient>,
  workspaceId: string,
  event: string,
): Promise<boolean> {
  const { data } = await admin
    .from("subscription_events")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("event", event)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

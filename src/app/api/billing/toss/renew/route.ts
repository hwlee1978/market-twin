import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { chargeBillingKey, tossPriceKrw } from "@/lib/billing/toss";
import { getPlan, type PlanSlug } from "@/lib/billing/plans";
import {
  notifyPaymentFailed,
  notifyPaymentSucceeded,
} from "@/lib/email/billing-notify";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/billing/toss/renew
 *
 * Cron-driven recurring-charge worker for TossPayments subscriptions.
 * Toss does NOT auto-renew — we have to call chargeBillingKey for
 * every period. Vercel Cron (or any external scheduler) hits this
 * endpoint daily; auth is via the CRON_SECRET header.
 *
 * Logic:
 *   - Find Toss-paid subscriptions where current_period_end <= now()
 *     (cycle just rolled over) AND status='active'
 *   - For each: charge billingKey for the period amount, advance
 *     current_period_*; on success log payment_succeeded; on failure
 *     mark past_due + log payment_failed
 *
 * The same row is processed at most once per cron tick because we
 * only pick rows where end <= now(); after the successful charge we
 * advance current_period_end forward by one cycle so the next tick
 * skips it. Failure leaves end unchanged so we retry on the next
 * tick — but we also flip status to past_due, which gates the user's
 * sims via canStartSim.
 *
 * Vercel Cron config (vercel.json):
 *   { "path": "/api/billing/toss/renew", "schedule": "0 1 * * *" }
 *   → daily 01:00 UTC (10:00 KST)
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const admin = createServiceClient();
  const now = new Date().toISOString();
  const { data: due, error } = await admin
    .from("subscriptions")
    .select(
      "workspace_id, plan, billing_interval, toss_billing_key, toss_customer_key, current_period_end, current_period_start, cancel_at_period_end",
    )
    .eq("payment_provider", "tosspayments")
    .eq("status", "active")
    .lte("current_period_end", now)
    .not("toss_billing_key", "is", null);

  if (error) {
    console.error("[toss renew] subscription query failed:", error.message);
    return NextResponse.json({ error: "db_query_failed" }, { status: 500 });
  }

  const results: Array<{ workspaceId: string; outcome: "success" | "failed"; reason?: string }> = [];

  for (const row of due ?? []) {
    const workspaceId = row.workspace_id as string;

    // User hit cancel earlier — period just expired, so flip to canceled
    // and skip the charge. No new billing happens.
    if (row.cancel_at_period_end) {
      await admin
        .from("subscriptions")
        .update({
          plan: "free_trial",
          status: "canceled",
          toss_billing_key: null,
          cancel_at_period_end: false,
          trial_sims_limit: 0,
        })
        .eq("workspace_id", workspaceId);
      await admin.from("subscription_events").insert({
        workspace_id: workspaceId,
        event: "canceled",
        to_plan: "free_trial",
        to_status: "canceled",
        metadata: { provider: "tosspayments", scheduled: true },
      });
      results.push({ workspaceId, outcome: "success", reason: "canceled_at_period_end" });
      continue;
    }

    try {
      const planSlug = row.plan as PlanSlug;
      const cycle = (row.billing_interval ?? "monthly") as "monthly" | "annual";
      const amountKrw = tossPriceKrw(planSlug, cycle);
      if (amountKrw == null) {
        // Plan changed to a non-billable tier (free_trial / enterprise)
        // but the row still says active — treat as soft-cancel.
        results.push({ workspaceId, outcome: "failed", reason: "no_price" });
        continue;
      }
      const plan = getPlan(planSlug);
      const orderId = randomUUID();
      const orderName = `Market Twin ${plan.name} renewal (${cycle})`;
      const charge = await chargeBillingKey({
        billingKey: row.toss_billing_key as string,
        customerKey: row.toss_customer_key as string,
        amountKrw,
        orderId,
        orderName,
      });

      const newStart = new Date(charge.approvedAt);
      const newEnd = new Date(newStart);
      if (cycle === "annual") newEnd.setFullYear(newEnd.getFullYear() + 1);
      else newEnd.setMonth(newEnd.getMonth() + 1);

      await admin
        .from("subscriptions")
        .update({
          current_period_start: newStart.toISOString(),
          current_period_end: newEnd.toISOString(),
        })
        .eq("workspace_id", workspaceId);

      await admin.from("subscription_events").insert({
        workspace_id: workspaceId,
        event: "payment_succeeded",
        amount_cents: amountKrw * 100,
        currency: "KRW",
        metadata: { payment_key: charge.paymentKey, order_id: orderId, renewal: true, cycle },
      });
      void notifyPaymentSucceeded({
        workspaceId,
        planName: plan.name,
        amountCents: amountKrw * 100,
        currency: "KRW",
        isRenewal: true,
      });
      results.push({ workspaceId, outcome: "success" });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.warn(`[toss renew] charge failed for workspace ${workspaceId}:`, reason);
      await admin
        .from("subscriptions")
        .update({ status: "past_due" })
        .eq("workspace_id", workspaceId);
      await admin.from("subscription_events").insert({
        workspace_id: workspaceId,
        event: "payment_failed",
        to_status: "past_due",
        currency: "KRW",
        metadata: { reason, renewal: true },
      });
      void notifyPaymentFailed({
        workspaceId,
        planName: getPlan(row.plan as PlanSlug).name,
        reason,
        currency: "KRW",
      });
      results.push({ workspaceId, outcome: "failed", reason });
    }
  }

  return NextResponse.json({
    processed: results.length,
    succeeded: results.filter((r) => r.outcome === "success").length,
    failed: results.filter((r) => r.outcome === "failed").length,
    results,
  });
}

import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { chargeBillingKey, expireBillingKey, nicePriceKrw } from "@/lib/billing/nice";
import { getPlan, type PlanSlug } from "@/lib/billing/plans";
import {
  notifyPaymentFailed,
  notifyPaymentSucceeded,
  notifySinglePaymentExpiring,
  defaultUpgradeUrl,
} from "@/lib/email/billing-notify";
import { assertCronAuth } from "@/lib/auth/cron-gate";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/billing/nice/renew
 *
 * Cron-driven recurring-charge worker for 나이스페이먼츠(V2) subscriptions.
 * Twin of the Toss renew worker — NICE does NOT auto-renew, so we call
 * chargeBillingKey(bid) for every period. Vercel Cron hits this daily;
 * auth via CRON_SECRET.
 *
 * Logic (mirrors toss/renew):
 *   - Find NICE-paid subs where current_period_end <= now() AND
 *     status='active' AND nice_bid is set
 *   - cancel_at_period_end → expire the bid + downgrade to free_trial
 *   - else → charge bid for the period amount, advance current_period_*;
 *     success → payment_succeeded, failure → past_due
 *
 * Vercel Cron (vercel.json):
 *   { "path": "/api/billing/nice/renew", "schedule": "0 1 * * *" }
 */
export async function GET(req: Request) {
  const gate = assertCronAuth(req);
  if (gate) return gate;

  const admin = createServiceClient();
  const now = new Date().toISOString();
  const { data: due, error } = await admin
    .from("subscriptions")
    .select(
      "workspace_id, plan, billing_interval, nice_bid, current_period_end, current_period_start, cancel_at_period_end",
    )
    .eq("payment_provider", "nicepay")
    .eq("status", "active")
    .lte("current_period_end", now)
    .not("nice_bid", "is", null);

  if (error) {
    console.error("[nice renew] subscription query failed:", error.message);
    return NextResponse.json({ error: "db_query_failed" }, { status: 500 });
  }

  const results: Array<{ workspaceId: string; outcome: "success" | "failed"; reason?: string }> = [];

  for (const row of due ?? []) {
    const workspaceId = row.workspace_id as string;
    const bid = row.nice_bid as string;

    // Canceled earlier — period just expired. Expire the bid on NICE's
    // side, downgrade to free_trial, skip charge.
    if (row.cancel_at_period_end) {
      try {
        await expireBillingKey({ bid, orderId: randomUUID() });
      } catch (err) {
        // Non-fatal: downgrade locally even if expire fails so billing stops.
        console.warn(`[nice renew] bid expire failed for ${workspaceId}:`, err instanceof Error ? err.message : err);
      }
      await admin
        .from("subscriptions")
        .update({
          plan: "free_trial",
          status: "canceled",
          nice_bid: null,
          cancel_at_period_end: false,
          trial_sims_limit: 0,
        })
        .eq("workspace_id", workspaceId);
      await admin.from("subscription_events").insert({
        workspace_id: workspaceId,
        event: "canceled",
        to_plan: "free_trial",
        to_status: "canceled",
        metadata: { provider: "nicepay", scheduled: true },
      });
      results.push({ workspaceId, outcome: "success", reason: "canceled_at_period_end" });
      continue;
    }

    try {
      const planSlug = row.plan as PlanSlug;
      const cycle = (row.billing_interval ?? "monthly") as "monthly" | "annual";
      const amountKrw = nicePriceKrw(planSlug, cycle);
      if (amountKrw == null) {
        results.push({ workspaceId, outcome: "failed", reason: "no_price" });
        continue;
      }
      const plan = getPlan(planSlug);
      const orderId = randomUUID();
      const goodsName = `Market Twin ${plan.name} renewal (${cycle})`;
      const charge = await chargeBillingKey({ bid, amountKrw, orderId, goodsName });

      const newStart = charge.paidAt ? new Date(charge.paidAt) : new Date();
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
        metadata: { tid: charge.tid, order_id: orderId, renewal: true, cycle, provider: "nicepay" },
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
      console.warn(`[nice renew] charge failed for workspace ${workspaceId}:`, reason);
      await admin
        .from("subscriptions")
        .update({ status: "past_due" })
        .eq("workspace_id", workspaceId);
      await admin.from("subscription_events").insert({
        workspace_id: workspaceId,
        event: "payment_failed",
        to_status: "past_due",
        currency: "KRW",
        metadata: { reason, renewal: true, provider: "nicepay" },
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

  // ── 단건결제 만료 sweep ────────────────────────────────────────────
  // 결제창 단건결제는 빌키(bid)가 없어 위 자동과금 루프(nice_bid IS NOT NULL)
  // 가 건드리지 않는다. getSubscription도 current_period_end로 자동 강등을
  // 하지 않으므로, 기간이 지난 단건 구독은 여기서 free_trial로 내려준다.
  let expiredSingle = 0;
  const { data: lapsed, error: lapsedErr } = await admin
    .from("subscriptions")
    .select("workspace_id, plan")
    .eq("payment_provider", "nicepay")
    .eq("status", "active")
    .is("nice_bid", null)
    .lte("current_period_end", now);

  if (lapsedErr) {
    console.error("[nice renew] single-payment sweep query failed:", lapsedErr.message);
  } else {
    for (const row of lapsed ?? []) {
      const workspaceId = row.workspace_id as string;
      await admin
        .from("subscriptions")
        .update({
          plan: "free_trial",
          status: "canceled",
          cancel_at_period_end: false,
          trial_sims_limit: 0,
        })
        .eq("workspace_id", workspaceId);
      await admin.from("subscription_events").insert({
        workspace_id: workspaceId,
        event: "canceled",
        from_plan: row.plan as string,
        to_plan: "free_trial",
        to_status: "canceled",
        metadata: { provider: "nicepay", mode: "single", reason: "period_expired" },
      });
      expiredSingle += 1;
    }
  }

  // ── 단건결제 만료 임박 재구매 안내 (D-3 근처) ─────────────────────────
  // 단건은 자동갱신이 없어 가만두면 그냥 끊긴다. 만료 ~3일 전(2~4일 창)에
  // 재결제 안내 메일을 한 번 보낸다. 멱등성은 해당 period_end에 대한
  // single_expiry_reminder 이벤트 존재 여부로 보장(주기마다 재구매하면
  // period_end가 바뀌므로 다음 주기엔 다시 안내된다).
  let remindersSent = 0;
  const remindFrom = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
  const remindTo = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString();
  const { data: expiring, error: expiringErr } = await admin
    .from("subscriptions")
    .select("workspace_id, plan, current_period_end")
    .eq("payment_provider", "nicepay")
    .eq("status", "active")
    .is("nice_bid", null)
    .gte("current_period_end", remindFrom)
    .lt("current_period_end", remindTo);

  if (expiringErr) {
    console.error("[nice renew] expiring-soon query failed:", expiringErr.message);
  } else {
    for (const row of expiring ?? []) {
      const workspaceId = row.workspace_id as string;
      const periodEnd = row.current_period_end as string;
      const { data: sent } = await admin
        .from("subscription_events")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("event", "single_expiry_reminder")
        .eq("metadata->>period_end", periodEnd)
        .limit(1);
      if (sent && sent.length) continue;

      const plan = getPlan(row.plan as PlanSlug);
      const daysLeft = Math.max(
        1,
        Math.ceil((new Date(periodEnd).getTime() - Date.now()) / (24 * 60 * 60 * 1000)),
      );
      void notifySinglePaymentExpiring({
        workspaceId,
        planName: plan.name,
        daysLeft,
        upgradeUrl: defaultUpgradeUrl("ko"), // 수신자별 locale은 헬퍼 내부에서 해석
      });
      await admin.from("subscription_events").insert({
        workspace_id: workspaceId,
        event: "single_expiry_reminder",
        metadata: { period_end: periodEnd, days_left: daysLeft, provider: "nicepay", mode: "single" },
      });
      remindersSent += 1;
    }
  }

  return NextResponse.json({
    processed: results.length,
    succeeded: results.filter((r) => r.outcome === "success").length,
    failed: results.filter((r) => r.outcome === "failed").length,
    expiredSingle,
    remindersSent,
    results,
  });
}

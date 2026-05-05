import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import {
  issueBillingKey,
  chargeBillingKey,
  tossPriceKrw,
  workspaceCustomerKey,
} from "@/lib/billing/toss";
import { getPlan } from "@/lib/billing/plans";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const RequestSchema = z.object({
  authKey: z.string().min(10),
  plan: z.enum(["starter", "growth"]),
  cycle: z.enum(["monthly", "annual"]).default("monthly"),
});

/**
 * POST /api/billing/toss/issue
 *
 * Final step of the Toss billing-key flow:
 *   1. Frontend opened Toss widget with our customerKey
 *   2. User entered card details → Toss redirected back with authKey
 *   3. This endpoint exchanges authKey → billingKey, charges the first
 *      period immediately, and persists the subscription state
 *
 * On success, the workspace is on the chosen plan and we have a stored
 * billingKey for renewals. Renewal charges fire from a scheduled cron
 * (see TODO at the bottom of this file).
 */
export async function POST(req: Request) {
  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (ctx.status !== "active") {
    return NextResponse.json({ error: `workspace_${ctx.status}` }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { authKey, plan: planSlug, cycle } = parsed.data;

  const amountKrw = tossPriceKrw(planSlug, cycle);
  if (amountKrw == null) {
    return NextResponse.json({ error: "no_price_for_plan" }, { status: 400 });
  }

  const customerKey = workspaceCustomerKey(ctx.workspaceId);
  const admin = createServiceClient();

  let billingKey: string;
  let card: { cardCompany: string; cardNumberMasked: string };
  try {
    const issued = await issueBillingKey({ authKey, customerKey });
    billingKey = issued.billingKey;
    card = { cardCompany: issued.cardCompany, cardNumberMasked: issued.cardNumberMasked };
  } catch (err) {
    console.error("[toss issue] billing key exchange failed:", err);
    return NextResponse.json(
      { error: "billing_key_failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }

  // First charge — establish the period boundary on the same call.
  // Failure here invalidates the billingKey from our side (we never
  // persist it) so the user is asked to re-enter card details.
  const orderId = randomUUID();
  const plan = getPlan(planSlug);
  const orderName = `Market Twin ${plan.name} (${cycle === "annual" ? "Annual" : "Monthly"})`;
  let paymentKey: string;
  let approvedAt: string;
  try {
    const charge = await chargeBillingKey({
      billingKey,
      customerKey,
      amountKrw,
      orderId,
      orderName,
      customerEmail: ctx.email,
    });
    paymentKey = charge.paymentKey;
    approvedAt = charge.approvedAt;
  } catch (err) {
    console.error("[toss issue] first charge failed:", err);
    return NextResponse.json(
      { error: "first_charge_failed", detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }

  const periodStart = new Date(approvedAt);
  const periodEnd = new Date(periodStart);
  if (cycle === "annual") periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  else periodEnd.setMonth(periodEnd.getMonth() + 1);

  await admin
    .from("subscriptions")
    .update({
      plan: planSlug,
      status: "active",
      payment_provider: "tosspayments",
      toss_customer_key: customerKey,
      toss_billing_key: billingKey,
      current_period_start: periodStart.toISOString(),
      current_period_end: periodEnd.toISOString(),
      cancel_at_period_end: false,
      billing_currency: "KRW",
      billing_interval: cycle,
    })
    .eq("workspace_id", ctx.workspaceId);

  await admin.from("subscription_events").insert({
    workspace_id: ctx.workspaceId,
    event: "payment_succeeded",
    to_plan: planSlug,
    to_status: "active",
    amount_cents: amountKrw * 100, // store as KRW × 100 to match plans.ts convention
    currency: "KRW",
    metadata: {
      payment_key: paymentKey,
      order_id: orderId,
      cycle,
      card_company: card.cardCompany,
      card_number_masked: card.cardNumberMasked,
    },
  });

  return NextResponse.json({
    ok: true,
    plan: planSlug,
    cycle,
    cardCompany: card.cardCompany,
    cardNumberMasked: card.cardNumberMasked,
  });
}

// TODO (next session): scheduled renewal worker
//   - Vercel Cron or Supabase Edge Function fires daily
//   - Query subscriptions where payment_provider='tosspayments' AND
//     status='active' AND current_period_end <= now() + 1 day
//   - For each: chargeBillingKey, update current_period_*, log event
//   - On charge failure: status='past_due' + send email

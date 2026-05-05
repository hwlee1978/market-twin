import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

/**
 * POST /api/billing/toss/cancel
 *
 * Marks the Toss subscription as cancel-at-period-end. We don't
 * actively cancel the billingKey on Toss's side — the user keeps
 * access through the paid period, and our renewal cron simply skips
 * rows with cancel_at_period_end=true after the period rolls over.
 *
 * For Stripe customers, use the Customer Portal (POST /api/billing/portal)
 * — Stripe owns the cancel-at-period-end semantics natively. This
 * route exists because Toss has no equivalent self-serve portal.
 */
export async function POST() {
  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createServiceClient();
  const { data: sub, error } = await admin
    .from("subscriptions")
    .select("plan, payment_provider, toss_billing_key, current_period_end, status")
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();

  if (error || !sub) {
    return NextResponse.json({ error: "subscription_not_found" }, { status: 404 });
  }
  if (sub.payment_provider !== "tosspayments") {
    return NextResponse.json(
      { error: "wrong_provider", detail: "Use the Stripe Customer Portal for Stripe subscriptions." },
      { status: 400 },
    );
  }
  if (sub.status === "canceled") {
    return NextResponse.json({ ok: true, alreadyCanceled: true });
  }

  await admin
    .from("subscriptions")
    .update({ cancel_at_period_end: true })
    .eq("workspace_id", ctx.workspaceId);

  await admin.from("subscription_events").insert({
    workspace_id: ctx.workspaceId,
    event: "cancel_scheduled",
    metadata: {
      effective_at: sub.current_period_end,
      provider: "tosspayments",
    },
  });

  return NextResponse.json({
    ok: true,
    effectiveAt: sub.current_period_end,
  });
}

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

/**
 * POST /api/billing/nice/cancel
 *
 * Marks the NICE subscription as cancel-at-period-end. Twin of
 * toss/cancel — we keep the bid until the period rolls over so the user
 * retains access through the paid period. The renewal cron then expires
 * the bid on NICE's side and downgrades to free_trial (see nice/renew).
 *
 * For Stripe customers, use the Customer Portal (/api/billing/portal).
 */
export async function POST() {
  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createServiceClient();
  const { data: sub, error } = await admin
    .from("subscriptions")
    .select("plan, payment_provider, nice_bid, current_period_end, status")
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();

  if (error || !sub) {
    return NextResponse.json({ error: "subscription_not_found" }, { status: 404 });
  }
  if (sub.payment_provider !== "nicepay") {
    return NextResponse.json(
      { error: "wrong_provider", detail: "Use the matching provider's cancel flow." },
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
      provider: "nicepay",
    },
  });

  return NextResponse.json({
    ok: true,
    effectiveAt: sub.current_period_end,
  });
}

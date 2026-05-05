import { NextResponse } from "next/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { getSubscription, getMonthlyUsage } from "@/lib/billing/usage";

export const dynamic = "force-dynamic";

/**
 * GET /api/billing/subscription
 *
 * Returns the current workspace's subscription state + month-to-date
 * usage so the /billing page can render progress bars without
 * duplicating the queries client-side.
 */
export async function GET() {
  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const sub = await getSubscription(ctx.workspaceId);
  const usage = await getMonthlyUsage(ctx.workspaceId, sub);

  return NextResponse.json({
    plan: {
      slug: sub.plan.slug,
      name: sub.plan.name,
      limits: sub.plan.limits,
      features: sub.plan.features,
      priceMonthly: sub.plan.priceMonthly,
      selfServe: sub.plan.selfServe,
    },
    status: sub.status,
    trial: {
      active: sub.trialActive,
      endsAt: sub.trialEndsAt,
      simsUsed: sub.trialSimsUsed,
      simsLimit: sub.trialSimsLimit,
    },
    period: {
      start: sub.currentPeriodStart,
      end: sub.currentPeriodEnd,
      cancelAtEnd: sub.cancelAtPeriodEnd,
    },
    usage,
  });
}

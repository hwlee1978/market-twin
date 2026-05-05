import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { stripe, appOrigin } from "@/lib/billing/stripe";

export const dynamic = "force-dynamic";

/**
 * POST /api/billing/portal
 *
 * Returns a Stripe Customer Portal URL where the user can swap card,
 * download past invoices, change plan, or cancel — all hosted by
 * Stripe so we don't have to build/audit those flows ourselves.
 *
 * Configure the portal once in Stripe Dashboard → Settings → Billing →
 * Customer portal: enable plan switching, cancellation, invoice
 * history. Otherwise the page renders with a default empty layout.
 */
export async function POST(req: Request) {
  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createServiceClient();
  const { data: sub } = await admin
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();

  if (!sub?.stripe_customer_id) {
    return NextResponse.json(
      { error: "no_stripe_customer", detail: "This workspace has no Stripe customer yet. Subscribe to a paid plan first." },
      { status: 404 },
    );
  }

  const origin = appOrigin(req.url);
  const session = await stripe().billingPortal.sessions.create({
    customer: sub.stripe_customer_id,
    return_url: `${origin}/ko/billing`,
  });

  return NextResponse.json({ url: session.url });
}

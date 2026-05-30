import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { getPlan, type PlanSlug } from "@/lib/billing/plans";
import { stripe, stripePriceId, appOrigin } from "@/lib/billing/stripe";

export const dynamic = "force-dynamic";

const RequestSchema = z.object({
  // 4-tier paid ladder (per plans.ts). validator added 2026-05-30 — was
  // previously gated out at checkout despite being a real tier.
  plan: z.enum(["starter", "validator", "growth"]),
  cycle: z.enum(["monthly", "annual"]).default("monthly"),
  // The user's locale, so we land them back on the right share-page
  // language after success. Defaults to ko.
  locale: z.enum(["ko", "en"]).default("ko"),
});

/**
 * POST /api/billing/checkout
 *
 * Creates a Stripe Checkout Session for the workspace's first paid
 * subscription (or upgrade from another tier). On success, the user
 * lands on Stripe's hosted page → enters card → on completion Stripe
 * fires a `checkout.session.completed` webhook that we handle in
 * /api/billing/webhook to flip subscriptions.plan / status.
 *
 * Returns: { url } — the client redirects window.location to it.
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
  const { plan: planSlug, cycle, locale } = parsed.data;
  const plan = getPlan(planSlug);
  const priceId = stripePriceId(planSlug, cycle);
  if (!priceId) {
    return NextResponse.json(
      {
        error: "stripe_price_not_configured",
        detail: `STRIPE_PRICE_${planSlug.toUpperCase()}_${cycle.toUpperCase()} env var is missing or invalid.`,
      },
      { status: 500 },
    );
  }

  const admin = createServiceClient();

  // Lookup or create a Stripe customer for this workspace. Re-using the
  // same customer ID across upgrades keeps payment-method on file and
  // makes billing history visible in one place in Stripe.
  const { data: subRow } = await admin
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();

  let customerId = subRow?.stripe_customer_id ?? null;
  if (!customerId) {
    const customer = await stripe().customers.create({
      email: ctx.email,
      metadata: {
        workspace_id: ctx.workspaceId,
        user_id: ctx.userId,
      },
    });
    customerId = customer.id;
    await admin
      .from("subscriptions")
      .update({ stripe_customer_id: customerId, payment_provider: "stripe" })
      .eq("workspace_id", ctx.workspaceId);
  }

  const origin = appOrigin(req.url);

  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}/${locale}/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/${locale}/billing?checkout=canceled`,
    // Reflected back in webhook payload so we can match the session to
    // the workspace without an extra DB query during webhook processing.
    metadata: {
      workspace_id: ctx.workspaceId,
      plan: planSlug,
      cycle,
    },
    subscription_data: {
      metadata: {
        workspace_id: ctx.workspaceId,
        plan: planSlug,
        cycle,
      },
    },
    // Allow the user to apply a promo code on the Checkout page.
    // Cheap to enable; lets us run discount campaigns without code changes.
    allow_promotion_codes: true,
    // Tax: Stripe will add the right line if Tax is configured in the
    // dashboard. Non-fatal if not — invoice just shows pre-tax.
    automatic_tax: { enabled: false },
  });

  if (!session.url) {
    return NextResponse.json(
      { error: "checkout_url_missing" },
      { status: 502 },
    );
  }

  // Audit trail — the webhook also writes one on confirmation, but
  // tracking the intent here lets us see "user clicked upgrade but
  // bailed" in subscription_events without webhook coverage.
  await admin.from("subscription_events").insert({
    workspace_id: ctx.workspaceId,
    event: "checkout_started",
    to_plan: planSlug,
    metadata: { cycle, plan: plan.slug, session_id: session.id },
  });

  return NextResponse.json({ url: session.url });
}

import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createServiceClient } from "@/lib/supabase/server";
import { stripe, stripeWebhookSecret } from "@/lib/billing/stripe";
import type { PlanSlug, SubscriptionStatus } from "@/lib/billing/plans";

export const dynamic = "force-dynamic";
// Stripe webhooks need the raw body for signature verification; Next's
// default body parsing would mutate it. Using arrayBuffer below avoids
// that without us having to disable bodyParser config (App Router style).

/**
 * POST /api/billing/webhook
 *
 * Stripe calls us on subscription lifecycle events. We:
 *   1. Verify the signature (rejects forged calls)
 *   2. Update subscriptions.* on the matching workspace
 *   3. Log the event in subscription_events for audit / billing UI
 *
 * Events we care about (others are silently ignored):
 *   - checkout.session.completed: first paid checkout finished
 *   - customer.subscription.updated: plan change, billing cycle, status flips
 *   - customer.subscription.deleted: cancellation took effect
 *   - invoice.paid: monthly/annual renewal succeeded
 *   - invoice.payment_failed: card declined; mark past_due
 */
export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "missing_signature" }, { status: 400 });
  }

  const buf = Buffer.from(await req.arrayBuffer());
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(buf, sig, stripeWebhookSecret());
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[stripe webhook] signature verification failed: ${msg}`);
    return NextResponse.json({ error: "bad_signature" }, { status: 400 });
  }

  const admin = createServiceClient();

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session, admin);
        break;
      case "customer.subscription.updated":
      case "customer.subscription.created":
        await handleSubscriptionUpsert(event.data.object as Stripe.Subscription, admin);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription, admin);
        break;
      case "invoice.paid":
        await handleInvoicePaid(event.data.object as Stripe.Invoice, admin);
        break;
      case "invoice.payment_failed":
        await handleInvoiceFailed(event.data.object as Stripe.Invoice, admin);
        break;
      default:
        // Unhandled event types are common (e.g. payment_method.attached).
        // Acknowledge so Stripe doesn't retry indefinitely.
        break;
    }
  } catch (err) {
    console.error(`[stripe webhook] handler failed for ${event.type}:`, err);
    // Return 500 so Stripe retries — better than swallowing a write
    // error and leaving the DB out of sync.
    return NextResponse.json({ error: "handler_failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

type Admin = ReturnType<typeof createServiceClient>;

async function handleCheckoutCompleted(session: Stripe.Checkout.Session, admin: Admin) {
  const workspaceId = session.metadata?.workspace_id;
  const plan = session.metadata?.plan as PlanSlug | undefined;
  if (!workspaceId || !plan) {
    console.warn("[stripe webhook] checkout.session.completed missing metadata", session.id);
    return;
  }

  const subscriptionId =
    typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
  if (!subscriptionId) return;

  // Pull the subscription so we get period dates + status + cycle in one go.
  const sub = await stripe().subscriptions.retrieve(subscriptionId);
  await persistSubscription(workspaceId, plan, sub, admin);

  await admin.from("subscription_events").insert({
    workspace_id: workspaceId,
    event: "checkout_completed",
    to_plan: plan,
    to_status: "active",
    metadata: { session_id: session.id, subscription_id: subscriptionId },
  });
}

async function handleSubscriptionUpsert(sub: Stripe.Subscription, admin: Admin) {
  const workspaceId = sub.metadata?.workspace_id;
  const plan = sub.metadata?.plan as PlanSlug | undefined;
  if (!workspaceId || !plan) return; // not one of ours
  await persistSubscription(workspaceId, plan, sub, admin);
}

async function handleSubscriptionDeleted(sub: Stripe.Subscription, admin: Admin) {
  const workspaceId = sub.metadata?.workspace_id;
  if (!workspaceId) return;

  // Cancellation downgrades the workspace to free_trial with quota
  // exhausted — the user keeps read-only access to past results but
  // can't start new sims until they resubscribe.
  await admin
    .from("subscriptions")
    .update({
      plan: "free_trial",
      status: "canceled",
      stripe_subscription_id: null,
      cancel_at_period_end: false,
      trial_sims_limit: 0,
    })
    .eq("workspace_id", workspaceId);

  await admin.from("subscription_events").insert({
    workspace_id: workspaceId,
    event: "canceled",
    to_plan: "free_trial",
    to_status: "canceled",
    metadata: { subscription_id: sub.id },
  });
}

async function handleInvoicePaid(invoice: Stripe.Invoice, admin: Admin) {
  // Stripe.Invoice's `subscription` field is typed as a property in
  // some API versions; cast through unknown to extract the id without
  // taking a hard dep on the exact shape.
  const subId =
    typeof (invoice as unknown as { subscription?: string | { id: string } }).subscription === "string"
      ? ((invoice as unknown as { subscription?: string }).subscription as string)
      : (invoice as unknown as { subscription?: { id: string } }).subscription?.id;
  if (!subId) return;
  const sub = await stripe().subscriptions.retrieve(subId);
  const workspaceId = sub.metadata?.workspace_id;
  if (!workspaceId) return;

  await admin.from("subscription_events").insert({
    workspace_id: workspaceId,
    event: "payment_succeeded",
    amount_cents: invoice.amount_paid,
    currency: invoice.currency.toUpperCase(),
    metadata: {
      invoice_id: invoice.id,
      subscription_id: subId,
      hosted_invoice_url: invoice.hosted_invoice_url ?? null,
    },
  });

  // Refresh subscription state — period_end advances on each renewal.
  const plan = sub.metadata?.plan as PlanSlug | undefined;
  if (plan) await persistSubscription(workspaceId, plan, sub, admin);
}

async function handleInvoiceFailed(invoice: Stripe.Invoice, admin: Admin) {
  const subId =
    typeof (invoice as unknown as { subscription?: string | { id: string } }).subscription === "string"
      ? ((invoice as unknown as { subscription?: string }).subscription as string)
      : (invoice as unknown as { subscription?: { id: string } }).subscription?.id;
  if (!subId) return;
  const sub = await stripe().subscriptions.retrieve(subId);
  const workspaceId = sub.metadata?.workspace_id;
  if (!workspaceId) return;

  await admin
    .from("subscriptions")
    .update({ status: "past_due" })
    .eq("workspace_id", workspaceId);

  await admin.from("subscription_events").insert({
    workspace_id: workspaceId,
    event: "payment_failed",
    to_status: "past_due",
    amount_cents: invoice.amount_due,
    currency: invoice.currency.toUpperCase(),
    metadata: { invoice_id: invoice.id, subscription_id: subId },
  });
}

/**
 * Persist Stripe subscription state into our subscriptions row.
 * Stripe → our column mapping:
 *   sub.status              → subscriptions.status (active / past_due / canceled / paused / trialing → trialing not used here)
 *   sub.current_period_*    → current_period_start/end
 *   sub.cancel_at_period_end → cancel_at_period_end
 *   sub.items[0].price.recurring.interval → billing_interval (month/year → monthly/annual)
 *   sub.items[0].price.currency → billing_currency
 */
async function persistSubscription(
  workspaceId: string,
  plan: PlanSlug,
  sub: Stripe.Subscription,
  admin: Admin,
) {
  const item = sub.items.data[0];
  const interval = item?.price.recurring?.interval ?? "month";
  const billingInterval = interval === "year" ? "annual" : "monthly";
  const billingCurrency = (item?.price.currency ?? "usd").toUpperCase();
  const status = mapStripeStatus(sub.status);

  // current_period_start / end live on Stripe.Subscription with snake_case
  // through the REST API; cast through unknown so this works regardless
  // of which API version's TS shape the dependency happens to ship.
  const periods = sub as unknown as {
    current_period_start?: number;
    current_period_end?: number;
  };
  const periodStart = periods.current_period_start
    ? new Date(periods.current_period_start * 1000).toISOString()
    : null;
  const periodEnd = periods.current_period_end
    ? new Date(periods.current_period_end * 1000).toISOString()
    : null;

  await admin
    .from("subscriptions")
    .update({
      plan,
      status,
      payment_provider: "stripe",
      stripe_subscription_id: sub.id,
      stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
      current_period_start: periodStart,
      current_period_end: periodEnd,
      cancel_at_period_end: sub.cancel_at_period_end,
      billing_interval: billingInterval,
      billing_currency: billingCurrency,
    })
    .eq("workspace_id", workspaceId);
}

function mapStripeStatus(s: Stripe.Subscription.Status): SubscriptionStatus {
  switch (s) {
    case "active":
    case "trialing":
      return s === "trialing" ? "trialing" : "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
    case "paused":
      return "paused";
    default:
      // incomplete / other — keep as past_due to be safe (gates access).
      return "past_due";
  }
}

import Stripe from "stripe";
import type { PlanSlug } from "./plans";

/**
 * Stripe singleton — lazy so the module loads in environments that don't
 * have a key yet (e.g. local dev pointing at a non-Stripe path, the
 * static Tier-selection page, or build steps that import billing types).
 *
 * The api version is pinned so library updates don't silently change
 * webhook payload shapes; bump deliberately when reviewing the changelog.
 */
let _stripe: Stripe | null = null;
export function stripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. Configure it in .env.local before invoking the billing API.",
    );
  }
  _stripe = new Stripe(key, {
    apiVersion: "2026-04-22.dahlia",
    typescript: true,
  });
  return _stripe;
}

/**
 * Stripe webhook signature secret. Validated separately from the API
 * key because webhooks have their own per-endpoint secret in the Stripe
 * dashboard. Throws when invoked without one — webhook handlers must
 * reject unsigned payloads instead of silently trusting them.
 */
export function stripeWebhookSecret(): string {
  const v = process.env.STRIPE_WEBHOOK_SECRET;
  if (!v) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not set.");
  }
  return v;
}

/**
 * Plan slug → Stripe price ID lookup. Keys live in env so the same code
 * supports test-mode and live-mode without redeploys (just swap the env
 * vars). Per-plan we have a monthly + annual price, both in USD; KRW
 * customers go through the Toss integration instead so we don't list
 * KRW Stripe prices here.
 *
 * Naming: STRIPE_PRICE_<PLAN>_<CYCLE> (e.g. STRIPE_PRICE_STARTER_MONTHLY).
 * Set in Stripe dashboard → Products → copy each price's `price_*` ID.
 */
type Cycle = "monthly" | "annual";
export function stripePriceId(plan: PlanSlug, cycle: Cycle): string | null {
  // free_trial / enterprise aren't self-serve through Stripe.
  if (plan === "free_trial" || plan === "enterprise") return null;
  const envKey = `STRIPE_PRICE_${plan.toUpperCase()}_${cycle.toUpperCase()}`;
  const priceId = process.env[envKey];
  return priceId && priceId.startsWith("price_") ? priceId : null;
}

/**
 * Origin used to construct Checkout success / cancel URLs. Reads from
 * NEXT_PUBLIC_APP_URL when set, falls back to the request's origin so
 * preview deploys and local dev work without env config.
 */
export function appOrigin(reqUrl: string): string {
  const env = process.env.NEXT_PUBLIC_APP_URL;
  if (env) return env.replace(/\/$/, "");
  try {
    const u = new URL(reqUrl);
    return `${u.protocol}//${u.host}`;
  } catch {
    return "http://localhost:3000";
  }
}

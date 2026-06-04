/**
 * Billing-activation readiness check (2026-06-04).
 *
 * Surfaces env-var presence + manual dashboard checklist so the
 * operator can see "what's still blocking paid signup" at a glance
 * without grepping through Vercel project settings.
 *
 * Used by /admin/billing — runs server-side (env vars not exposed to
 * client). The status is best-effort and pure presence-check; it
 * doesn't try to validate keys against Stripe/Toss APIs (would add
 * latency + outbound network on every admin page load).
 */

export type CheckStatus = "ok" | "missing" | "warning";

export interface ReadinessItem {
  /** i18n key for the label — e.g. "stripe.secret" maps to admin.billing.readiness.items.stripe.secret. */
  key: string;
  /** Human-readable env var name shown in the row. */
  env?: string;
  status: CheckStatus;
  /** Optional helper text shown below the row (i18n key). */
  hintKey?: string;
}

export interface ReadinessGroup {
  /** i18n key for the group title — e.g. "stripe" → admin.billing.readiness.groups.stripe. */
  titleKey: string;
  items: ReadinessItem[];
  /** Group-level readiness: ok if every item ok; missing if any missing. */
  status: CheckStatus;
}

export interface ReadinessReport {
  groups: ReadinessGroup[];
  /** Highest-severity status across all groups — drives the page banner. */
  overall: CheckStatus;
  /** Manual dashboard actions still pending (i18n keys). */
  manualChecklistKeys: string[];
}

function check(env: string): CheckStatus {
  const val = process.env[env];
  if (!val) return "missing";
  return "ok";
}

function rollGroup(items: ReadinessItem[]): CheckStatus {
  if (items.some((i) => i.status === "missing")) return "missing";
  if (items.some((i) => i.status === "warning")) return "warning";
  return "ok";
}

function rollOverall(groups: ReadinessGroup[]): CheckStatus {
  if (groups.some((g) => g.status === "missing")) return "missing";
  if (groups.some((g) => g.status === "warning")) return "warning";
  return "ok";
}

export function getBillingReadiness(): ReadinessReport {
  // Stripe — USD route. Six product prices (3 plans × 2 cycles) +
  // the two account keys + the webhook secret.
  const stripeItems: ReadinessItem[] = [
    { key: "stripe.secret", env: "STRIPE_SECRET_KEY", status: check("STRIPE_SECRET_KEY") },
    {
      key: "stripe.webhook",
      env: "STRIPE_WEBHOOK_SECRET",
      status: check("STRIPE_WEBHOOK_SECRET"),
      hintKey: "stripe.webhookHint",
    },
    {
      key: "stripe.price.starterMonthly",
      env: "STRIPE_PRICE_STARTER_MONTHLY",
      status: check("STRIPE_PRICE_STARTER_MONTHLY"),
    },
    {
      key: "stripe.price.starterAnnual",
      env: "STRIPE_PRICE_STARTER_ANNUAL",
      status: check("STRIPE_PRICE_STARTER_ANNUAL"),
    },
    {
      key: "stripe.price.validatorMonthly",
      env: "STRIPE_PRICE_VALIDATOR_MONTHLY",
      status: check("STRIPE_PRICE_VALIDATOR_MONTHLY"),
    },
    {
      key: "stripe.price.validatorAnnual",
      env: "STRIPE_PRICE_VALIDATOR_ANNUAL",
      status: check("STRIPE_PRICE_VALIDATOR_ANNUAL"),
    },
    {
      key: "stripe.price.growthMonthly",
      env: "STRIPE_PRICE_GROWTH_MONTHLY",
      status: check("STRIPE_PRICE_GROWTH_MONTHLY"),
    },
    {
      key: "stripe.price.growthAnnual",
      env: "STRIPE_PRICE_GROWTH_ANNUAL",
      status: check("STRIPE_PRICE_GROWTH_ANNUAL"),
    },
  ];
  const stripeGroup: ReadinessGroup = {
    titleKey: "stripe",
    items: stripeItems,
    status: rollGroup(stripeItems),
  };

  // Toss — KRW route. Public client key is exposed to the browser
  // (Toss SDK widget needs it), so we check NEXT_PUBLIC_ prefix.
  const tossItems: ReadinessItem[] = [
    { key: "toss.secret", env: "TOSS_SECRET_KEY", status: check("TOSS_SECRET_KEY") },
    {
      key: "toss.client",
      env: "NEXT_PUBLIC_TOSS_CLIENT_KEY",
      status: check("NEXT_PUBLIC_TOSS_CLIENT_KEY"),
      hintKey: "toss.clientHint",
    },
    {
      key: "toss.webhook",
      env: "TOSS_WEBHOOK_SECRET",
      status: check("TOSS_WEBHOOK_SECRET"),
      hintKey: "toss.webhookHint",
    },
  ];
  const tossGroup: ReadinessGroup = {
    titleKey: "toss",
    items: tossItems,
    status: rollGroup(tossItems),
  };

  // Signup gate — separate from PG envs but blocks the actual
  // /signup page from rendering even with everything else configured.
  const signupEnabled = process.env.NEXT_PUBLIC_SIGNUP_ENABLED === "true";
  const gateItems: ReadinessItem[] = [
    {
      key: "gate.signup",
      env: "NEXT_PUBLIC_SIGNUP_ENABLED",
      status: signupEnabled ? "ok" : "missing",
      hintKey: signupEnabled ? undefined : "gate.signupHint",
    },
  ];
  const gateGroup: ReadinessGroup = {
    titleKey: "gate",
    items: gateItems,
    status: rollGroup(gateItems),
  };

  const groups = [stripeGroup, tossGroup, gateGroup];

  // Manual dashboard actions — surfaced as i18n-keyed checklist for
  // the operator. Not auto-detectable; reflects the "do this in your
  // browser" workflow.
  const manualChecklistKeys: string[] = [];
  if (stripeGroup.status !== "ok") {
    manualChecklistKeys.push(
      "checklist.stripeProducts",
      "checklist.stripePrices",
      "checklist.stripeWebhook",
    );
  }
  if (tossGroup.status !== "ok") {
    manualChecklistKeys.push(
      "checklist.tossMerchant",
      "checklist.tossWebhook",
    );
  }

  return {
    groups,
    overall: rollOverall(groups),
    manualChecklistKeys,
  };
}

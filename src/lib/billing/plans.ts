/**
 * Plan definitions — single source of truth for tier limits, pricing,
 * and feature gates. Hardcoded in code (not the DB) so changing a limit
 * doesn't require a migration. The DB stores only the plan slug
 * (subscriptions.plan) and resolves the rest through this module.
 *
 * Adding a new plan: append to PLANS, update the PlanSlug union, and
 * add UI copy in the i18n files.
 *
 * Pricing convention: cents in the indicated currency (USD = USD cents,
 * KRW = KRW × 100 to keep integer math consistent with Stripe). KRW is
 * a zero-decimal currency on the API surface but we still scale by 100
 * internally so the same toCents/fromCents logic works.
 */

export type PlanSlug =
  | "free_trial"
  | "starter"
  | "validator"
  | "growth"
  | "enterprise";

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "paused";

export interface PlanDefinition {
  slug: PlanSlug;
  /** Display name (locale-agnostic; fall back when i18n missing). */
  name: string;
  /** Human tagline shown on the tier card. */
  tagline: { ko: string; en: string };
  /** Self-checkout enabled. Enterprise routes to sales contact instead. */
  selfServe: boolean;
  /** Suggested order in tier listings (ascending = "lower" tier). */
  order: number;
  /**
   * Monthly price. null for plans without a public price (free trial,
   * enterprise contact-sales). Annual = monthly × 10 (16.7% off).
   */
  priceMonthly: { usd: number | null; krw: number | null };
  /** Limits enforced server-side. -1 = unlimited (admin / compliance only). */
  limits: {
    /** Total simulations per billing month. */
    simsPerMonth: number;
    /** Subset of simsPerMonth that can be Consensus+ tier. 0 = no Consensus+.
     * Consensus+ runs 3 internal sims at 3,000 personas each — far costlier
     * per ensemble than Consensus, so it gets its own quota. */
    decisionPlusSimsPerMonth: number;
    /** Subset of simsPerMonth that can be Deep tier (multi-LLM). 0 = no Deep. */
    deepSimsPerMonth: number;
    /** Whether Deep_Pro tier is unlocked at all. */
    deepProEnabled: boolean;
    /** Persona-chat messages per month. */
    chatMessagesPerMonth: number;
    /** User seats included. */
    seats: number;
    /** Max personas per single sim (caps the tier choice in wizard). */
    maxPersonasPerSim: number;
  };
  /** Feature flags surfaced as ✓ / ✗ in the tier table. */
  features: {
    pdfDownload: boolean;
    csvExport: boolean;
    publicShareLinks: boolean;
    multiLLM: boolean;
    apiAccess: boolean;
    sso: boolean;
    auditLogs: boolean;
    crossProjectCompare: boolean;
  };
  /** Support tier. */
  support: { ko: string; en: string };
}

/**
 * Free trial — gates BOTH on a 7-day calendar window AND a sim quota
 * (default 1). Whichever comes first ends the trial. Tracked in
 * subscriptions.trial_ends_at + subscriptions.trial_sims_used. Free
 * trials never charge a card; the user has to actively upgrade to keep
 * using paid features.
 */
const FREE_TRIAL: PlanDefinition = {
  slug: "free_trial",
  name: "Free Trial",
  tagline: {
    ko: "가입만으로 7일 또는 시뮬 1건 무료 체험",
    en: "Free for 7 days or 1 simulation, whichever comes first",
  },
  selfServe: true,
  order: 0,
  priceMonthly: { usd: 0, krw: 0 },
  limits: {
    simsPerMonth: 1,
    decisionPlusSimsPerMonth: 0,
    deepSimsPerMonth: 0,
    deepProEnabled: false,
    chatMessagesPerMonth: 5,
    seats: 1,
    maxPersonasPerSim: 200,
  },
  features: {
    pdfDownload: false, // preview only
    csvExport: false,
    publicShareLinks: false,
    multiLLM: false,
    apiAccess: false,
    sso: false,
    auditLogs: false,
    crossProjectCompare: false,
  },
  support: { ko: "커뮤니티", en: "Community" },
};

// Pricing built from a 100% margin (price = worst-case LLM cost × 2) using
// per-tier ensemble cost: Hypothesis $0.90 / Consensus $4 / Consensus+ $36 /
// Triangulated $100 (5,000 personas, 5 internal sims × multi-LLM). All
// caps below assume the user maxes the highest-tier slots first.
const STARTER: PlanDefinition = {
  slug: "starter",
  name: "Starter",
  tagline: {
    ko: "월 5건 시뮬 (Consensus까지), 1 사용자",
    en: "5 sims/month (Consensus tier), 1 user",
  },
  selfServe: true,
  order: 1,
  // Worst case: 5 × Consensus = $20. 100% margin = $40 / ₩52,000.
  priceMonthly: { usd: 4000, krw: 5200000 },
  limits: {
    simsPerMonth: 5,
    decisionPlusSimsPerMonth: 0,
    deepSimsPerMonth: 0,
    deepProEnabled: false,
    chatMessagesPerMonth: 50,
    seats: 1,
    maxPersonasPerSim: 1000,
  },
  features: {
    pdfDownload: true,
    csvExport: true,
    publicShareLinks: true,
    multiLLM: false,
    apiAccess: false,
    sso: false,
    auditLogs: false,
    crossProjectCompare: false,
  },
  support: { ko: "이메일 (48시간)", en: "Email (48h)" },
};

const VALIDATOR: PlanDefinition = {
  slug: "validator",
  name: "Validator",
  tagline: {
    ko: "월 10건 시뮬 (Consensus+ 3건 포함), 1 사용자",
    en: "10 sims/month (incl. 3 Consensus+), 1 user",
  },
  selfServe: true,
  order: 2,
  // Worst case: 3 × Consensus+ + 7 × Consensus = $108 + $28 = $136.
  // 100% margin = $272 / ₩360,000.
  priceMonthly: { usd: 27200, krw: 36000000 },
  limits: {
    simsPerMonth: 10,
    decisionPlusSimsPerMonth: 3,
    deepSimsPerMonth: 0,
    deepProEnabled: false,
    chatMessagesPerMonth: 200,
    seats: 1,
    maxPersonasPerSim: 3000,
  },
  features: {
    pdfDownload: true,
    csvExport: true,
    publicShareLinks: true,
    multiLLM: false, // Triangulated still gated to Growth
    apiAccess: false,
    sso: false,
    auditLogs: false,
    crossProjectCompare: false,
  },
  support: { ko: "이메일 (36시간)", en: "Email (36h)" },
};

const GROWTH: PlanDefinition = {
  slug: "growth",
  name: "Growth",
  tagline: {
    ko: "월 20건 시뮬 (Triangulated 3건 + Consensus+ 5건 포함), 멀티 LLM, 3 사용자",
    en: "20 sims/month (incl. 3 Triangulated + 5 Consensus+), multi-LLM, 3 users",
  },
  selfServe: true,
  order: 3,
  // Worst case: 3 × Triangulated + 5 × Consensus+ + 12 × Consensus
  // = $300 + $180 + $48 = $528. 100% margin = $1,056 / ₩1,400,000.
  priceMonthly: { usd: 105600, krw: 140000000 },
  limits: {
    simsPerMonth: 20,
    decisionPlusSimsPerMonth: 5,
    deepSimsPerMonth: 3,
    deepProEnabled: false,
    chatMessagesPerMonth: 500,
    seats: 3,
    maxPersonasPerSim: 5000,
  },
  features: {
    pdfDownload: true,
    csvExport: true,
    publicShareLinks: true,
    multiLLM: true,
    apiAccess: false,
    sso: false,
    auditLogs: false,
    crossProjectCompare: true,
  },
  support: { ko: "이메일 (24시간)", en: "Email (24h)" },
};

const ENTERPRISE: PlanDefinition = {
  slug: "enterprise",
  name: "Enterprise",
  tagline: {
    ko: "무제한 시뮬, 심층분석 Pro, SSO, 전담 CSM",
    en: "Unlimited sims, Triangulated Pro, SSO, dedicated CSM",
  },
  selfServe: false,
  order: 3,
  priceMonthly: { usd: null, krw: null }, // contact sales
  limits: {
    simsPerMonth: -1,
    decisionPlusSimsPerMonth: -1,
    deepSimsPerMonth: -1,
    deepProEnabled: true,
    chatMessagesPerMonth: -1,
    seats: 10,
    maxPersonasPerSim: 10000,
  },
  features: {
    pdfDownload: true,
    csvExport: true,
    publicShareLinks: true,
    multiLLM: true,
    apiAccess: true,
    sso: true,
    auditLogs: true,
    crossProjectCompare: true,
  },
  support: { ko: "전담 CSM + 99.9% SLA", en: "Dedicated CSM + 99.9% SLA" },
};

export const PLANS: Record<PlanSlug, PlanDefinition> = {
  free_trial: FREE_TRIAL,
  starter: STARTER,
  validator: VALIDATOR,
  growth: GROWTH,
  enterprise: ENTERPRISE,
};

/** All plans in ascending tier order, suitable for direct iteration in UI. */
export const ALL_PLANS: PlanDefinition[] = (
  Object.values(PLANS) as PlanDefinition[]
).sort((a, b) => a.order - b.order);

/** Self-serve tiers only (excludes Enterprise contact-sales tier). */
export const SELF_SERVE_PLANS: PlanDefinition[] = ALL_PLANS.filter(
  (p) => p.selfServe,
);

export function getPlan(slug: string): PlanDefinition {
  if (slug in PLANS) return PLANS[slug as PlanSlug];
  // Unknown slug from a corrupted DB row — treat as free_trial so the
  // user keeps minimum access while we surface the error in admin.
  return FREE_TRIAL;
}

/**
 * Annual price = monthly × 10 (i.e. 2 months free, 16.7% discount).
 * Returns null when the underlying monthly price is null (e.g. enterprise).
 */
export function annualPrice(p: PlanDefinition, currency: "usd" | "krw"): number | null {
  const monthly = p.priceMonthly[currency];
  return monthly == null ? null : monthly * 10;
}

/**
 * Whether the workspace is currently allowed to start a sim of a given
 * tier under their plan. Caller must already have fetched usage counts
 * for the current billing month.
 */
export function canStartSim(opts: {
  plan: PlanDefinition;
  trialActive: boolean;
  trialSimsUsed: number;
  trialSimsLimit: number;
  monthSimsUsed: number;
  monthDecisionPlusSimsUsed: number;
  monthDeepSimsUsed: number;
  simTier: "hypothesis" | "decision" | "decision_plus" | "deep" | "deep_pro";
}): { allowed: true } | { allowed: false; reason: string } {
  const { plan, simTier } = opts;
  // deep_pro is gated to plans that explicitly enable it (Enterprise only).
  if (simTier === "deep_pro" && !plan.limits.deepProEnabled) {
    return { allowed: false, reason: "deep_pro_requires_enterprise" };
  }
  // deep tier (multi-LLM) requires Growth+ on quota and any plan with multiLLM.
  if (simTier === "deep" && !plan.features.multiLLM) {
    return { allowed: false, reason: "deep_requires_growth" };
  }
  // decision_plus (Consensus+) is gated by its own per-month quota — plans
  // that don't include it set decisionPlusSimsPerMonth: 0 to block entry.
  if (
    simTier === "decision_plus" &&
    plan.limits.decisionPlusSimsPerMonth === 0
  ) {
    return { allowed: false, reason: "decision_plus_requires_validator" };
  }
  // Free trial path: gated on either time window OR sim quota.
  if (plan.slug === "free_trial") {
    if (!opts.trialActive) return { allowed: false, reason: "trial_expired" };
    if (opts.trialSimsUsed >= opts.trialSimsLimit) {
      return { allowed: false, reason: "trial_sim_quota_exhausted" };
    }
    return { allowed: true };
  }
  // Paid plans: check monthly quotas (-1 means unlimited).
  if (plan.limits.simsPerMonth >= 0 && opts.monthSimsUsed >= plan.limits.simsPerMonth) {
    return { allowed: false, reason: "month_sim_quota_exhausted" };
  }
  if (
    simTier === "decision_plus" &&
    plan.limits.decisionPlusSimsPerMonth >= 0 &&
    opts.monthDecisionPlusSimsUsed >= plan.limits.decisionPlusSimsPerMonth
  ) {
    return { allowed: false, reason: "month_decision_plus_quota_exhausted" };
  }
  if (
    simTier === "deep" &&
    plan.limits.deepSimsPerMonth >= 0 &&
    opts.monthDeepSimsUsed >= plan.limits.deepSimsPerMonth
  ) {
    return { allowed: false, reason: "month_deep_quota_exhausted" };
  }
  return { allowed: true };
}

/**
 * Format a price for display. Returns null when the input is null
 * (Enterprise contact-sales). KRW drops decimal portion since the
 * minor unit isn't used in real life.
 */
export function formatPlanPrice(
  cents: number | null,
  currency: "usd" | "krw",
): string | null {
  if (cents == null) return null;
  if (currency === "krw") {
    // We store KRW × 100 to keep integer math symmetric with Stripe;
    // strip the decimal entirely on display.
    const won = Math.round(cents / 100);
    return `₩${won.toLocaleString("en-US")}`;
  }
  // USD: standard cents → dollars.
  const dollars = cents / 100;
  return `$${dollars.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

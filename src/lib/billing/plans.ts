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

/** Simulation depth tier — shared by canStartSim and single-purchase packs. */
export type SimTier =
  | "hypothesis"
  | "decision"
  | "decision_plus"
  | "deep"
  | "deep_pro";

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
    /** Subset of simsPerMonth that can be Consensus Plus tier. 0 = no Consensus Plus.
     * Consensus Plus runs 3 internal sims at 3,000 personas each — far costlier
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
  name: "베타 무료 체험",
  tagline: {
    ko: "베타 기간 — 7일 또는 초기검증 2회 무료 체험",
    en: "Beta — free for 7 days or 2 simulations, whichever comes first",
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

// Pricing reflects 2026-05-28 cost re-baseline after sim spec change.
// Tier config source of truth = packages/shared/src/simulation/orchestrator.ts:
//   Hypothesis    3 sims × 200 × multi-LLM (anth+oai+ds) = $3-5
//   Consensus     6 sims × 200 × multi-LLM (anth+oai+ds) = $25 (was 5-sim/$14)
//   Consensus Plus   15 sims × 200 × multi-LLM (anth+oai+ds) = $45
//   Triangulated 25 sims × 200 × multi-LLM (anth+oai+ds) = $60
//   Tri. Pro     50 sims × 200 × multi-LLM (anth+oai+gem) = $90
//
// User-set tier prices ₩500k / ₩1.5M / ₩3.5M (and $399 / $999 / $2,299)
// — implied margin sits between cost × 4 (Starter worst case 5×$25=$125
// → $399) and cost × 5 (Growth worst case 3×$60+5×$45+12×$25=$705
// → ~$3,525 at cost×5 budget; capped at $2,299 to keep tier ladder sane).
// Triangulated Pro is Enterprise-exclusive — not surfaced on public pricing.
const STARTER: PlanDefinition = {
  slug: "starter",
  name: "Starter",
  tagline: {
    ko: "월 5건 검증분석 (Consensus), 1 사용자",
    en: "5 Consensus sims/month, 1 user",
  },
  selfServe: true,
  order: 1,
  // Worst case: 5 × Consensus = $125. Price = $399 / ₩500,000.
  priceMonthly: { usd: 39900, krw: 50000000 },
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
    ko: "월 10건 (검증분석 Plus 3건 포함), 1 사용자",
    en: "10 sims/month (incl. 3 Consensus Plus), 1 user",
  },
  selfServe: true,
  order: 2,
  // Worst case: 3 × Consensus Plus + 7 × Consensus = $135 + $175 = $310.
  // Price = $999 / ₩1,500,000.
  priceMonthly: { usd: 99900, krw: 150000000 },
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
    ko: "월 20건 (심층분석 3건 + 검증분석 Plus 5건 포함), 3 사용자",
    en: "20 sims/month (incl. 3 Triangulated + 5 Consensus Plus), 3 users",
  },
  selfServe: true,
  order: 3,
  // Worst case: 3 × Triangulated + 5 × Consensus Plus + 12 × Consensus
  // = $180 + $225 + $300 = $705. Price = $2,299 / ₩3,500,000.
  priceMonthly: { usd: 229900, krw: 350000000 },
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

/**
 * Single-purchase packs — pay-per-simulation "1회권" for users who don't
 * want a monthly subscription. One pack = one ensemble run at the given
 * tier. Prices sit intentionally ABOVE the subscription per-sim rate so a
 * heavy user is nudged to subscribe (e.g. decision 1회권 $99 vs Starter's
 * $399/5 = $79.8/sim → +24%); hypothesis is a low-friction tripwire.
 *
 * Pricing (cost/run → 1회권, ~4× margin):
 *   hypothesis     $3-5  → $49  / ₩69,000   (tripwire)
 *   decision       $25   → $99  / ₩139,000
 *   decision_plus  $45   → $199 / ₩279,000
 *   deep           $60   → $249 / ₩349,000
 *   deep_pro       $90   → $399 / ₩559,000
 *
 * LIVE (KRW): inquiryOnly = false — the KRW CTA routes to the NicePay 단건결제
 * checkout (/api/billing/nice/checkout accepts a `pack` slug), and a paid pack
 * grants ONE sim_entitlements row of that tier, consumed on the next matching
 * run-ensemble. USD packs stay inquiry-only until Stripe pack checkout lands.
 * Set inquiryOnly = true again to fall back to the 사전 문의 mailto.
 *
 * Price convention matches PlanDefinition.priceMonthly: USD cents, KRW × 100.
 */
export interface SinglePurchasePack {
  slug: string;
  /** Which sim tier one purchase unlocks (a single ensemble run). */
  tier: SimTier;
  name: { ko: string; en: string };
  tagline: { ko: string; en: string };
  /** Listing order, ascending = cheaper/lower tier. */
  order: number;
  /** One-time price. cents in the indicated currency (KRW × 100). */
  price: { usd: number; krw: number };
  /** Beta: route CTA to 사전 문의 instead of self-serve checkout. */
  inquiryOnly: boolean;
}

const SINGLE_PACK_HYPOTHESIS: SinglePurchasePack = {
  slug: "pack_hypothesis",
  tier: "hypothesis",
  name: { ko: "초기검증 1회권", en: "Hypothesis single run" },
  tagline: {
    ko: "초기검증(Hypothesis) 시뮬 1회 — 빠른 방향 점검",
    en: "One Hypothesis simulation — a fast directional check",
  },
  order: 1,
  price: { usd: 4900, krw: 6900000 },
  inquiryOnly: false,
};

const SINGLE_PACK_DECISION: SinglePurchasePack = {
  slug: "pack_decision",
  tier: "decision",
  name: { ko: "검증분석 1회권", en: "Consensus single run" },
  tagline: {
    ko: "검증분석(Consensus) 시뮬 1회 — 멀티 LLM 합의",
    en: "One Consensus simulation — multi-LLM consensus",
  },
  order: 2,
  price: { usd: 9900, krw: 13900000 },
  inquiryOnly: false,
};

const SINGLE_PACK_DECISION_PLUS: SinglePurchasePack = {
  slug: "pack_decision_plus",
  tier: "decision_plus",
  name: { ko: "검증분석 Plus 1회권", en: "Consensus Plus single run" },
  tagline: {
    ko: "검증분석 Plus(Consensus Plus) 시뮬 1회 — 확장 표본",
    en: "One Consensus Plus simulation — expanded sample",
  },
  order: 3,
  price: { usd: 19900, krw: 27900000 },
  inquiryOnly: false,
};

const SINGLE_PACK_DEEP: SinglePurchasePack = {
  slug: "pack_deep",
  tier: "deep",
  name: { ko: "심층분석 1회권", en: "Triangulated single run" },
  tagline: {
    ko: "심층분석(Triangulated) 시뮬 1회 — 대규모 삼각검증",
    en: "One Triangulated simulation — large-scale triangulation",
  },
  order: 4,
  price: { usd: 24900, krw: 34900000 },
  inquiryOnly: false,
};

// 심층분석 Pro(deep_pro)는 아직 미릴리즈 — 단건 이용권에서 제외.
// 릴리즈 시 pack 정의를 추가하고 아래 배열에 넣으면 됨 (order: 5, $399 / ₩559,000).

/** All single-purchase packs in ascending tier order. */
export const SINGLE_PURCHASE_PACKS: SinglePurchasePack[] = [
  SINGLE_PACK_HYPOTHESIS,
  SINGLE_PACK_DECISION,
  SINGLE_PACK_DECISION_PLUS,
  SINGLE_PACK_DEEP,
].sort((a, b) => a.order - b.order);

/** Single-purchase packs keyed by slug (pack_hypothesis … pack_deep). */
export const PACK_BY_SLUG: Record<string, SinglePurchasePack> = Object.fromEntries(
  SINGLE_PURCHASE_PACKS.map((p) => [p.slug, p]),
);
/** Returns the pack for a slug, or null if it isn't a single-purchase pack. */
export function getSinglePack(slug: string): SinglePurchasePack | null {
  return PACK_BY_SLUG[slug] ?? null;
}
/** True when `slug` identifies a single-purchase pack (vs a subscription plan). */
export function isPackSlug(slug: string): boolean {
  return slug in PACK_BY_SLUG;
}

/**
 * 오픈 베타 여부. **기본 ON** — 결제를 켜려면 `NEXT_PUBLIC_OPEN_BETA=off`로 명시.
 * ON이면 모든 결제 UI/CTA를 감추고 "베타 무료" 상태로 노출하며, checkout·upgrade
 * 진입을 차단한다(실제 청구 없음). 시뮬 실행 한도(무료체험)는 그대로 유지된다.
 */
export function isOpenBeta(): boolean {
  return process.env.NEXT_PUBLIC_OPEN_BETA !== "off";
}

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
  simTier: SimTier;
  /**
   * 단건결제(자동갱신 없음) 이용기간이 만료됐는지. trialActive처럼 시간 판정은
   * 호출부에서 계산해 넘긴다. true면 일일 만료 cron이 아직 강등하지 않았더라도
   * 유료 시뮬을 차단한다. 정기결제(자동갱신)는 갱신 lag에 막으면 안 되므로 이
   * 플래그는 단건일 때만 true로 넘긴다.
   */
  singlePaymentExpired?: boolean;
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
  // decision_plus (Consensus Plus) is gated by its own per-month quota — plans
  // that don't include it set decisionPlusSimsPerMonth: 0 to block entry.
  if (
    simTier === "decision_plus" &&
    plan.limits.decisionPlusSimsPerMonth === 0
  ) {
    return { allowed: false, reason: "decision_plus_requires_validator" };
  }
  // Free trial path: hypothesis(초기검증) tier ONLY, gated on time window
  // OR sim quota. Restricting the tier keeps the free run's cost bounded
  // (~$3-5) — without this, a trial user could pick Consensus(~$25)+ for
  // free, blowing per-user cost (e.g. for the 「링크업」 program).
  if (plan.slug === "free_trial") {
    if (simTier !== "hypothesis") {
      return { allowed: false, reason: "trial_tier_hypothesis_only" };
    }
    if (!opts.trialActive) return { allowed: false, reason: "trial_expired" };
    if (opts.trialSimsUsed >= opts.trialSimsLimit) {
      return { allowed: false, reason: "trial_sim_quota_exhausted" };
    }
    return { allowed: true };
  }
  // 단건결제 만료 — 일일 cron이 free_trial로 강등하기 전이라도(최대 ~24h lag)
  // plan은 아직 유료라 quota 검사를 통과해버린다. 만료됐으면 여기서 차단해
  // 재결제를 유도한다. (정기결제는 호출부에서 이 플래그를 false로 넘긴다.)
  if (opts.singlePaymentExpired) {
    return { allowed: false, reason: "single_payment_expired" };
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

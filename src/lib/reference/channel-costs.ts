/**
 * Channel cost reference data — curated typical ad-buying costs by
 * country × channel × category. Used as grounding for the country-
 * ranking LLM's `cacEstimateUsd` field so estimates anchor on real
 * industry benchmarks instead of free-styled numbers.
 *
 * Structure (multiplicative model — keeps maintenance tractable):
 *
 *   country_cost_index[code]              relative ad-buying cost vs US
 *                                         baseline (US = 1.00). Captures
 *                                         PPP, ad-market maturity, and
 *                                         audience purchasing power.
 *
 *   channel_category_matrix[ch][cat]      US baseline {cpmUsd, cpcUsd,
 *                                         ctrPct, cvrPct} median values.
 *                                         Country cost for the same
 *                                         tuple = baseline × country_index.
 *
 *   local_channel_overrides[code]         per-country exceptions where a
 *                                         local channel dominates (Naver
 *                                         in KR, LINE in JP, WeChat in
 *                                         CN). Listed alongside the
 *                                         global subset that's available.
 *
 * Sources (2024-2025 medians, refresh annually):
 *   - WordStream Industry Benchmarks 2024 (US baseline)
 *   - LocaliQ Search Advertising Benchmarks 2024
 *   - Statista Digital Advertising Outlook 2024-2025
 *   - Meta / Google quarterly investor calls (CPM trends)
 *   - IAB regional reports (EMEA, APAC)
 *   - Country indices cross-checked against PPP (World Bank) and
 *     digital-ad-spend per capita (eMarketer)
 *
 * IMPORTANT — these are MEDIANS for the recommended channel mix in
 * each category. Actual CAC for a specific brand varies ±50-100%
 * with creative quality, audience targeting, season, and competition
 * within the category. Treat the LLM's grounded estimate as a
 * reasonable benchmark, not a guarantee.
 */

// ─── Country cost index ──────────────────────────────────────────
// US = 1.00 baseline. Higher = more expensive ad inventory; lower =
// cheaper. Derived from CPM averages per platform per country
// (Meta + Google) cross-checked against PPP for sanity.
export interface CountryCostIndex {
  /** Multiplier vs US baseline. Range typically 0.15-1.15. */
  index: number;
  /** Optional country-specific note (e.g. VPN-blocked, fragmented market). */
  note?: string;
}

export const COUNTRY_COST_INDEX: Record<string, CountryCostIndex> = {
  // Tier 1 — at or above US (mature, premium audiences, high competition)
  US: { index: 1.0, note: "Baseline — Meta + Google blended median" },
  AU: { index: 1.05, note: "Frequently slightly above US on Meta CPM" },
  GB: { index: 0.95 },
  CA: { index: 0.9 },
  SG: { index: 0.95, note: "Small market but high-CPM expat / affluent local audience" },

  // Tier 2 — Western Europe + mature APAC
  DE: { index: 0.85 },
  NL: { index: 0.85, note: "Small audience but high spending power" },
  JP: { index: 0.85, note: "Mature; LINE/Yahoo dominate alongside Meta/Google" },
  FR: { index: 0.75 },
  AE: { index: 0.75, note: "Premium expat audiences; smaller national volume" },
  KR: { index: 0.65, note: "Naver + Kakao native; Meta/Google second-tier" },
  IT: { index: 0.65 },
  TW: { index: 0.6 },
  ES: { index: 0.6 },
  SA: { index: 0.55 },

  // Tier 3 — Latin America + lower-cost Asia
  BR: { index: 0.45 },
  MX: { index: 0.45 },
  CN: { index: 0.45, note: "Western channels VPN-blocked; index reflects WeChat/Douyin baseline" },
  MY: { index: 0.4 },
  TH: { index: 0.4 },

  // Tier 4 — high-volume emerging markets (cheap inventory, lower spending power)
  PH: { index: 0.3 },
  ID: { index: 0.3 },
  VN: { index: 0.25 },
  IN: { index: 0.2, note: "Massive scale, lowest CPM among 24 candidates" },
};

// ─── Channels (9 — matches the user's curated list) ──────────────
// Note: X removed (low B2C efficiency, sparse data); Yahoo Japan
// dropped for LINE in local overrides; Snapchat included.
export const CHANNELS = [
  "meta",          // Instagram + Facebook combined (Meta Ads Manager view)
  "googleSearch",  // Search ads (intent capture)
  "googleDisplay", // GDN display ads
  "youtube",       // In-stream + YouTube Shorts
  "tiktok",        // TikTok Ads (in-feed + Spark Ads)
  "amazon",        // Amazon Sponsored Products + DSP
  "pinterest",     // Pinterest Promoted Pins
  "linkedin",      // LinkedIn Sponsored Content (B2B-skewed)
  "snapchat",      // Snap Ads (US/UK/IN strong; APAC sparse)
  "reddit",        // Reddit Promoted Posts (community-fit dependent)
] as const;
export type Channel = (typeof CHANNELS)[number];

// ─── Categories (8 — matches the system's product categories) ────
// Drops "other" which falls back to a category-weighted average.
export const COST_CATEGORIES = [
  "beauty",
  "fashion",
  "food",
  "health",
  "electronics",
  "saas",
  "home",
  "ip",
] as const;
export type CostCategory = (typeof COST_CATEGORIES)[number];

export interface CostMetrics {
  /** USD cost per 1000 impressions, US baseline median. */
  cpmUsd: number;
  /** USD cost per click, US baseline median (when applicable; null for CPM-only channels). */
  cpcUsd: number | null;
  /** Typical click-through rate (%, US baseline median). */
  ctrPct: number;
  /** Typical conversion rate (% of clicks → action, US baseline median). */
  cvrPct: number;
}

/**
 * US baseline {cpm, cpc, ctr, cvr} per channel × category. Channel
 * cost in country X = country_index × these values for cpm/cpc; CTR
 * and CVR are treated as channel-and-category-bound (less geo-
 * sensitive than cost).
 *
 * Numbers reflect 2024-2025 industry medians from WordStream + Meta
 * Reporting + Google Ads Reach Planner, with category sub-segment
 * adjustments where the segments diverge meaningfully (e.g. SaaS CPC
 * is much higher than CPG due to bidding competition on intent
 * keywords).
 */
export const CHANNEL_CATEGORY_MATRIX: Record<Channel, Record<CostCategory, CostMetrics>> = {
  // ── Meta (IG + FB) — broad reach, mid-funnel discovery ──
  meta: {
    beauty:      { cpmUsd: 12, cpcUsd: 1.2, ctrPct: 1.4, cvrPct: 4.5 },
    fashion:     { cpmUsd: 11, cpcUsd: 1.0, ctrPct: 1.5, cvrPct: 4.0 },
    food:        { cpmUsd: 10, cpcUsd: 0.9, ctrPct: 1.3, cvrPct: 3.8 },
    health:      { cpmUsd: 14, cpcUsd: 1.6, ctrPct: 1.2, cvrPct: 3.2 },
    electronics: { cpmUsd: 13, cpcUsd: 1.4, ctrPct: 1.0, cvrPct: 2.8 },
    saas:        { cpmUsd: 16, cpcUsd: 3.5, ctrPct: 0.9, cvrPct: 2.2 },
    home:        { cpmUsd: 11, cpcUsd: 1.1, ctrPct: 1.2, cvrPct: 3.0 },
    ip:          { cpmUsd: 9,  cpcUsd: 0.7, ctrPct: 1.8, cvrPct: 4.5 },
  },

  // ── Google Search — high-intent, expensive CPC ──
  googleSearch: {
    beauty:      { cpmUsd: 0,  cpcUsd: 1.4, ctrPct: 5.0, cvrPct: 4.5 },
    fashion:     { cpmUsd: 0,  cpcUsd: 1.2, ctrPct: 5.5, cvrPct: 4.0 },
    food:        { cpmUsd: 0,  cpcUsd: 1.0, ctrPct: 5.0, cvrPct: 4.0 },
    health:      { cpmUsd: 0,  cpcUsd: 2.6, ctrPct: 4.5, cvrPct: 3.5 },
    electronics: { cpmUsd: 0,  cpcUsd: 1.7, ctrPct: 4.0, cvrPct: 3.5 },
    saas:        { cpmUsd: 0,  cpcUsd: 4.2, ctrPct: 3.5, cvrPct: 3.0 },
    home:        { cpmUsd: 0,  cpcUsd: 1.6, ctrPct: 4.5, cvrPct: 3.5 },
    ip:          { cpmUsd: 0,  cpcUsd: 0.8, ctrPct: 5.5, cvrPct: 4.0 },
  },

  // ── Google Display — display network, low-intent ──
  googleDisplay: {
    beauty:      { cpmUsd: 4,  cpcUsd: 0.6, ctrPct: 0.6, cvrPct: 1.5 },
    fashion:     { cpmUsd: 4,  cpcUsd: 0.55, ctrPct: 0.6, cvrPct: 1.4 },
    food:        { cpmUsd: 3,  cpcUsd: 0.5, ctrPct: 0.5, cvrPct: 1.4 },
    health:      { cpmUsd: 4.5, cpcUsd: 0.7, ctrPct: 0.5, cvrPct: 1.2 },
    electronics: { cpmUsd: 4,  cpcUsd: 0.6, ctrPct: 0.5, cvrPct: 1.0 },
    saas:        { cpmUsd: 5,  cpcUsd: 1.2, ctrPct: 0.4, cvrPct: 0.8 },
    home:        { cpmUsd: 4,  cpcUsd: 0.55, ctrPct: 0.5, cvrPct: 1.2 },
    ip:          { cpmUsd: 3,  cpcUsd: 0.4, ctrPct: 0.7, cvrPct: 1.5 },
  },

  // ── YouTube — video ads, mid-funnel awareness ──
  youtube: {
    beauty:      { cpmUsd: 8,  cpcUsd: null, ctrPct: 0.6, cvrPct: 1.8 },
    fashion:     { cpmUsd: 7,  cpcUsd: null, ctrPct: 0.65, cvrPct: 1.6 },
    food:        { cpmUsd: 6,  cpcUsd: null, ctrPct: 0.5, cvrPct: 1.5 },
    health:      { cpmUsd: 9,  cpcUsd: null, ctrPct: 0.5, cvrPct: 1.3 },
    electronics: { cpmUsd: 8,  cpcUsd: null, ctrPct: 0.45, cvrPct: 1.2 },
    saas:        { cpmUsd: 11, cpcUsd: null, ctrPct: 0.4, cvrPct: 1.0 },
    home:        { cpmUsd: 7,  cpcUsd: null, ctrPct: 0.5, cvrPct: 1.3 },
    ip:          { cpmUsd: 5,  cpcUsd: null, ctrPct: 0.8, cvrPct: 2.0 },
  },

  // ── TikTok — high engagement, younger skew, viral upside ──
  tiktok: {
    beauty:      { cpmUsd: 10, cpcUsd: 1.0, ctrPct: 1.6, cvrPct: 3.2 },
    fashion:     { cpmUsd: 9,  cpcUsd: 0.9, ctrPct: 1.8, cvrPct: 3.0 },
    food:        { cpmUsd: 8,  cpcUsd: 0.8, ctrPct: 1.5, cvrPct: 2.8 },
    health:      { cpmUsd: 11, cpcUsd: 1.3, ctrPct: 1.3, cvrPct: 2.4 },
    electronics: { cpmUsd: 10, cpcUsd: 1.1, ctrPct: 1.2, cvrPct: 2.0 },
    saas:        { cpmUsd: 12, cpcUsd: 2.5, ctrPct: 1.0, cvrPct: 1.5 },
    home:        { cpmUsd: 9,  cpcUsd: 0.9, ctrPct: 1.4, cvrPct: 2.4 },
    ip:          { cpmUsd: 6,  cpcUsd: 0.5, ctrPct: 2.5, cvrPct: 4.0 },
  },

  // ── Amazon Ads — bottom-funnel, marketplace-bound ──
  amazon: {
    beauty:      { cpmUsd: 0,  cpcUsd: 1.1, ctrPct: 0.4, cvrPct: 9.0 },
    fashion:     { cpmUsd: 0,  cpcUsd: 0.9, ctrPct: 0.4, cvrPct: 8.0 },
    food:        { cpmUsd: 0,  cpcUsd: 0.85, ctrPct: 0.4, cvrPct: 9.5 },
    health:      { cpmUsd: 0,  cpcUsd: 1.3, ctrPct: 0.4, cvrPct: 8.5 },
    electronics: { cpmUsd: 0,  cpcUsd: 0.95, ctrPct: 0.5, cvrPct: 7.5 },
    saas:        { cpmUsd: 0,  cpcUsd: 2.5, ctrPct: 0.3, cvrPct: 4.0 },
    home:        { cpmUsd: 0,  cpcUsd: 0.85, ctrPct: 0.4, cvrPct: 8.5 },
    ip:          { cpmUsd: 0,  cpcUsd: 0.7, ctrPct: 0.5, cvrPct: 7.0 },
  },

  // ── Pinterest — discovery-led, female-skewed; strong for home/beauty/fashion ──
  pinterest: {
    beauty:      { cpmUsd: 7,  cpcUsd: 0.7, ctrPct: 0.9, cvrPct: 2.5 },
    fashion:     { cpmUsd: 7,  cpcUsd: 0.65, ctrPct: 1.0, cvrPct: 2.2 },
    food:        { cpmUsd: 6,  cpcUsd: 0.55, ctrPct: 0.8, cvrPct: 2.0 },
    health:      { cpmUsd: 8,  cpcUsd: 0.85, ctrPct: 0.7, cvrPct: 1.8 },
    electronics: { cpmUsd: 7,  cpcUsd: 0.75, ctrPct: 0.6, cvrPct: 1.5 },
    saas:        { cpmUsd: 9,  cpcUsd: 1.5, ctrPct: 0.5, cvrPct: 1.0 },
    home:        { cpmUsd: 6,  cpcUsd: 0.6, ctrPct: 1.1, cvrPct: 2.5 },
    ip:          { cpmUsd: 6,  cpcUsd: 0.55, ctrPct: 1.2, cvrPct: 2.4 },
  },

  // ── LinkedIn — B2B-skewed; very high CPC, low volume for B2C ──
  linkedin: {
    beauty:      { cpmUsd: 30, cpcUsd: 5.0, ctrPct: 0.4, cvrPct: 2.0 },
    fashion:     { cpmUsd: 30, cpcUsd: 5.0, ctrPct: 0.4, cvrPct: 2.0 },
    food:        { cpmUsd: 30, cpcUsd: 5.5, ctrPct: 0.4, cvrPct: 2.0 },
    health:      { cpmUsd: 32, cpcUsd: 6.0, ctrPct: 0.4, cvrPct: 2.0 },
    electronics: { cpmUsd: 30, cpcUsd: 5.5, ctrPct: 0.4, cvrPct: 2.0 },
    saas:        { cpmUsd: 35, cpcUsd: 8.0, ctrPct: 0.5, cvrPct: 3.0 },
    home:        { cpmUsd: 30, cpcUsd: 5.0, ctrPct: 0.4, cvrPct: 2.0 },
    ip:          { cpmUsd: 28, cpcUsd: 4.5, ctrPct: 0.4, cvrPct: 2.0 },
  },

  // ── Snapchat — younger US/UK/IN audiences; AR/lens features for beauty/fashion ──
  snapchat: {
    beauty:      { cpmUsd: 6,  cpcUsd: 0.7, ctrPct: 1.2, cvrPct: 2.5 },
    fashion:     { cpmUsd: 6,  cpcUsd: 0.65, ctrPct: 1.3, cvrPct: 2.4 },
    food:        { cpmUsd: 5,  cpcUsd: 0.55, ctrPct: 1.0, cvrPct: 2.0 },
    health:      { cpmUsd: 7,  cpcUsd: 0.85, ctrPct: 0.9, cvrPct: 1.8 },
    electronics: { cpmUsd: 6,  cpcUsd: 0.75, ctrPct: 0.8, cvrPct: 1.6 },
    saas:        { cpmUsd: 8,  cpcUsd: 1.5, ctrPct: 0.7, cvrPct: 1.2 },
    home:        { cpmUsd: 5,  cpcUsd: 0.6, ctrPct: 0.9, cvrPct: 1.8 },
    ip:          { cpmUsd: 4,  cpcUsd: 0.4, ctrPct: 1.6, cvrPct: 3.0 },
  },

  // ── Reddit — community-bound; works well for niche (electronics/saas/ip) ──
  reddit: {
    beauty:      { cpmUsd: 5,  cpcUsd: 0.4, ctrPct: 0.8, cvrPct: 2.0 },
    fashion:     { cpmUsd: 5,  cpcUsd: 0.4, ctrPct: 0.8, cvrPct: 1.8 },
    food:        { cpmUsd: 4,  cpcUsd: 0.35, ctrPct: 0.7, cvrPct: 1.8 },
    health:      { cpmUsd: 6,  cpcUsd: 0.55, ctrPct: 0.6, cvrPct: 1.6 },
    electronics: { cpmUsd: 5,  cpcUsd: 0.45, ctrPct: 1.0, cvrPct: 2.2 },
    saas:        { cpmUsd: 7,  cpcUsd: 0.9, ctrPct: 0.9, cvrPct: 2.0 },
    home:        { cpmUsd: 5,  cpcUsd: 0.45, ctrPct: 0.7, cvrPct: 1.8 },
    ip:          { cpmUsd: 4,  cpcUsd: 0.3, ctrPct: 1.5, cvrPct: 3.0 },
  },
};

// ─── Local channel overrides ─────────────────────────────────────
// Per-country channels that materially shift the ad mix vs the global
// defaults. Each entry adds (or replaces) channels for that country —
// the LLM is told these are the primary acquisition channels alongside
// (or instead of) global Meta/Google. Costs follow the same matrix
// model: cpm/cpc in USD baseline, scaled by country_cost_index.
export interface LocalChannel {
  /** Display name + short rationale. */
  name: string;
  /** US-equivalent CPM baseline (will be scaled by country_index). */
  cpmUsd: number;
  /** US-equivalent CPC baseline; null when channel is CPM-only. */
  cpcUsd: number | null;
  /** Typical CTR % (carries less geo-sensitivity than cost). */
  ctrPct: number;
  /** Typical CVR %. */
  cvrPct: number;
  /** Categories where this channel is particularly strong. */
  strongCategories: CostCategory[];
}

export const LOCAL_CHANNEL_OVERRIDES: Record<string, LocalChannel[]> = {
  KR: [
    {
      name: "Naver Search Ads",
      cpmUsd: 0,
      cpcUsd: 0.6,
      ctrPct: 4.5,
      cvrPct: 4.0,
      strongCategories: ["beauty", "fashion", "food", "health", "electronics", "home"],
    },
    {
      name: "Kakao Bizboard / Talk",
      cpmUsd: 4,
      cpcUsd: 0.4,
      ctrPct: 1.2,
      cvrPct: 2.5,
      strongCategories: ["beauty", "fashion", "food", "ip"],
    },
    {
      name: "Coupang Sponsored",
      cpmUsd: 0,
      cpcUsd: 0.7,
      ctrPct: 0.5,
      cvrPct: 9.0,
      strongCategories: ["beauty", "fashion", "food", "health", "electronics", "home"],
    },
  ],
  JP: [
    {
      name: "LINE Ads (Talk + Tap)",
      cpmUsd: 6,
      cpcUsd: 0.7,
      ctrPct: 1.0,
      cvrPct: 2.5,
      strongCategories: ["beauty", "fashion", "food", "ip"],
    },
    {
      name: "Rakuten Ads",
      cpmUsd: 0,
      cpcUsd: 0.9,
      ctrPct: 0.5,
      cvrPct: 7.0,
      strongCategories: ["beauty", "fashion", "food", "health", "electronics", "home"],
    },
  ],
  CN: [
    {
      name: "WeChat Moments / Mini Programs",
      cpmUsd: 5,
      cpcUsd: 0.45,
      ctrPct: 1.5,
      cvrPct: 3.0,
      strongCategories: ["beauty", "fashion", "food", "electronics", "ip"],
    },
    {
      name: "Douyin / Toutiao",
      cpmUsd: 4,
      cpcUsd: 0.4,
      ctrPct: 1.8,
      cvrPct: 3.2,
      strongCategories: ["beauty", "fashion", "food", "ip"],
    },
    {
      name: "Tmall / Taobao",
      cpmUsd: 0,
      cpcUsd: 0.55,
      ctrPct: 0.6,
      cvrPct: 8.5,
      strongCategories: ["beauty", "fashion", "food", "health", "electronics", "home"],
    },
  ],
  // Southeast Asia — Lazada + Shopee dominate marketplace ads
  ID: [
    { name: "Shopee Ads", cpmUsd: 0, cpcUsd: 0.4, ctrPct: 0.5, cvrPct: 7.0,
      strongCategories: ["beauty", "fashion", "food", "health", "electronics", "home"] },
    { name: "Lazada Sponsored", cpmUsd: 0, cpcUsd: 0.45, ctrPct: 0.5, cvrPct: 6.8,
      strongCategories: ["beauty", "fashion", "electronics", "home"] },
  ],
  TH: [
    { name: "Shopee Ads", cpmUsd: 0, cpcUsd: 0.4, ctrPct: 0.5, cvrPct: 7.5,
      strongCategories: ["beauty", "fashion", "food", "health", "electronics", "home"] },
    { name: "LINE Ads TH", cpmUsd: 5, cpcUsd: 0.5, ctrPct: 1.0, cvrPct: 2.5,
      strongCategories: ["beauty", "fashion", "food", "ip"] },
  ],
  VN: [
    { name: "Shopee Ads VN", cpmUsd: 0, cpcUsd: 0.3, ctrPct: 0.5, cvrPct: 7.0,
      strongCategories: ["beauty", "fashion", "food", "health", "electronics", "home"] },
    { name: "Zalo Ads", cpmUsd: 3, cpcUsd: 0.3, ctrPct: 1.2, cvrPct: 2.5,
      strongCategories: ["beauty", "fashion", "food", "ip"] },
  ],
  PH: [
    { name: "Shopee Ads PH", cpmUsd: 0, cpcUsd: 0.35, ctrPct: 0.5, cvrPct: 7.0,
      strongCategories: ["beauty", "fashion", "food", "health", "electronics", "home"] },
    { name: "Lazada Sponsored PH", cpmUsd: 0, cpcUsd: 0.4, ctrPct: 0.5, cvrPct: 6.5,
      strongCategories: ["beauty", "fashion", "electronics", "home"] },
  ],
  MY: [
    { name: "Shopee Ads MY", cpmUsd: 0, cpcUsd: 0.45, ctrPct: 0.5, cvrPct: 7.0,
      strongCategories: ["beauty", "fashion", "food", "health", "electronics", "home"] },
    { name: "Lazada Sponsored MY", cpmUsd: 0, cpcUsd: 0.5, ctrPct: 0.5, cvrPct: 6.5,
      strongCategories: ["beauty", "fashion", "electronics", "home"] },
  ],
};

/**
 * Resolve a project category string ("beauty" / "ip" / "other" / etc.)
 * to a CostCategory key. Unknown / "other" falls back to a sensible
 * mid-tier default ("home" — broad CTR/CVR, balanced channel mix).
 */
export function resolveCostCategory(category: string | null | undefined): CostCategory {
  if (!category) return "home";
  const lc = category.toLowerCase();
  return (COST_CATEGORIES.includes(lc as CostCategory) ? lc : "home") as CostCategory;
}

/**
 * Get the country cost index (multiplier vs US). Falls back to 0.7
 * for unknown countries — a moderately conservative middle.
 */
export function getCountryCostIndex(countryCode: string): CountryCostIndex {
  const upper = countryCode.toUpperCase();
  return COUNTRY_COST_INDEX[upper] ?? { index: 0.7, note: "unknown country, conservative fallback" };
}

/**
 * Build the LLM-prompt block for a given country × category. Lists
 * each global channel's scaled CPM/CPC + typical CTR/CVR, plus any
 * local channel overrides for the country. The LLM uses this as the
 * grounded basis for cacEstimateUsd instead of free-styling.
 */
export function buildChannelCostsBlock(
  countryCode: string,
  category: string | null | undefined,
): string {
  const idx = getCountryCostIndex(countryCode);
  const cat = resolveCostCategory(category);
  const lines: string[] = [];
  lines.push(
    `Channel ad costs for ${countryCode} (USD, scaled to country index ${idx.index.toFixed(2)} vs US baseline${idx.note ? `; ${idx.note}` : ""}). Category: ${cat}. CTR/CVR are channel/category typical medians, less geo-sensitive than cost.`,
  );
  lines.push("");
  lines.push("Global channels (scaled cost shown):");
  for (const ch of CHANNELS) {
    const m = CHANNEL_CATEGORY_MATRIX[ch][cat];
    const scaledCpm = m.cpmUsd > 0 ? `CPM $${(m.cpmUsd * idx.index).toFixed(2)}` : null;
    const scaledCpc =
      m.cpcUsd != null ? `CPC $${(m.cpcUsd * idx.index).toFixed(2)}` : null;
    const cost = [scaledCpm, scaledCpc].filter(Boolean).join(" · ");
    lines.push(`  - ${ch}: ${cost} · CTR ${m.ctrPct}% · CVR ${m.cvrPct}%`);
  }
  const locals = LOCAL_CHANNEL_OVERRIDES[countryCode.toUpperCase()] ?? [];
  if (locals.length > 0) {
    lines.push("");
    lines.push(`Local-dominant channels in ${countryCode} (often the primary mix for this market):`);
    for (const lc of locals) {
      const isStrong = lc.strongCategories.includes(cat);
      const scaledCpm = lc.cpmUsd > 0 ? `CPM $${(lc.cpmUsd * idx.index).toFixed(2)}` : null;
      const scaledCpc =
        lc.cpcUsd != null ? `CPC $${(lc.cpcUsd * idx.index).toFixed(2)}` : null;
      const cost = [scaledCpm, scaledCpc].filter(Boolean).join(" · ");
      lines.push(
        `  - ${lc.name}: ${cost} · CTR ${lc.ctrPct}% · CVR ${lc.cvrPct}%${isStrong ? " · STRONG fit" : ""}`,
      );
    }
  }
  return lines.join("\n");
}

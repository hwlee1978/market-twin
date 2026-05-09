/**
 * CAC benchmark reference — typical first-year DTC customer acquisition
 * cost ranges by category × market-tier × brand-stage. Used as a sanity
 * check on the persona-derived CAC computation in cac-from-personas.ts:
 * if our computed value lands wildly outside the relevant range, the
 * renderer flags the case so users see the discrepancy instead of
 * trusting a noisy number silently.
 *
 * This is NOT the source of truth for CAC — that's the persona
 * simulation. These ranges are anchors against industry reality.
 *
 * Numbers (USD, 2024-2025 medians) sourced from:
 *   - Shopify Plus DTC Benchmark Report 2024
 *   - Klaviyo Email + DTC Benchmarks 2024
 *   - eMarketer Cross-border Commerce Outlook 2024-2025
 *   - WordStream Industry Advertising Benchmarks 2024
 *   - Reforge SaaS Growth Benchmarks (SaaS-specific)
 *   - Public investor disclosures (Allbirds, Veja, Casper, On, Warby
 *     Parker, Glossier — cross-checked against category averages)
 *
 * Refresh annually alongside channel-costs.ts.
 *
 * Tier classification (matches COUNTRY_COST_INDEX in channel-costs.ts):
 *   - developed: index ≥ 0.6 (US, JP, GB, FR, AU, SG, KR, TW, IT, ES,
 *     DE, NL, AE, SA, CA)
 *   - emerging: index < 0.6 (BR, MX, CN, MY, TH, PH, ID, VN, IN)
 *
 * Brand stage:
 *   - newBrand: cross-border export entry, no local recognition. The
 *     primary case for this product (B2B SaaS for K-product overseas
 *     validation). Higher CAC due to awareness gap.
 *   - establishedDTC: brand operates in domestic market with built-up
 *     review depth, organic search demand, peer-of-peer trust. Used
 *     when originatingCountry === candidateCountry.
 *
 * Range semantics:
 *   - [low, high] is the inter-quartile-style band (~25th-75th
 *     percentile of comparable launches). Below low = exceptional
 *     execution / niche category fit. Above high = trust gap, premium
 *     positioning friction, or unviable economics.
 */

export type CacMarketTier = "developed" | "emerging";
export type CacBrandStage = "newBrand" | "establishedDTC";

interface BenchmarkRange {
  /** Lower band — typical efficient launch (USD). */
  low: number;
  /** Upper band — typical effortful launch (USD). */
  high: number;
}

interface CategoryBenchmarks {
  developed: Record<CacBrandStage, BenchmarkRange>;
  emerging: Record<CacBrandStage, BenchmarkRange>;
  /** Why this category is what it is — surfaced in cacRationale prose
   *  to ground the numbers (e.g. "fashion premium DTC carries higher
   *  CAC due to need for editorial proof + visual content"). */
  note: string;
}

export const CAC_BENCHMARKS: Record<string, CategoryBenchmarks> = {
  fashion: {
    developed: {
      newBrand:        { low: 60, high: 120 },
      establishedDTC:  { low: 40, high: 80 },
    },
    emerging: {
      newBrand:        { low: 25, high: 60 },
      establishedDTC:  { low: 15, high: 35 },
    },
    note: "Fashion DTC requires visual proof + style validation. Premium positioning ($80+ AOV) sits at the upper band; volume-fashion (under $40 AOV) at lower.",
  },
  beauty: {
    developed: {
      newBrand:        { low: 35, high: 80 },
      establishedDTC:  { low: 25, high: 50 },
    },
    emerging: {
      newBrand:        { low: 15, high: 40 },
      establishedDTC:  { low: 10, high: 25 },
    },
    note: "K-beauty halo materially shrinks awareness gap in JP/SE Asia → lean toward lower band. Standalone unknown brand → mid-to-upper.",
  },
  food: {
    developed: {
      newBrand:        { low: 40, high: 90 },
      establishedDTC:  { low: 25, high: 60 },
    },
    emerging: {
      newBrand:        { low: 18, high: 45 },
      establishedDTC:  { low: 12, high: 28 },
    },
    note: "Food cross-border faces customs + perishability friction; subscription/repeat models amortize CAC over LTV → first-purchase CAC is higher than apparent unit economics.",
  },
  health: {
    developed: {
      newBrand:        { low: 50, high: 130 },
      establishedDTC:  { low: 35, high: 80 },
    },
    emerging: {
      newBrand:        { low: 22, high: 55 },
      establishedDTC:  { low: 15, high: 38 },
    },
    note: "Health/wellness CAC inflated by trust + clinical-proof gates. Categories needing FDA/MFDS-style certification land at upper band until cert is in place.",
  },
  electronics: {
    developed: {
      newBrand:        { low: 80, high: 180 },
      establishedDTC:  { low: 50, high: 110 },
    },
    emerging: {
      newBrand:        { low: 35, high: 90 },
      establishedDTC:  { low: 22, high: 55 },
    },
    note: "Electronics requires spec proof + warranty trust; CAC scales with AOV — sub-$200 items at lower band, $500+ premium at upper.",
  },
  saas: {
    developed: {
      newBrand:        { low: 120, high: 350 },
      establishedDTC:  { low: 80, high: 200 },
    },
    emerging: {
      newBrand:        { low: 50, high: 150 },
      establishedDTC:  { low: 30, high: 90 },
    },
    note: "SaaS CAC varies wildly by ARPU — SMB/PLG at lower band, enterprise (sales-led) much higher. Range here covers SMB self-serve through mid-market.",
  },
  home: {
    developed: {
      newBrand:        { low: 100, high: 250 },
      establishedDTC:  { low: 60, high: 150 },
    },
    emerging: {
      newBrand:        { low: 40, high: 110 },
      establishedDTC:  { low: 25, high: 65 },
    },
    note: "Home goods (furniture, decor, appliances) carry high AOV → CAC scales with that. Long consideration cycle requires retargeting + content marketing budget.",
  },
  ip: {
    developed: {
      newBrand:        { low: 25, high: 70 },
      establishedDTC:  { low: 15, high: 40 },
    },
    emerging: {
      newBrand:        { low: 10, high: 30 },
      establishedDTC:  { low: 6, high: 18 },
    },
    note: "IP/character merchandise rides existing fandom; if franchise has any cultural recognition, CAC trends much lower than other categories.",
  },
};

/**
 * Category fallback for niche/unknown categories. "home" is a moderate
 * mid-tier benchmark and a safe default — not so low we underestimate
 * wildly, not so high we panic the user.
 */
const FALLBACK_CATEGORY = "home";

export function resolveBenchmarkCategory(
  category: string | null | undefined,
): keyof typeof CAC_BENCHMARKS {
  if (!category) return FALLBACK_CATEGORY;
  const lc = category.toLowerCase();
  return lc in CAC_BENCHMARKS
    ? (lc as keyof typeof CAC_BENCHMARKS)
    : FALLBACK_CATEGORY;
}

/**
 * Map a country code to a market tier. Mirrors the COUNTRY_COST_INDEX
 * threshold in channel-costs.ts — kept in sync manually since both
 * data files refresh annually together.
 */
const DEVELOPED_MARKETS = new Set([
  "US", "JP", "GB", "FR", "AU", "SG", "KR", "TW", "IT", "ES", "DE",
  "NL", "AE", "SA", "CA", "HK", "NZ",
]);

export function classifyMarketTier(countryCode: string): CacMarketTier {
  return DEVELOPED_MARKETS.has(countryCode.toUpperCase())
    ? "developed"
    : "emerging";
}

/**
 * Brand-stage decision: when the product is being launched in its OWN
 * home market (originating === candidate), the brand is "established"
 * — built-up review depth, organic search demand, peer trust networks
 * that the cross-border launch case lacks. Otherwise "newBrand".
 *
 * Note: this is a structural simplification. A 30-year Korean brand
 * launching into Japan via K-wave halo is closer to "establishedDTC"
 * in practice than "newBrand", but we don't currently track brand
 * heritage in the project schema. The benchmark range is wide enough
 * (e.g. fashion newBrand 60-120) to absorb that nuance — pick the
 * lower end of the band when you have reason to.
 */
export function classifyBrandStage(
  originatingCountry: string,
  candidateCountry: string,
): CacBrandStage {
  return originatingCountry.toUpperCase() === candidateCountry.toUpperCase()
    ? "establishedDTC"
    : "newBrand";
}

export interface BenchmarkLookup {
  category: keyof typeof CAC_BENCHMARKS;
  tier: CacMarketTier;
  stage: CacBrandStage;
  range: BenchmarkRange;
  note: string;
}

export function lookupBenchmark(opts: {
  category: string | null | undefined;
  originatingCountry: string;
  candidateCountry: string;
}): BenchmarkLookup {
  const cat = resolveBenchmarkCategory(opts.category);
  const tier = classifyMarketTier(opts.candidateCountry);
  const stage = classifyBrandStage(opts.originatingCountry, opts.candidateCountry);
  return {
    category: cat,
    tier,
    stage,
    range: CAC_BENCHMARKS[cat][tier][stage],
    note: CAC_BENCHMARKS[cat].note,
  };
}

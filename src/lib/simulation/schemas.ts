import { z } from "zod";

// ─── Project input ─────────────────────────────────────────────
export const ProjectInputSchema = z.object({
  productName: z.string().min(1),
  category: z.string(),
  description: z.string().min(10),
  basePriceCents: z.number().int().nonnegative(),
  currency: z.string().default("USD"),
  objective: z.enum(["awareness", "conversion", "retention", "expansion"]),
  /**
   * The product's origin / home market — informs the simulator that the
   * candidate countries are EXPORT TARGETS, not equal-weight launch options.
   * Synthesis uses this to keep action plans overseas-focused; if the origin
   * also appears in candidateCountries (user opted into a domestic-vs-overseas
   * comparison), country scoring still ranks it but the simulation knows
   * which entry is the home market.
   */
  originatingCountry: z.string().default("KR"),
  candidateCountries: z.array(z.string()).min(1),
  competitorUrls: z.array(z.string().url()).default([]),
  /**
   * User-described creative concepts (always text). Each entry is one
   * creative idea — feeds the synthesis stage so the LLM can score against
   * the product context.
   */
  assetDescriptions: z.array(z.string()).default([]),
  /**
   * Optional hosted image URLs for vision-powered evaluation. When present
   * AND the synthesis provider supports images (currently only Anthropic),
   * the synthesis prompt sends them as image content blocks. Empty array
   * is the common case — wizard surfaces an accuracy hint.
   */
  assetUrls: z.array(z.string().url()).default([]),
});
export type ProjectInput = z.infer<typeof ProjectInputSchema>;

// ─── Persona ───────────────────────────────────────────────────
// Bulletproof schema: every field passes through a coercion that accepts any
// shape an LLM might return (string instead of array, "high" instead of number,
// missing fields, etc.). The goal is that a parseable JSON object always yields
// a valid persona — we'd rather have slightly noisy data than empty output.
const toStr = (val: unknown): string => {
  if (val == null) return "unknown";
  const s = String(val).trim();
  return s || "unknown";
};

const toStringArray = (val: unknown): string[] => {
  if (Array.isArray(val)) return val.map((v) => String(v).trim()).filter(Boolean);
  if (typeof val === "string" && val.trim()) {
    return val
      .split(/[,;\n|]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
};

const toLowMedHigh = (val: unknown): "low" | "medium" | "high" => {
  const s = String(val ?? "").toLowerCase();
  if (s.startsWith("l") || s.includes("weak") || s.includes("insens")) return "low";
  if (s.startsWith("h") || s.includes("strong") || s.includes("very")) return "high";
  return "medium";
};

const toBool = (val: unknown): boolean => {
  if (typeof val === "boolean") return val;
  if (typeof val === "number") return val > 0;
  if (typeof val === "string") {
    const s = val.toLowerCase().trim();
    if (["true", "yes", "y", "1", "would click", "would tap", "click", "예", "네", "할 것"].some((k) => s.includes(k))) return true;
    return false;
  }
  return false;
};

const toIntent = (val: unknown): number => {
  if (typeof val === "number" && Number.isFinite(val)) {
    return Math.max(0, Math.min(100, val));
  }
  if (typeof val === "string") {
    const n = Number(val);
    if (Number.isFinite(n)) return Math.max(0, Math.min(100, n));
    const s = val.toLowerCase();
    if (s.includes("very high") || s.includes("definite") || s.includes("certain")) return 90;
    if (s.includes("high") || s.includes("strong") || s.includes("likely")) return 75;
    if (s.includes("very low") || s.includes("never")) return 10;
    if (s.includes("low") || s.includes("unlikely") || s.includes("weak")) return 25;
    if (s.includes("med") || s.includes("moderate") || s.includes("neutral")) return 50;
  }
  return 50;
};

export const PersonaSchema = z.object({
  id: z.string().optional(),
  ageRange: z.preprocess(toStr, z.string()),
  gender: z.preprocess(toStr, z.string()),
  country: z.preprocess(toStr, z.string()),
  incomeBand: z.preprocess(toStr, z.string()),
  profession: z.preprocess(toStr, z.string()),
  interests: z.preprocess(toStringArray, z.array(z.string())),
  purchaseStyle: z.preprocess(toStr, z.string()),
  priceSensitivity: z.preprocess(toLowMedHigh, z.enum(["low", "medium", "high"])),
  trustFactors: z.preprocess(toStringArray, z.array(z.string())),
  objections: z.preprocess(toStringArray, z.array(z.string())),
  purchaseIntent: z.preprocess(toIntent, z.number().min(0).max(100)),
  /**
   * First-person quote capturing the persona's reaction to the product
   * in their own voice. Defaults to empty for legacy sims that never
   * asked the LLM to produce one — UI hides the quote block when empty.
   */
  voice: z.preprocess((v) => (typeof v === "string" ? v : ""), z.string()).default(""),
  /**
   * Ad-stage reaction — what the persona thinks SEEING THE AD/SOCIAL POST,
   * BEFORE deciding whether to click through to learn more. This is a
   * separate funnel step from purchaseIntent, which is post-consideration.
   *
   * Together they form a 3-stage conversion funnel:
   *   1. curiosity (0-100): "did this catch my eye?"
   *   2. wouldClick (bool): "would I tap to learn more?"
   *   3. purchaseIntent (0-100): "after reading the details, would I buy?"
   *
   * Optional for backwards compat with legacy sims; the prompt always
   * asks for it now. Lenient parsing — any malformed shape becomes
   * undefined rather than failing the whole persona.
   */
  adReaction: z
    .object({
      curiosity: z.preprocess(toIntent, z.number().min(0).max(100)),
      wouldClick: z.preprocess(toBool, z.boolean()),
    })
    .optional()
    .catch(undefined),
});
export type Persona = z.infer<typeof PersonaSchema>;

/**
 * Reaction-only output for personas sampled from the pool. The full persona
 * profile is already known from the DB row; the LLM only needs to predict
 * how that pre-defined person would react to the specific product.
 */
export const PersonaReactionSchema = z.object({
  id: z.string(),
  trustFactors: z.preprocess(toStringArray, z.array(z.string())),
  objections: z.preprocess(toStringArray, z.array(z.string())),
  purchaseIntent: z.preprocess(toIntent, z.number().min(0).max(100)),
  voice: z.preprocess((v) => (typeof v === "string" ? v : ""), z.string()).default(""),
  /** Ad-stage reaction; same shape as PersonaSchema.adReaction. */
  adReaction: z
    .object({
      curiosity: z.preprocess(toIntent, z.number().min(0).max(100)),
      wouldClick: z.preprocess(toBool, z.boolean()),
    })
    .optional()
    .catch(undefined),
});
export type PersonaReaction = z.infer<typeof PersonaReactionSchema>;

// ─── Country scoring ───────────────────────────────────────────
/**
 * Decomposition of finalScore into 6 weighted components. The user-facing
 * polish — instead of just seeing "Japan 62%", they see what's driving
 * that number (channelMatch high, regulatory low, etc.). Optional on the
 * schema for backwards compat with legacy single-sim runs that landed
 * before this field existed; the prompt always asks for it now.
 *
 * Each component is 0-100, same scale as finalScore. The LLM is told
 * finalScore should be a sensible weighted average of these — not
 * mechanically recomputed, since cross-component interactions matter
 * (e.g., great market size with terrible regulatory = launch blocked).
 */
export const CountryScoreComponentsSchema = z.object({
  /** Addressable market scale (population × purchasing power × category penetration). */
  marketSize: z.number().min(0).max(100),
  /** Cultural alignment — language, brand familiarity, lifestyle fit. */
  culturalFit: z.number().min(0).max(100),
  /** Channel availability and persona-channel alignment for this product. */
  channelMatch: z.number().min(0).max(100),
  /** Price tolerance vs local purchasing power and competitor anchors. */
  priceCompat: z.number().min(0).max(100),
  /** Competitive intensity — INVERTED so higher = less crowded (better). */
  competition: z.number().min(0).max(100),
  /** Regulatory friction — INVERTED so higher = fewer blockers (better). */
  regulatory: z.number().min(0).max(100),
});
export type CountryScoreComponents = z.infer<typeof CountryScoreComponentsSchema>;

export const CountryScoreSchema = z.object({
  country: z.string(),
  demandScore: z.number().min(0).max(100),
  cacEstimateUsd: z.number().nonnegative(),
  /**
   * LLM's stated channel-mix arithmetic for the CAC estimate. Emitted
   * since channel-cost grounding shipped — sims pre-2026-05-08 leave
   * this empty. Surfaced on the Decision-aid CAC card so the user
   * can audit the assumed mix (e.g., "60% Meta @ $12 CPM + 30% Google
   * Search @ $1.4 CPC + 10% TikTok @ $10 CPM = blended CAC $18.50").
   */
  cacRationale: z.string().optional(),
  competitionScore: z.number().min(0).max(100),
  finalScore: z.number().min(0).max(100),
  rank: z.number().int().min(1),
  rationale: z.string(),
  // .catch(undefined) means a malformed components (string, partial object,
  // wrong type) is silently dropped instead of poisoning the whole country
  // parse. Without it, a single bad components blob from the LLM would
  // sink the entire country sample and we'd lose all scoring data.
  components: CountryScoreComponentsSchema.optional().catch(undefined),
  // Within-sim std of finalScore across the LLM resampling rolls (3-5).
  // Populated by aggregateCountryScores; absent on raw samples and
  // legacy data. Lets the ensemble combine within-sim noise with
  // across-sim variance via law of total variance.
  finalScoreStd: z.number().nonnegative().optional(),
  finalScoreSampleN: z.number().int().nonnegative().optional(),
});
export type CountryScore = z.infer<typeof CountryScoreSchema>;

// ─── Pricing ───────────────────────────────────────────────────
export const PricingPointSchema = z.object({
  priceCents: z.number().int().nonnegative(),
  conversionProbability: z.number().min(0).max(1),
  estimatedRevenueIndex: z.number(),
});
export const PricingResultSchema = z.object({
  recommendedPriceCents: z.number().int().nonnegative(),
  marginEstimate: z.string(),
  // Numeric companion to the prose marginEstimate. LLM emits a single
  // integer percentage (typical gross margin for this category in the
  // recommended country). Used to drive the Decision-aid break-even
  // table at three scenarios (margin−10pp / base / margin+10pp) so the
  // user sees viability without us hardcoding 30% / 50% defaults.
  // Optional for legacy data; UI falls back to 35% when absent.
  marginEstimatePct: z.number().int().min(0).max(95).optional(),
  curve: z.array(PricingPointSchema),
  /**
   * Pricing-range metadata captured at sim time. Optional because
   * legacy results predate the dynamic-range stage. The curve itself
   * is emitted within this range.
   */
  range: z
    .object({
      minCents: z.number().int().nonnegative(),
      maxCents: z.number().int().nonnegative(),
      rationale: z.array(z.string()).default([]),
    })
    .optional(),
  /**
   * Competitor retail prices extracted from user-provided URLs at
   * sim time. Used as anchor data for the pricing prompt; surfaced
   * in the report so users see the basis for the recommendation.
   * Optional / empty when extraction yielded nothing.
   */
  competitorPrices: z
    .array(
      z.object({
        url: z.string(),
        priceCents: z.number().int().nonnegative(),
        productName: z.string().optional(),
        sourceCurrency: z.string().optional(),
      }),
    )
    .optional(),
  // Within-sim std of recommendedPriceCents across the LLM resampling
  // rolls (default 5). Captured at runner aggregation time; absent on
  // legacy data. Lets the ensemble surface true LLM noise even when
  // across-sim sims all happen to converge on the same value.
  recommendedPriceStd: z.number().nonnegative().optional(),
  recommendedPriceSampleN: z.number().int().nonnegative().optional(),
});
export type PricingResult = z.infer<typeof PricingResultSchema>;

// ─── Risks ─────────────────────────────────────────────────────
export const RiskSchema = z.object({
  factor: z.string(),
  severity: z.enum(["low", "medium", "high"]),
  description: z.string(),
});
export type Risk = z.infer<typeof RiskSchema>;

// ─── Overview ──────────────────────────────────────────────────
export const OverviewSchema = z.object({
  successScore: z.number().min(0).max(100),
  bestCountry: z.string(),
  bestSegment: z.string(),
  bestPriceCents: z.number().int().nonnegative(),
  bestCreative: z.string().nullable(),
  riskLevel: z.enum(["low", "medium", "high"]),
  headline: z.string(),
});
export type Overview = z.infer<typeof OverviewSchema>;

// ─── Recommendation ────────────────────────────────────────────
export const RecommendationSchema = z.object({
  executiveSummary: z.string(),
  actionPlan: z.array(z.string()),
  channels: z.array(z.string()),
});
export type Recommendation = z.infer<typeof RecommendationSchema>;

// ─── Full result ───────────────────────────────────────────────
export const SimulationResultSchema = z.object({
  overview: OverviewSchema,
  countries: z.array(CountryScoreSchema),
  personas: z.array(PersonaSchema),
  pricing: PricingResultSchema,
  creative: z.array(
    z.object({
      assetName: z.string(),
      score: z.number().min(0).max(100),
      strengths: z.array(z.string()),
      weaknesses: z.array(z.string()),
    }),
  ),
  risks: z.array(RiskSchema),
  recommendations: RecommendationSchema,
});
export type SimulationResult = z.infer<typeof SimulationResultSchema>;

// ─── Market Profile (recommended country deep-dive) ───────────
/**
 * Deep market analysis for the ensemble's recommended country.
 * Generated by a single LLM call after recommendation is finalized
 * — fills the gap between aggregate persona signals (which the
 * existing pipeline produces) and the structured market context
 * a launch decision actually needs (named competitors, regulatory
 * specifics, pricing benchmarks).
 *
 * All fields are optional / can be empty — the LLM may not have
 * confident knowledge for every category. We render whatever it
 * provides and skip blank sections.
 */
export const MarketProfileSchema = z.object({
  country: z.string(),
  marketSize: z
    .object({
      estimateUsd: z.string(),
      growthTrend: z.string(),
      addressableSegment: z.string(),
      /**
       * Source citations for the TAM / growth / segment estimates.
       * Populated when the market-size stage hit Tavily; empty when
       * we fell back to LLM-only (e.g. TAVILY_API_KEY missing or the
       * search returned nothing usable). UI renders these as a
       * "출처" / "Sources" link list below the estimate.
       */
      citations: z
        .array(
          z.object({
            url: z.string(),
            title: z.string(),
          }),
        )
        .default([])
        .optional(),
    })
    .partial()
    .optional(),
  competitors: z
    .array(
      z.object({
        name: z.string(),
        type: z.enum(["direct", "indirect", "substitute"]).default("direct"),
        strengths: z.array(z.string()).default([]),
        weaknesses: z.array(z.string()).default([]),
        pricePoint: z.string().default(""),
        marketShareEstimate: z.string().default(""),
        threatLevel: z.enum(["high", "medium", "low"]).default("medium"),
        /** Country of origin (HQ / brand origin), e.g. "US", "FR",
         *  "NZ". Two-letter ISO code preferred so the renderer can
         *  flag it consistently; full names ("미국", "France") are
         *  accepted for legacy. Empty when the LLM doesn't know. */
        originCountry: z.string().default(""),
        /** One-sentence brand establishment context — founding year
         *  / global scale / cultural standing — so a reader unfamiliar
         *  with the brand gets the "who are they?" answer in one line.
         *  Examples: "2016년 SF 창업, B Corp 인증, 2023년 글로벌 매출
         *  $300M 추정", "1976년 설립 일본 토종 카주얼 브랜드, 동남아
         *  10개국 진출". Empty when the LLM bails. */
        brandContext: z.string().default(""),
      }),
    )
    .max(6)
    .default([]),
  channels: z
    .object({
      primary: z.array(z.object({ name: z.string(), rationale: z.string() })).default([]),
      secondary: z.array(z.object({ name: z.string(), rationale: z.string() })).default([]),
      emerging: z.array(z.object({ name: z.string(), rationale: z.string() })).default([]),
    })
    .partial()
    .optional(),
  culturalNotes: z
    .object({
      valuesAlignment: z.string().default(""),
      purchaseBehavior: z.string().default(""),
      languageNotes: z.string().default(""),
      seasonality: z.string().default(""),
    })
    .partial()
    .optional(),
  regulatory: z
    .object({
      barriers: z
        .array(
          z.object({
            name: z.string(),
            severity: z.enum(["high", "medium", "low"]).default("medium"),
            description: z.string().default(""),
          }),
        )
        .max(5)
        .default([]),
      requirements: z.array(z.string()).default([]),
      timeToCompliance: z.string().default(""),
    })
    .partial()
    .optional(),
  pricingBenchmarks: z
    .object({
      entryLevel: z.string().default(""),
      mid: z.string().default(""),
      premium: z.string().default(""),
      yourPosition: z.string().default(""),
      // Price (in cents) the LLM actually analyzed in `yourPosition`.
      // Pre-2026-05-07 sims always used the user's input base price;
      // newer sims anchor on the pricing-stage recommended price so the
      // narrative stays consistent with the Pricing tab. UI uses this
      // to label the position card honestly ("at $49.95 position" vs.
      // "at $32 position"); falls back to input price when absent.
      yourPositionPriceCents: z.number().int().nonnegative().optional(),
    })
    .partial()
    .optional(),
  goToMarketStrategy: z
    .object({
      keyMessage: z.string().default(""),
      primaryAudience: z.string().default(""),
      differentiators: z.array(z.string()).default([]),
      risks: z.array(z.string()).default([]),
    })
    .partial()
    .optional(),
});
export type MarketProfile = z.infer<typeof MarketProfileSchema>;

// ─── Synthesis critique ────────────────────────────────────────
/**
 * Output of the post-synthesis self-critique pass. The critique LLM checks
 * the synthesis result against the underlying data (persona aggregate,
 * country scores, pricing curve) and returns mechanical fixes the runner
 * applies before persisting.
 *
 * Empty `issues` and missing `fixes` = synthesis was internally consistent.
 */
export const SynthesisCritiqueSchema = z.object({
  /** Human-readable reasons for adjustments — surfaced in operator logs. */
  issues: z.array(z.string()).default([]),
  /**
   * Field-level overrides applied to the synthesis result. Each field is
   * optional; only present when the critique detected an inconsistency.
   */
  fixes: z
    .object({
      bestCountry: z.string().optional(),
      riskLevel: z.enum(["low", "medium", "high"]).optional(),
      bestPriceCents: z.number().int().nonnegative().optional(),
      bestSegment: z.string().optional(),
      headline: z.string().optional(),
    })
    .partial()
    .default({}),
});
export type SynthesisCritique = z.infer<typeof SynthesisCritiqueSchema>;

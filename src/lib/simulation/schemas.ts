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
});
export type PersonaReaction = z.infer<typeof PersonaReactionSchema>;

// ─── Country scoring ───────────────────────────────────────────
export const CountryScoreSchema = z.object({
  country: z.string(),
  demandScore: z.number().min(0).max(100),
  cacEstimateUsd: z.number().nonnegative(),
  competitionScore: z.number().min(0).max(100),
  finalScore: z.number().min(0).max(100),
  rank: z.number().int().min(1),
  rationale: z.string(),
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
  curve: z.array(PricingPointSchema),
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

/**
 * Ground truth schema for simulation accuracy validation.
 *
 * Every product validation case is a JSON file under `validation/ground-truth/`
 * that conforms to GroundTruth (validated by Zod at load time). The schema is
 * versioned (`schemaVersion`) so future field migrations can be detected.
 *
 * Design choices that diverge from the original MVP proposal:
 *
 *   1. **metric is enumerated, not free-text.**
 *      "CN 매출 1위" and "CN 점유율 1위" are different claims. Mixing them
 *      collapses different facts under one ranking. Each Evidence row picks
 *      from `EvidenceMetric` and the value type is narrowed accordingly.
 *
 *   2. **asOf is mandatory per evidence, not per product.**
 *      Ground truth is a collection of dated facts, not a snapshot. A 2024 IR
 *      revenue rank + a 2025 trend report can coexist on the same product
 *      without ambiguity — each carries its own timestamp.
 *
 *   3. **source.confidence is 3-tier (high/medium/low) and source.type is
 *      enumerated** (IR, trade_data, market_research, ...). The composite
 *      product-level confidence is *derived* from per-evidence confidence,
 *      not declared. Avoid the "confidence: high" sticker being applied to
 *      a thin source.
 *
 *   4. **leakageRisk is explicit.** Well-known products (불닭, 신라면) are
 *      almost certainly in LLM training data, so a "confident correct" answer
 *      may be recall rather than reasoning. The flag isn't a disqualifier —
 *      it shifts how `confident_wrong` and `confident_correct` are interpreted
 *      downstream.
 *
 *   5. **split: TUNING vs HOLDOUT** is mandatory and aligns with the existing
 *      [calibration provenance](../simulation/calibration/provenance.ts) rule
 *      that every TUNING_ANCHOR must declare its holdoutProducts.
 */

import { z } from "zod";

/** Schema version — bump only on breaking field changes. */
export const SCHEMA_VERSION = 1 as const;

/** ISO 3166-1 alpha-2 country code, or a regional aggregate. */
export const CountryOrRegionSchema = z
  .string()
  .min(2)
  .max(8)
  .describe("ISO-3166-1 alpha-2 (e.g., 'US', 'CN') or region ('EU', 'SEA', 'MENA').");

export const ConfidenceSchema = z.enum(["high", "medium", "low"]);

/**
 * Per-evidence metric enum. Adding a new metric is a Zod schema change —
 * intentional friction. If the new claim doesn't fit any of these, ask
 * whether the claim is really verifiable.
 */
export const EvidenceMetricSchema = z.enum([
  "revenue_rank_overseas",      // 해외 매출 순위 (1, 2, 3...)
  "revenue_absolute_usd",       // 해외 매출액 (USD, country-specific)
  "market_share_pct",           // 카테고리 내 시장점유율 (0-100)
  "growth_trajectory",          // growing | flat | declining | saturated
  "market_entry_status",        // entered | exploring | not_present | rejected
  "consumer_acceptance",        // strong | mixed | weak
  "regulatory_barrier",         // blocker | obstacle | minor | none
  "trade_data_export_usd",      // UN Comtrade / KITA 수출 통계 (USD)
  "channel_presence",           // mainstream | niche | absent
]);
export type EvidenceMetric = z.infer<typeof EvidenceMetricSchema>;

export const SourceTypeSchema = z.enum([
  "IR",                         // 기업 IR 공시 / 사업보고서 (highest evidentiary weight)
  "trade_data",                 // UN Comtrade, KITA, OECD, customs
  "market_research",            // Euromonitor, Statista, Nielsen, Mintel
  "industry_report",            // KOTRA, KOFICE, MAFRA, government think-tank
  "trade_news",                 // 매일경제, FT, Nikkei, industry trade press
  "company_press_release",      // 기업 보도자료
  "general_news",               // 일반 뉴스 (least authoritative)
  "academic",                   // peer-reviewed
]);
export type SourceType = z.infer<typeof SourceTypeSchema>;

export const SourceSchema = z.object({
  type: SourceTypeSchema,
  url: z.string().url().optional(),
  title: z.string().optional(),
  publishedAt: z.string().optional().describe("ISO date the source was published, if known."),
  accessedAt: z.string().describe("ISO date the source was retrieved/recorded."),
});

/**
 * value type is metric-dependent. Zod doesn't trivially express
 * "discriminated union by sibling field", so we accept union(number, string)
 * and the validator function `validateMetricValue` enforces the per-metric
 * shape with clear error messages.
 */
export const EvidenceSchema = z.object({
  country: CountryOrRegionSchema,
  metric: EvidenceMetricSchema,
  value: z.union([z.number(), z.string()]),
  /** For rank-style metrics (revenue_rank_overseas). 1-based. */
  rank: z.number().int().positive().optional(),
  asOf: z.string().describe("ISO date the fact pertains to. e.g., '2024-12-31' for FY2024 IR."),
  source: SourceSchema,
  confidence: ConfidenceSchema,
  notes: z.string().optional(),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

export const CategorySchema = z.enum([
  "food",
  "beauty",
  "health",
  "appliances",
  "fashion",
  "beverage",
  "alcohol",
  "home",
  "pet",
  "other",
]);
export type ProductCategory = z.infer<typeof CategorySchema>;

export const SplitSchema = z.enum(["TUNING", "HOLDOUT"]);

/**
 * Leakage risk metadata. The model may know a product from training data
 * rather than from the prompts we feed it. This isn't disqualifying but
 * changes how we read confident-correct answers downstream.
 */
export const LeakageRiskSchema = z.object({
  inTrainingData: z.boolean().describe(
    "True if the product is well-known enough that LLM training data plausibly contains its market facts.",
  ),
  launchedBefore: z
    .string()
    .optional()
    .describe("ISO date product launched. If pre-2024, leakage is likely."),
  notes: z.string().optional(),
});

export const GroundTruthSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  product: z.string().min(1),
  category: CategorySchema,
  priceUsd: z.number().positive(),
  originCountry: CountryOrRegionSchema,
  asOf: z.string().describe("Snapshot date for the dataset. Per-evidence asOf may be older."),
  candidateCountries: z
    .array(CountryOrRegionSchema)
    .min(2)
    .max(15)
    .describe("Countries the sim must score. Holdout integrity: same list across builds."),
  split: SplitSchema,
  evidence: z.array(EvidenceSchema).min(1),
  knownFacts: z.array(z.string()).optional().describe(
    "Free-text facts that may appear in the product description. Used to detect description-echo bias.",
  ),
  leakageRisk: LeakageRiskSchema,
  /** Free-text notes for the validator (not for the LLM). */
  reviewerNotes: z.string().optional(),
});
export type GroundTruth = z.infer<typeof GroundTruthSchema>;

/* ---------- metric-value narrowing (run after Zod parse) ---------- */

const RANK_METRICS = new Set<EvidenceMetric>(["revenue_rank_overseas"]);
const NUMERIC_METRICS = new Set<EvidenceMetric>([
  "revenue_rank_overseas",
  "revenue_absolute_usd",
  "market_share_pct",
  "trade_data_export_usd",
]);
const STRING_METRICS = new Set<EvidenceMetric>([
  "growth_trajectory",
  "market_entry_status",
  "consumer_acceptance",
  "regulatory_barrier",
  "channel_presence",
]);
const STRING_METRIC_VALUES: Record<EvidenceMetric, readonly string[] | null> = {
  revenue_rank_overseas: null,
  revenue_absolute_usd: null,
  market_share_pct: null,
  trade_data_export_usd: null,
  growth_trajectory: ["growing", "flat", "declining", "saturated"],
  market_entry_status: ["entered", "exploring", "not_present", "rejected"],
  consumer_acceptance: ["strong", "mixed", "weak"],
  regulatory_barrier: ["blocker", "obstacle", "minor", "none"],
  channel_presence: ["mainstream", "niche", "absent"],
};

export function validateMetricValue(evidence: Evidence): string | null {
  const { metric, value, rank } = evidence;
  if (NUMERIC_METRICS.has(metric)) {
    if (typeof value !== "number") {
      return `metric '${metric}' requires numeric value, got ${typeof value}`;
    }
    if (RANK_METRICS.has(metric) && (rank == null || rank !== value)) {
      return `metric '${metric}' must set rank equal to value (got rank=${rank}, value=${value})`;
    }
    if (metric === "market_share_pct" && (value < 0 || value > 100)) {
      return `market_share_pct must be 0-100, got ${value}`;
    }
  } else if (STRING_METRICS.has(metric)) {
    if (typeof value !== "string") {
      return `metric '${metric}' requires string value, got ${typeof value}`;
    }
    const allowed = STRING_METRIC_VALUES[metric];
    if (allowed && !allowed.includes(value)) {
      return `metric '${metric}' value must be one of [${allowed.join(", ")}], got '${value}'`;
    }
  }
  return null;
}

/**
 * Parse + cross-field validate a raw ground truth JSON. Throws with all
 * accumulated errors if invalid.
 */
export function parseGroundTruth(raw: unknown): GroundTruth {
  const parsed = GroundTruthSchema.parse(raw);
  const errors: string[] = [];
  parsed.evidence.forEach((ev, i) => {
    const err = validateMetricValue(ev);
    if (err) errors.push(`evidence[${i}] (${ev.country}/${ev.metric}): ${err}`);
  });
  if (errors.length) {
    throw new Error(`GroundTruth cross-field validation failed:\n  - ${errors.join("\n  - ")}`);
  }
  return parsed;
}

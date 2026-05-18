/**
 * Per-LLM × per-category trust weights for ensemble winner-picker aggregation.
 * Phase F.2 B1 ship (2026-05-18).
 *
 * Why these numbers exist:
 *   v8 diagnostic exposed that round-robin treating Anthropic/OpenAI/DeepSeek
 *   as equal voters was leaving signal on the table. scripts/analyze-per-
 *   provider-accuracy.ts ran on 637 sims across 83 ensembles and computed
 *   per-(category × provider) top-3 hit rate:
 *
 *     category    anthropic  openai  deepseek   uniform
 *     alcohol     58%        36%     57%        50%
 *     beauty      69%        65%     83%        72%
 *     food        72%        40%     71%        61%
 *     tech        88%        43%    100%        77%
 *     wellness    76%        63%     67%        69%
 *
 *   OpenAI underperforms uniformly. DeepSeek dominates beauty/tech.
 *   Anthropic is balanced. Sample sizes are 25-108 per (category, provider).
 *
 * Mechanism:
 *   ensemble.ts winner picker reads these weights when PHASE_F2_ENABLED=true.
 *   Each per-sim country rank is multiplied by the inverse provider weight
 *   (higher weight = smaller rank multiplier = more influence on winner).
 *   Fallback to uniform when provider × category not in matrix.
 *
 * Cold-start protection:
 *   minSamplesPerCell = 5. If any (category, provider) cell in the historical
 *   matrix had < 5 sims, that weight defaults to 1.0× regardless of computed
 *   rate. The matrix below already filters; cells with < 5 historical sims
 *   are left out (undefined → fallback).
 */

import { calibrated } from "./provenance";

export type ProviderName = "anthropic" | "openai" | "deepseek";

/**
 * Categories used internally — inferred from product name + ground-truth
 * category. See scripts/analyze-per-provider-accuracy.ts for the inference rules.
 * `_default` is the cold-start fallback when category cannot be classified.
 */
export type ProviderCategory = "beauty" | "food" | "wellness" | "tech" | "alcohol" | "_default";

export type ProviderWeightMatrix = Record<ProviderCategory, Record<ProviderName, number>>;

export const PROVIDER_WEIGHTS = calibrated<ProviderWeightMatrix>(
  {
    beauty:   { anthropic: 0.95, openai: 0.90, deepseek: 1.14 },
    food:     { anthropic: 1.18, openai: 0.66, deepseek: 1.16 },
    wellness: { anthropic: 1.12, openai: 0.91, deepseek: 0.97 },
    tech:     { anthropic: 1.15, openai: 0.56, deepseek: 1.30 },
    alcohol:  { anthropic: 1.15, openai: 0.72, deepseek: 1.13 },
    _default: { anthropic: 1.00, openai: 1.00, deepseek: 1.00 },
  },
  {
    source: "TUNING_ANCHOR",
    rationale:
      "Per-provider × per-category top-3 hit rate across 637 sims (83 ensembles, v3→v8b generations). Weight = rate / category_mean_rate, then clipped to [0.4, 1.5] to avoid runaway downweighting on sparse cells. OpenAI underperforms uniformly (36-65% vs Anthropic 58-88% / DeepSeek 57-100%) → 0.56-0.91× weights. DeepSeek dominates tech (100%) and beauty (83%) → 1.14-1.30×. Anthropic balanced (1.12-1.18× outside beauty).",
    informedByRuns: [
      "v3 baseline (40.0)",
      "v5 관세청 (44.9)",
      "v6 DART partial F.1-B (54.6)",
      "v7 DART full F.1-B (72.0 ✓ p=0.0086)",
      "v8 KOTRA v1 (65.7 with US-bias regression on jinro)",
      "v8a KOTRA off diagnostic",
      "v8b KOTRA v2 cap + MFDS narrow (mean +1.1, MFDS BoJ +5.6 ✓)",
    ],
    holdoutProducts: [
      "jinro-chamisul",
      "lg-oled-tv-c-series",
      "orion-chocopie",
      "laneige-lip-sleeping-mask",
      "cj-hetbahn",
      "lotte-pepero",
      "mediheal-maskpack",
    ],
    lastReviewed: "2026-05-18",
    reviewBy: "2026-08-18",
  },
);

/**
 * Look up the weight for a (category, provider) pair with safe fallbacks.
 * Returns 1.0 when:
 *   - PHASE_F2_ENABLED env is not "true"
 *   - category not recognized
 *   - provider not in matrix
 */
export function getProviderWeight(category: string | null | undefined, provider: string | null | undefined): number {
  if (process.env.PHASE_F2_ENABLED !== "true") return 1.0;
  if (!provider) return 1.0;
  const p = provider.toLowerCase() as ProviderName;
  if (!["anthropic", "openai", "deepseek"].includes(p)) return 1.0;
  const cat = normalizeCategory(category);
  return PROVIDER_WEIGHTS.value[cat][p];
}

/**
 * Infer a ProviderCategory from a category label or product name.
 * Keep this conservative — when in doubt return _default (uniform).
 */
export function normalizeCategory(catOrProduct: string | null | undefined): ProviderCategory {
  if (!catOrProduct) return "_default";
  const t = catOrProduct.toLowerCase();
  if (t.includes("oled") || t.includes("tv") || t.includes("appliance") || t.includes("가전")) return "tech";
  if (t.includes("정관장") || t.includes("ginseng") || t.includes("wellness") || t.includes("건강기능")) return "wellness";
  if (t.includes("진로") || t.includes("소주") || t.includes("chamisul") || t.includes("alcohol") || t.includes("주류")) return "alcohol";
  if (t.includes("beauty") || t.includes("뷰티") || t.includes("화장품") || t.includes("skincare") || t.includes("toner") || t.includes("mask")) return "beauty";
  if (t.includes("food") || t.includes("식품") || t.includes("ramen") || t.includes("라면") || t.includes("ice")) return "food";
  return "_default";
}

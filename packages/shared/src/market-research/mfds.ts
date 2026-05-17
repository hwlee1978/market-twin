/**
 * MFDS (식품의약품안전처) cosmetic regulation anchor — Phase F.3.
 *
 * Narrow-scope ship (2026-05-18): activates only for sunscreen-category
 * fixtures because MFDS data is dominated by regulated functional
 * ingredients (UV filters, retinol, etc.) — safe skincare actives like
 * Centella / snail mucin / niacinamide have no MFDS entries (they're
 * unregulated globally).
 *
 * Data flow:
 *   1. scripts/prefetch-mfds-regulations.ts dumps 7,257-row MFDS dataset to
 *      validation/reference/mfds-cosmetic-regulations.json (gitignored,
 *      regenerable). No live API calls at sim time.
 *   2. validation/reference/brand-ingredients.json maps each fixture-slug to
 *      its key ingredients (hand-curated, narrow to sunscreen).
 *   3. At sim time, this module joins the two: per fixture, looks up each
 *      ingredient in the MFDS reg dataset and surfaces country restrictions.
 *
 * Skips entirely (returns empty block) when:
 *   - fixture slug has no brand-ingredients.json entry, OR
 *   - product category does not include "sunscreen" / "UV" / "선크림" keyword
 *
 * Lessons applied from KOTRA F.1-C v8a regression diagnosis:
 *   - Strict filter (skip fixture entirely if no relevant signal)
 *   - Per-ingredient signal, not aggregate counts (no "X more" style hints)
 *   - Empty block beats noise injection
 */

import { readFileSync } from "node:fs";
import path from "node:path";

interface MfdsRegItem {
  ingredientKo: string;
  ingredientEn: string | null;
  prohibitedCountries: string[];
  limitedCountries: string[];
}

interface MfdsRegDataset {
  _meta?: { source?: string; fetchedAt?: string; totalRows?: number };
  items: MfdsRegItem[];
}

interface BrandIngredientEntry {
  category: string;
  productKo: string;
  uvFilters?: Array<{
    ingredientKo: string;
    ingredientEn: string;
    purpose: string;
  }>;
  notes?: string;
}

interface BrandIngredientsFile {
  _meta?: Record<string, unknown>;
  brands: Record<string, BrandIngredientEntry>;
}

let regCache: Map<string, MfdsRegItem> | null = null;
let brandCache: BrandIngredientsFile | null = null;

function loadReg(): Map<string, MfdsRegItem> {
  if (regCache) return regCache;
  // Resolve relative to repo root — works for both Next.js (cwd=repo) and
  // tsx scripts (cwd=repo). validation/ lives at repo root.
  const filePath = path.resolve(process.cwd(), "validation/reference/mfds-cosmetic-regulations.json");
  try {
    const raw = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as MfdsRegDataset;
    const map = new Map<string, MfdsRegItem>();
    for (const item of parsed.items) {
      if (item.ingredientKo) map.set(item.ingredientKo, item);
    }
    regCache = map;
    return map;
  } catch (err) {
    console.warn(
      `[mfds] failed to load reg dataset (${(err as Error).message}); ` +
        `run 'npx tsx --env-file=.env.local scripts/prefetch-mfds-regulations.ts' first`,
    );
    return new Map();
  }
}

function loadBrandIngredients(): BrandIngredientsFile {
  if (brandCache) return brandCache;
  const filePath = path.resolve(process.cwd(), "validation/reference/brand-ingredients.json");
  try {
    const raw = readFileSync(filePath, "utf8");
    brandCache = JSON.parse(raw) as BrandIngredientsFile;
    return brandCache;
  } catch (err) {
    console.warn(`[mfds] failed to load brand-ingredients.json: ${(err as Error).message}`);
    return { brands: {} };
  }
}

export interface MfdsLookupResult {
  fixtureSlug: string;
  productKo: string;
  matched: Array<{
    ingredientKo: string;
    ingredientEn: string;
    purpose: string;
    prohibitedCountries: string[];
    limitedCountries: string[];
  }>;
  unmatchedIngredients: Array<{
    ingredientKo: string;
    ingredientEn: string;
    purpose: string;
  }>;
}

/** Look up a fixture in brand-ingredients.json and join with MFDS reg data. */
export function lookupMfdsForFixture(fixtureSlug: string): MfdsLookupResult | null {
  const brands = loadBrandIngredients();
  const entry = brands.brands[fixtureSlug];
  if (!entry || !entry.uvFilters || entry.uvFilters.length === 0) return null;
  const reg = loadReg();
  const matched: MfdsLookupResult["matched"] = [];
  const unmatched: MfdsLookupResult["unmatchedIngredients"] = [];
  for (const f of entry.uvFilters) {
    const hit = reg.get(f.ingredientKo);
    if (hit) {
      matched.push({
        ingredientKo: f.ingredientKo,
        ingredientEn: f.ingredientEn,
        purpose: f.purpose,
        prohibitedCountries: hit.prohibitedCountries,
        limitedCountries: hit.limitedCountries,
      });
    } else {
      unmatched.push(f);
    }
  }
  if (matched.length === 0 && unmatched.length === 0) return null;
  return { fixtureSlug, productKo: entry.productKo, matched, unmatchedIngredients: unmatched };
}

/**
 * Render MFDS anchor block for prompt injection. Format mirrors KOTRA/DART
 * blocks. Returns empty string when nothing relevant for this fixture.
 */
export function renderMfdsBlock(
  result: MfdsLookupResult | null,
  opts: { locale?: "ko" | "en" } = {},
): string {
  if (!result) return "";
  if (result.matched.length === 0 && result.unmatchedIngredients.length === 0) return "";
  const isKo = opts.locale !== "en";
  const header = isKo
    ? "═══ MFDS 식약처 화장품 규제정보 anchor (성분별 국가별 사용 제한) ═══"
    : "═══ MFDS cosmetic regulatory anchor (per-ingredient country restrictions) ═══";

  const matchedLines = result.matched.map((m) => {
    const proh = m.prohibitedCountries.length
      ? `PROH=${m.prohibitedCountries.join(",")}`
      : "";
    const lim = m.limitedCountries.length ? `LIMIT=${m.limitedCountries.join(",")}` : "";
    const tags = [proh, lim].filter(Boolean).join("  ");
    return `    ${m.ingredientEn.padEnd(38)} (${m.purpose}) — ${tags}`;
  });

  const unmatchedLines = result.unmatchedIngredients.map((u) => {
    return `    ${u.ingredientEn.padEnd(38)} (${u.purpose}) — not in MFDS reg list`;
  });

  const note = isKo
    ? `주의: MFDS 화장품 규제정보는 KR perspective의 7,257건 국제 화장품 성분 규제 데이터. 'LIMIT=US'는 US에서 사용 한도가 정해져 있음(완전 금지 아님). MFDS reg 미등재 성분 = 안전 활성 성분이거나 한국식 UV filter (US FDA 1999 monograph 미반영 → US 미인증). 미등재 자체가 'KR/EU OK, US 미인증 가능성' 신호.`
    : `Note: MFDS cosmetic regulation reflects KR perspective on 7,257 internationally-regulated ingredients. 'LIMIT=US' means concentration capped (not banned). Ingredients not listed are either globally safe OR Korean-developed UV filters not yet approved by US FDA (1999 monograph) — absence is itself a 'KR/EU OK, US uncertain' signal.`;

  const productLine = isKo
    ? `  ${result.fixtureSlug} (${result.productKo}):`
    : `  ${result.fixtureSlug} (${result.productKo}):`;

  return `${header}\n${productLine}\n${[...matchedLines, ...unmatchedLines].join("\n")}\n\n${note}`;
}

/** Top-level convenience for orchestrator. Returns empty block when not relevant. */
export function buildMfdsAnchor(
  fixtureSlug: string,
  opts: { locale?: "ko" | "en" } = {},
): { block: string; result: MfdsLookupResult | null } {
  const result = lookupMfdsForFixture(fixtureSlug);
  const block = renderMfdsBlock(result, opts);
  return { block, result };
}

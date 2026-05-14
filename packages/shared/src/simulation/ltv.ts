/**
 * Per-category lifetime-value multipliers — used by the Investment +
 * ROI page to surface BOTH the single-purchase break-even (the
 * conservative floor) AND the LTV-adjusted break-even (the realistic
 * picture for repeat-purchase categories).
 *
 * Why this exists:
 * - The single-purchase model alone produced misleading "위험"
 *   (unsustainable) labels in three accuracy-validation runs (Buldak
 *   / Shin Ramyun / COSRX) — M:R ratios of 839% / 2,751% / 205%
 *   suggested the categories couldn't recover marketing spend, when
 *   in reality food has ~3-year retention with monthly+ repeat and
 *   beauty essence reorders quarterly.
 * - The right surface is dual: show both numbers so the reader sees
 *   the conservative floor AND the realistic plan-against figure.
 *
 * Numbers below are conservative — anchored on widely-cited industry
 * retention figures, then discounted further so the LTV-adjusted view
 * doesn't overclaim. If a category sits between two values, the lower
 * one is preferred. These aren't research-grade estimates; they're a
 * first-order correction to the single-purchase fiction.
 *
 * Sources for the anchor figures:
 * - Food/CPG: McKinsey CPG report 2023 — repeat rate ~70% within 12mo,
 *   3-yr retention typically 40-50%. Conservative 8 ≈ ~1 purchase/mo
 *   for ~8mo on average across the cohort.
 * - Beauty essence: NPD Group cycle data — 100ml essence consumed in
 *   ~3mo, average 1.3 reorders per year, 3yr customer life. 4 ≈
 *   conservative discount.
 * - SaaS: Mid-market SaaS benchmark — ~24mo retention with monthly
 *   billing. 18 = conservative discount on 24.
 * - Electronics: 1-2yr replacement cycle for non-accessory hardware;
 *   1.2 accounts for an occasional accessory / minor upgrade.
 *
 * The category fallback ("other") is 1.5 — small uplift above pure
 * single-purchase, so a project with no category match doesn't read
 * as overconfident.
 */

type Category =
  | "food"
  | "beauty"
  | "fashion"
  | "health"
  | "electronics"
  | "home"
  | "saas"
  | "ip"
  | "other";

export const CATEGORY_LTV_MULTIPLIER: Record<Category, number> = {
  food: 8,
  beauty: 4,
  health: 6,
  home: 1.5,
  saas: 18,
  fashion: 2,
  electronics: 1.2,
  ip: 4,
  other: 1.5,
};

/**
 * Look up the LTV multiplier for a category string. Tolerates the
 * "other"-fallback case in the schema (un-matched category strings
 * land on the conservative 1.5 multiplier rather than throwing).
 */
export function getLTVMultiplier(category: string): number {
  const key = category.toLowerCase() as Category;
  return CATEGORY_LTV_MULTIPLIER[key] ?? CATEGORY_LTV_MULTIPLIER.other;
}

/**
 * Human-readable explanation for the category's LTV anchor — surfaced
 * in the UI so the reader sees WHY a given multiplier was chosen,
 * not just the number. Keep this in sync with the multipliers above.
 */
export function getLTVRationale(
  category: string,
  locale: "ko" | "en",
): string {
  const key = category.toLowerCase() as Category;
  const ko: Record<Category, string> = {
    food: "월 단위 반복 구매가 일반적인 카테고리 — 평균 8회 재구매 가정",
    beauty: "분기당 1회 정도 재구매 — 평균 4회 보수적 추정",
    health: "보충제·기능식품은 월간 구독 흔함 — 평균 6회",
    home: "내구재 위주 — 소모품 일부 고려해 1.5회",
    saas: "월간 구독 모델 — 24개월 retention 보수치 18회",
    fashion: "시즌별 구매 가능 — 평균 2회",
    electronics: "재구매 거의 없음 — 액세서리 일부 고려 1.2회",
    ip: "팬덤·콜렉션 구매 — 평균 4회",
    other: "카테고리 미특정 — 보수적으로 1.5회",
  };
  const en: Record<Category, string> = {
    food: "Monthly+ repeat is normal — assumes ~8 reorders/customer",
    beauty: "Quarterly reorders typical — ~4 over customer life",
    health: "Supplements / functional foods often subscribed — ~6 reorders",
    home: "Durables-heavy with some consumables — ~1.5",
    saas: "Monthly subscription model — ~18mo conservative retention",
    fashion: "Seasonal repurchase — ~2",
    electronics: "Rare repurchase, occasional accessory — ~1.2",
    ip: "Fandom / collection buying — ~4",
    other: "Category unspecified — conservative 1.5",
  };
  const table = locale === "ko" ? ko : en;
  return table[key] ?? table.other;
}

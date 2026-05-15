/**
 * Per-category lifetime-value multipliers — used by the Investment + ROI
 * page to surface BOTH the single-purchase break-even (the conservative
 * floor) AND the LTV-adjusted break-even (the realistic picture for
 * repeat-purchase categories).
 *
 * Numbers are conservative — anchored on industry retention figures, then
 * discounted further so the LTV-adjusted view doesn't overclaim. They are
 * NOT research-grade — flagged as a TUNING_ANCHOR so each value carries
 * the dataset that informed it AND the discount applied. When a category
 * gets refreshed, both fields move together.
 */

import { calibrated } from "./provenance";

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

export const CATEGORY_LTV_MULTIPLIER = calibrated<Record<Category, number>>(
  {
    food: 8,
    beauty: 4,
    health: 6,
    home: 1.5,
    saas: 18,
    fashion: 2,
    electronics: 1.2,
    ip: 4,
    other: 1.5,
  },
  {
    source: "TUNING_ANCHOR",
    rationale:
      "Anchored on industry retention figures (McKinsey CPG / NPD essence cycle / SaaS benchmarks) but discounted further so the LTV view stays conservative. Validated against the Buldak / Shin / COSRX M:R reality check (single-purchase view called all three 'unsustainable' which contradicts public IR for those products).",
    references: [
      "Food/CPG: McKinsey CPG report 2023 — repeat ~70% within 12mo, 3yr retention 40-50%; 8 ≈ ~1 purchase/mo for ~8mo cohort average",
      "Beauty essence: NPD Group cycle data — 100ml essence ~3mo, ~1.3 reorders/yr, 3yr customer life; 4 = conservative discount",
      "SaaS: Mid-market SaaS benchmark — ~24mo retention; 18 = conservative discount",
      "Electronics: 1-2yr replacement cycle; 1.2 accounts for occasional accessory",
    ],
    informedByRuns: [
      "Buldak (1st run, 2026-05-14) — single-purchase M:R 839% wrong call",
      "Shin Ramyun (2nd run, 2026-05-14) — single-purchase M:R 2,751% wrong call",
      "COSRX (3rd run, 2026-05-14) — single-purchase M:R 205% wrong call",
    ],
    holdoutProducts: [],
    lastReviewed: "2026-05-14",
    reviewBy: "2026-08-14",
  },
);

const RATIONALE_KO: Record<Category, string> = {
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

const RATIONALE_EN: Record<Category, string> = {
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

export function getLTVMultiplier(category: string): number {
  const key = category.toLowerCase() as Category;
  return CATEGORY_LTV_MULTIPLIER.value[key] ?? CATEGORY_LTV_MULTIPLIER.value.other;
}

export function getLTVRationale(category: string, locale: "ko" | "en"): string {
  const key = category.toLowerCase() as Category;
  const table = locale === "ko" ? RATIONALE_KO : RATIONALE_EN;
  return table[key] ?? table.other;
}

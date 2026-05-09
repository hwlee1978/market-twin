/**
 * Stress-scenario library for the Decision-aid component vulnerability
 * card. Each of the 6 finalScore components has 2-3 plausible adverse
 * scenarios with estimated point drops — used to render concrete
 * "what could flip the recommendation" answers instead of a generic
 * "10pt drop" placeholder.
 *
 * Drop magnitudes are heuristic ranges drawn from public market-research
 * post-mortems (recession impact studies, retailer rejection cases,
 * regulatory action histories). Treat as rough order-of-magnitude
 * estimates, not precise forecasts.
 */

export type ComponentKey =
  | "marketSize"
  | "culturalFit"
  | "channelMatch"
  | "priceCompat"
  | "competition"
  | "regulatory";

export interface StressScenario {
  /** Korean label, displayed when locale = ko. */
  ko: string;
  /** English label. */
  en: string;
  /** Estimated point drop on this component if the scenario plays out.
   *  Derived from public case-study magnitudes — not precise. */
  dropPt: number;
}

/** Display label for each component (replaces jargony "(inv)" suffixes). */
export const COMPONENT_LABEL: Record<ComponentKey, { ko: string; en: string }> = {
  marketSize: { ko: "시장 규모", en: "Market size" },
  culturalFit: { ko: "문화 적합", en: "Cultural fit" },
  channelMatch: { ko: "채널 매치", en: "Channel match" },
  priceCompat: { ko: "가격 수용", en: "Price fit" },
  // (inv) renamed to direct-meaning labels — score is "headroom" /
  // "ease" where high = good, which is what the matrix already captures.
  competition: { ko: "경쟁 여지", en: "Competitive headroom" },
  regulatory: { ko: "규제 용이성", en: "Regulatory ease" },
};

export const COMPONENT_STRESS_SCENARIOS: Record<ComponentKey, StressScenario[]> = {
  marketSize: [
    { ko: "카테고리 수요 침체 (-20%)", en: "Category recession (demand -20%)", dropPt: 12 },
    { ko: "타겟 cohort 인구 축소", en: "Target cohort demographic shrink", dropPt: 8 },
    { ko: "거시 충격 (GDP -3% 이상)", en: "Macro shock (GDP -3%+)", dropPt: 15 },
  ],
  culturalFit: [
    { ko: "트렌드 사이클 종료", en: "Trend cycle ends", dropPt: 12 },
    { ko: "브랜드 미스·cancel-culture 사건", en: "Brand misstep / cancel-culture event", dropPt: 25 },
    { ko: "현지 경쟁사가 동일 포지셔닝 선점", en: "Local competitor pre-empts positioning", dropPt: 10 },
  ],
  channelMatch: [
    { ko: "주력 retailer / 마켓플레이스 거절", en: "Primary retailer / marketplace rejection", dropPt: 22 },
    { ko: "채널 수수료 10%+ 인상", en: "Channel commission hike (10%+)", dropPt: 8 },
    { ko: "알고리즘 변화로 노출 감소", en: "Algorithm shift cuts visibility", dropPt: 12 },
  ],
  priceCompat: [
    { ko: "환율 15%+ 불리한 방향 변동", en: "FX moves 15%+ against you", dropPt: 12 },
    { ko: "관세 / 수입세 인상", en: "Tariff / import duty hike", dropPt: 10 },
    { ko: "경쟁사 가격 -20% 인하", en: "Competitor price cut -20%", dropPt: 15 },
  ],
  competition: [
    { ko: "신규 경쟁사 (강력) 진입", en: "Major new competitor enters", dropPt: 18 },
    { ko: "기존 경쟁사 마케팅 +50%", en: "Incumbent boosts marketing +50%", dropPt: 10 },
    { ko: "카테고리 leader 가격 공격", en: "Category leader price war", dropPt: 20 },
  ],
  regulatory: [
    { ko: "신규 라벨링·표시 규제", en: "New labelling / disclosure rule", dropPt: 15 },
    { ko: "Health-claim 제한 강화", en: "Health-claim restriction tightens", dropPt: 25 },
    { ko: "수입 인증 심사 강화", en: "Import certification scrutiny tightens", dropPt: 12 },
  ],
};

/**
 * Compute the per-component drop required to flip the recommendation,
 * assuming components contribute equally to finalScore (1/6 each).
 *
 * If the gap between top and runner-up is `gap` points, then dropping
 * a single component by `gap × 6` would pull finalScore down by `gap`,
 * matching the runner-up. So `gap × 6` is the per-component flip
 * threshold.
 */
export function flipThresholdPt(gap: number, componentCount = 6): number {
  return Math.max(0, gap * componentCount);
}

/** Cumulative worst-case for a single component — sums all scenario drops. */
export function cumulativeWorstCase(scenarios: StressScenario[]): number {
  return scenarios.reduce((s, sc) => s + sc.dropPt, 0);
}

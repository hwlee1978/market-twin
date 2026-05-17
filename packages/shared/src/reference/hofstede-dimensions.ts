/**
 * Hofstede 6-dimension cultural scores per candidate country.
 *
 * Source: Hofstede Insights (hofstede-insights.com), 2024 dataset. Static
 * reference data — refreshed manually when Hofstede publishes revisions
 * (typically every 5-10 years). Not subject to annual-refresh policy
 * because cultural dimensions move slowly.
 *
 * Each dimension is 0-100. Phase F.0 (2026-05-17) integration:
 *   - Persona generation prompt receives a country's scores so the LLM
 *     can ground purchaseIntent distribution, objection patterns, and
 *     channel preferences in measurable cultural prior rather than
 *     guessing.
 *   - Country scoring prompt receives the same data alongside the
 *     candidate's culturalFit sub-score so the LLM has external evidence
 *     for the score it emits.
 *
 * Why this fixes defects:
 *   - #1 EU/CN under-rating: Korean LLM training data underrepresents
 *     EU cultural distinctness (DE/FR/IT each different despite shared
 *     "European" label). Hofstede shows DE Uncertainty Avoidance 65 vs
 *     IT 75 vs FR 86 — distinct enough that the LLM should differentiate
 *     consumer adoption speed instead of averaging.
 *   - #4 K-Wave penetration miscalls: countries with high Power Distance
 *     + low Individualism (CN PD=80, ID=78) follow social cascade
 *     adoption patterns the LLM understates without explicit grounding.
 *
 * Coverage: all 24 reference countries in current candidate pool +
 * regional aggregates for missing countries.
 */

export interface HofstedeProfile {
  /**
   * Power Distance Index. Higher = more acceptance of hierarchical
   * authority. Affects: trust in expert reviews, brand prestige weight.
   */
  powerDistance: number;
  /**
   * Individualism vs Collectivism. Higher = more individualist. Affects:
   * solo decision-making, peer-of-peer review trust, family-targeted ads.
   */
  individualism: number;
  /**
   * Masculinity vs Femininity. Higher = competitive/achievement focused.
   * Affects: status signaling product positioning weight.
   */
  masculinity: number;
  /**
   * Uncertainty Avoidance. Higher = less comfort with ambiguity. Affects:
   * trial willingness on unknown brands, regulatory documentation demand,
   * refund/return guarantee importance.
   */
  uncertaintyAvoidance: number;
  /**
   * Long-term Orientation. Higher = future/persistence focused. Affects:
   * brand loyalty vs trend-chasing, repeat purchase patterns.
   */
  longTermOrientation: number;
  /**
   * Indulgence vs Restraint. Higher = more indulgent/leisure-positive.
   * Affects: impulse buying, hedonic product receptiveness.
   */
  indulgence: number;
}

/**
 * Country → Hofstede scores. Country codes use ISO 3166-1 alpha-2.
 * Source dimensions are well-documented; gaps filled with regional
 * average + note in HOFSTEDE_NOTES below.
 */
export const HOFSTEDE_BY_COUNTRY: Record<string, HofstedeProfile> = {
  // Asia
  KR: { powerDistance: 60, individualism: 18, masculinity: 39, uncertaintyAvoidance: 85, longTermOrientation: 100, indulgence: 29 },
  JP: { powerDistance: 54, individualism: 46, masculinity: 95, uncertaintyAvoidance: 92, longTermOrientation: 88, indulgence: 42 },
  CN: { powerDistance: 80, individualism: 20, masculinity: 66, uncertaintyAvoidance: 30, longTermOrientation: 87, indulgence: 24 },
  TW: { powerDistance: 58, individualism: 17, masculinity: 45, uncertaintyAvoidance: 69, longTermOrientation: 93, indulgence: 49 },
  HK: { powerDistance: 68, individualism: 25, masculinity: 57, uncertaintyAvoidance: 29, longTermOrientation: 61, indulgence: 17 },
  SG: { powerDistance: 74, individualism: 20, masculinity: 48, uncertaintyAvoidance: 8, longTermOrientation: 72, indulgence: 46 },
  TH: { powerDistance: 64, individualism: 20, masculinity: 34, uncertaintyAvoidance: 64, longTermOrientation: 32, indulgence: 45 },
  VN: { powerDistance: 70, individualism: 20, masculinity: 40, uncertaintyAvoidance: 30, longTermOrientation: 57, indulgence: 35 },
  ID: { powerDistance: 78, individualism: 14, masculinity: 46, uncertaintyAvoidance: 48, longTermOrientation: 62, indulgence: 38 },
  MY: { powerDistance: 100, individualism: 26, masculinity: 50, uncertaintyAvoidance: 36, longTermOrientation: 41, indulgence: 57 },
  PH: { powerDistance: 94, individualism: 32, masculinity: 64, uncertaintyAvoidance: 44, longTermOrientation: 27, indulgence: 42 },
  IN: { powerDistance: 77, individualism: 48, masculinity: 56, uncertaintyAvoidance: 40, longTermOrientation: 51, indulgence: 26 },
  // North America
  US: { powerDistance: 40, individualism: 91, masculinity: 62, uncertaintyAvoidance: 46, longTermOrientation: 26, indulgence: 68 },
  CA: { powerDistance: 39, individualism: 80, masculinity: 52, uncertaintyAvoidance: 48, longTermOrientation: 36, indulgence: 68 },
  MX: { powerDistance: 81, individualism: 30, masculinity: 69, uncertaintyAvoidance: 82, longTermOrientation: 24, indulgence: 97 },
  // Latin America
  BR: { powerDistance: 69, individualism: 38, masculinity: 49, uncertaintyAvoidance: 76, longTermOrientation: 44, indulgence: 59 },
  AR: { powerDistance: 49, individualism: 46, masculinity: 56, uncertaintyAvoidance: 86, longTermOrientation: 20, indulgence: 62 },
  // Europe
  GB: { powerDistance: 35, individualism: 89, masculinity: 66, uncertaintyAvoidance: 35, longTermOrientation: 51, indulgence: 69 },
  DE: { powerDistance: 35, individualism: 67, masculinity: 66, uncertaintyAvoidance: 65, longTermOrientation: 83, indulgence: 40 },
  FR: { powerDistance: 68, individualism: 71, masculinity: 43, uncertaintyAvoidance: 86, longTermOrientation: 63, indulgence: 48 },
  IT: { powerDistance: 50, individualism: 76, masculinity: 70, uncertaintyAvoidance: 75, longTermOrientation: 61, indulgence: 30 },
  ES: { powerDistance: 57, individualism: 51, masculinity: 42, uncertaintyAvoidance: 86, longTermOrientation: 48, indulgence: 44 },
  NL: { powerDistance: 38, individualism: 80, masculinity: 14, uncertaintyAvoidance: 53, longTermOrientation: 67, indulgence: 68 },
  SE: { powerDistance: 31, individualism: 71, masculinity: 5, uncertaintyAvoidance: 29, longTermOrientation: 53, indulgence: 78 },
  // Oceania
  AU: { powerDistance: 38, individualism: 90, masculinity: 61, uncertaintyAvoidance: 51, longTermOrientation: 21, indulgence: 71 },
  NZ: { powerDistance: 22, individualism: 79, masculinity: 58, uncertaintyAvoidance: 49, longTermOrientation: 33, indulgence: 75 },
  // Middle East / MENA
  AE: { powerDistance: 90, individualism: 25, masculinity: 50, uncertaintyAvoidance: 80, longTermOrientation: 40, indulgence: 52 },
  SA: { powerDistance: 95, individualism: 25, masculinity: 60, uncertaintyAvoidance: 80, longTermOrientation: 36, indulgence: 52 },
  TR: { powerDistance: 66, individualism: 37, masculinity: 45, uncertaintyAvoidance: 85, longTermOrientation: 46, indulgence: 49 },
};

/** Best-effort fallback when country not in table. Returns "global average" approximation. */
const HOFSTEDE_GLOBAL_AVG: HofstedeProfile = {
  powerDistance: 55,
  individualism: 43,
  masculinity: 49,
  uncertaintyAvoidance: 65,
  longTermOrientation: 47,
  indulgence: 45,
};

export function getHofstede(countryCode: string): HofstedeProfile {
  return HOFSTEDE_BY_COUNTRY[countryCode.toUpperCase()] ?? HOFSTEDE_GLOBAL_AVG;
}

/**
 * Render a single country's Hofstede profile as a deterministic prompt
 * block. Designed to slot into persona-generation or country-scoring
 * prompts without bloating token count — each line is one dimension with
 * the score + a one-clause interpretation hint for the LLM.
 *
 * Why interpretation hints inline: bare scores (e.g., "UAI 92") risk the
 * LLM under-weighting them or interpreting in the wrong direction. The
 * hint anchors the meaning (high UAI → conservative consumer trial).
 */
/**
 * Render a compact table covering MULTIPLE countries at once — optimized
 * for the country-scoring prompt where all 10 candidates must share token
 * budget. Each country gets one line with the 5 most decision-relevant
 * dimensions (PD/IDV/UAI/LTO/IND). Compare to renderHofstedeBlock() which
 * expands one country with interpretation hints.
 */
export function renderHofstedeTable(
  countryCodes: string[],
  locale: "ko" | "en" = "ko",
): string {
  const rows = countryCodes.map((c) => {
    const h = getHofstede(c);
    return `  ${c.padEnd(3)} PD=${String(h.powerDistance).padStart(3)} IDV=${String(h.individualism).padStart(3)} UAI=${String(h.uncertaintyAvoidance).padStart(3)} LTO=${String(h.longTermOrientation).padStart(3)} IND=${String(h.indulgence).padStart(3)}`;
  });
  const header =
    locale === "ko"
      ? "═══ 문화 차원 prior (Hofstede 6D · culturalFit sub-score 외부 grounding) ═══"
      : "═══ Cultural dimension prior (Hofstede 6D · culturalFit grounding) ═══";
  const legend =
    locale === "ko"
      ? "PD=Power Distance, IDV=Individualism, UAI=Uncertainty Avoidance (신상품 시도 의지 역지표), LTO=Long-term Orientation (브랜드 충성), IND=Indulgence (impulse/hedonic 수용도). 모두 0-100, 높을수록 강함."
      : "PD=Power Distance, IDV=Individualism, UAI=Uncertainty Avoidance (inverse of new-brand trial willingness), LTO=Long-term Orientation (brand loyalty depth), IND=Indulgence (impulse/hedonic openness). All 0-100, higher = more.";
  const note =
    locale === "ko"
      ? "주의: culturalFit를 산정할 때 K-product origin (KR PD=60, IDV=18, UAI=85, LTO=100, IND=29) 과 candidate의 차원 거리를 고려하세요. UAI 차이가 크면 신규 진출 시 trial barrier 큼. LTO/IDV 정합도 높으면 long-term 채택 가능성 큼."
      : "Note: when scoring culturalFit, compare candidate's profile against K-product origin (KR PD=60, IDV=18, UAI=85, LTO=100, IND=29). Large UAI gap raises trial barrier. Aligned LTO/IDV signals long-term adoption potential.";
  return `${header}\n${legend}\n${rows.join("\n")}\n\n${note}`;
}

export function renderHofstedeBlock(
  countryCode: string,
  locale: "ko" | "en" = "ko",
): string {
  const h = getHofstede(countryCode);
  const interpret = (score: number, label: { low: string; mid: string; high: string }) =>
    score < 40 ? label.low : score >= 70 ? label.high : label.mid;
  if (locale === "ko") {
    return [
      `${countryCode} 문화 차원 (Hofstede, 0-100):`,
      `  Power Distance ${h.powerDistance} — ${interpret(h.powerDistance, { low: "수평적, 권위 약함", mid: "혼합", high: "위계적, 전문가/브랜드 권위 강함" })}`,
      `  Individualism ${h.individualism} — ${interpret(h.individualism, { low: "집단주의, 사회적 cascade 영향 큼", mid: "혼합", high: "개인 의사결정, 자기 취향 우선" })}`,
      `  Uncertainty Avoidance ${h.uncertaintyAvoidance} — ${interpret(h.uncertaintyAvoidance, { low: "신상품 시도 적극", mid: "표준 시도 패턴", high: "신상품 보수적, 규제·인증·환불 보장 중시" })}`,
      `  Long-term Orientation ${h.longTermOrientation} — ${interpret(h.longTermOrientation, { low: "단기 trend·viral 민감", mid: "혼합", high: "장기 신뢰 누적, 브랜드 충성 강함" })}`,
      `  Indulgence ${h.indulgence} — ${interpret(h.indulgence, { low: "절제, 실용 우선", mid: "혼합", high: "즉흥 구매·hedonic 수용도 높음" })}`,
    ].join("\n");
  }
  return [
    `${countryCode} cultural dimensions (Hofstede, 0-100):`,
    `  Power Distance ${h.powerDistance} — ${interpret(h.powerDistance, { low: "flat, weak authority signal", mid: "mixed", high: "hierarchical, expert/brand authority weighty" })}`,
    `  Individualism ${h.individualism} — ${interpret(h.individualism, { low: "collectivist, social-cascade adoption strong", mid: "mixed", high: "individual choice, self-taste primacy" })}`,
    `  Uncertainty Avoidance ${h.uncertaintyAvoidance} — ${interpret(h.uncertaintyAvoidance, { low: "high trial willingness for new brands", mid: "standard trial patterns", high: "conservative on unknowns, demands certification / guarantees" })}`,
    `  Long-term Orientation ${h.longTermOrientation} — ${interpret(h.longTermOrientation, { low: "short-term trend / viral sensitive", mid: "mixed", high: "long-term trust accrual, strong brand loyalty" })}`,
    `  Indulgence ${h.indulgence} — ${interpret(h.indulgence, { low: "restrained, utility-first", mid: "mixed", high: "impulse buying / hedonic openness high" })}`,
  ].join("\n");
}

/**
 * Competition score rubric thresholds — band edges the LLM is told to
 * use when scoring components.competition.
 *
 * Rendered into the prompt at runtime; lives here so the bands aren't
 * silently edited inside a long prompt string. If we change a band, we
 * change it once and re-validate.
 */

import { calibrated } from "./provenance";

export interface CompetitionBand {
  label: string;
  min: number;
  max: number;
  /** When the band applies — the rubric the LLM matches against. */
  conditionEn: string;
  conditionKo: string;
}

export const COMPETITION_RUBRIC_BANDS = calibrated<CompetitionBand[]>(
  [
    {
      label: "moderate-coexistence",
      min: 50,
      max: 65,
      conditionEn:
        "Strong incumbent + clear differentiation axis in description (taste tier, price tier, origin story, occasion, ingredient claim) — coexistence viable",
      conditionKo:
        "강한 incumbent + description에 명확한 차별화 축 (맛/가격/원산지/사용 시나리오/성분 인증) — 공존 가능",
    },
    {
      label: "crowded",
      min: 25,
      max: 40,
      conditionEn:
        "Strong incumbent + weak / generic positioning ('better quality') — genuinely crowded",
      conditionKo: "강한 incumbent + 약한·일반 포지셔닝 ('더 나은 품질') — 실제 포화",
    },
    {
      label: "loses",
      min: 15,
      max: 30,
      conditionEn:
        "Strong incumbent + product positioned as cheaper-me-too — likely loses",
      conditionKo: "강한 incumbent + 가격 me-too 포지셔닝 — 패배 가능성 높음",
    },
    {
      label: "open-lane",
      min: 65,
      max: 85,
      conditionEn: "Few incumbents or fragmented market — open lane",
      conditionKo: "incumbent가 적거나 시장이 분산 — open lane",
    },
  ],
  {
    source: "TUNING_ANCHOR",
    rationale:
      "Bands chosen to operationalize the segment-differentiation rule (Shin Ramyun US miscall: scored 46 because Maruchan/Nissin strong, but Nongshim America actually generates $538M/yr). Band edges are eyeballed — they communicate magnitude differences (50-65 vs 25-40) but the exact numbers are uncertain. Replace with empirical band-fit when 6+ products with public competition-share data are validated.",
    informedByRuns: [
      "Shin Ramyun (2nd run, 2026-05-14) — competition 46 miscall",
      "Buldak (1st + 5th runs) — same pattern",
    ],
    holdoutProducts: [],
    lastReviewed: "2026-05-14",
    reviewBy: "2026-08-14",
  },
);

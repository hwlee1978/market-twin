/**
 * Plain-language meanings for the two graded labels a report shows.
 *
 * Both scales have a middle grade spelled MODERATE, and they measure
 * different things — confidence is how much the independent sims agreed
 * on a market, variance is how far their scores moved. Seeing "MODERATE"
 * twice on one page with no explanation is the reported confusion this
 * module exists to remove, so the variance labels are deliberately given
 * different words (안정적 / 보통 / 불안정) rather than sharing the
 * confidence vocabulary.
 *
 * Kept next to the aggregator that assigns the labels, and imported by
 * both the results page and the PDF, so the two can never drift into
 * describing the same grade differently.
 */

export type ConfidenceGrade = "STRONG" | "MODERATE" | "WEAK";
export type VarianceGrade = "low" | "moderate" | "high";
export type GradeLocale = "ko" | "en";

export interface GradeCopy {
  /** Short label for the chip. */
  label: string;
  /** One line: what this grade means. */
  meaning: string;
  /** What the reader should do about it. */
  action: string;
}

const CONFIDENCE: Record<GradeLocale, Record<ConfidenceGrade, GradeCopy>> = {
  ko: {
    STRONG: {
      label: "높음",
      meaning:
        "독립 시뮬레이션의 3분의 2 이상이 같은 시장을 1순위로 지목했고, 서로 다른 AI 모델의 판단도 일치하며, 2순위와의 격차가 뚜렷합니다.",
      action: "이 추천을 단독 근거로 진출 시장을 결정할 수 있습니다.",
    },
    MODERATE: {
      label: "보통",
      meaning:
        "과반에 가까운 합의는 형성됐으나, 모델 간 이견이 있거나 2순위와의 격차가 크지 않습니다.",
      action: "진출 방향의 근거로는 충분하되, 단일 시장으로 좁히기 전 2순위를 함께 검토하십시오.",
    },
    WEAK: {
      label: "낮음",
      meaning:
        "시뮬레이션 간 판단이 갈렸거나, 판단의 토대가 된 공식 통계·시장 자료가 얇습니다.",
      action:
        "이 결과만으로 시장을 결정하지 마십시오. 상위 등급으로 재실행하거나 후보 시장을 좁혀 다시 분석하는 것을 권합니다.",
    },
  },
  en: {
    STRONG: {
      label: "Strong",
      meaning:
        "Two-thirds or more of the independent simulations put the same market first, different AI models agreed, and the gap to the runner-up is clear.",
      action: "This recommendation can carry the market decision on its own.",
    },
    MODERATE: {
      label: "Moderate",
      meaning:
        "There is near-majority agreement, but the models diverge or the runner-up is close behind.",
      action:
        "Sound enough to set direction; evaluate the runner-up before narrowing to a single market.",
    },
    WEAK: {
      label: "Weak",
      meaning:
        "The simulations disagreed, or the official statistics and market evidence underpinning them were thin.",
      action:
        "Do not decide a market on this alone. Re-run at a higher tier, or narrow the candidate list and analyse again.",
    },
  },
};

/**
 * Variance wording takes the measured range so the sentence can name it.
 * "Scores moved somewhat" tells the reader nothing they can act on;
 * "the same country scored up to 27.8 points apart, so countries within
 * that of each other are not really ranked" does.
 */
function varianceText(
  grade: VarianceGrade,
  locale: GradeLocale,
  maxRange?: number,
): GradeCopy {
  const n = maxRange != null ? Math.round(maxRange * 10) / 10 : null;
  const ko = n != null ? `최대 ${n}점` : "크지 않은 폭";
  const en = n != null ? `up to ${n} points` : "a small amount";

  if (locale === "ko") {
    if (grade === "low") {
      return {
        label: "안정적",
        meaning: `같은 국가의 점수가 시뮬레이션마다 거의 달라지지 않았습니다(${ko} 차이).`,
        action: "국가 순위를 그대로 신뢰하셔도 됩니다.",
      };
    }
    if (grade === "high") {
      return {
        label: "불안정",
        meaning: `같은 국가인데도 시뮬레이션에 따라 점수가 ${ko}까지 벌어졌습니다.`,
        action:
          "점수 차가 이 폭에 못 미치는 국가들끼리는 순위를 신뢰하기 어렵습니다. 시뮬 횟수를 늘리면 순서가 안정됩니다.",
      };
    }
    return {
      label: "보통",
      meaning: `같은 국가라도 시뮬레이션에 따라 점수가 ${ko}까지 달랐습니다. 흔히 나타나는 정도입니다.`,
      action: `점수가 몇 점 차이로 갈린 국가끼리는 우열이 뒤집힐 수 있습니다. 1위와 2위가 근소하면 두 곳을 함께 검토하십시오.`,
    };
  }

  if (grade === "low") {
    return {
      label: "Stable",
      meaning: `A country scored almost the same in every simulation (${en} apart).`,
      action: "You can take the country ranking at face value.",
    };
  }
  if (grade === "high") {
    return {
      label: "Volatile",
      meaning: `The same country scored ${en} apart depending on the simulation.`,
      action:
      "Where countries are separated by less than that, the ordering is not reliable. More simulations will settle it.",
    };
  }
  return {
    label: "Normal",
    meaning: `A country scored ${en} apart between simulations — a common amount of movement.`,
    action:
      "Countries separated by only a few points could swap places. If first and second are close, evaluate both.",
  };
}

export function confidenceCopy(grade: ConfidenceGrade, locale: GradeLocale): GradeCopy {
  return CONFIDENCE[locale][grade] ?? CONFIDENCE[locale].WEAK;
}

export function varianceCopyFor(
  grade: VarianceGrade,
  locale: GradeLocale,
  maxRange?: number,
): GradeCopy {
  return varianceText(grade, locale, maxRange);
}

/** All three confidence grades, for rendering a legend. */
export function confidenceLegend(locale: GradeLocale): Array<GradeCopy & { grade: ConfidenceGrade }> {
  return (["STRONG", "MODERATE", "WEAK"] as const).map((g) => ({
    grade: g,
    ...CONFIDENCE[locale][g],
  }));
}

/**
 * How the grade is arrived at. Shown under the legend so the label
 * reads as a measurement rather than an opinion.
 */
export function confidenceBasis(locale: GradeLocale): string {
  return locale === "ko"
    ? "신뢰도는 정확도 보증이 아니라 독립 시뮬레이션 간 합의 정도입니다. 우승 시장의 1순위 득표율(66% 이상 / 40% 이상 / 그 미만)에서 출발해, 근거 자료가 얇거나 모델 간 판단이 갈리거나 2순위와의 격차가 좁으면 한 단계씩 낮춥니다."
    : "Confidence measures agreement between independent simulations, not accuracy. It starts from the winning market's first-place vote share (≥66% / ≥40% / below) and is lowered a grade when the evidence base is thin, the models disagree, or the runner-up is close.";
}

/* ────────────────────────────────────────────────────────────────
   Action scoring — impact and effort.
   ──────────────────────────────────────────────────────────────── */

export type ActionScore = 1 | 2 | 3;

/**
 * The 1-3 scales the merge step assigns to every recommended action.
 *
 * These were defined only in a Zod comment and then printed raw
 * ("effort=3, impact=3") into action text a customer reads. Three out
 * of three sounds like a rating; it is a bucket, and which bucket
 * changes what the reader should do with the action.
 */
const IMPACT: Record<GradeLocale, Record<ActionScore, string>> = {
  ko: {
    1: "소폭 개선",
    2: "유의미한 변화",
    3: "출시를 좌우",
  },
  en: {
    1: "Incremental",
    2: "Meaningful",
    3: "Launch-defining",
  },
};

const EFFORT: Record<GradeLocale, Record<ActionScore, string>> = {
  ko: {
    1: "며칠",
    2: "몇 주",
    3: "몇 달 이상",
  },
  en: {
    1: "Days",
    2: "Weeks",
    3: "Months or more",
  },
};

export function impactLabel(score: number | undefined, locale: GradeLocale): string | null {
  if (score !== 1 && score !== 2 && score !== 3) return null;
  return IMPACT[locale][score];
}

export function effortLabel(score: number | undefined, locale: GradeLocale): string | null {
  if (score !== 1 && score !== 2 && score !== 3) return null;
  return EFFORT[locale][score];
}

/** One line defining both scales, for a footnote under an action list. */
export function actionScaleNote(locale: GradeLocale): string {
  return locale === "ko"
    ? "영향도 1 소폭 개선 · 2 유의미한 변화 · 3 출시를 좌우 | 난이도 1 며칠 · 2 몇 주 · 3 몇 달 이상(신규 파트너·인증 등)"
    : "Impact 1 incremental · 2 meaningful · 3 launch-defining | Effort 1 days · 2 weeks · 3 months or more (new partner, certification)";
}

/**
 * Strip score notation the model leaks into action prose.
 *
 * impact and effort are separate JSON fields, but the merge prompt
 * necessarily discusses them as "effort=3", and the model copies that
 * notation into the action text: "【즉시 착수 — 2026년 10월, effort=3,
 * impact=3】 SFA 수입 등록…". The reader sees a bare 3 with no scale
 * anywhere, and the renderer already shows both scores properly beside
 * the action, so the inline copy is duplicate as well as cryptic.
 *
 * Applied at render time rather than at merge, because every narrative
 * already stored carries it.
 */
export function stripActionScoreNotation(text: string): string {
  return text
    // Inside a 【…】 prefix: drop just the score pairs, keep the timing.
    .replace(/【([^】]*)】/g, (whole, inner: string) => {
      const cleaned = inner
        // The unit belongs to the notation when the model writes one
        // ("effort=3개월"); leaving it behind produced "2026년 10월개월".
        .replace(
          /[,·|;]?\s*(?:effort|impact|난이도|영향도?)\s*[=:]\s*\d+\s*(?:개월|주|일|months?|weeks?|days?)?/gi,
          "",
        )
        .replace(/^\s*[,·|;]\s*/, "")
        .replace(/\s*[,·|;]\s*$/, "")
        .trim();
      return cleaned ? `【${cleaned}】` : "";
    })
    // Bare occurrences outside any bracket.
    .replace(
      /\(?\s*(?:effort|impact)\s*[=:]\s*\d+\s*(?:개월|주|일|months?|weeks?|days?)?\s*(?:[,·|/]\s*(?:effort|impact)\s*[=:]\s*\d+\s*(?:개월|주|일|months?|weeks?|days?)?\s*)?\)?/gi,
      "",
    )
    .replace(/\s{2,}/g, " ")
    .trim();
}

/* ────────────────────────────────────────────────────────────────
   Metric units — what a bare number on a card actually is.
   ──────────────────────────────────────────────────────────────── */

export type SegmentMetric = "volume" | "cac" | "competition" | "overall";

/**
 * Format a segment figure with its unit, and caption the scale.
 *
 * The strategy cards printed "VN 4.20" next to "TW 68.0" — dollars and
 * a 0-100 score, side by side, neither labelled. A reader cannot tell
 * that 4.20 is good and 43.0 is also good, for different reasons, or
 * that one of them is money.
 */
export function formatSegmentValue(
  metric: SegmentMetric,
  value: number,
  locale: GradeLocale,
): { text: string; caption: string } {
  if (metric === "cac") {
    return {
      text: `$${value.toFixed(2)}`,
      caption: locale === "ko" ? "고객 1명 획득 비용 · 낮을수록 좋음" : "per customer acquired · lower is better",
    };
  }
  if (metric === "competition") {
    return {
      text: value.toFixed(1),
      caption:
        locale === "ko"
          ? "경쟁 강도 100점 만점 · 낮을수록 경쟁이 약함"
          : "competitive density out of 100 · lower means less crowded",
    };
  }
  if (metric === "volume") {
    return {
      text: value.toFixed(1),
      caption:
        locale === "ko" ? "수요 점수 100점 만점 · 높을수록 좋음" : "demand score out of 100 · higher is better",
    };
  }
  return {
    text: value.toFixed(1),
    caption:
      locale === "ko"
        ? "종합 점수 100점 만점 · 수요·경쟁·비용 가중평균"
        : "overall score out of 100 · weighted demand, competition and cost",
  };
}

/**
 * True when a model-written field is a non-answer rather than content.
 *
 * The margin estimate is the case that surfaced it: when the sims find
 * no margin benchmark, the merge writes the literal string "n/a", and
 * the renderer's only guard was `!== "—"`. So a card appeared with the
 * heading "예상 마진 분석", the body "n/a", and a footnote explaining
 * where the (absent) figure came from. Empty is fine; a card that says
 * nothing while looking like it says something is not.
 */
export function isNonAnswer(text: string | null | undefined): boolean {
  if (!text) return true;
  const t = text.trim().toLowerCase().replace(/[.\s]+$/, "");
  return (
    t === "" ||
    t === "n/a" ||
    t === "na" ||
    t === "—" ||
    t === "-" ||
    t === "없음" ||
    t === "해당 없음" ||
    t === "정보 없음" ||
    t === "unknown" ||
    t === "not available" ||
    t === "not applicable"
  );
}

/**
 * True only when the engine refused to name a single winner.
 *
 * `recommendation.secondary` is populated whenever two or more countries
 * scored — it is the runner-up, not a verdict. The tie verdict lives in
 * `displayMode`, which turns "top2" when fewer than two of the three
 * dominance checks pass (mean gap >= 5pt, top-1 vote share >= 50%, every
 * provider agreeing).
 *
 * Calling a 2nd-place market an "equal candidate" when the engine named a
 * single winner overstates the result: a run with SG on 50% of the vote
 * and TW on 33% was being presented as a dead heat on screen and in the
 * PDF.
 */
export function isTieResult(displayMode: string | null | undefined): boolean {
  return displayMode === "top2";
}

export interface SecondaryCopy {
  /** Heading prefix, e.g. "2순위 후보 리스크". */
  label: string;
  /** Short badge shown beside a populated section heading. */
  chip: string;
  /** Lead-in for the generate CTA paragraph. */
  lead: string;
}

/**
 * Wording for the runner-up sections. Lives here rather than in the web
 * component so the results page and the PDF report cannot drift apart —
 * they had already drifted once, each carrying its own tie detection.
 */
export function secondaryCopy(isTie: boolean, locale: "ko" | "en"): SecondaryCopy {
  const isKo = locale === "ko";
  if (isTie) {
    return {
      label: isKo ? "Top 2 동등 후보" : "Top 2 tie",
      chip: isKo ? "동등 후보" : "tied",
      lead: isKo ? "Top 2 동등 후보이므로" : "This is a Top 2 tie, so",
    };
  }
  return {
    label: isKo ? "2순위 후보" : "Runner-up",
    chip: isKo ? "2순위" : "#2",
    lead: isKo ? "2순위 후보 시장도 함께 보려면" : "To weigh the runner-up market as well,",
  };
}

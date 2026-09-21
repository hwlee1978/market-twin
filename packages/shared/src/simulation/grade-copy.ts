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

const VARIANCE: Record<GradeLocale, Record<VarianceGrade, GradeCopy>> = {
  ko: {
    low: {
      label: "안정적",
      meaning: "같은 국가의 점수가 시뮬레이션마다 거의 같게 나왔습니다.",
      action: "단일 시뮬레이션만으로도 비슷한 결론에 도달했을 것입니다.",
    },
    moderate: {
      label: "보통",
      meaning: "국가 점수가 시뮬레이션마다 어느 정도 움직였습니다. 통상적인 범위입니다.",
      action: "개별 점수의 소수점보다 국가 간 순서를 기준으로 읽으십시오.",
    },
    high: {
      label: "불안정",
      meaning: "국가 점수가 시뮬레이션마다 크게 달라졌습니다.",
      action:
        "점수 차이가 작은 국가들은 사실상 동률로 보아야 합니다. 시뮬 횟수를 늘리면 순서가 안정됩니다.",
    },
  },
  en: {
    low: {
      label: "Stable",
      meaning: "A country's score barely moved between simulations.",
      action: "A single simulation would have reached much the same conclusion.",
    },
    moderate: {
      label: "Normal",
      meaning: "Country scores moved somewhat between runs — the usual range.",
      action: "Read the ordering between countries rather than the decimals of any one score.",
    },
    high: {
      label: "Volatile",
      meaning: "Country scores moved a great deal between simulations.",
      action:
        "Treat closely-scored countries as effectively tied. More simulations will settle the ordering.",
    },
  },
};

export function confidenceCopy(grade: ConfidenceGrade, locale: GradeLocale): GradeCopy {
  return CONFIDENCE[locale][grade] ?? CONFIDENCE[locale].WEAK;
}

export function varianceCopyFor(grade: VarianceGrade, locale: GradeLocale): GradeCopy {
  return VARIANCE[locale][grade] ?? VARIANCE[locale].moderate;
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

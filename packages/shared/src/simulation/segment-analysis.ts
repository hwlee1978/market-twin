/**
 * Segment-breakdown analysis helpers — generate human-readable
 * commentary for tables that otherwise leave interpretation to the
 * reader. Pure deterministic functions: no LLM calls, runs render-
 * side in both PDF and dashboard so the two stay in sync.
 *
 * Currently provides: income × intent. Expand as needed for
 * gender / age cuts.
 */

export interface SegmentRow {
  bucket: string;
  count: number;
  meanIntent: number;
  topCountry: string;
  topCountryShare: number;
}

export interface IncomeIntentAnalysis {
  /** Three to six bullet points, in the report's locale. */
  bullets: string[];
  /** A one-sentence headline summarizing the strategic implication. */
  headline: string;
  /** Tone classification used to colour the headline in the UI/PDF. */
  tone: "success" | "warn" | "risk" | "neutral";
}

const INCOME_ORDER = [
  "<$30k",
  "$30-60k",
  "$60-100k",
  "$100-150k",
  "$150k+",
];

/**
 * Compute an ordering index for an income bucket. The aggregator
 * normalizes incomes into a small set of canonical labels; we sort
 * by their economic ordering rather than alphabetical so trend
 * detection works.
 */
function incomeRank(bucket: string): number {
  const idx = INCOME_ORDER.indexOf(bucket);
  return idx === -1 ? 99 : idx;
}

export function analyzeIncomeIntent(
  rows: SegmentRow[],
  locale: "ko" | "en" = "ko",
): IncomeIntentAnalysis {
  const isKo = locale === "ko";
  if (rows.length === 0) {
    return {
      bullets: [],
      headline: isKo ? "데이터 부족 — 분석 불가" : "Insufficient data",
      tone: "neutral",
    };
  }

  // Order rows by income bucket. Some segments may have non-canonical
  // labels — those drop to the end via the rank-99 default.
  const sorted = [...rows].sort((a, b) => incomeRank(a.bucket) - incomeRank(b.bucket));
  const sortedReverse = [...sorted].reverse();

  const totalN = sorted.reduce((s, r) => s + r.count, 0);
  const overallMean =
    totalN > 0
      ? sorted.reduce((s, r) => s + r.meanIntent * r.count, 0) / totalN
      : 0;

  // Trend detection: monotonic up / monotonic down / flat / U-shaped
  // We use the income-ordered rows.
  let monotonicUp = true;
  let monotonicDown = true;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].meanIntent < sorted[i - 1].meanIntent) monotonicUp = false;
    if (sorted[i].meanIntent > sorted[i - 1].meanIntent) monotonicDown = false;
  }
  // "Strong" = first/last differ by ≥6pt.
  const intentRange =
    sorted.length >= 2
      ? sorted[sorted.length - 1].meanIntent - sorted[0].meanIntent
      : 0;
  const strongTrend = Math.abs(intentRange) >= 6;

  // Champion / weak segment identification — bucket with highest
  // intent (must have meaningful sample).
  const ROBUST_N = 30;
  const bigSamples = sorted.filter((r) => r.count >= ROBUST_N);
  const champion =
    bigSamples.length > 0
      ? bigSamples.reduce((best, r) => (r.meanIntent > best.meanIntent ? r : best))
      : sorted.reduce((best, r) => (r.meanIntent > best.meanIntent ? r : best));
  const weakest = sorted.reduce((worst, r) =>
    r.meanIntent < worst.meanIntent ? r : worst,
  );

  // Country preference shifts — does the top country differ across
  // income tiers?
  const uniqueCountries = new Set(sorted.map((r) => r.topCountry));
  const countryShift = uniqueCountries.size > 1;

  // Sample-size warnings.
  const smallSamples = sorted.filter((r) => r.count < ROBUST_N);

  const bullets: string[] = [];

  // Bullet 1: trend.
  if (monotonicUp && strongTrend) {
    bullets.push(
      isKo
        ? `소득이 높을수록 구매의향도 함께 올라갑니다 (가장 낮은 소득대 ${sorted[0].meanIntent.toFixed(1)}점 → 가장 높은 소득대 ${sorted[sorted.length - 1].meanIntent.toFixed(1)}점). 가격을 올려도 수요가 크게 줄지 않는 구조라 프리미엄 가격이 가능합니다.`
        : `The higher the income, the higher the intent (lowest bracket ${sorted[0].meanIntent.toFixed(1)} → highest ${sorted[sorted.length - 1].meanIntent.toFixed(1)}). Demand holds up as the price rises, so premium pricing is viable.`,
    );
  } else if (monotonicDown && strongTrend) {
    bullets.push(
      isKo
        ? `소득이 높을수록 구매의향이 떨어집니다 (${sortedReverse[0].meanIntent.toFixed(1)}점 → ${sortedReverse[sortedReverse.length - 1].meanIntent.toFixed(1)}점). 가성비를 앞세운 보급형 포지셔닝이 맞습니다.`
        : `The higher the income, the lower the intent (${sortedReverse[0].meanIntent.toFixed(1)} → ${sortedReverse[sortedReverse.length - 1].meanIntent.toFixed(1)}). Value, entry-tier positioning is the play.`,
    );
  } else if (Math.abs(intentRange) < 4) {
    bullets.push(
      isKo
        ? `소득대별 구매의향 차이가 거의 없습니다 (가장 높은 소득대와 가장 낮은 소득대의 차이 ${intentRange.toFixed(1)}점). 소득은 구매를 가르는 요인이 아니므로, 직업·문화 같은 다른 축에서 차이를 찾아야 합니다.`
        : `Intent barely differs between income brackets (${intentRange.toFixed(1)} points between highest and lowest). Income is not what decides the purchase — look at profession and culture instead.`,
    );
  } else {
    bullets.push(
      isKo
        ? `소득과 구매의향이 비례하지 않습니다 — 특정 소득대에서만 의향이 튀어 오릅니다. 하나의 가격으로 전체를 공략하기보다 소득대별로 가격대를 나누는 편이 낫습니다.`
        : `Intent does not track income — it jumps in particular brackets and not others. Splitting the price by bracket will do more than one price for everyone.`,
    );
  }

  // Bullet 2: champion segment.
  bullets.push(
    isKo
      ? `가장 반응이 좋은 소득대는 ${champion.bucket}입니다 (평균 구매의향 ${champion.meanIntent.toFixed(1)}점, 페르소나 ${champion.count}명, 그중 ${champion.topCountryShare}%가 ${champion.topCountry} 시장). 초기 고객 확보는 여기부터 공략하세요.`
      : `The ${champion.bucket} bracket responds best (mean intent ${champion.meanIntent.toFixed(1)}, ${champion.count} personas, ${champion.topCountryShare}% of them in ${champion.topCountry}). Start acquisition here.`,
  );

  // Bullet 3: country shift insight.
  if (countryShift) {
    const lowIncomeCountry = sorted[0]?.topCountry;
    const highIncomeCountry = sorted[sorted.length - 1]?.topCountry;
    if (lowIncomeCountry && highIncomeCountry && lowIncomeCountry !== highIncomeCountry) {
      bullets.push(
        isKo
          ? `소득대에 따라 주력 시장이 갈립니다 — 낮은 소득대(${sorted[0].bucket})는 ${lowIncomeCountry}, 높은 소득대(${sorted[sorted.length - 1].bucket})는 ${highIncomeCountry}에 몰려 있습니다. 같은 제품이라도 시장별로 가격대를 달리 가져갈 여지가 있습니다.`
          : `Which market dominates changes with income — the ${sorted[0].bucket} bracket sits in ${lowIncomeCountry}, the ${sorted[sorted.length - 1].bucket} bracket in ${highIncomeCountry}. The same product can carry a different price in each.`,
      );
    } else {
      bullets.push(
        isKo
          ? `소득대마다 1순위 시장이 달라 모두 ${uniqueCountries.size}개 시장이 등장합니다 — 가격과 채널을 시장별로 나눠 설계하는 것을 검토하세요.`
          : `${uniqueCountries.size} different markets come out on top across the income brackets — price and channel are worth planning market by market.`,
      );
    }
  } else {
    bullets.push(
      isKo
        ? `모든 소득대에서 ${sorted[0].topCountry}가 1순위입니다 — 한 시장에 집중하는 전략이 맞습니다.`
        : `${sorted[0].topCountry} comes first in every income bracket — a single-market focus fits.`,
    );
  }

  // Bullet 4: weak segment / lowest priority.
  if (weakest.bucket !== champion.bucket && weakest.meanIntent < overallMean - 5) {
    bullets.push(
      isKo
        ? `가장 반응이 약한 소득대는 ${weakest.bucket}입니다 (평균 구매의향 ${weakest.meanIntent.toFixed(1)}점, 페르소나 ${weakest.count}명). 마케팅 비용 대비 효과가 낮아 우선순위에서 빼는 것을 검토하세요.`
        : `The ${weakest.bucket} bracket responds worst (mean intent ${weakest.meanIntent.toFixed(1)}, ${weakest.count} personas). Marketing there returns little — worth deprioritising.`,
    );
  }

  // Bullet 5: sample-size warning, only when meaningful.
  if (smallSamples.length > 0) {
    const smallList = smallSamples
      .map((r) => (isKo ? `${r.bucket} ${r.count}명` : `${r.bucket} (${r.count})`))
      .join(", ");
    bullets.push(
      isKo
        ? `표본이 적은 소득대에 주의하세요: ${smallList}. 페르소나가 30명 미만이면 몇 사람의 응답만으로 평균이 흔들립니다. 시뮬을 더 돌리면 값이 안정됩니다.`
        : `Treat these brackets carefully — the sample is small: ${smallList}. Under 30 personas, a handful of answers can move the average. More sims would settle it.`,
    );
  }

  // Headline + tone.
  let headline: string;
  let tone: IncomeIntentAnalysis["tone"];
  if (monotonicUp && strongTrend) {
    headline = isKo
      ? "고소득층이 가장 잘 반응합니다 — 프리미엄 가격과 고소득 타깃 광고가 맞습니다."
      : "High earners respond best — premium pricing and high-income targeting are the fit.";
    tone = "success";
  } else if (monotonicDown && strongTrend) {
    headline = isKo
      ? "저소득층이 핵심 고객입니다 — 가성비 가격과 폭넓은 타깃 광고가 맞습니다."
      : "Lower earners are the core customer — value pricing and broad targeting are the fit.";
    tone = "warn";
  } else if (Math.abs(intentRange) < 4) {
    headline = isKo
      ? "소득대별 반응 차이가 거의 없습니다 — 가격이 아니라 직업·문화에서 차이를 찾아야 합니다."
      : "Intent is much the same across brackets — the difference lies in profession and culture, not price.";
    tone = "neutral";
  } else {
    headline = isKo
      ? "소득이 높다고 더 사지는 않습니다 — 반응이 튀는 소득대에 가격을 맞추세요."
      : "Earning more does not mean buying more — price to the brackets that actually jump.";
    tone = "warn";
  }

  return { bullets, headline, tone };
}

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
        ? `소득이 높을수록 구매의향이 일관되게 상승 (최저 ${sorted[0].meanIntent.toFixed(1)} → 최고 ${sorted[sorted.length - 1].meanIntent.toFixed(1)}). 비탄력적 수요 = 프리미엄 가격 책정 가능.`
        : `Intent rises monotonically with income (low ${sorted[0].meanIntent.toFixed(1)} → high ${sorted[sorted.length - 1].meanIntent.toFixed(1)}). Inelastic demand = premium pricing viable.`,
    );
  } else if (monotonicDown && strongTrend) {
    bullets.push(
      isKo
        ? `소득이 높을수록 구매의향이 일관되게 하락 (최저 ${sortedReverse[0].meanIntent.toFixed(1)} → 최고 ${sortedReverse[sortedReverse.length - 1].meanIntent.toFixed(1)}). 가치 / 엔트리 시장 포지셔닝이 핵심.`
        : `Intent falls monotonically with income (top ${sortedReverse[0].meanIntent.toFixed(1)} → bottom ${sortedReverse[sortedReverse.length - 1].meanIntent.toFixed(1)}). Value / entry-tier positioning is the play.`,
    );
  } else if (Math.abs(intentRange) < 4) {
    bullets.push(
      isKo
        ? `소득대 간 의향 격차가 좁음 (range ${intentRange.toFixed(1)}pt). 가격은 소득과 거의 무관 — 다른 차원(직업·문화 등)이 결정 요인.`
        : `Intent is similar across income brackets (range ${intentRange.toFixed(1)}pt). Income is not the price driver — other dimensions (profession, culture) are.`,
    );
  } else {
    bullets.push(
      isKo
        ? `소득과 의향이 비단조 관계 (특정 소득대에서 spike). 단일 가격 전략보다 세그먼트별 차별화 검토.`
        : `Non-monotonic income-intent relationship (peaks in specific brackets). Consider segment-tier pricing rather than a single price.`,
    );
  }

  // Bullet 2: champion segment.
  bullets.push(
    isKo
      ? `최강 세그먼트: **${champion.bucket}** (의향 ${champion.meanIntent.toFixed(1)}, n=${champion.count}, 주 시장 ${champion.topCountry} ${champion.topCountryShare}%) — 1차 acquisition 우선 타겟.`
      : `Strongest segment: **${champion.bucket}** (intent ${champion.meanIntent.toFixed(1)}, n=${champion.count}, top market ${champion.topCountry} ${champion.topCountryShare}%) — primary acquisition target.`,
  );

  // Bullet 3: country shift insight.
  if (countryShift) {
    const lowIncomeCountry = sorted[0]?.topCountry;
    const highIncomeCountry = sorted[sorted.length - 1]?.topCountry;
    if (lowIncomeCountry && highIncomeCountry && lowIncomeCountry !== highIncomeCountry) {
      bullets.push(
        isKo
          ? `소득대별 시장 선호도 분기: 저소득(${sorted[0].bucket})은 **${lowIncomeCountry}**, 고소득(${sorted[sorted.length - 1].bucket})은 **${highIncomeCountry}** — 동일 제품도 시장별 가격대를 차별화할 여지.`
          : `Country preference shifts across income: low (${sorted[0].bucket}) → **${lowIncomeCountry}**, high (${sorted[sorted.length - 1].bucket}) → **${highIncomeCountry}**. Differentiated per-market pricing has room here.`,
      );
    } else {
      bullets.push(
        isKo
          ? `소득대별로 ${uniqueCountries.size}개 시장이 1순위로 등장 — 가격 포지셔닝과 채널 전략을 시장별로 분기 검토.`
          : `${uniqueCountries.size} different markets surface as #1 across income tiers — consider per-market pricing and channel differentiation.`,
      );
    }
  } else {
    bullets.push(
      isKo
        ? `모든 소득대에서 동일 시장(**${sorted[0].topCountry}**)이 1순위 — 단일 시장 집중 전략 적합.`
        : `Same market (**${sorted[0].topCountry}**) is #1 across all income tiers — single-market focus strategy fits.`,
    );
  }

  // Bullet 4: weak segment / lowest priority.
  if (weakest.bucket !== champion.bucket && weakest.meanIntent < overallMean - 5) {
    bullets.push(
      isKo
        ? `가장 약한 세그먼트: **${weakest.bucket}** (의향 ${weakest.meanIntent.toFixed(1)}, n=${weakest.count}) — 마케팅 ROI 낮음, 우선순위에서 제외 검토.`
        : `Weakest segment: **${weakest.bucket}** (intent ${weakest.meanIntent.toFixed(1)}, n=${weakest.count}) — low marketing ROI, deprioritize.`,
    );
  }

  // Bullet 5: sample-size warning, only when meaningful.
  if (smallSamples.length > 0) {
    const smallList = smallSamples.map((r) => `${r.bucket} (n=${r.count})`).join(", ");
    bullets.push(
      isKo
        ? `샘플 크기 주의: ${smallList} — 30명 미만 세그먼트는 의향 평균이 노이즈에 민감. 추가 시뮬로 보강 권장.`
        : `Small samples: ${smallList} — fewer than 30 personas means high noise sensitivity. Consider additional sims for confidence.`,
    );
  }

  // Headline + tone.
  let headline: string;
  let tone: IncomeIntentAnalysis["tone"];
  if (monotonicUp && strongTrend) {
    headline = isKo
      ? "고소득층이 챔피언 세그먼트 — 프리미엄 포지셔닝 + 고소득 타겟 광고가 정답."
      : "High-income brackets are the champion segment — premium positioning + high-income targeting wins.";
    tone = "success";
  } else if (monotonicDown && strongTrend) {
    headline = isKo
      ? "저소득층이 핵심 시장 — 가치/엔트리 가격 + 광범위 타겟 광고 구조 권장."
      : "Lower-income brackets are the core market — value pricing + broad-target advertising fit best.";
    tone = "warn";
  } else if (Math.abs(intentRange) < 4) {
    headline = isKo
      ? "소득대별 의향 격차 좁음 — 가격이 결정 요인이 아님. 직업/문화 차원에서 차별화 모색."
      : "Income brackets show similar intent — price isn't the deciding factor. Differentiate on profession/culture.";
    tone = "neutral";
  } else {
    headline = isKo
      ? "비단조 관계 — 특정 소득대 spike에 맞춘 세그먼트별 가격 전략 검토."
      : "Non-monotonic relationship — explore segment-tier pricing aligned with the income spikes.";
    tone = "warn";
  }

  return { bullets, headline, tone };
}

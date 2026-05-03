/**
 * Ensemble PDF builder. Multi-page report sized to the tier the buyer
 * paid for: roughly 10 pages for 초기검증, ~15 for 검증분석, ~20 for
 * 심층분석. The shape is the same across tiers — what changes is which
 * sections appear and how many items each one renders. TIER_BUDGET is
 * the single source of truth for that visibility decision so we don't
 * scatter `if (tier === 'deep')` branches throughout the doc tree.
 */
import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { Style } from "@react-pdf/types";
import { splitByFont } from "./fonts";
import type { EnsembleAggregate } from "@/lib/simulation/ensemble";
import { getCountryLabel } from "@/lib/countries";

const C = {
  brand: "#0A1F4D",
  brandSoft: "#EAF0FB",
  ink: "#0F172A",
  body: "#334155",
  muted: "#64748B",
  faint: "#94A3B8",
  divider: "#E2E8F0",
  card: "#F8FAFC",
  success: "#16A34A",
  warn: "#CA8A04",
  risk: "#DC2626",
};

type TierName =
  | "hypothesis"
  | "decision"
  | "decision_plus"
  | "deep"
  | "deep_pro";

/**
 * Per-tier content budgets. Drives both how much we render in each
 * section and which optional pages appear at all. Numbers are item
 * caps — we always show fewer if the data has fewer entries.
 */
const TIER_BUDGET: Record<
  TierName,
  {
    rank: number;
    voices: number;
    risks: number;
    actions: number;
    countriesInRanking: number;
    professions: number;
    showDemographics: boolean;
    showPricingCurve: boolean;
    showProviderConsensus: boolean; // gated additionally by lineup size
    showMethodology: boolean;
    showAppendix: boolean;
  }
> = {
  hypothesis: {
    rank: 1,
    voices: 4,
    risks: 6,
    actions: 5,
    countriesInRanking: 5,
    professions: 6,
    showDemographics: false,
    showPricingCurve: true,
    showProviderConsensus: false,
    showMethodology: true,
    showAppendix: false,
  },
  decision: {
    rank: 2,
    voices: 6,
    risks: 8,
    actions: 7,
    countriesInRanking: 8,
    professions: 8,
    showDemographics: true,
    showPricingCurve: true,
    showProviderConsensus: false,
    showMethodology: true,
    showAppendix: false,
  },
  decision_plus: {
    rank: 3,
    voices: 8,
    risks: 10,
    actions: 8,
    countriesInRanking: 10,
    professions: 10,
    showDemographics: true,
    showPricingCurve: true,
    showProviderConsensus: false,
    showMethodology: true,
    showAppendix: true,
  },
  deep: {
    rank: 4,
    voices: 10,
    risks: 12,
    actions: 10,
    countriesInRanking: 12,
    professions: 12,
    showDemographics: true,
    showPricingCurve: true,
    showProviderConsensus: true,
    showMethodology: true,
    showAppendix: true,
  },
  deep_pro: {
    rank: 5,
    voices: 12,
    risks: 14,
    actions: 12,
    countriesInRanking: 12,
    professions: 12,
    showDemographics: true,
    showPricingCurve: true,
    showProviderConsensus: true,
    showMethodology: true,
    showAppendix: true,
  },
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 56,
    paddingBottom: 48,
    paddingHorizontal: 48,
    fontSize: 10,
    fontFamily: "AppFont",
    color: C.ink,
  },
  pageHeader: {
    position: "absolute",
    top: 24,
    left: 48,
    right: 48,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: 8,
    borderBottom: `0.5pt solid ${C.divider}`,
    fontSize: 8,
    color: C.muted,
  },
  pageFooter: {
    position: "absolute",
    bottom: 24,
    left: 48,
    right: 48,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: C.faint,
  },

  // Cover
  coverPage: {
    padding: 0,
    fontFamily: "AppFont",
    color: "#FFFFFF",
    backgroundColor: C.brand,
  },
  coverInner: {
    padding: 56,
    flexGrow: 1,
    justifyContent: "space-between",
  },
  coverEyebrow: {
    fontSize: 10,
    fontWeight: 600,
    color: "#94CFEA",
    letterSpacing: 1.5,
    marginBottom: 14,
  },
  coverTitle: {
    fontSize: 28,
    fontWeight: 700,
    lineHeight: 1.25,
    marginBottom: 8,
  },
  coverProduct: {
    fontSize: 14,
    color: "#C7D7F5",
    marginBottom: 32,
  },
  coverRecCard: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 8,
    padding: 24,
    marginBottom: 24,
  },
  coverRecLabel: {
    fontSize: 9,
    color: "#94CFEA",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 6,
  },
  coverRecCountry: {
    fontSize: 36,
    fontWeight: 700,
    marginBottom: 8,
  },
  coverRecMeta: {
    fontSize: 11,
    color: "#C7D7F5",
  },
  coverFooter: {
    fontSize: 9,
    color: "#94CFEA",
    borderTop: "0.5pt solid rgba(199,215,245,0.3)",
    paddingTop: 12,
  },

  // Section primitives
  sectionEyebrow: {
    fontSize: 8,
    fontWeight: 600,
    color: C.muted,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: C.ink,
    marginBottom: 14,
    letterSpacing: -0.2,
  },
  sectionBlock: { marginBottom: 22 },
  pageTitle: {
    fontSize: 22,
    fontWeight: 700,
    color: C.ink,
    marginBottom: 4,
    letterSpacing: -0.3,
  },
  pageSubtitle: {
    fontSize: 10,
    color: C.muted,
    marginBottom: 22,
  },

  // KPI grid
  kpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 18,
  },
  kpiCard: {
    width: "23.5%",
    backgroundColor: C.card,
    borderRadius: 6,
    padding: 12,
  },
  kpiLabel: {
    fontSize: 7,
    color: C.muted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  kpiValue: { fontSize: 16, fontWeight: 700, color: C.ink },
  kpiSub: { fontSize: 8, color: C.faint, marginTop: 2 },

  // Distribution bars
  distRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
    gap: 8,
  },
  distCountry: { width: 32, fontSize: 10, fontWeight: 600 },
  distBarTrack: {
    flex: 1,
    height: 10,
    backgroundColor: C.divider,
    borderRadius: 4,
    overflow: "hidden",
  },
  distBarFill: { height: "100%" },
  distMeta: {
    width: 90,
    fontSize: 9,
    color: C.muted,
    textAlign: "right",
  },

  // Segment cards
  segGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  segCard: {
    width: "48%",
    backgroundColor: C.card,
    borderRadius: 6,
    padding: 12,
    borderLeft: `2pt solid ${C.brand}`,
  },
  segLabel: {
    fontSize: 8,
    color: C.muted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  segCountry: { fontSize: 16, fontWeight: 700, color: C.ink },
  segValue: { fontSize: 9, color: C.muted, marginTop: 2 },
  segAlt: { fontSize: 8, color: C.faint, marginTop: 4 },

  // Stats table
  table: {
    border: `0.5pt solid ${C.divider}`,
    borderRadius: 4,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: C.card,
    borderBottom: `0.5pt solid ${C.divider}`,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  tableRow: {
    flexDirection: "row",
    borderBottom: `0.5pt solid ${C.divider}`,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  tableRowLast: { borderBottom: "none" },
  th: { fontSize: 8, fontWeight: 600, color: C.muted, textTransform: "uppercase" },
  td: { fontSize: 9, color: C.ink },
  tdMuted: { fontSize: 9, color: C.muted },
  colCountry: { flex: 1.4 },
  colNum: { flex: 1, textAlign: "right" },

  // Narrative
  summaryBox: {
    backgroundColor: C.card,
    borderRadius: 6,
    padding: 14,
    fontSize: 10,
    color: C.body,
    lineHeight: 1.6,
  },
  // Same column-only pattern as actionRow — flex row + wrapped text was
  // clipping or bleeding into the next item for Korean descriptions.
  // Severity moves inline into the factor line as a coloured prefix.
  riskRow: {
    padding: 12,
    marginBottom: 8,
    backgroundColor: C.card,
    borderRadius: 4,
  },
  riskRowLast: { marginBottom: 0 },
  riskFactor: { fontSize: 10, fontWeight: 600, color: C.ink, marginBottom: 4 },
  riskDesc: { fontSize: 9, color: C.body, lineHeight: 1.65 },
  riskMeta: { fontSize: 8, color: C.faint, marginTop: 4 },
  riskSevPrefix: {
    fontSize: 8,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginRight: 6,
  },
  // No flexDirection:row here — react-pdf miscalculates wrapped text
  // height inside flex rows for mixed Korean + Latin + em-dash, which
  // either overlapped the next row (no card) or got clipped at the card
  // boundary. Numbering is inlined into the text instead so the layout
  // is a plain column and the text wraps freely.
  actionRow: {
    padding: 12,
    marginBottom: 10,
    backgroundColor: C.card,
    borderRadius: 4,
  },
  actionText: { fontSize: 10, color: C.body, lineHeight: 1.65 },
  actionMeta: { fontSize: 8, color: C.faint, marginTop: 6 },

  // Project info card
  infoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
    backgroundColor: C.card,
    padding: 16,
    borderRadius: 6,
  },
  infoItem: { width: "47%" },
  infoLabel: {
    fontSize: 7,
    color: C.muted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 3,
  },
  infoValue: { fontSize: 10, color: C.ink, fontWeight: 600 },
  infoLong: { fontSize: 9, color: C.body, lineHeight: 1.55, marginTop: 4 },

  // Voice quote
  voiceCard: {
    backgroundColor: C.card,
    borderLeft: `3pt solid ${C.success}`,
    paddingLeft: 12,
    paddingVertical: 10,
    paddingRight: 12,
    marginBottom: 8,
    borderRadius: 4,
  },
  voiceCardNeg: { borderLeft: `3pt solid ${C.warn}` },
  voiceText: { fontSize: 9.5, color: C.body, lineHeight: 1.55 },
  voiceMeta: { fontSize: 8, color: C.faint, marginTop: 5 },

  // Pricing
  priceHero: {
    backgroundColor: C.card,
    padding: 18,
    borderRadius: 6,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  priceBig: {
    fontSize: 28,
    fontWeight: 700,
    color: C.brand,
    marginRight: 12,
  },
  priceMeta: { fontSize: 9, color: C.muted },

  // Variance callout
  callout: {
    backgroundColor: C.card,
    borderRadius: 6,
    padding: 14,
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },
  calloutHigh: { backgroundColor: "#FEF3C7" },
  calloutDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 4,
  },
  calloutLabel: { fontSize: 8, color: C.muted, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.6 },
  calloutBody: { fontSize: 10, color: C.body, lineHeight: 1.55 },
  calloutMeta: { fontSize: 8, color: C.faint, marginTop: 4 },

  // Bullet list — same column-only pattern; bullet inlined into the
  // text so wrapped lines don't break against the row-flex layout.
  bulletRow: {
    marginBottom: 7,
  },
  bulletText: { fontSize: 9.5, color: C.body, lineHeight: 1.65 },
});

/**
 * Wraps a string into <Text> children with per-script font assignment so
 * Korean / Japanese / Chinese all render glyphs that actually exist in
 * the registered fonts.
 */
function MText({ children, style }: { children: string; style?: Style | Style[] }) {
  const runs = splitByFont(children);
  return (
    <Text style={style}>
      {runs.map((r, i) =>
        r.font ? (
          <Text key={i} style={{ fontFamily: r.font }}>
            {r.text}
          </Text>
        ) : (
          r.text
        ),
      )}
    </Text>
  );
}

function riskLevelLabel(level: "low" | "medium" | "high", isKo: boolean): string {
  if (isKo) return level === "high" ? "높음" : level === "medium" ? "보통" : "낮음";
  return level === "high" ? "HIGH" : level === "medium" ? "MEDIUM" : "LOW";
}

function providerLabelPdf(provider: string): string {
  switch (provider) {
    case "anthropic":
      return "Claude";
    case "openai":
      return "GPT-4";
    case "gemini":
      return "Gemini";
    default:
      return provider;
  }
}

function buildLineupString(
  providers: readonly string[],
  parallelSims: number,
  breakdown: EnsembleAggregate["providerBreakdown"],
  isKo: boolean,
): string {
  if (providers.length <= 1) {
    return providers.map(providerLabelPdf).join(", ");
  }
  const expected: Record<string, number> = {};
  for (let i = 0; i < parallelSims; i++) {
    const p = providers[i % providers.length];
    expected[p] = (expected[p] ?? 0) + 1;
  }
  const actualMap = new Map<string, number>(
    (breakdown ?? []).map((b) => [b.provider, b.simCount]),
  );
  return providers
    .map((p) => {
      const exp = expected[p] ?? 0;
      const actual = actualMap.get(p) ?? 0;
      const label = providerLabelPdf(p);
      if (actual < exp) {
        return `${label} (${actual}/${exp}${isKo ? " 완주" : " ok"})`;
      }
      return label;
    })
    .join(" · ");
}

interface BuildArgs {
  aggregate: EnsembleAggregate;
  productName: string;
  tier: TierName;
  parallelSims: number;
  perSimPersonas: number;
  llmProviders: string[];
  locale: "ko" | "en";
  generatedAt: Date;
  ensembleId: string;
  /**
   * Optional project context for the project-info / executive-summary
   * page. Falls back to "Untitled product" so the PDF still renders if
   * the caller didn't pull project details.
   */
  project?: {
    name?: string;
    product_name?: string;
    category?: string | null;
    description?: string | null;
    base_price_cents?: number | null;
    currency?: string | null;
    objective?: string | null;
    originating_country?: string | null;
    candidate_countries?: string[] | null;
  } | null;
}

const TIER_DISPLAY: Record<
  TierName,
  { ko: string; en: string; eyebrowKo: string; eyebrowEn: string }
> = {
  hypothesis: { ko: "초기검증", en: "Hypothesis", eyebrowKo: "초기검증 분석", eyebrowEn: "Hypothesis analysis" },
  decision: { ko: "검증분석", en: "Decision", eyebrowKo: "검증분석", eyebrowEn: "Decision analysis" },
  decision_plus: { ko: "검증분석+", en: "Decision+", eyebrowKo: "검증분석+", eyebrowEn: "Decision+ analysis" },
  deep: { ko: "심층분석", en: "Deep", eyebrowKo: "심층분석", eyebrowEn: "Deep analysis" },
  deep_pro: { ko: "심층분석 Pro", en: "Deep Pro", eyebrowKo: "심층분석 Pro", eyebrowEn: "Deep Pro analysis" },
};

export async function buildEnsemblePdf(args: BuildArgs): Promise<Buffer> {
  const {
    aggregate,
    productName,
    tier,
    parallelSims,
    perSimPersonas,
    llmProviders,
    locale,
    generatedAt,
    ensembleId,
    project,
  } = args;
  const isKo = locale === "ko";
  const tierDisplay = TIER_DISPLAY[tier] ?? TIER_DISPLAY.decision;
  const tierEyebrow = (isKo ? tierDisplay.eyebrowKo : tierDisplay.eyebrowEn).toUpperCase();
  const tierBudget = TIER_BUDGET[tier] ?? TIER_BUDGET.decision;
  const generatedAtStr = generatedAt.toLocaleDateString(
    isKo ? "ko-KR" : "en-US",
    { year: "numeric", month: "short", day: "numeric" },
  );
  const lineup = buildLineupString(llmProviders, parallelSims, aggregate.providerBreakdown, isKo);

  const t = isKo
    ? {
        coverEyebrow: `MARKET TWIN · ${tierEyebrow}`,
        coverRecLabel: "추천 진출국",
        consensus: "합의도",
        confidence: { STRONG: "강함", MODERATE: "보통", WEAK: "약함" },
        coverFooter: `${parallelSims}개 시뮬레이션 · 페르소나 ${aggregate.effectivePersonas.toLocaleString()}명 · ${lineup}`,
        bestCountryEyebrow: "추천 분포",
        bestCountryTitle: "시뮬별 1위 국가 분포",
        segmentEyebrow: "전략별 추천",
        segmentTitle: "비즈니스 우선순위에 따른 시장 추천",
        statsEyebrow: "점수 통계",
        statsTitle: "국가별 점수 분포 (N개 시뮬 합산)",
        thRank: "순위",
        thCountry: "국가",
        thMean: "평균",
        thMedian: "중앙값",
        thStd: "표준편차",
        thRange: "범위",
        thCac: "CAC",
        varianceEyebrow: "변동성 평가",
        varianceTitle: "결과 신뢰성 진단",
        varianceMeta: "최대 점수 변동",
        varianceMetaMean: "평균 변동",
        varianceLabels: { low: "낮음", moderate: "보통", high: "높음" },
        varianceNotes: {
          low: "단일 시뮬 결과만으로도 신뢰할 수 있는 수준입니다.",
          moderate: "시뮬 간 변동이 중간 수준입니다. 앙상블 결과가 의미 있는 신뢰도를 더해줍니다.",
          high: "동일 조건에서도 시뮬마다 점수 편차가 큽니다. 단일 시뮬은 불안정하니 앙상블 결과를 신뢰하세요.",
        },
        footerLeft: "Market Twin · 정밀 검증 보고서",
      }
    : {
        coverEyebrow: `MARKET TWIN · ${tierEyebrow}`,
        coverRecLabel: "Recommended Market",
        consensus: "consensus",
        confidence: { STRONG: "Strong", MODERATE: "Moderate", WEAK: "Weak" },
        coverFooter: `${parallelSims} parallel sim${parallelSims === 1 ? "" : "s"} · ${aggregate.effectivePersonas.toLocaleString()} personas · ${lineup}`,
        bestCountryEyebrow: "Recommendation Distribution",
        bestCountryTitle: "Top market across all sims",
        segmentEyebrow: "Strategy Picks",
        segmentTitle: "Best market per business priority",
        statsEyebrow: "Score Statistics",
        statsTitle: "Per-country score distribution (aggregated)",
        thRank: "Rank",
        thCountry: "Country",
        thMean: "Mean",
        thMedian: "Median",
        thStd: "Std",
        thRange: "Range",
        thCac: "CAC",
        varianceEyebrow: "Variance Assessment",
        varianceTitle: "Result reliability diagnosis",
        varianceMeta: "Max score range",
        varianceMetaMean: "Mean range",
        varianceLabels: { low: "Low", moderate: "Moderate", high: "High" },
        varianceNotes: {
          low: "Single-sim answer would have been reliable.",
          moderate: "Moderate run-to-run variance. Ensemble adds meaningful confidence.",
          high: "Same fixture produces very different country scores per run. Trust the ensemble; single sim alone would be unreliable.",
        },
        footerLeft: "Market Twin · Validation Report",
      };

  const recCountryLabel = getCountryLabel(aggregate.recommendation.country, locale) || aggregate.recommendation.country;
  const confidenceColor =
    aggregate.recommendation.confidence === "STRONG"
      ? C.success
      : aggregate.recommendation.confidence === "MODERATE"
        ? C.warn
        : C.risk;
  const varianceColor =
    aggregate.varianceAssessment.label === "high"
      ? C.warn
      : aggregate.varianceAssessment.label === "moderate"
        ? C.muted
        : C.success;

  const pageHeader = (
    <View style={styles.pageHeader} fixed>
      <MText style={{ fontSize: 8, fontWeight: 600, color: C.muted, letterSpacing: 0.4 }}>
        MARKET TWIN
      </MText>
      <MText style={{ fontSize: 8, color: C.faint }}>{productName}</MText>
    </View>
  );
  const pageFooter = (
    <View style={styles.pageFooter} fixed>
      <MText style={{ fontSize: 8, color: C.faint }}>{t.footerLeft}</MText>
      <MText style={{ fontSize: 8, color: C.faint }}>{`Ensemble ${ensembleId.slice(0, 8)}`}</MText>
    </View>
  );

  // ── helper renderers (closed over t / styles / aggregate) ──────────────
  const renderProjectInfoPage = () => {
    if (!project) return null;
    const fmtPrice = () => {
      if (project.base_price_cents == null) return "—";
      const v = project.base_price_cents / 100;
      return `${v.toFixed(2)} ${project.currency ?? "USD"}`;
    };
    const objectiveLabel = (() => {
      if (!project.objective) return "—";
      if (!isKo) return project.objective;
      const map: Record<string, string> = {
        conversion: "전환",
        awareness: "인지도",
        retention: "유지",
        expansion: "확장",
      };
      return map[project.objective] ?? project.objective;
    })();
    return (
      <Page size="A4" style={styles.page}>
        {pageHeader}
        <MText style={styles.pageTitle}>{isKo ? "프로젝트 개요" : "Project overview"}</MText>
        <MText style={styles.pageSubtitle}>
          {isKo
            ? "이 분석이 평가한 제품 / 가격 / 시장 후보 정보입니다."
            : "Product, price and market context this analysis evaluated."}
        </MText>

        <View style={styles.infoGrid}>
          <View style={styles.infoItem}>
            <MText style={styles.infoLabel}>{isKo ? "제품" : "Product"}</MText>
            <MText style={styles.infoValue}>{project.product_name ?? productName}</MText>
          </View>
          <View style={styles.infoItem}>
            <MText style={styles.infoLabel}>{isKo ? "카테고리" : "Category"}</MText>
            <MText style={styles.infoValue}>{project.category ?? "—"}</MText>
          </View>
          <View style={styles.infoItem}>
            <MText style={styles.infoLabel}>{isKo ? "기본 가격" : "Base price"}</MText>
            <MText style={styles.infoValue}>{fmtPrice()}</MText>
          </View>
          <View style={styles.infoItem}>
            <MText style={styles.infoLabel}>{isKo ? "출시 목표" : "Objective"}</MText>
            <MText style={styles.infoValue}>{objectiveLabel}</MText>
          </View>
          <View style={styles.infoItem}>
            <MText style={styles.infoLabel}>{isKo ? "출시 국가" : "Origin"}</MText>
            <MText style={styles.infoValue}>{project.originating_country ?? "—"}</MText>
          </View>
          <View style={styles.infoItem}>
            <MText style={styles.infoLabel}>{isKo ? "후보 진출국" : "Target markets"}</MText>
            <MText style={styles.infoValue}>
              {(project.candidate_countries ?? []).join(", ") || "—"}
            </MText>
          </View>
          {project.description && (
            <View style={{ width: "100%", marginTop: 6 }}>
              <MText style={styles.infoLabel}>{isKo ? "설명" : "Description"}</MText>
              <MText style={styles.infoLong}>{project.description}</MText>
            </View>
          )}
        </View>

        <View style={{ marginTop: 22 }}>
          <MText style={styles.sectionEyebrow}>{isKo ? "실행 요약" : "Run summary"}</MText>
          <View style={styles.kpiGrid}>
            <Kpi label={isKo ? "분석 단계" : "Tier"} value={isKo ? tierDisplay.ko : tierDisplay.en} />
            <Kpi
              label={isKo ? "완료 시뮬" : "Completed sims"}
              value={`${aggregate.simCount}/${parallelSims}`}
              sub={`${Math.round((aggregate.simCount / Math.max(1, parallelSims)) * 100)}%`}
            />
            <Kpi
              label={isKo ? "유효 페르소나" : "Effective personas"}
              value={aggregate.effectivePersonas.toLocaleString()}
              sub={`${perSimPersonas}/sim`}
            />
            <Kpi
              label="LLM"
              value={llmProviders.map(providerLabelPdf).join(" · ")}
              sub={generatedAtStr}
            />
          </View>
        </View>

        {pageFooter}
      </Page>
    );
  };

  const renderExecutiveSummaryPage = () => {
    if (!aggregate.narrative?.executiveSummary) return null;
    const runnerUp = aggregate.bestCountryDistribution[1];
    const winnerStats = aggregate.countryStats.find(
      (c) => c.country === aggregate.recommendation.country,
    );
    const overallSeg = aggregate.segments.find((s) => s.id === "overall");
    const topRisk = aggregate.narrative?.mergedRisks?.[0];
    const topAction = aggregate.narrative?.mergedActions?.[0];
    const fmtPrice = (cents?: number) =>
      typeof cents === "number" ? `$${(cents / 100).toFixed(2)}` : "—";
    return (
      <Page size="A4" style={styles.page}>
        {pageHeader}
        <MText style={styles.pageTitle}>{isKo ? "종합 의견" : "Executive summary"}</MText>
        <MText style={styles.pageSubtitle}>
          {isKo
            ? `${aggregate.simCount}개 시뮬의 결과를 통합한 합의 narrative입니다.`
            : `Cross-sim consensus narrative from ${aggregate.simCount} runs.`}
        </MText>

        <View style={styles.summaryBox}>
          <MText style={{ fontSize: 11, color: C.body, lineHeight: 1.7 }}>
            {aggregate.narrative.executiveSummary}
          </MText>
        </View>

        <View style={{ marginTop: 22 }}>
          <MText style={styles.sectionEyebrow}>{isKo ? "핵심 발견" : "Key findings"}</MText>
          <View style={{ marginTop: 6 }}>
            <BulletItem
              text={
                isKo
                  ? `${recCountryLabel} 진출이 합의 우위 (${aggregate.recommendation.consensusPercent}% / ${aggregate.recommendation.confidence})${winnerStats ? ` — 평균 점수 ${winnerStats.finalScore.mean.toFixed(0)}, 표준편차 ${winnerStats.finalScore.std.toFixed(1)}` : ""}.`
                  : `${recCountryLabel} leads consensus (${aggregate.recommendation.consensusPercent}% / ${aggregate.recommendation.confidence})${winnerStats ? ` — mean ${winnerStats.finalScore.mean.toFixed(0)}, std ${winnerStats.finalScore.std.toFixed(1)}` : ""}.`
              }
            />
            {runnerUp && (
              <BulletItem
                text={
                  isKo
                    ? `차순위는 ${runnerUp.country} (${runnerUp.percent}%) — 1순위가 막혔을 때 즉시 대안.`
                    : `Runner-up: ${runnerUp.country} (${runnerUp.percent}%) — immediate fallback.`
                }
              />
            )}
            {overallSeg && overallSeg.bestCountry !== aggregate.recommendation.country && (
              <BulletItem
                text={
                  isKo
                    ? `종합 점수 1위는 ${overallSeg.bestCountry} (${overallSeg.bestValue.toFixed(0)}) — 합의도 1위와 다르니 의사결정 시 참고.`
                    : `Highest-scored market is ${overallSeg.bestCountry} (${overallSeg.bestValue.toFixed(0)}) — diverges from consensus winner.`
                }
              />
            )}
            {aggregate.pricing && (
              <BulletItem
                text={
                  isKo
                    ? `권장 가격 ${fmtPrice(aggregate.pricing.recommendedPriceCents)} (시뮬 50% 구간 ${fmtPrice(aggregate.pricing.recommendedPriceP25)}–${fmtPrice(aggregate.pricing.recommendedPriceP75)}).`
                    : `Recommended price ${fmtPrice(aggregate.pricing.recommendedPriceCents)} (mid-50% ${fmtPrice(aggregate.pricing.recommendedPriceP25)}–${fmtPrice(aggregate.pricing.recommendedPriceP75)}).`
                }
              />
            )}
            {aggregate.personas && (
              <BulletItem
                text={
                  isKo
                    ? `${aggregate.personas.total.toLocaleString()}명 페르소나 평균 구매의향 ${aggregate.personas.intentMean.toFixed(0)}% (강한 관심 ${aggregate.personas.highIntentCount.toLocaleString()}, 약한 관심 ${aggregate.personas.lowIntentCount.toLocaleString()}).`
                    : `${aggregate.personas.total.toLocaleString()} personas, mean intent ${aggregate.personas.intentMean.toFixed(0)}% (high ${aggregate.personas.highIntentCount}, low ${aggregate.personas.lowIntentCount}).`
                }
              />
            )}
            {topRisk && (
              <BulletItem
                text={
                  isKo
                    ? `최우선 리스크: ${topRisk.factor} (${topRisk.severity}, ${topRisk.surfacedInSims}개 시뮬 언급).`
                    : `Top risk: ${topRisk.factor} (${topRisk.severity}, surfaced in ${topRisk.surfacedInSims}).`
                }
              />
            )}
            {topAction && (
              <BulletItem
                text={
                  isKo ? `1순위 액션: ${topAction.action}` : `First action: ${topAction.action}`
                }
              />
            )}
            <BulletItem
              text={
                isKo
                  ? `시뮬 간 변동성: ${aggregate.varianceAssessment.label.toUpperCase()} (최대 점수 변동 ${aggregate.varianceAssessment.maxFinalScoreRange}점).`
                  : `Variance: ${aggregate.varianceAssessment.label.toUpperCase()} (max range ${aggregate.varianceAssessment.maxFinalScoreRange}pt).`
              }
            />
          </View>
        </View>

        {pageFooter}
      </Page>
    );
  };

  const renderRecommendationPage = () => (
    <Page size="A4" style={styles.page}>
      {pageHeader}
      <MText style={styles.pageTitle}>{isKo ? "추천 결정" : "Recommendation"}</MText>
      <MText style={styles.pageSubtitle}>
        {isKo
          ? "시뮬 합의 기반 1순위 시장과 전략별 대안입니다."
          : "Consensus-driven primary market and strategy-specific alternatives."}
      </MText>

      <View style={styles.sectionBlock}>
        <MText style={styles.sectionEyebrow}>{t.bestCountryEyebrow}</MText>
        <MText style={styles.sectionTitle}>{t.bestCountryTitle}</MText>
        {aggregate.bestCountryDistribution.map((b) => {
          const isWinner = b.country === aggregate.recommendation.country;
          return (
            <View key={b.country} style={styles.distRow}>
              <MText style={styles.distCountry}>{b.country}</MText>
              <View style={styles.distBarTrack}>
                <View
                  style={[
                    styles.distBarFill,
                    { width: `${b.percent}%`, backgroundColor: isWinner ? C.success : C.faint },
                  ]}
                />
              </View>
              <MText style={styles.distMeta}>{`${b.count}/${aggregate.simCount} (${b.percent}%)`}</MText>
            </View>
          );
        })}
      </View>

      <View style={styles.sectionBlock}>
        <MText style={styles.sectionEyebrow}>{t.segmentEyebrow}</MText>
        <MText style={styles.sectionTitle}>{t.segmentTitle}</MText>
        <View style={styles.segGrid}>
          {aggregate.segments.map((seg) => {
            const isCAC = seg.id === "cac";
            const valueText = isCAC ? `$${seg.bestValue.toFixed(2)}` : seg.bestValue.toFixed(1);
            const altText = seg.alternative
              ? isCAC
                ? `$${seg.alternative.value.toFixed(2)}`
                : seg.alternative.value.toFixed(1)
              : null;
            return (
              <View key={seg.id} style={styles.segCard} wrap={false}>
                <MText style={styles.segLabel}>{seg.labelKo}</MText>
                <MText style={styles.segCountry}>{seg.bestCountry}</MText>
                <MText style={styles.segValue}>{valueText}</MText>
                {seg.alternative && altText && (
                  <MText style={styles.segAlt}>
                    {`${isKo ? "대안" : "Alt"}: ${seg.alternative.country} (${altText})`}
                  </MText>
                )}
              </View>
            );
          })}
        </View>
      </View>

      {pageFooter}
    </Page>
  );

  const renderCountriesPage = () => {
    const stats = aggregate.countryStats.slice(0, tierBudget.countriesInRanking);
    return (
      <Page size="A4" style={styles.page}>
        {pageHeader}
        <MText style={styles.pageTitle}>{isKo ? "국가별 점수 분석" : "Country score analysis"}</MText>
        <MText style={styles.pageSubtitle}>
          {isKo
            ? `${aggregate.simCount}개 시뮬에서 산출된 국가별 demand · CAC · competition · final score 통합 통계입니다.`
            : `Demand × CAC × competition × final score statistics across ${aggregate.simCount} sims.`}
        </MText>

        <View style={styles.sectionBlock}>
          <MText style={styles.sectionEyebrow}>{t.statsEyebrow}</MText>
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <MText style={[styles.th, styles.colCountry]}>{t.thCountry}</MText>
              <MText style={[styles.th, styles.colNum]}>{t.thMean}</MText>
              <MText style={[styles.th, styles.colNum]}>{t.thMedian}</MText>
              <MText style={[styles.th, styles.colNum]}>{t.thStd}</MText>
              <MText style={[styles.th, styles.colNum]}>{t.thRange}</MText>
              <MText style={[styles.th, styles.colNum]}>{t.thCac}</MText>
            </View>
            {stats.map((c, i) => {
              const last = i === stats.length - 1;
              return (
                <View key={c.country} style={[styles.tableRow, last ? styles.tableRowLast : {}]}>
                  <MText style={[styles.td, styles.colCountry, { fontWeight: 600 }]}>{c.country}</MText>
                  <MText style={[styles.td, styles.colNum]}>{c.finalScore.mean.toFixed(1)}</MText>
                  <MText style={[styles.td, styles.colNum]}>{c.finalScore.median.toFixed(1)}</MText>
                  <MText style={[styles.tdMuted, styles.colNum]}>{c.finalScore.std.toFixed(1)}</MText>
                  <MText style={[styles.tdMuted, styles.colNum]}>{`${c.finalScore.min.toFixed(0)}–${c.finalScore.max.toFixed(0)}`}</MText>
                  <MText style={[styles.tdMuted, styles.colNum]}>{`$${c.cacEstimateUsd.median.toFixed(2)}`}</MText>
                </View>
              );
            })}
          </View>
        </View>

        {/* Per-country ranking bars */}
        <View style={styles.sectionBlock}>
          <MText style={styles.sectionEyebrow}>{isKo ? "평균 점수 시각화" : "Mean score visualization"}</MText>
          {stats.map((c) => {
            const max = Math.max(...stats.map((x) => x.finalScore.mean), 1);
            const w = (c.finalScore.mean / max) * 100;
            const isWinner = c.country === aggregate.recommendation.country;
            return (
              <View key={c.country} style={styles.distRow}>
                <MText style={styles.distCountry}>{c.country}</MText>
                <View style={styles.distBarTrack}>
                  <View
                    style={[
                      styles.distBarFill,
                      { width: `${w}%`, backgroundColor: isWinner ? C.success : C.brand },
                    ]}
                  />
                </View>
                <MText style={styles.distMeta}>
                  {`${c.finalScore.mean.toFixed(0)} (${c.finalScore.min.toFixed(0)}–${c.finalScore.max.toFixed(0)})`}
                </MText>
              </View>
            );
          })}
        </View>

        {pageFooter}
      </Page>
    );
  };

  const renderPersonasPage = () => {
    if (!aggregate.personas) return null;
    const p = aggregate.personas;
    const histMax = Math.max(...p.intentHistogram.map((b) => b.count), 1);
    return (
      <Page size="A4" style={styles.page}>
        {pageHeader}
        <MText style={styles.pageTitle}>{isKo ? "페르소나 분석" : "Persona analysis"}</MText>
        <MText style={styles.pageSubtitle}>
          {isKo
            ? `${p.total.toLocaleString()}명 페르소나의 구매의향 분포 및 인구통계 요약입니다.`
            : `Intent distribution and demographic snapshot for ${p.total.toLocaleString()} personas.`}
        </MText>

        <View style={styles.kpiGrid}>
          <Kpi label={isKo ? "총 페르소나" : "Total"} value={p.total.toLocaleString()} />
          <Kpi
            label={isKo ? "평균 구매의향" : "Mean intent"}
            value={`${p.intentMean.toFixed(0)}%`}
            sub={isKo ? `중앙값 ${p.intentMedian}%` : `Median ${p.intentMedian}%`}
          />
          <Kpi
            label={isKo ? "강한 관심 (≥70)" : "High intent"}
            value={p.highIntentCount.toLocaleString()}
          />
          <Kpi
            label={isKo ? "약한 관심 (<35)" : "Low intent"}
            value={p.lowIntentCount.toLocaleString()}
          />
        </View>

        <View style={styles.sectionBlock}>
          <MText style={styles.sectionEyebrow}>
            {isKo ? "구매의향 분포 (히스토그램)" : "Intent distribution"}
          </MText>
          <View style={{ flexDirection: "row", alignItems: "flex-end", height: 90, gap: 4 }}>
            {p.intentHistogram.map((b) => {
              const h = (b.count / histMax) * 100;
              const fill = b.binStart >= 70 ? C.success : b.binStart < 35 ? C.warn : C.brand;
              return (
                <View key={b.binStart} style={{ flex: 1, alignItems: "center" }}>
                  <View
                    style={{
                      width: "100%",
                      height: `${h}%`,
                      backgroundColor: fill,
                      borderTopLeftRadius: 2,
                      borderTopRightRadius: 2,
                    }}
                  />
                  <Text style={{ fontSize: 7, color: C.faint, marginTop: 2 }}>{b.binStart}</Text>
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.sectionBlock}>
          <MText style={styles.sectionEyebrow}>
            {isKo ? "국가별 평균 구매의향" : "Per-country mean intent"}
          </MText>
          {p.byCountry.map((c) => {
            const w = c.meanIntent;
            return (
              <View key={c.country} style={styles.distRow}>
                <MText style={styles.distCountry}>{c.country}</MText>
                <View style={styles.distBarTrack}>
                  <View style={[styles.distBarFill, { width: `${w}%`, backgroundColor: C.brand }]} />
                </View>
                <MText style={styles.distMeta}>
                  {`${c.meanIntent}% (n=${c.count.toLocaleString()})`}
                </MText>
              </View>
            );
          })}
        </View>

        {tierBudget.showDemographics && (
          <View style={styles.sectionBlock}>
            <MText style={styles.sectionEyebrow}>
              {isKo ? "인구통계 분포" : "Demographics"}
            </MText>
            <View style={{ flexDirection: "row", gap: 14 }}>
              <View style={{ flex: 1 }}>
                <MText style={[styles.infoLabel, { marginBottom: 4 }]}>
                  {isKo ? "연령대" : "Age groups"}
                </MText>
                {p.ageDistribution.length === 0 ? (
                  <MText style={styles.tdMuted}>—</MText>
                ) : (
                  p.ageDistribution.map((a) => {
                    const max = Math.max(...p.ageDistribution.map((x) => x.count), 1);
                    const w = (a.count / max) * 100;
                    return (
                      <View key={a.bucket} style={styles.distRow}>
                        <MText style={[styles.distCountry, { width: 40, fontSize: 9 }]}>{a.bucket}</MText>
                        <View style={styles.distBarTrack}>
                          <View style={[styles.distBarFill, { width: `${w}%`, backgroundColor: C.brand }]} />
                        </View>
                        <MText style={styles.distMeta}>{String(a.count)}</MText>
                      </View>
                    );
                  })
                )}
              </View>
              <View style={{ flex: 1 }}>
                <MText style={[styles.infoLabel, { marginBottom: 4 }]}>
                  {isKo ? `직업 (Top ${tierBudget.professions})` : `Top professions`}
                </MText>
                {p.professionTopN.slice(0, tierBudget.professions).map((o) => (
                  <View
                    key={o.profession}
                    style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 3 }}
                  >
                    <MText style={{ fontSize: 9, color: C.body, flex: 1 }}>{o.profession}</MText>
                    <MText style={{ fontSize: 9, color: C.muted }}>{String(o.count)}</MText>
                  </View>
                ))}
              </View>
            </View>
          </View>
        )}

        {pageFooter}
      </Page>
    );
  };

  const renderVoicesPage = () => {
    if (!aggregate.personas) return null;
    const p = aggregate.personas;
    const pos = p.topPositiveVoices.slice(0, tierBudget.voices);
    const neg = p.topNegativeVoices.slice(0, tierBudget.voices);
    if (pos.length === 0 && neg.length === 0) return null;
    return (
      <Page size="A4" style={styles.page}>
        {pageHeader}
        <MText style={styles.pageTitle}>{isKo ? "페르소나의 목소리" : "Persona voices"}</MText>
        <MText style={styles.pageSubtitle}>
          {isKo
            ? "구매의향 상위 / 하위 응답자의 직접 인용입니다."
            : "Verbatim quotes from highest- and lowest-intent personas."}
        </MText>

        {pos.length > 0 && (
          <View style={styles.sectionBlock}>
            <MText style={styles.sectionEyebrow}>{isKo ? "긍정 (Top)" : "Positive (top)"}</MText>
            {pos.map((v, i) => (
              <View key={i} style={styles.voiceCard} wrap={false}>
                <MText style={styles.voiceText}>{`"${v.text}"`}</MText>
                <MText style={styles.voiceMeta}>
                  {[
                    `${v.country} · ${v.intent}%`,
                    v.profession,
                    v.ageRange,
                  ].filter(Boolean).join(" · ")}
                </MText>
              </View>
            ))}
          </View>
        )}

        {neg.length > 0 && (
          <View style={styles.sectionBlock}>
            <MText style={styles.sectionEyebrow}>{isKo ? "부정 (Bottom)" : "Negative (bottom)"}</MText>
            {neg.map((v, i) => (
              <View key={i} style={[styles.voiceCard, styles.voiceCardNeg]} wrap={false}>
                <MText style={styles.voiceText}>{`"${v.text}"`}</MText>
                <MText style={styles.voiceMeta}>
                  {[
                    `${v.country} · ${v.intent}%`,
                    v.profession,
                    v.ageRange,
                  ].filter(Boolean).join(" · ")}
                </MText>
              </View>
            ))}
          </View>
        )}

        {pageFooter}
      </Page>
    );
  };

  const renderPricingPage = () => {
    if (!aggregate.pricing) return null;
    const pr = aggregate.pricing;
    const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;
    const peakPoint = pr.curve.reduce<typeof pr.curve[number] | null>(
      (best, p) =>
        best === null || p.meanConversionProbability > best.meanConversionProbability ? p : best,
      null,
    );
    const maxConv = Math.max(...pr.curve.map((p) => p.meanConversionProbability), 0.0001);
    return (
      <Page size="A4" style={styles.page}>
        {pageHeader}
        <MText style={styles.pageTitle}>{isKo ? "가격 분석" : "Pricing analysis"}</MText>
        <MText style={styles.pageSubtitle}>
          {isKo
            ? "시뮬 합산 권장 가격, 50% 구간, 전환 곡선을 제공합니다."
            : "Cross-sim recommended price, mid-50% range, and conversion curve."}
        </MText>

        <View style={styles.priceHero}>
          <View>
            <MText style={styles.kpiLabel}>{isKo ? "권장 가격 (중앙값)" : "Recommended"}</MText>
            <View style={{ flexDirection: "row", alignItems: "baseline" }}>
              <MText style={styles.priceBig}>{fmt(pr.recommendedPriceCents)}</MText>
              <MText style={styles.priceMeta}>
                {isKo
                  ? `중간 50%: ${fmt(pr.recommendedPriceP25)}–${fmt(pr.recommendedPriceP75)}`
                  : `Mid-50%: ${fmt(pr.recommendedPriceP25)}–${fmt(pr.recommendedPriceP75)}`}
              </MText>
            </View>
          </View>
          {peakPoint && (
            <View style={{ alignItems: "flex-end" }}>
              <MText style={styles.kpiLabel}>{isKo ? "최고 전환 가격" : "Peak conversion"}</MText>
              <MText style={{ fontSize: 14, fontWeight: 700, color: C.ink }}>
                {fmt(peakPoint.priceCents)}
              </MText>
              <MText style={styles.priceMeta}>
                {`${(peakPoint.meanConversionProbability * 100).toFixed(1)}%`}
              </MText>
            </View>
          )}
        </View>

        {tierBudget.showPricingCurve && pr.curve.length > 0 && (
          <View style={styles.sectionBlock}>
            <MText style={styles.sectionEyebrow}>
              {isKo ? "가격–전환 곡선" : "Price–conversion curve"}
            </MText>
            {pr.curve.map((point) => (
              <View key={point.priceCents} style={styles.distRow}>
                <MText style={[styles.distCountry, { width: 60 }]}>{fmt(point.priceCents)}</MText>
                <View style={styles.distBarTrack}>
                  <View
                    style={[
                      styles.distBarFill,
                      {
                        width: `${(point.meanConversionProbability / maxConv) * 100}%`,
                        backgroundColor: C.brand,
                      },
                    ]}
                  />
                </View>
                <MText style={styles.distMeta}>
                  {`${(point.meanConversionProbability * 100).toFixed(1)}% (n=${point.sampleCount})`}
                </MText>
              </View>
            ))}
          </View>
        )}

        {pr.marginEstimate && pr.marginEstimate !== "—" && (
          <View style={styles.sectionBlock}>
            <MText style={styles.sectionEyebrow}>{isKo ? "예상 마진 분석" : "Margin analysis"}</MText>
            <View style={styles.summaryBox}>
              <MText style={{ fontSize: 10, color: C.body, lineHeight: 1.6 }}>
                {pr.marginEstimate}
              </MText>
            </View>
          </View>
        )}

        {pageFooter}
      </Page>
    );
  };

  const renderRisksPage = () => {
    if (!aggregate.narrative?.mergedRisks?.length) return null;
    const risks = aggregate.narrative.mergedRisks.slice(0, tierBudget.risks);
    return (
      <Page size="A4" style={styles.page}>
        {pageHeader}
        <MText style={styles.pageTitle}>{isKo ? "주요 리스크" : "Key risks"}</MText>
        <MText style={styles.pageSubtitle}>
          {isKo
            ? `${aggregate.simCount}개 시뮬에서 자주 등장한 리스크를 통합한 결과 — 종합 리스크 수준: ${riskLevelLabel(aggregate.narrative.overallRiskLevel, true)}.`
            : `Risks dedup'd across ${aggregate.simCount} sims — overall: ${riskLevelLabel(aggregate.narrative.overallRiskLevel, false)}.`}
        </MText>

        <View>
          {risks.map((r, i, arr) => {
            const sevColor =
              r.severity === "high" ? C.risk : r.severity === "medium" ? C.warn : C.muted;
            const last = i === arr.length - 1;
            return (
              <View key={i} style={[styles.riskRow, last ? styles.riskRowLast : {}]} wrap={false}>
                <Text style={styles.riskFactor}>
                  <Text style={[styles.riskSevPrefix, { color: sevColor }]}>
                    {r.severity.toUpperCase()}
                    {"  "}
                  </Text>
                  {r.factor}
                </Text>
                <MText style={styles.riskDesc}>{r.description}</MText>
                <MText style={styles.riskMeta}>
                  {isKo
                    ? `${r.surfacedInSims}개 시뮬에서 언급`
                    : `Surfaced in ${r.surfacedInSims} sim${r.surfacedInSims === 1 ? "" : "s"}`}
                </MText>
              </View>
            );
          })}
        </View>

        {pageFooter}
      </Page>
    );
  };

  const renderActionsPage = () => {
    if (!aggregate.narrative?.mergedActions?.length) return null;
    const actions = aggregate.narrative.mergedActions.slice(0, tierBudget.actions);
    return (
      <Page size="A4" style={styles.page}>
        {pageHeader}
        <MText style={styles.pageTitle}>{isKo ? "권장 액션" : "Recommended actions"}</MText>
        <MText style={styles.pageSubtitle}>
          {isKo
            ? `시뮬 합의 기반 우선순위 액션 플랜입니다.`
            : `Cross-sim consensus action plan, in priority order.`}
        </MText>

        <View>
          {actions.map((a, i) => (
            <View key={i} style={styles.actionRow} wrap={false}>
              <MText style={styles.actionText}>
                {`${i + 1}. ${a.action}`}
              </MText>
              <MText style={styles.actionMeta}>
                {isKo
                  ? `${a.surfacedInSims}개 시뮬에서 권장`
                  : `Recommended by ${a.surfacedInSims} sim${a.surfacedInSims === 1 ? "" : "s"}`}
              </MText>
            </View>
          ))}
        </View>

        {pageFooter}
      </Page>
    );
  };

  const renderProviderConsensusPage = () => {
    if (!tierBudget.showProviderConsensus) return null;
    if (!aggregate.providerBreakdown || aggregate.providerBreakdown.length < 2) return null;
    return (
      <Page size="A4" style={styles.page}>
        {pageHeader}
        <MText style={styles.pageTitle}>{isKo ? "LLM별 합의도" : "Cross-model consensus"}</MText>
        <MText style={styles.pageSubtitle}>
          {isKo
            ? "여러 LLM이 같은 시장을 추천하면 단일 모델 편향을 배제한 강한 시그널입니다."
            : "When multiple LLMs converge on the same market, single-model bias is ruled out."}
        </MText>

        <View style={styles.sectionBlock}>
          <View style={styles.segGrid}>
            {aggregate.providerBreakdown.map((pb) => {
              const top = pb.bestCountryDistribution[0];
              return (
                <View key={pb.provider} style={styles.segCard} wrap={false}>
                  <MText style={styles.segLabel}>
                    {`${providerLabelPdf(pb.provider)} · ${pb.simCount}${isKo ? "개" : ""}`}
                  </MText>
                  <MText style={styles.segCountry}>{top?.country ?? "—"}</MText>
                  <MText style={styles.segValue}>
                    {top ? `${top.percent}% ${isKo ? "지지" : "support"}` : ""}
                  </MText>
                  <MText style={styles.segAlt}>
                    {`${pb.agreementWithOverallPercent}% ${isKo ? "전체 합의 일치" : "agreement w/ overall"}`}
                  </MText>
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.sectionBlock}>
          <MText style={styles.sectionEyebrow}>
            {isKo ? "LLM별 추천 시장 분포" : "Per-model recommendation distribution"}
          </MText>
          {aggregate.providerBreakdown.map((pb) => (
            <View key={pb.provider} style={{ marginBottom: 10 }}>
              <MText style={{ fontSize: 9, fontWeight: 600, color: C.ink, marginBottom: 4 }}>
                {`${providerLabelPdf(pb.provider)} (${pb.simCount} sims)`}
              </MText>
              {pb.bestCountryDistribution.map((b) => (
                <View key={b.country} style={styles.distRow}>
                  <MText style={styles.distCountry}>{b.country}</MText>
                  <View style={styles.distBarTrack}>
                    <View
                      style={[
                        styles.distBarFill,
                        {
                          width: `${b.percent}%`,
                          backgroundColor:
                            b.country === aggregate.recommendation.country ? C.success : C.faint,
                        },
                      ]}
                    />
                  </View>
                  <MText style={styles.distMeta}>{`${b.count}/${pb.simCount} (${b.percent}%)`}</MText>
                </View>
              ))}
            </View>
          ))}
        </View>

        {pageFooter}
      </Page>
    );
  };

  const renderVariancePage = () => (
    <Page size="A4" style={styles.page}>
      {pageHeader}
      <MText style={styles.pageTitle}>{isKo ? "결과 신뢰성 진단" : "Result reliability"}</MText>
      <MText style={styles.pageSubtitle}>
        {isKo
          ? "시뮬레이션 간 점수 변동 폭으로 본 앙상블 결과의 신뢰도입니다."
          : "Confidence in the ensemble result, viewed through sim-to-sim score variance."}
      </MText>

      <View
        style={[
          styles.callout,
          aggregate.varianceAssessment.label === "high" ? styles.calloutHigh : {},
        ]}
      >
        <View style={[styles.calloutDot, { backgroundColor: varianceColor }]} />
        <View style={{ flex: 1 }}>
          <MText style={styles.calloutLabel}>
            {t.varianceLabels[aggregate.varianceAssessment.label]}
          </MText>
          <MText style={styles.calloutBody}>
            {t.varianceNotes[aggregate.varianceAssessment.label]}
          </MText>
          <MText style={styles.calloutMeta}>
            {`${t.varianceMeta}: ${aggregate.varianceAssessment.maxFinalScoreRange.toFixed(0)}pt · ${t.varianceMetaMean}: ${aggregate.varianceAssessment.meanFinalScoreRange.toFixed(0)}pt`}
          </MText>
        </View>
      </View>

      {tierBudget.showMethodology && (
        <View style={{ marginTop: 22 }}>
          <MText style={styles.sectionEyebrow}>{isKo ? "방법론" : "Methodology"}</MText>
          <MText style={styles.sectionTitle}>
            {isKo ? "이 분석은 어떻게 수행됐는가" : "How this analysis was produced"}
          </MText>
          <View style={{ marginTop: 6 }}>
            <BulletItem
              text={
                isKo
                  ? `${parallelSims}개 독립 시뮬을 병렬 실행. 각 시뮬은 ${perSimPersonas}명 페르소나를 별도로 샘플링하여 다른 입력을 받습니다.`
                  : `${parallelSims} independent simulations run in parallel. Each draws a different ${perSimPersonas}-persona sample.`
              }
            />
            <BulletItem
              text={
                isKo
                  ? `시뮬마다 7단계 (규제 검토 → 페르소나 생성 → 반응 수집 → 국가 점수 → 가격 → 합성 → 자기검증)를 거침.`
                  : `Each sim runs a 7-stage pipeline: regulatory check → personas → reactions → country scoring → pricing → synthesis → self-critique.`
              }
            />
            <BulletItem
              text={
                isKo
                  ? `완료된 ${aggregate.simCount}개 결과를 단일 합의 narrative + 통계로 통합. 리스크/액션은 LLM이 의미 기반으로 dedup.`
                  : `${aggregate.simCount} completed runs merged into one consensus narrative + stats; risks/actions deduped semantically by an LLM pass.`
              }
            />
            <BulletItem
              text={
                isKo
                  ? `사용된 모델: ${llmProviders.map(providerLabelPdf).join(", ")}. ${llmProviders.length > 1 ? "여러 모델이 합의하면 단일 모델 편향이 배제됩니다." : "단일 모델 분석이라 모델 편향 가능성을 감안하세요."}`
                  : `Models used: ${llmProviders.map(providerLabelPdf).join(", ")}. ${llmProviders.length > 1 ? "Multi-model consensus rules out single-provider bias." : "Single-model analysis — consider model-specific bias."}`
              }
            />
            <BulletItem
              text={
                isKo
                  ? `합의도 ≥80%는 STRONG, 50–79%는 MODERATE, <50%는 WEAK. 변동성 등급은 시뮬 간 점수 차이의 최대값으로 결정.`
                  : `Consensus ≥80% = STRONG, 50–79% = MODERATE, <50% = WEAK. Variance label set by max sim-to-sim score range.`
              }
            />
          </View>
        </View>
      )}

      {pageFooter}
    </Page>
  );

  const renderAppendixPage = () => {
    if (!tierBudget.showAppendix) return null;
    return (
      <Page size="A4" style={styles.page}>
        {pageHeader}
        <MText style={styles.pageTitle}>{isKo ? "부록 · 메타데이터" : "Appendix · metadata"}</MText>
        <MText style={styles.pageSubtitle}>
          {isKo
            ? "이 보고서를 생성한 환경 정보입니다. 지원 문의 시 참조하세요."
            : "Environmental metadata for this report — reference when contacting support."}
        </MText>

        <View style={{ flexDirection: "column", gap: 10 }}>
          <MetaLine label={isKo ? "Tier" : "Tier"} value={isKo ? tierDisplay.ko : tierDisplay.en} />
          <MetaLine label={isKo ? "병렬 시뮬" : "Parallel sims"} value={String(parallelSims)} />
          <MetaLine
            label={isKo ? "완료 시뮬" : "Completed sims"}
            value={`${aggregate.simCount}/${parallelSims}`}
          />
          <MetaLine
            label={isKo ? "유효 페르소나" : "Effective personas"}
            value={aggregate.effectivePersonas.toLocaleString()}
          />
          <MetaLine
            label={isKo ? "LLM 라인업" : "LLM lineup"}
            value={lineup}
          />
          <MetaLine label={isKo ? "분석 국가 수" : "Markets analyzed"} value={String(aggregate.countryStats.length)} />
          <MetaLine label={isKo ? "변동성 등급" : "Variance label"} value={aggregate.varianceAssessment.label.toUpperCase()} />
          <MetaLine
            label={isKo ? "최대 점수 변동" : "Max score range"}
            value={`${aggregate.varianceAssessment.maxFinalScoreRange}pt`}
          />
          <MetaLine
            label={isKo ? "평균 변동" : "Mean range"}
            value={`${aggregate.varianceAssessment.meanFinalScoreRange}pt`}
          />
          <MetaLine label={isKo ? "앙상블 ID" : "Ensemble ID"} value={ensembleId} />
          <MetaLine label={isKo ? "로케일" : "Locale"} value={locale} />
          <MetaLine
            label={isKo ? "생성 시각" : "Generated at"}
            value={generatedAt.toLocaleString(isKo ? "ko-KR" : "en-US")}
          />
        </View>

        {pageFooter}
      </Page>
    );
  };

  const doc = (
    <Document>
      {/* COVER */}
      <Page size="A4" style={styles.coverPage}>
        <View style={styles.coverInner}>
          <View>
            <MText style={styles.coverEyebrow}>{t.coverEyebrow}</MText>
            <MText style={styles.coverTitle}>{productName}</MText>
            <MText style={styles.coverProduct}>{generatedAtStr}</MText>
          </View>
          <View>
            <View style={styles.coverRecCard}>
              <MText style={styles.coverRecLabel}>{t.coverRecLabel}</MText>
              <MText style={styles.coverRecCountry}>{recCountryLabel}</MText>
              <Text style={styles.coverRecMeta}>
                <Text style={{ fontWeight: 700 }}>{aggregate.recommendation.consensusPercent}%</Text>
                <Text>{` ${t.consensus} · `}</Text>
                <Text style={{ fontWeight: 700, color: confidenceColor === C.success ? "#86EFAC" : confidenceColor === C.warn ? "#FEF08A" : "#FCA5A5" }}>
                  {t.confidence[aggregate.recommendation.confidence]}
                </Text>
              </Text>
            </View>
            <MText style={styles.coverFooter}>{t.coverFooter}</MText>
          </View>
        </View>
      </Page>

      {renderProjectInfoPage()}
      {renderExecutiveSummaryPage()}
      {renderRecommendationPage()}
      {renderCountriesPage()}
      {renderPersonasPage()}
      {renderVoicesPage()}
      {renderPricingPage()}
      {renderRisksPage()}
      {renderActionsPage()}
      {renderProviderConsensusPage()}
      {renderVariancePage()}
      {renderAppendixPage()}
    </Document>
  );

  return await renderToBuffer(doc);
}

/* ────────────────────────────────── small helpers ─── */

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={styles.kpiCard}>
      <MText style={styles.kpiLabel}>{label}</MText>
      <MText style={styles.kpiValue}>{value}</MText>
      {sub && <MText style={styles.kpiSub}>{sub}</MText>}
    </View>
  );
}

function BulletItem({ text }: { text: string }) {
  return (
    <View style={styles.bulletRow}>
      <MText style={styles.bulletText}>{`· ${text}`}</MText>
    </View>
  );
}

function MetaLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", borderBottom: `0.5pt solid ${C.divider}`, paddingVertical: 6 }}>
      <MText style={{ fontSize: 9, color: C.muted }}>{label}</MText>
      <MText style={{ fontSize: 9, color: C.ink, fontFamily: "AppFont" }}>{value}</MText>
    </View>
  );
}

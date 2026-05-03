/**
 * Ensemble PDF builder. Different shape from the single-sim report:
 * leads with the recommendation + consensus, then segments, then the
 * country statistics table, then variance assessment. Optimized for
 * "send this to your CEO" — one cover + 1-2 content pages.
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

  // Content sections
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
  riskRow: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 8,
    borderBottom: `0.5pt solid ${C.divider}`,
    alignItems: "flex-start",
  },
  riskRowLast: { borderBottom: "none" },
  riskSeverityBadge: {
    width: 56,
    fontSize: 8,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    paddingTop: 1,
  },
  riskBody: { flex: 1 },
  riskFactor: { fontSize: 10, fontWeight: 600, color: C.ink, marginBottom: 2 },
  riskDesc: { fontSize: 9, color: C.body, lineHeight: 1.5 },
  riskMeta: { fontSize: 8, color: C.faint, marginTop: 2 },
  actionRow: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 6,
    alignItems: "flex-start",
  },
  actionBullet: { fontSize: 10, fontWeight: 700, color: C.brand, width: 16 },
  actionText: { flex: 1, fontSize: 10, color: C.body, lineHeight: 1.5 },
  actionMeta: { fontSize: 8, color: C.faint, marginLeft: 6 },

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

// Mirrors providerLabel in EnsembleView.tsx — keep these two in sync so the
// dashboard and PDF render the same brand name for each provider id.
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

/**
 * Build the provider-lineup string with "(actual/expected)" annotations
 * for any provider that lost sims. Mirrors ProviderLineup in EnsembleView
 * so the cover and the dashboard tell the same story. Single-provider
 * ensembles skip the annotation since there's no failure attribution.
 */
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
  tier: "hypothesis" | "decision" | "deep";
  parallelSims: number;
  perSimPersonas: number;
  llmProviders: string[];
  locale: "ko" | "en";
  generatedAt: Date;
  ensembleId: string;
}

export async function buildEnsemblePdf(args: BuildArgs): Promise<Buffer> {
  const { aggregate, productName, tier, parallelSims, perSimPersonas, llmProviders, locale, generatedAt, ensembleId } = args;
  const isKo = locale === "ko";
  const tierLabel =
    tier === "deep" ? "Deep Validation" : tier === "decision" ? "Decision" : "Hypothesis";
  const generatedAtStr = generatedAt.toLocaleDateString(
    isKo ? "ko-KR" : "en-US",
    { year: "numeric", month: "short", day: "numeric" },
  );

  const lineup = buildLineupString(llmProviders, parallelSims, aggregate.providerBreakdown, isKo);
  const t = isKo
    ? {
        coverEyebrow: `MARKET TWIN · ${tierLabel.toUpperCase()} ANALYSIS`,
        coverRecLabel: "추천 진출국",
        consensus: "합의도",
        confidence: { STRONG: "강함", MODERATE: "보통", WEAK: "약함" },
        coverFooter: `${parallelSims}개 시뮬레이션 · 페르소나 ${aggregate.effectivePersonas.toLocaleString()}명 · ${lineup}`,
        bestCountryEyebrow: "01 · 추천 분포",
        bestCountryTitle: "시뮬별 1위 국가 분포",
        segmentEyebrow: "02 · 전략별 추천",
        segmentTitle: "비즈니스 우선순위에 따른 시장 추천",
        statsEyebrow: "03 · 점수 통계",
        statsTitle: "국가별 점수 분포 (N개 시뮬 합산)",
        thRank: "순위",
        thCountry: "국가",
        thMean: "평균",
        thMedian: "중앙값",
        thStd: "표준편차",
        thRange: "범위",
        thCac: "CAC",
        varianceEyebrow: "04 · 변동성 평가",
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
        coverEyebrow: `MARKET TWIN · ${tierLabel.toUpperCase()} ANALYSIS`,
        coverRecLabel: "Recommended Market",
        consensus: "consensus",
        confidence: { STRONG: "Strong", MODERATE: "Moderate", WEAK: "Weak" },
        coverFooter: `${parallelSims} parallel sim${parallelSims === 1 ? "" : "s"} · ${aggregate.effectivePersonas.toLocaleString()} personas · ${lineup}`,
        bestCountryEyebrow: "01 · Recommendation Distribution",
        bestCountryTitle: "Top market across all sims",
        segmentEyebrow: "02 · Strategy Picks",
        segmentTitle: "Best market per business priority",
        statsEyebrow: "03 · Score Statistics",
        statsTitle: "Per-country score distribution (aggregated)",
        thRank: "Rank",
        thCountry: "Country",
        thMean: "Mean",
        thMedian: "Median",
        thStd: "Std",
        thRange: "Range",
        thCac: "CAC",
        varianceEyebrow: "04 · Variance Assessment",
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

      {/* CONTENT */}
      <Page size="A4" style={styles.page}>
        <View style={styles.pageHeader}>
          <MText style={{ fontSize: 8, fontWeight: 600, color: C.muted, letterSpacing: 0.4 }}>MARKET TWIN</MText>
          <MText style={{ fontSize: 8, color: C.faint }}>{productName}</MText>
        </View>

        {/* Narrative sections — only present when the LLM merge step ran
            (multi-sim ensemble). Single-sim ensembles also get them via
            the trivial-pass-through path in mergeNarrative(). */}
        {aggregate.narrative && (
          <>
            <View style={styles.sectionBlock}>
              <MText style={styles.sectionEyebrow}>{isKo ? "개요" : "Executive summary"}</MText>
              <MText style={styles.sectionTitle}>
                {isKo
                  ? `종합 추천: ${recCountryLabel}`
                  : `Consensus recommendation: ${recCountryLabel}`}
              </MText>
              <View style={styles.summaryBox}>
                <MText style={{ fontSize: 10, color: C.body, lineHeight: 1.6 }}>
                  {aggregate.narrative.executiveSummary}
                </MText>
              </View>
            </View>

            {aggregate.narrative.mergedRisks.length > 0 && (
              <View style={styles.sectionBlock}>
                <MText style={styles.sectionEyebrow}>
                  {isKo ? "주요 리스크 (시뮬 합의)" : "Key risks (cross-sim consensus)"}
                </MText>
                <MText style={styles.sectionTitle}>
                  {isKo
                    ? `종합 리스크 수준: ${riskLevelLabel(aggregate.narrative.overallRiskLevel, true)}`
                    : `Overall: ${riskLevelLabel(aggregate.narrative.overallRiskLevel, false)}`}
                </MText>
                <View>
                  {aggregate.narrative.mergedRisks.map((r, i, arr) => {
                    const sevColor =
                      r.severity === "high" ? C.risk : r.severity === "medium" ? C.warn : C.muted;
                    const last = i === arr.length - 1;
                    return (
                      <View key={i} style={[styles.riskRow, last ? styles.riskRowLast : {}]} wrap={false}>
                        <MText style={[styles.riskSeverityBadge, { color: sevColor }]}>
                          {r.severity}
                        </MText>
                        <View style={styles.riskBody}>
                          <MText style={styles.riskFactor}>{r.factor}</MText>
                          <MText style={styles.riskDesc}>{r.description}</MText>
                          <MText style={styles.riskMeta}>
                            {isKo
                              ? `${r.surfacedInSims}개 시뮬에서 언급`
                              : `Surfaced in ${r.surfacedInSims} sim${r.surfacedInSims === 1 ? "" : "s"}`}
                          </MText>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {aggregate.narrative.mergedActions.length > 0 && (
              <View style={styles.sectionBlock}>
                <MText style={styles.sectionEyebrow}>
                  {isKo ? "권장 액션 (시뮬 합의)" : "Recommended actions (cross-sim consensus)"}
                </MText>
                <MText style={styles.sectionTitle}>
                  {isKo ? "우선순위 액션 플랜" : "Priority action plan"}
                </MText>
                <View>
                  {aggregate.narrative.mergedActions.map((a, i) => (
                    <View key={i} style={styles.actionRow} wrap={false}>
                      <MText style={styles.actionBullet}>{`${i + 1}.`}</MText>
                      <View style={{ flex: 1 }}>
                        <MText style={styles.actionText}>{a.action}</MText>
                        <MText style={styles.actionMeta}>
                          {isKo
                            ? `${a.surfacedInSims}개 시뮬에서 권장`
                            : `Recommended by ${a.surfacedInSims} sim${a.surfacedInSims === 1 ? "" : "s"}`}
                        </MText>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </>
        )}

        {/* Section 1: bestCountry distribution */}
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

        {/* Section 2: Segment recommendations */}
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

        {/* Section 2.5: Provider consensus — only for multi-LLM ensembles. */}
        {aggregate.providerBreakdown && aggregate.providerBreakdown.length > 0 && (
          <View style={styles.sectionBlock}>
            <MText style={styles.sectionEyebrow}>
              {isKo ? "LLM별 합의도" : "Cross-model consensus"}
            </MText>
            <MText style={styles.sectionTitle}>
              {isKo
                ? "모델별 추천 시장 및 전체 합의 일치도"
                : "Per-model pick + agreement with overall winner"}
            </MText>
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
        )}

        {/* Section 3: Country stats table */}
        <View style={styles.sectionBlock}>
          <MText style={styles.sectionEyebrow}>{t.statsEyebrow}</MText>
          <MText style={styles.sectionTitle}>{t.statsTitle}</MText>
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <MText style={[styles.th, styles.colCountry]}>{t.thCountry}</MText>
              <MText style={[styles.th, styles.colNum]}>{t.thMean}</MText>
              <MText style={[styles.th, styles.colNum]}>{t.thMedian}</MText>
              <MText style={[styles.th, styles.colNum]}>{t.thStd}</MText>
              <MText style={[styles.th, styles.colNum]}>{t.thRange}</MText>
              <MText style={[styles.th, styles.colNum]}>{t.thCac}</MText>
            </View>
            {aggregate.countryStats.map((c, i) => {
              const last = i === aggregate.countryStats.length - 1;
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

        {/* Section 4: Variance callout */}
        <View style={styles.sectionBlock}>
          <MText style={styles.sectionEyebrow}>{t.varianceEyebrow}</MText>
          <MText style={styles.sectionTitle}>{t.varianceTitle}</MText>
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
        </View>

        <View style={styles.pageFooter}>
          <MText style={{ fontSize: 8, color: C.faint }}>{t.footerLeft}</MText>
          <MText style={{ fontSize: 8, color: C.faint }}>{`Ensemble ${ensembleId.slice(0, 8)}`}</MText>
        </View>
      </Page>
    </Document>
  );

  return await renderToBuffer(doc);
}

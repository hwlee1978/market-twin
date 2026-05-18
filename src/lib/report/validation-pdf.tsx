/**
 * Cross-validation PDF report — McKinsey/BCG-style consulting layout.
 *
 * The 3rd PDF report variant. Designed to read as a partner-grade
 * deliverable: tight typography, decisive headlines, color-coded
 * alignment matrix, risk heatmap, phased execution timeline. Consumes
 * ValidationReportData from validation-content.ts (the LLM-augmented
 * cross-check data structure).
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
import { normalizeLLMText } from "@/lib/format/normalize";
import { getCountryLabel } from "@/lib/countries";
import type { ValidationReportData } from "./validation-content";

const C = {
  brand: "#0A1F4D",
  brandSoft: "#EAF0FB",
  brandAccent: "#94CFEA",
  ink: "#0F172A",
  body: "#334155",
  muted: "#64748B",
  faint: "#94A3B8",
  divider: "#E2E8F0",
  card: "#F8FAFC",
  success: "#16A34A",
  warn: "#CA8A04",
  risk: "#DC2626",
  highBg: "#DCFCE7",
  highInk: "#166534",
  medBg: "#FEF3C7",
  medInk: "#92400E",
  lowBg: "#FEE2E2",
  lowInk: "#991B1B",
  concernBg: "#F3E8FF",
  concernInk: "#6B21A8",
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 64,
    paddingBottom: 52,
    paddingHorizontal: 52,
    fontSize: 10,
    fontFamily: "AppFont",
    color: C.ink,
  },
  pageAccent: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: C.brand,
  },
  pageHeader: {
    position: "absolute",
    top: 28,
    left: 52,
    right: 52,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 10,
    borderBottom: `0.5pt solid ${C.divider}`,
    fontSize: 8,
    color: C.muted,
  },
  pageFooter: {
    position: "absolute",
    bottom: 24,
    left: 52,
    right: 52,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 10,
    borderTop: `0.5pt solid ${C.divider}`,
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
    color: C.brandAccent,
    letterSpacing: 1.5,
    marginBottom: 14,
  },
  coverTitle: {
    fontSize: 26,
    fontWeight: 700,
    lineHeight: 1.25,
    marginBottom: 8,
  },
  coverSubtitle: {
    fontSize: 14,
    color: "#C7D7F5",
    marginBottom: 28,
    lineHeight: 1.45,
  },
  coverProduct: {
    fontSize: 12,
    color: "#C7D7F5",
    marginBottom: 28,
  },
  coverRecCard: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 8,
    padding: 22,
    marginBottom: 24,
  },
  coverRecLabel: {
    fontSize: 9,
    color: C.brandAccent,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 6,
  },
  coverRecCountry: {
    fontSize: 32,
    fontWeight: 700,
    marginBottom: 8,
  },
  coverRecMeta: {
    fontSize: 11,
    color: "#C7D7F5",
  },
  coverFooter: {
    fontSize: 9,
    color: C.brandAccent,
    borderTop: "0.5pt solid rgba(199,215,245,0.3)",
    paddingTop: 12,
  },

  // Section primitives
  sectionEyebrow: {
    fontSize: 8,
    fontWeight: 700,
    color: C.brand,
    letterSpacing: 1.0,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: 700,
    color: C.ink,
    marginBottom: 6,
    letterSpacing: -0.4,
  },
  pageTitleRule: {
    width: 40,
    height: 2,
    backgroundColor: C.brand,
    marginBottom: 14,
  },
  pageSubtitle: {
    fontSize: 10,
    color: C.muted,
    marginBottom: 18,
    lineHeight: 1.55,
  },

  // Headline / verdict
  headlineCard: {
    backgroundColor: C.brand,
    borderRadius: 8,
    padding: 18,
    marginBottom: 16,
  },
  headlineText: {
    fontSize: 15,
    fontWeight: 700,
    color: "#FFFFFF",
    lineHeight: 1.35,
  },
  headlineMeta: {
    fontSize: 9,
    color: C.brandAccent,
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 6,
  },

  // Confidence grade badge
  gradeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  gradeBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: C.brand,
    justifyContent: "center",
    alignItems: "center",
  },
  gradeLetter: {
    fontSize: 24,
    fontWeight: 700,
    color: "#FFFFFF",
  },
  gradeMeta: { flex: 1 },
  gradeLabel: {
    fontSize: 9,
    color: C.muted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  gradeText: {
    fontSize: 12,
    fontWeight: 700,
    color: C.ink,
  },

  // Key message box
  keyMessage: {
    backgroundColor: C.card,
    borderLeft: `3pt solid ${C.brand}`,
    padding: 14,
    fontSize: 10.5,
    color: C.body,
    lineHeight: 1.65,
    marginBottom: 16,
  },

  // Action cards
  actionCard: {
    backgroundColor: C.card,
    padding: 12,
    borderRadius: 4,
    marginBottom: 8,
  },
  actionNum: {
    fontSize: 18,
    fontWeight: 700,
    color: C.brand,
    marginBottom: 4,
  },
  actionText: { fontSize: 10, color: C.body, lineHeight: 1.55 },

  // KPI grid (recommendation snapshot)
  kpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  kpiCard: {
    width: "23.5%",
    backgroundColor: C.card,
    borderLeftWidth: 2,
    borderLeftColor: C.brand,
    borderRadius: 4,
    padding: 12,
  },
  kpiLabel: {
    fontSize: 7,
    fontWeight: 600,
    color: C.muted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
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
  distBarFill: { height: "100%", backgroundColor: C.brand },
  distMeta: {
    width: 90,
    fontSize: 9,
    color: C.muted,
    textAlign: "right",
  },

  // Tables
  table: {
    border: `0.5pt solid ${C.divider}`,
    borderRadius: 4,
    marginBottom: 14,
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
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  tableRowLast: { borderBottom: "none" },
  th: { fontSize: 8, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 0.4 },
  td: { fontSize: 9, color: C.ink, lineHeight: 1.5 },
  tdMuted: { fontSize: 9, color: C.muted, lineHeight: 1.5 },

  // Alignment matrix pills
  alignPill: {
    fontSize: 8,
    fontWeight: 700,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    alignSelf: "flex-start",
  },

  // Two-column block
  twoCol: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 14,
  },
  twoColItem: {
    flex: 1,
    backgroundColor: C.card,
    padding: 12,
    borderRadius: 4,
  },
  twoColLabel: {
    fontSize: 8,
    color: C.muted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  twoColValue: { fontSize: 11, fontWeight: 700, color: C.ink, marginBottom: 4 },
  twoColBody: { fontSize: 9.5, color: C.body, lineHeight: 1.55 },

  // Risk cards
  riskRow: {
    padding: 12,
    marginBottom: 8,
    backgroundColor: C.card,
    borderRadius: 4,
    borderLeftWidth: 2,
  },
  riskTitle: { fontSize: 10, fontWeight: 700, color: C.ink, marginBottom: 4 },
  riskSeverity: {
    fontSize: 8,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  riskMitigation: { fontSize: 9.5, color: C.body, lineHeight: 1.55 },

  // Phase timeline
  phaseRow: {
    flexDirection: "row",
    marginBottom: 14,
    gap: 0,
  },
  phaseLeft: {
    width: 110,
    backgroundColor: C.brand,
    padding: 12,
    borderTopLeftRadius: 4,
    borderBottomLeftRadius: 4,
  },
  phaseRight: {
    flex: 1,
    backgroundColor: C.card,
    padding: 12,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
  },
  phaseLabel: {
    fontSize: 9,
    color: C.brandAccent,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  phaseDuration: { fontSize: 11, fontWeight: 700, color: "#FFFFFF" },
  phaseGoal: { fontSize: 11, fontWeight: 700, color: C.ink, marginBottom: 8 },
  phaseDeliverable: { fontSize: 9.5, color: C.body, lineHeight: 1.55, marginBottom: 2 },

  // Citation list
  citationRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 6,
    gap: 6,
  },
  citationBullet: { fontSize: 9, color: C.brand, fontWeight: 700 },
  citationText: { fontSize: 9.5, color: C.body, lineHeight: 1.55, flex: 1 },

  // Bullet list
  bulletRow: { marginBottom: 6 },
  bulletText: { fontSize: 9.5, color: C.body, lineHeight: 1.65 },
});

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

function stripUnsupportedGlyphs(text: string): string {
  if (!text) return text;
  return normalizeLLMText(text)
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/[\u{1F1E6}-\u{1F1FF}]/gu, "")
    .replace(/ {2,}/g, " ")
    .trim();
}

function alignmentPalette(level: "high" | "medium" | "low" | "concern") {
  switch (level) {
    case "high":
      return { bg: C.highBg, ink: C.highInk };
    case "medium":
      return { bg: C.medBg, ink: C.medInk };
    case "low":
      return { bg: C.lowBg, ink: C.lowInk };
    case "concern":
      return { bg: C.concernBg, ink: C.concernInk };
  }
}

function alignmentLabel(level: "high" | "medium" | "low" | "concern", isKo: boolean): string {
  if (isKo) {
    return level === "high" ? "높음" : level === "medium" ? "보통" : level === "low" ? "낮음" : "주의";
  }
  return level.toUpperCase();
}

function severityPalette(sev: "high" | "medium" | "low") {
  switch (sev) {
    case "high":
      return { border: C.risk, ink: C.risk };
    case "medium":
      return { border: C.warn, ink: C.warn };
    case "low":
      return { border: C.muted, ink: C.muted };
  }
}

function severityLabel(sev: "high" | "medium" | "low", isKo: boolean): string {
  if (isKo) return sev === "high" ? "심각" : sev === "medium" ? "보통" : "낮음";
  return sev.toUpperCase();
}

function reliabilityColor(r: "A" | "B+" | "B" | "C"): string {
  if (r === "A") return C.success;
  if (r === "B+" || r === "B") return C.warn;
  return C.muted;
}

function gradeColor(grade: "A" | "B+" | "B" | "C+" | "C"): string {
  if (grade === "A") return C.success;
  if (grade === "B+" || grade === "B") return C.brand;
  return C.warn;
}

function fitTitleSize(text: string): number {
  let weight = 0;
  for (const ch of text) {
    weight += /[가-힯぀-ヿ一-鿿]/.test(ch) ? 1.6 : 1;
  }
  if (weight <= 18) return 26;
  if (weight <= 24) return 22;
  if (weight <= 30) return 20;
  if (weight <= 38) return 18;
  return 16;
}

export async function buildValidationPdf(data: ValidationReportData): Promise<Buffer> {
  const { meta, simResult, executiveSummary, marketValidation, competitiveLandscape,
    alignmentMatrix, riskAssessment, phasedExecution, limitations, appendix } = data;
  const isKo = meta.locale === "ko";
  const generatedAt = new Date(meta.generatedAt);
  const generatedAtStr = generatedAt.toLocaleDateString(
    isKo ? "ko-KR" : "en-US",
    { year: "numeric", month: "short", day: "numeric" },
  );
  const winnerLabel = getCountryLabel(simResult.winner, isKo ? "ko" : "en");

  const t = isKo
    ? {
        coverEyebrow: "MARKET TWIN · 교차검증 리포트",
        coverTitle: "교차검증 분석 리포트",
        coverSubtitle: "AI 시뮬레이션 결과 × 외부 시장 데이터 정합성 검증",
        coverRecLabel: "추천 진출국",
        consensus: "합의도",
        confidence: { STRONG: "강함", MODERATE: "보통", WEAK: "약함" },
        coverFooter: `${meta.simCount}개 시뮬레이션 · 페르소나 ${meta.personaCount.toLocaleString()}명 · ${meta.llmProviders.length}개 LLM`,
        pageHeader: "교차검증 리포트",
        execEyebrow: "01 EXECUTIVE SUMMARY",
        execTitle: "총괄 요약",
        execSub: "추천 결론 · 신뢰도 · 즉시 실행 액션",
        recommendation: "추천 결론",
        confGradeLabel: "신뢰 등급",
        threeActions: "즉시 실행 3대 액션",
        snapshotEyebrow: "02 RECOMMENDATION SNAPSHOT",
        snapshotTitle: "추천 의사결정 스냅샷",
        snapshotSub: "시뮬레이션 결과의 핵심 지표 · 다중 LLM 합의 분포",
        kpiWinner: "추천국",
        kpiConsensus: "합의도",
        kpiConfidence: "신뢰도",
        kpiSims: "시뮬레이션",
        voteDistTitle: "1순위 국가 분포 (다중 LLM 투표)",
        scoreRankTitle: "국가별 평균 점수 (최종 스코어)",
        marketEyebrow: "03 MARKET VALIDATION",
        marketTitle: "시장 검증",
        marketSub: "외부 시장 데이터로 본 시장 매력도",
        growth: "시장 성장 신호",
        growthSource: "근거 출처",
        segmentFit: "타깃 세그먼트 적합도",
        timing: "진출 시점 판단",
        citations: "참고 자료",
        compEyebrow: "04 COMPETITIVE LANDSCAPE",
        compTitle: "경쟁 환경 분석",
        compSub: "동종 브랜드 패턴 · 경쟁 강도 · 차별화 기회",
        peerBrand: "동종 브랜드 진출 패턴",
        peerExamples: "벤치마크 사례",
        intensity: "경쟁 강도",
        differentiation: "차별화 기회",
        intensityLow: "낮음",
        intensityMed: "보통",
        intensityHigh: "높음",
        alignEyebrow: "05 CROSS-SOURCE ALIGNMENT",
        alignTitle: "교차 데이터 정합성 매트릭스",
        alignSub: "시뮬 신호와 외부 데이터의 정합도 차원별 분석",
        thDim: "차원",
        thSim: "시뮬 신호",
        thExt: "외부 데이터",
        thAlign: "정합도",
        thNote: "비고",
        riskEyebrow: "06 RISK ASSESSMENT",
        riskTitle: "리스크 진단",
        riskSub: "심각도별 리스크 · 완화 전략",
        phaseEyebrow: "07 PHASED EXECUTION",
        phaseTitle: "단계별 실행 로드맵",
        phaseSub: "90일 → 270일 → 그 이상의 마일스톤",
        limitEyebrow: "08 LIMITATIONS & METHODOLOGY",
        limitTitle: "한계 및 방법론",
        limitSub: "이 리포트의 한계 · 데이터 출처 · 방법론",
        limitations: "한계 사항",
        sources: "데이터 출처",
        thCategory: "분야",
        thSource: "출처",
        thReliability: "신뢰도",
        methodology: "방법론",
        contact: "문의",
      }
    : {
        coverEyebrow: "MARKET TWIN · CROSS-VALIDATION REPORT",
        coverTitle: "Cross-Validation Analysis",
        coverSubtitle: "AI simulation results × external market data alignment audit",
        coverRecLabel: "Recommended market",
        consensus: "consensus",
        confidence: { STRONG: "STRONG", MODERATE: "MODERATE", WEAK: "WEAK" },
        coverFooter: `${meta.simCount} simulations · ${meta.personaCount.toLocaleString()} personas · ${meta.llmProviders.length} LLMs`,
        pageHeader: "Cross-Validation Report",
        execEyebrow: "01 EXECUTIVE SUMMARY",
        execTitle: "Executive Summary",
        execSub: "Verdict · confidence grade · top 3 actions",
        recommendation: "Recommendation",
        confGradeLabel: "Confidence grade",
        threeActions: "Top 3 actions — next 90 days",
        snapshotEyebrow: "02 RECOMMENDATION SNAPSHOT",
        snapshotTitle: "Recommendation Snapshot",
        snapshotSub: "Headline metrics · multi-LLM consensus distribution",
        kpiWinner: "Pick",
        kpiConsensus: "Consensus",
        kpiConfidence: "Confidence",
        kpiSims: "Simulations",
        voteDistTitle: "Top-pick distribution (multi-LLM vote)",
        scoreRankTitle: "Mean final score by country",
        marketEyebrow: "03 MARKET VALIDATION",
        marketTitle: "Market Validation",
        marketSub: "External market data view on attractiveness",
        growth: "Market growth signal",
        growthSource: "Source",
        segmentFit: "Segment fit",
        timing: "Timing assessment",
        citations: "Citations",
        compEyebrow: "04 COMPETITIVE LANDSCAPE",
        compTitle: "Competitive Landscape",
        compSub: "Peer brand pattern · intensity · differentiation",
        peerBrand: "Peer brand entry pattern",
        peerExamples: "Benchmark cases",
        intensity: "Competitive intensity",
        differentiation: "Differentiation opportunity",
        intensityLow: "Low",
        intensityMed: "Moderate",
        intensityHigh: "High",
        alignEyebrow: "05 CROSS-SOURCE ALIGNMENT",
        alignTitle: "Cross-Source Alignment Matrix",
        alignSub: "Per-dimension alignment between simulation signal and external data",
        thDim: "Dimension",
        thSim: "Simulation signal",
        thExt: "External data",
        thAlign: "Alignment",
        thNote: "Note",
        riskEyebrow: "06 RISK ASSESSMENT",
        riskTitle: "Risk Assessment",
        riskSub: "Severity-tagged risks · mitigation",
        phaseEyebrow: "07 PHASED EXECUTION",
        phaseTitle: "Phased Execution Roadmap",
        phaseSub: "Day 1-90 → 91-270 → 271+ milestones",
        limitEyebrow: "08 LIMITATIONS & METHODOLOGY",
        limitTitle: "Limitations & Methodology",
        limitSub: "What this report can / cannot tell you",
        limitations: "Limitations",
        sources: "Data sources",
        thCategory: "Category",
        thSource: "Source",
        thReliability: "Reliability",
        methodology: "Methodology",
        contact: "Contact",
      };

  const confidenceLabel = t.confidence[simResult.confidence];

  const pageHeader = (
    <View style={styles.pageHeader} fixed>
      <MText>{`${t.pageHeader} · ${stripUnsupportedGlyphs(meta.productName)}`}</MText>
      <MText>{generatedAtStr}</MText>
    </View>
  );
  const pageFooter = (
    <View style={styles.pageFooter} fixed>
      <MText>{`MARKET TWIN · ${meta.ensembleId.slice(0, 8)}`}</MText>
      <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );

  // ── Cover ──────────────────────────────────────────────
  const coverPage = (
    <Page size="A4" style={styles.coverPage}>
      <View
        style={{
          position: "absolute",
          top: -120,
          right: -120,
          width: 360,
          height: 360,
          borderRadius: 180,
          backgroundColor: "rgba(255,255,255,0.04)",
        }}
      />
      <View
        style={{
          position: "absolute",
          top: 0,
          right: 56,
          width: 1,
          height: "100%",
          backgroundColor: "rgba(255,255,255,0.08)",
        }}
      />
      <View style={styles.coverInner}>
        <View>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              marginBottom: 32,
            }}
          >
            <View
              style={{
                width: 4,
                height: 14,
                backgroundColor: C.brandAccent,
                borderRadius: 1,
              }}
            />
            <MText
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: "#FFFFFF",
                letterSpacing: 1.8,
              }}
            >
              MARKET TWIN
            </MText>
          </View>
          <MText style={styles.coverEyebrow}>{t.coverEyebrow}</MText>
          <MText
            style={[
              styles.coverTitle,
              { fontSize: fitTitleSize(t.coverTitle) },
            ]}
          >
            {t.coverTitle}
          </MText>
          <MText style={styles.coverSubtitle}>{t.coverSubtitle}</MText>
          <MText style={styles.coverProduct}>
            {`${stripUnsupportedGlyphs(meta.productName)} · ${generatedAtStr}`}
          </MText>
        </View>
        <View>
          <View style={styles.coverRecCard}>
            <MText style={styles.coverRecLabel}>{t.coverRecLabel}</MText>
            <MText style={styles.coverRecCountry}>{winnerLabel}</MText>
            <Text style={styles.coverRecMeta}>
              <Text style={{ fontWeight: 700 }}>{simResult.consensusPercent}%</Text>
              <Text>{` ${t.consensus} · `}</Text>
              <Text
                style={{
                  fontWeight: 700,
                  color:
                    simResult.confidence === "STRONG"
                      ? "#86EFAC"
                      : simResult.confidence === "MODERATE"
                        ? "#FEF08A"
                        : "#FCA5A5",
                }}
              >
                {confidenceLabel}
              </Text>
            </Text>
          </View>
          <MText style={styles.coverFooter}>{t.coverFooter}</MText>
        </View>
      </View>
    </Page>
  );

  // ── 01 Executive Summary ───────────────────────────────
  const execPage = (
    <Page size="A4" style={styles.page}>
      <View style={styles.pageAccent} fixed />
      {pageHeader}
      <MText style={styles.sectionEyebrow}>{t.execEyebrow}</MText>
      <MText style={styles.pageTitle}>{t.execTitle}</MText>
      <View style={styles.pageTitleRule} />
      <MText style={styles.pageSubtitle}>{t.execSub}</MText>

      <View style={styles.headlineCard}>
        <MText style={styles.headlineMeta}>{t.recommendation}</MText>
        <MText style={styles.headlineText}>
          {stripUnsupportedGlyphs(executiveSummary.headline)}
        </MText>
      </View>

      <View style={styles.gradeRow}>
        <View
          style={[
            styles.gradeBadge,
            { backgroundColor: gradeColor(executiveSummary.confidenceGrade) },
          ]}
        >
          <MText style={styles.gradeLetter}>{executiveSummary.confidenceGrade}</MText>
        </View>
        <View style={styles.gradeMeta}>
          <MText style={styles.gradeLabel}>{t.confGradeLabel}</MText>
          <MText style={styles.gradeText}>
            {stripUnsupportedGlyphs(executiveSummary.confidenceLabel)}
          </MText>
        </View>
      </View>

      <View style={styles.keyMessage}>
        <MText style={{ fontSize: 10.5, color: C.body, lineHeight: 1.65 }}>
          {stripUnsupportedGlyphs(executiveSummary.keyMessage)}
        </MText>
      </View>

      <MText
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: C.ink,
          marginBottom: 10,
          marginTop: 4,
        }}
      >
        {t.threeActions}
      </MText>
      {executiveSummary.threeActions.map((action, i) => (
        <View key={i} style={styles.actionCard}>
          <MText style={styles.actionNum}>{String(i + 1).padStart(2, "0")}</MText>
          <MText style={styles.actionText}>{stripUnsupportedGlyphs(action)}</MText>
        </View>
      ))}

      {pageFooter}
    </Page>
  );

  // ── 02 Recommendation Snapshot ─────────────────────────
  const topPercent = simResult.voteDistribution[0]?.percent ?? 1;
  const snapshotPage = (
    <Page size="A4" style={styles.page}>
      <View style={styles.pageAccent} fixed />
      {pageHeader}
      <MText style={styles.sectionEyebrow}>{t.snapshotEyebrow}</MText>
      <MText style={styles.pageTitle}>{t.snapshotTitle}</MText>
      <View style={styles.pageTitleRule} />
      <MText style={styles.pageSubtitle}>{t.snapshotSub}</MText>

      <View style={styles.kpiGrid}>
        <View style={styles.kpiCard}>
          <MText style={styles.kpiLabel}>{t.kpiWinner}</MText>
          <MText style={styles.kpiValue}>{winnerLabel}</MText>
          {simResult.topCountriesTied && simResult.runnerUp && (
            <MText style={styles.kpiSub}>
              {`tied with ${getCountryLabel(simResult.runnerUp, isKo ? "ko" : "en")}`}
            </MText>
          )}
        </View>
        <View style={styles.kpiCard}>
          <MText style={styles.kpiLabel}>{t.kpiConsensus}</MText>
          <MText style={styles.kpiValue}>{`${simResult.consensusPercent}%`}</MText>
          {simResult.consensusType && (
            <MText style={styles.kpiSub}>{simResult.consensusType}</MText>
          )}
        </View>
        <View style={styles.kpiCard}>
          <MText style={styles.kpiLabel}>{t.kpiConfidence}</MText>
          <MText style={styles.kpiValue}>{confidenceLabel}</MText>
        </View>
        <View style={styles.kpiCard}>
          <MText style={styles.kpiLabel}>{t.kpiSims}</MText>
          <MText style={styles.kpiValue}>{String(meta.simCount)}</MText>
          <MText style={styles.kpiSub}>{`${meta.llmProviders.length} LLM mix`}</MText>
        </View>
      </View>

      <MText
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: C.ink,
          marginBottom: 10,
          marginTop: 8,
        }}
      >
        {t.voteDistTitle}
      </MText>
      {simResult.voteDistribution.slice(0, 6).map((row, i) => {
        const pct = topPercent > 0 ? (row.percent / topPercent) * 100 : 0;
        const isWinner = i === 0;
        return (
          <View key={row.country} style={styles.distRow}>
            <MText style={styles.distCountry}>
              {getCountryLabel(row.country, isKo ? "ko" : "en")}
            </MText>
            <View style={styles.distBarTrack}>
              <View
                style={[
                  styles.distBarFill,
                  {
                    width: `${pct}%`,
                    backgroundColor: isWinner ? C.brand : C.faint,
                  },
                ]}
              />
            </View>
            <MText style={styles.distMeta}>{`${row.count} · ${row.percent}%`}</MText>
          </View>
        );
      })}

      <MText
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: C.ink,
          marginBottom: 10,
          marginTop: 16,
        }}
      >
        {t.scoreRankTitle}
      </MText>
      <View style={styles.table}>
        <View style={styles.tableHeader}>
          <MText style={[styles.th, { flex: 1.4 }]}>{t.thDim}</MText>
          <MText style={[styles.th, { flex: 1, textAlign: "right" }]}>μ</MText>
          <MText style={[styles.th, { flex: 1, textAlign: "right" }]}>σ</MText>
        </View>
        {simResult.scoreRanking.slice(0, 8).map((row, idx) => {
          const last = idx === Math.min(7, simResult.scoreRanking.length - 1);
          return (
            <View key={row.country} style={[styles.tableRow, last ? styles.tableRowLast : {}]}>
              <MText style={[styles.td, { flex: 1.4, fontWeight: idx === 0 ? 700 : 400 }]}>
                {getCountryLabel(row.country, isKo ? "ko" : "en")}
              </MText>
              <MText style={[styles.td, { flex: 1, textAlign: "right" }]}>
                {row.mean.toFixed(1)}
              </MText>
              <MText style={[styles.tdMuted, { flex: 1, textAlign: "right" }]}>
                {row.std.toFixed(1)}
              </MText>
            </View>
          );
        })}
      </View>

      {pageFooter}
    </Page>
  );

  // ── 03 Market Validation ───────────────────────────────
  const marketPage = (
    <Page size="A4" style={styles.page}>
      <View style={styles.pageAccent} fixed />
      {pageHeader}
      <MText style={styles.sectionEyebrow}>{t.marketEyebrow}</MText>
      <MText style={styles.pageTitle}>{t.marketTitle}</MText>
      <View style={styles.pageTitleRule} />
      <MText style={styles.pageSubtitle}>{t.marketSub}</MText>

      <View style={styles.twoCol}>
        <View style={styles.twoColItem}>
          <MText style={styles.twoColLabel}>{t.growth}</MText>
          <MText style={styles.twoColValue}>
            {stripUnsupportedGlyphs(marketValidation.marketGrowthSignal)}
          </MText>
          <MText style={styles.twoColBody}>
            {`${t.growthSource}: ${stripUnsupportedGlyphs(marketValidation.growthSource)}`}
          </MText>
        </View>
        <View style={styles.twoColItem}>
          <MText style={styles.twoColLabel}>{t.timing}</MText>
          <MText style={styles.twoColValue}>
            {stripUnsupportedGlyphs(marketValidation.timingAssessment)}
          </MText>
        </View>
      </View>

      <View
        style={{
          backgroundColor: C.card,
          padding: 14,
          borderRadius: 4,
          marginBottom: 14,
        }}
      >
        <MText style={styles.twoColLabel}>{t.segmentFit}</MText>
        <MText style={{ fontSize: 10.5, color: C.body, lineHeight: 1.65, marginTop: 4 }}>
          {stripUnsupportedGlyphs(marketValidation.segmentFit)}
        </MText>
      </View>

      {marketValidation.citations.length > 0 && (
        <>
          <MText
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: C.ink,
              marginBottom: 8,
              marginTop: 6,
            }}
          >
            {t.citations}
          </MText>
          {marketValidation.citations.map((cite, i) => (
            <View key={i} style={styles.citationRow}>
              <MText style={styles.citationBullet}>{`[${i + 1}]`}</MText>
              <MText style={styles.citationText}>
                {stripUnsupportedGlyphs(`${cite.label}${cite.url ? ` — ${cite.url}` : ""}`)}
              </MText>
            </View>
          ))}
        </>
      )}

      {pageFooter}
    </Page>
  );

  // ── 04 Competitive Landscape ───────────────────────────
  const intensityText =
    competitiveLandscape.competitiveIntensity === "high"
      ? t.intensityHigh
      : competitiveLandscape.competitiveIntensity === "low"
        ? t.intensityLow
        : t.intensityMed;
  const intensityColor =
    competitiveLandscape.competitiveIntensity === "high"
      ? C.risk
      : competitiveLandscape.competitiveIntensity === "low"
        ? C.success
        : C.warn;
  const compPage = (
    <Page size="A4" style={styles.page}>
      <View style={styles.pageAccent} fixed />
      {pageHeader}
      <MText style={styles.sectionEyebrow}>{t.compEyebrow}</MText>
      <MText style={styles.pageTitle}>{t.compTitle}</MText>
      <View style={styles.pageTitleRule} />
      <MText style={styles.pageSubtitle}>{t.compSub}</MText>

      <View
        style={{
          backgroundColor: C.card,
          padding: 14,
          borderRadius: 4,
          marginBottom: 14,
          borderLeft: `3pt solid ${C.brand}`,
        }}
      >
        <MText style={styles.twoColLabel}>{t.peerBrand}</MText>
        <MText
          style={{ fontSize: 10.5, color: C.body, lineHeight: 1.65, marginTop: 4 }}
        >
          {stripUnsupportedGlyphs(competitiveLandscape.peerBrandPattern)}
        </MText>
      </View>

      {competitiveLandscape.peerBrandExamples.length > 0 && (
        <>
          <MText
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: C.ink,
              marginBottom: 8,
            }}
          >
            {t.peerExamples}
          </MText>
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <MText style={[styles.th, { flex: 1 }]}>{isKo ? "브랜드" : "Brand"}</MText>
              <MText style={[styles.th, { flex: 3 }]}>{isKo ? "신호" : "Signal"}</MText>
            </View>
            {competitiveLandscape.peerBrandExamples.map((ex, idx) => {
              const last = idx === competitiveLandscape.peerBrandExamples.length - 1;
              return (
                <View key={idx} style={[styles.tableRow, last ? styles.tableRowLast : {}]}>
                  <MText style={[styles.td, { flex: 1, fontWeight: 700 }]}>
                    {stripUnsupportedGlyphs(ex.brand)}
                  </MText>
                  <MText style={[styles.td, { flex: 3 }]}>
                    {stripUnsupportedGlyphs(ex.signal)}
                  </MText>
                </View>
              );
            })}
          </View>
        </>
      )}

      <View style={styles.twoCol}>
        <View style={styles.twoColItem}>
          <MText style={styles.twoColLabel}>{t.intensity}</MText>
          <MText style={[styles.twoColValue, { color: intensityColor }]}>
            {intensityText.toUpperCase()}
          </MText>
        </View>
        <View style={styles.twoColItem}>
          <MText style={styles.twoColLabel}>{t.differentiation}</MText>
          <MText style={styles.twoColBody}>
            {stripUnsupportedGlyphs(competitiveLandscape.differentiationOpportunity)}
          </MText>
        </View>
      </View>

      {pageFooter}
    </Page>
  );

  // ── 05 Cross-Source Alignment Matrix ───────────────────
  const alignPage = (
    <Page size="A4" style={styles.page}>
      <View style={styles.pageAccent} fixed />
      {pageHeader}
      <MText style={styles.sectionEyebrow}>{t.alignEyebrow}</MText>
      <MText style={styles.pageTitle}>{t.alignTitle}</MText>
      <View style={styles.pageTitleRule} />
      <MText style={styles.pageSubtitle}>{t.alignSub}</MText>

      <View style={styles.table}>
        <View style={styles.tableHeader}>
          <MText style={[styles.th, { flex: 1.1 }]}>{t.thDim}</MText>
          <MText style={[styles.th, { flex: 1.6 }]}>{t.thSim}</MText>
          <MText style={[styles.th, { flex: 1.6 }]}>{t.thExt}</MText>
          <MText style={[styles.th, { flex: 0.8, textAlign: "center" }]}>{t.thAlign}</MText>
        </View>
        {alignmentMatrix.map((row, idx) => {
          const last = idx === alignmentMatrix.length - 1;
          const palette = alignmentPalette(row.alignment);
          return (
            <View key={idx} style={[styles.tableRow, last ? styles.tableRowLast : {}]}>
              <View style={{ flex: 1.1 }}>
                <MText style={[styles.td, { fontWeight: 700 }]}>
                  {stripUnsupportedGlyphs(row.dimension)}
                </MText>
                {row.note && (
                  <MText style={[styles.tdMuted, { fontSize: 8, marginTop: 3 }]}>
                    {stripUnsupportedGlyphs(row.note)}
                  </MText>
                )}
              </View>
              <MText style={[styles.td, { flex: 1.6 }]}>
                {stripUnsupportedGlyphs(row.simSignal)}
              </MText>
              <MText style={[styles.td, { flex: 1.6 }]}>
                {stripUnsupportedGlyphs(row.externalData)}
              </MText>
              <View style={{ flex: 0.8, alignItems: "center" }}>
                <View
                  style={[
                    styles.alignPill,
                    { backgroundColor: palette.bg },
                  ]}
                >
                  <MText style={{ fontSize: 8, fontWeight: 700, color: palette.ink }}>
                    {alignmentLabel(row.alignment, isKo)}
                  </MText>
                </View>
              </View>
            </View>
          );
        })}
      </View>

      {/* Legend */}
      <View
        style={{
          flexDirection: "row",
          gap: 10,
          flexWrap: "wrap",
          marginTop: 8,
        }}
      >
        {(["high", "medium", "low", "concern"] as const).map((lvl) => {
          const palette = alignmentPalette(lvl);
          return (
            <View
              key={lvl}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 4,
              }}
            >
              <View
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 2,
                  backgroundColor: palette.bg,
                }}
              />
              <MText style={{ fontSize: 8, color: C.muted }}>
                {alignmentLabel(lvl, isKo)}
              </MText>
            </View>
          );
        })}
      </View>

      {pageFooter}
    </Page>
  );

  // ── 06 Risk Assessment ─────────────────────────────────
  const riskPage = (
    <Page size="A4" style={styles.page}>
      <View style={styles.pageAccent} fixed />
      {pageHeader}
      <MText style={styles.sectionEyebrow}>{t.riskEyebrow}</MText>
      <MText style={styles.pageTitle}>{t.riskTitle}</MText>
      <View style={styles.pageTitleRule} />
      <MText style={styles.pageSubtitle}>{t.riskSub}</MText>

      {riskAssessment.map((risk, idx) => {
        const palette = severityPalette(risk.severity);
        return (
          <View
            key={idx}
            style={[styles.riskRow, { borderLeftColor: palette.border }]}
          >
            <MText style={[styles.riskSeverity, { color: palette.ink }]}>
              {`${severityLabel(risk.severity, isKo)} · ${stripUnsupportedGlyphs(risk.risk)}`}
            </MText>
            <MText style={styles.riskMitigation}>
              {stripUnsupportedGlyphs(risk.mitigation)}
            </MText>
          </View>
        );
      })}

      {pageFooter}
    </Page>
  );

  // ── 07 Phased Execution ────────────────────────────────
  const renderPhase = (
    label: string,
    phase: { duration: string; goal: string; deliverables: string[] },
  ) => (
    <View style={styles.phaseRow}>
      <View style={styles.phaseLeft}>
        <MText style={styles.phaseLabel}>{label}</MText>
        <MText style={styles.phaseDuration}>
          {stripUnsupportedGlyphs(phase.duration)}
        </MText>
      </View>
      <View style={styles.phaseRight}>
        <MText style={styles.phaseGoal}>{stripUnsupportedGlyphs(phase.goal)}</MText>
        {phase.deliverables.map((d, i) => (
          <MText key={i} style={styles.phaseDeliverable}>
            {`· ${stripUnsupportedGlyphs(d)}`}
          </MText>
        ))}
      </View>
    </View>
  );

  const phasePage = (
    <Page size="A4" style={styles.page}>
      <View style={styles.pageAccent} fixed />
      {pageHeader}
      <MText style={styles.sectionEyebrow}>{t.phaseEyebrow}</MText>
      <MText style={styles.pageTitle}>{t.phaseTitle}</MText>
      <View style={styles.pageTitleRule} />
      <MText style={styles.pageSubtitle}>{t.phaseSub}</MText>

      {renderPhase(isKo ? "PHASE 1" : "PHASE 1", phasedExecution.phase1)}
      {renderPhase(isKo ? "PHASE 2" : "PHASE 2", phasedExecution.phase2)}
      {renderPhase(isKo ? "PHASE 3" : "PHASE 3", phasedExecution.phase3)}

      {pageFooter}
    </Page>
  );

  // ── 08 Limitations & Methodology ───────────────────────
  const limitPage = (
    <Page size="A4" style={styles.page}>
      <View style={styles.pageAccent} fixed />
      {pageHeader}
      <MText style={styles.sectionEyebrow}>{t.limitEyebrow}</MText>
      <MText style={styles.pageTitle}>{t.limitTitle}</MText>
      <View style={styles.pageTitleRule} />
      <MText style={styles.pageSubtitle}>{t.limitSub}</MText>

      <MText
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: C.ink,
          marginBottom: 8,
        }}
      >
        {t.limitations}
      </MText>
      {limitations.map((l, i) => (
        <View key={i} style={styles.bulletRow}>
          <MText style={styles.bulletText}>{`· ${stripUnsupportedGlyphs(l)}`}</MText>
        </View>
      ))}

      <MText
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: C.ink,
          marginBottom: 8,
          marginTop: 16,
        }}
      >
        {t.sources}
      </MText>
      <View style={styles.table}>
        <View style={styles.tableHeader}>
          <MText style={[styles.th, { flex: 1.2 }]}>{t.thCategory}</MText>
          <MText style={[styles.th, { flex: 2.4 }]}>{t.thSource}</MText>
          <MText style={[styles.th, { flex: 0.7, textAlign: "center" }]}>
            {t.thReliability}
          </MText>
        </View>
        {appendix.dataSources.map((src, idx) => {
          const last = idx === appendix.dataSources.length - 1;
          return (
            <View key={idx} style={[styles.tableRow, last ? styles.tableRowLast : {}]}>
              <MText style={[styles.td, { flex: 1.2, fontWeight: 600 }]}>
                {stripUnsupportedGlyphs(src.category)}
              </MText>
              <MText style={[styles.td, { flex: 2.4 }]}>
                {stripUnsupportedGlyphs(src.source)}
              </MText>
              <View style={{ flex: 0.7, alignItems: "center" }}>
                <MText
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    color: reliabilityColor(src.reliability),
                  }}
                >
                  {src.reliability}
                </MText>
              </View>
            </View>
          );
        })}
      </View>

      <MText
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: C.ink,
          marginBottom: 6,
          marginTop: 14,
        }}
      >
        {t.methodology}
      </MText>
      <View
        style={{
          backgroundColor: C.card,
          padding: 12,
          borderRadius: 4,
          marginBottom: 14,
        }}
      >
        <MText style={{ fontSize: 10, color: C.body, lineHeight: 1.65 }}>
          {stripUnsupportedGlyphs(appendix.methodology)}
        </MText>
      </View>

      <MText style={{ fontSize: 8, color: C.faint, marginTop: 8 }}>
        {`${t.contact}: ${appendix.contact}`}
      </MText>

      {pageFooter}
    </Page>
  );

  const doc = (
    <Document>
      {coverPage}
      {execPage}
      {snapshotPage}
      {marketPage}
      {compPage}
      {alignPage}
      {riskPage}
      {phasePage}
      {limitPage}
    </Document>
  );

  return await renderToBuffer(doc);
}

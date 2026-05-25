/**
 * Cross-validation PDF — McKinsey/BCG consulting layout.
 *
 * 13-14 page report rendered from ValidationReportData. The data
 * structure is produced by validation-content.ts which pre-fetches
 * objective data (Tavily web search + KOTRA OpenAPI) and feeds it to
 * Sonnet as grounding context — so every numeric claim in this PDF
 * traces back to a real source, not LLM recall.
 *
 * Page order:
 *   1.  Cover (product info table + recommendation callout)
 *   2.  Table of contents
 *   3.  Executive Brief (30s summary + momentum indicators)
 *   4.  Validation Methodology (infra table + 4-source list)
 *   5.  Simulation Results — vote distribution + score ranking + finding callout
 *   6.  External Cross-check Source A — market size + CAGR
 *   7.  External Cross-check Source B — peer brand patterns
 *   8.  External Cross-check Source C — KOTRA success cases (real API)
 *   9.  External Cross-check Source D — internal brand growth
 *   10. Integrated Analysis — alignment matrix + weighted scoring
 *   11. Risk Assessment — star-rated risks
 *   12. Phased Execution — Phase 1 step table + Phase 2/3 bullets
 *   13. Honest Disclosure — limitations + per-area letter grades
 *   14. Appendix — sources + reference URLs + reproduction spec
 *   15. Closing tagline
 */
import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import type * as React from "react";
import type { Style } from "@react-pdf/types";
import { splitByFont } from "./fonts";
import { normalizeLLMText } from "@/lib/format/normalize";
import { getCountryLabel } from "@/lib/countries";
import { formatPrice } from "@/lib/format/price";
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

  sectionEyebrow: {
    fontSize: 8,
    fontWeight: 700,
    color: C.brand,
    letterSpacing: 1.0,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  sectionNum: {
    fontSize: 14,
    fontWeight: 700,
    color: C.brand,
    marginRight: 8,
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: 700,
    color: C.ink,
    marginBottom: 6,
    letterSpacing: -0.4,
  },
  pageTitleRow: {
    flexDirection: "row",
    alignItems: "baseline",
    marginBottom: 8,
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
    marginBottom: 14,
    lineHeight: 1.55,
  },
  subSectionTitle: {
    fontSize: 12,
    fontWeight: 700,
    color: C.ink,
    marginBottom: 8,
    marginTop: 10,
  },
  subSubTitle: {
    fontSize: 10,
    fontWeight: 700,
    color: C.brand,
    marginBottom: 6,
    marginTop: 8,
  },

  // Cover (white background, McKinsey-style)
  coverPageWhite: {
    paddingTop: 72,
    paddingBottom: 64,
    paddingHorizontal: 52,
    fontFamily: "AppFont",
    color: C.ink,
    backgroundColor: "#FFFFFF",
  },
  coverHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingBottom: 12,
    borderBottom: `0.5pt solid ${C.divider}`,
    marginBottom: 20,
  },
  coverHeaderTitle: { fontSize: 9, fontWeight: 700, color: C.brand, letterSpacing: 1.4 },
  coverHeaderSub: { fontSize: 9, color: C.muted, letterSpacing: 0.8 },
  coverBrandBar: {
    backgroundColor: C.brandSoft,
    padding: 12,
    marginBottom: 32,
    borderLeft: `3pt solid ${C.brand}`,
  },
  coverBrandText: { fontSize: 10, fontWeight: 700, color: C.brand, letterSpacing: 1.2 },
  coverEyebrow: {
    fontSize: 11,
    fontWeight: 700,
    color: C.brand,
    letterSpacing: 1.5,
    marginBottom: 14,
  },
  coverTitle: {
    fontSize: 36,
    fontWeight: 700,
    color: C.ink,
    marginBottom: 10,
    letterSpacing: -0.5,
  },
  coverSubtitle1: {
    fontSize: 18,
    fontWeight: 700,
    color: C.ink,
    marginBottom: 16,
  },
  coverSubtitle2: {
    fontSize: 11,
    color: C.muted,
    marginBottom: 28,
    lineHeight: 1.5,
  },
  coverInfoTable: {
    border: `0.5pt solid ${C.divider}`,
    borderRadius: 4,
    marginBottom: 28,
  },
  coverInfoRow: {
    flexDirection: "row",
    borderBottom: `0.5pt solid ${C.divider}`,
  },
  coverInfoRowLast: { borderBottom: "none" },
  coverInfoLabel: {
    width: 100,
    backgroundColor: C.brand,
    color: "#FFFFFF",
    padding: 10,
    fontSize: 9,
    fontWeight: 700,
  },
  coverInfoValue: {
    flex: 1,
    padding: 10,
    fontSize: 10,
    color: C.ink,
  },
  coverConclusionCard: {
    backgroundColor: "#F0FDF4",
    borderLeft: `3pt solid ${C.success}`,
    borderRadius: 4,
    padding: 16,
  },
  coverConclusionLabel: {
    fontSize: 9,
    fontWeight: 700,
    color: C.success,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  coverConclusionMain: {
    fontSize: 15,
    fontWeight: 700,
    color: C.ink,
    marginBottom: 6,
  },
  coverConclusionMeta: {
    fontSize: 10,
    color: C.muted,
  },

  // TOC
  tocTitle: {
    fontSize: 26,
    fontWeight: 700,
    color: C.brand,
    marginBottom: 22,
    letterSpacing: -0.4,
  },
  tocRow: {
    flexDirection: "row",
    alignItems: "center",
    borderBottom: `0.5pt solid ${C.divider}`,
    paddingVertical: 12,
  },
  tocNum: { width: 36, fontSize: 12, fontWeight: 700, color: C.brand, textAlign: "center" },
  tocLabel: { flex: 1, fontSize: 11, color: C.ink, paddingHorizontal: 8 },
  tocPage: { width: 36, fontSize: 10, color: C.muted, textAlign: "right" },

  // Callouts
  calloutCard: {
    padding: 14,
    borderRadius: 4,
    marginBottom: 12,
  },
  calloutSuccessBg: {
    backgroundColor: "#F0FDF4",
    borderLeft: `3pt solid ${C.success}`,
  },
  calloutBrandBg: {
    backgroundColor: C.brandSoft,
    borderLeft: `3pt solid ${C.brand}`,
  },
  calloutWarnBg: {
    backgroundColor: "#FEF3C7",
    borderLeft: `3pt solid ${C.warn}`,
  },
  calloutRiskBg: {
    backgroundColor: "#FEE2E2",
    borderLeft: `3pt solid ${C.risk}`,
  },
  calloutCardBg: {
    backgroundColor: C.card,
    borderLeft: `3pt solid ${C.brand}`,
  },
  calloutTitle: {
    fontSize: 9,
    fontWeight: 700,
    color: C.brand,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  calloutTitleSuccess: { color: C.success },
  calloutTitleWarn: { color: C.warn },
  calloutTitleRisk: { color: C.risk },
  calloutBody: { fontSize: 10.5, color: C.body, lineHeight: 1.65 },

  // Tables
  table: {
    border: `0.5pt solid ${C.divider}`,
    borderRadius: 4,
    marginBottom: 12,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: C.brand,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  tableHeaderLight: {
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
  tableRowAccent: {
    backgroundColor: C.brandSoft,
  },
  tableRowLast: { borderBottom: "none" },
  th: { fontSize: 9, fontWeight: 700, color: "#FFFFFF", letterSpacing: 0.3 },
  thLight: { fontSize: 8, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: 0.4 },
  td: { fontSize: 9.5, color: C.ink, lineHeight: 1.5 },
  tdMuted: { fontSize: 9.5, color: C.muted, lineHeight: 1.5 },
  tdBold: { fontSize: 9.5, color: C.ink, fontWeight: 700 },

  // Exhibit caption
  exhibitCaption: {
    fontSize: 9,
    color: C.muted,
    marginBottom: 6,
  },
  exhibitNum: { fontWeight: 700, color: C.brand },

  // Bullet
  bulletRow: { marginBottom: 6, flexDirection: "row" },
  bulletDot: { fontSize: 10.5, color: C.brand, fontWeight: 700, marginRight: 6 },
  bulletText: { fontSize: 10, color: C.body, lineHeight: 1.65, flex: 1 },

  // Alignment pill
  alignPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    alignSelf: "flex-start",
  },
  alignPillText: { fontSize: 8, fontWeight: 700 },

  // Scoring bar
  scoreRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 8,
  },
  scoreLabel: { flex: 1.6, fontSize: 9.5, color: C.ink },
  scoreBarTrack: {
    flex: 2,
    height: 8,
    backgroundColor: C.divider,
    borderRadius: 3,
    overflow: "hidden",
  },
  scoreBarFill: { height: "100%", backgroundColor: C.brand, borderRadius: 3 },
  scorePercent: { width: 50, fontSize: 9.5, color: C.ink, fontWeight: 700, textAlign: "right" },
  scoreDots: { width: 80, fontSize: 12, color: C.brand, textAlign: "right", letterSpacing: 1 },

  // Phase
  phaseRow: {
    flexDirection: "row",
    marginBottom: 12,
  },
  phaseLeft: {
    width: 120,
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
  phaseDuration: { fontSize: 12, fontWeight: 700, color: "#FFFFFF" },
  phaseGoal: { fontSize: 10.5, fontWeight: 700, color: C.ink, marginBottom: 6 },
  phaseDeliverable: { fontSize: 9.5, color: C.body, lineHeight: 1.55, marginBottom: 3 },

  // Risk row
  riskRow: {
    padding: 10,
    marginBottom: 7,
    backgroundColor: C.card,
    borderRadius: 4,
    borderLeftWidth: 2,
    flexDirection: "row",
    gap: 12,
  },
  riskMain: { flex: 4 },
  riskStarsCol: { width: 48, alignItems: "center", justifyContent: "center" },
  riskStars: { fontSize: 11, color: C.risk, fontWeight: 700, letterSpacing: 1 },
  riskTitle: { fontSize: 10, fontWeight: 700, color: C.ink, marginBottom: 4 },
  riskMitigation: { fontSize: 9.5, color: C.body, lineHeight: 1.5 },

  // Grade table
  gradeRow: {
    flexDirection: "row",
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderBottom: `0.5pt solid ${C.divider}`,
  },
  gradeArea: { flex: 1.5, fontSize: 9.5, color: C.ink, fontWeight: 600 },
  gradeValue: { width: 90, fontSize: 11, fontWeight: 700, textAlign: "center" },
  gradeBasis: { flex: 2.5, fontSize: 9.5, color: C.body, lineHeight: 1.5 },

  // Citation row
  citeRow: {
    flexDirection: "row",
    marginBottom: 4,
    gap: 6,
  },
  citeNum: { fontSize: 9, fontWeight: 700, color: C.brand, width: 18 },
  citeText: { fontSize: 9, color: C.body, flex: 1, lineHeight: 1.45 },

  // KPI grid
  kpiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 14,
  },
  kpiCard: {
    width: "31%",
    backgroundColor: C.card,
    borderLeftWidth: 2,
    borderLeftColor: C.brand,
    borderRadius: 4,
    padding: 10,
  },
  kpiLabel: {
    fontSize: 7,
    fontWeight: 700,
    color: C.muted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 3,
  },
  kpiValue: { fontSize: 14, fontWeight: 700, color: C.ink },
  kpiSub: { fontSize: 8, color: C.faint, marginTop: 2 },
});

function MText({ children, style }: { children: string; style?: Style | Style[] }) {
  const runs = splitByFont(children ?? "");
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
    case "high": return { bg: C.highBg, ink: C.highInk };
    case "medium": return { bg: C.medBg, ink: C.medInk };
    case "low": return { bg: C.lowBg, ink: C.lowInk };
    case "concern": return { bg: C.concernBg, ink: C.concernInk };
  }
}

function alignmentLabel(level: "high" | "medium" | "low" | "concern", isKo: boolean): string {
  if (isKo) {
    return level === "high" ? "✓ 완전 정합"
      : level === "medium" ? "✓ 정합"
      : level === "low" ? "⚠ 부분 정합"
      : "⚠ 주의";
  }
  return level === "high" ? "✓ FULL ALIGN"
    : level === "medium" ? "✓ ALIGN"
    : level === "low" ? "⚠ PARTIAL"
    : "⚠ CONCERN";
}

function verdictPalette(kind: "support" | "neutral" | "caveat") {
  switch (kind) {
    case "support": return { bg: "#F0FDF4", border: C.success, ink: C.success, label: "✓" };
    case "caveat": return { bg: "#FEF3C7", border: C.warn, ink: C.warn, label: "⚠" };
    default: return { bg: C.card, border: C.muted, ink: C.muted, label: "○" };
  }
}

function reliabilityColor(r: "A" | "B+" | "B" | "C"): string {
  if (r === "A") return C.success;
  if (r === "B+" || r === "B") return C.brand;
  return C.warn;
}

function gradeColor(grade: string): string {
  if (grade.startsWith("A")) return C.success;
  if (grade.startsWith("B")) return C.brand;
  return C.warn;
}

function starsToText(n: 1 | 2 | 3): string {
  return "★".repeat(n);
}

function fitTitleSize(text: string): number {
  let weight = 0;
  for (const ch of text) {
    weight += /[가-힯぀-ヿ一-鿿]/.test(ch) ? 1.6 : 1;
  }
  if (weight <= 14) return 36;
  if (weight <= 20) return 30;
  if (weight <= 26) return 26;
  if (weight <= 34) return 22;
  return 18;
}

export async function buildValidationPdf(data: ValidationReportData): Promise<Buffer> {
  const { meta, simResult, executiveSummary, methodology, externalCrossCheck,
    alignmentMatrix, alignmentScoring, riskAssessment, phasedExecution,
    honestDisclosure, appendix, secondaryAnalysis } = data;
  const isKo = meta.locale === "ko";
  const generatedAt = new Date(meta.generatedAt);
  const generatedAtStr = generatedAt.toLocaleDateString(
    isKo ? "ko-KR" : "en-US",
    { year: "numeric", month: "long", day: "numeric" },
  );
  const winnerLabel = getCountryLabel(simResult.winner, isKo ? "ko" : "en");

  // Top-2 tie detection — when the orchestrator flagged
  // displayMode="top2", every primary-only section needs a tie banner
  // so the reader sees that the validation also covers a parallel
  // secondary candidate (interleaved in dedicated pages right after
  // their primary counterparts).
  const topTwo = simResult.displayMode === "top2" && simResult.secondary
    ? {
        primaryCode: simResult.winner,
        primaryLabel: winnerLabel,
        secondaryCode: simResult.secondary.country,
        secondaryLabel: getCountryLabel(simResult.secondary.country, isKo ? "ko" : "en"),
      }
    : null;

  const t = isKo
    ? {
        coverHeaderTitle: "MARKET TWIN",
        coverHeaderSub: `Market Validation Report · ${meta.brand ?? meta.productName} · ${generatedAt.toLocaleDateString("ko-KR", { year: "numeric", month: "short" })}`,
        coverBrand: "AI-POWERED MARKET VALIDATION",
        coverEyebrow: "MARKET VALIDATION REPORT",
        coverSubtitleRec: `${winnerLabel} 진출 1순위 추천`,
        coverSubtitleAnalysis: `${meta.productName} 글로벌 진출 시장 분석`,
        infoProduct: "제품명",
        infoBrand: "브랜드",
        infoPrice: "가격",
        infoCategory: "카테고리",
        infoDate: "분석 일자",
        conclusionLabel: "결론",
        consensusWord: "합의",
        alignWord: "외부 데이터",
        alignSuffix: "정합",
        tocTitle: "CONTENTS",
        pageHeader: "Market Validation Report",
        sec1Eyebrow: "01",
        sec1Title: "Executive Brief",
        sec1Sub: "30초 요약 · 핵심 결론 · 시장 모멘텀",
        thirtySecLabel: "30초 요약",
        coreFiguresTitle: "핵심 수치",
        momentumTitle: "시장 모멘텀 지표",
        sec2Eyebrow: "02",
        sec2Title: "Validation Methodology",
        sec2Sub: "본 리포트는 AI 시뮬레이션 결과와 외부 시장 데이터를 결합한 multi-source 검증이다.",
        infraTitle: "분석 인프라",
        crossSourceTitle: "Cross-check 데이터 Source",
        sec3Eyebrow: "03",
        sec3Title: "Simulation Results",
        sec3Sub: "Multi-LLM ensemble 시뮬레이션 결과",
        winnerLabel: "최종 추천국 (Winner)",
        voteDistTitle: "후보국 표 분포 (per-sim best country votes)",
        scoreRankTitle: "FinalScore 평균 순위",
        keyFindingLabel: "핵심 발견",
        simExecLabel: "Simulation Executive Summary",
        sec4Eyebrow: "04",
        sec4Title: "External Data Cross-check",
        sec4Sub: "4개 독립 외부 source로 시뮬 결과를 검증한다. 모든 source가 동일 방향이면 high-confidence.",
        sourcePrefix: "Source",
        verdictWord: "Verdict",
        citationLabel: "근거 자료",
        sec5Eyebrow: "05",
        sec5Title: "Integrated Analysis",
        sec5Sub: "합리성 평가 매트릭스 · Alignment 점수",
        matrixTitle: "시뮬 vs 외부 데이터 정합성 비교",
        scoringTitle: "5개 차원 정합도 (가중 평균)",
        weightedAvg: "가중 평균",
        netVerdict: "Net 합리성 등급",
        sec6Eyebrow: "06",
        sec6Title: "Risk Assessment",
        sec6Sub: "★ = severity 등급. 의사결정 시 mitigation과 함께 검토 필요.",
        sec7Eyebrow: "07",
        sec7Title: "Action Plan",
        sec7Sub: "3단계 권장 행동 계획",
        phase1Label: "PHASE 1",
        phase2Label: "PHASE 2",
        phase3Label: "PHASE 3",
        thStep: "Step",
        thGoal: "목표",
        thDeliverable: "산출물",
        thNote: "비고",
        sec8Eyebrow: "08",
        sec8Title: "Limitations & Honest Disclosure",
        sec8Sub: "의사결정 시 인지해야 할 한계와 영역별 신뢰도",
        limitsTitle: "본 검증의 한계",
        gradesTitle: "영역별 신뢰도 평가",
        thArea: "영역",
        thGrade: "등급",
        thBasis: "근거",
        overallLabel: "종합 권장 등급",
        sec9Eyebrow: "09",
        sec9Title: "Appendix",
        sec9Sub: "데이터 출처 · 외부 reference URL · 시뮬 재현 명세 · 발행 명세",
        appendixA: "A. 데이터 출처",
        appendixB: "B. 외부 Reference URL",
        appendixC: "C. 시뮬 입력 재현 명세",
        appendixD: "D. 발행 명세",
        thCategory: "분야",
        thSource: "출처",
        thReliability: "신뢰도",
        thKey: "Key",
        thValue: "Value",
        disclaimerLabel: "Disclaimer",
        contactLabel: "문의",
      }
    : {
        coverHeaderTitle: "MARKET TWIN",
        coverHeaderSub: `Market Validation Report · ${meta.brand ?? meta.productName} · ${generatedAt.toLocaleDateString("en-US", { year: "numeric", month: "short" })}`,
        coverBrand: "AI-POWERED MARKET VALIDATION",
        coverEyebrow: "MARKET VALIDATION REPORT",
        coverSubtitleRec: `Top pick: ${winnerLabel}`,
        coverSubtitleAnalysis: `Global market analysis for ${meta.productName}`,
        infoProduct: "Product",
        infoBrand: "Brand",
        infoPrice: "Price",
        infoCategory: "Category",
        infoDate: "Analysis date",
        conclusionLabel: "Verdict",
        consensusWord: "consensus",
        alignWord: "External data",
        alignSuffix: "aligned",
        tocTitle: "CONTENTS",
        pageHeader: "Market Validation Report",
        sec1Eyebrow: "01",
        sec1Title: "Executive Brief",
        sec1Sub: "30-second summary · key verdict · market momentum",
        thirtySecLabel: "30-second summary",
        coreFiguresTitle: "Core figures",
        momentumTitle: "Market momentum indicators",
        sec2Eyebrow: "02",
        sec2Title: "Validation Methodology",
        sec2Sub: "Multi-source validation combining AI simulation with objective external data.",
        infraTitle: "Analysis infrastructure",
        crossSourceTitle: "Cross-check data sources",
        sec3Eyebrow: "03",
        sec3Title: "Simulation Results",
        sec3Sub: "Multi-LLM ensemble simulation outputs",
        winnerLabel: "Winner (top pick)",
        voteDistTitle: "Top-pick distribution (per-sim votes)",
        scoreRankTitle: "Mean final-score ranking",
        keyFindingLabel: "Key finding",
        simExecLabel: "Simulation executive summary",
        sec4Eyebrow: "04",
        sec4Title: "External Data Cross-check",
        sec4Sub: "Validated against 4 independent external sources. High-confidence when all 4 align.",
        sourcePrefix: "Source",
        verdictWord: "Verdict",
        citationLabel: "Citations",
        sec5Eyebrow: "05",
        sec5Title: "Integrated Analysis",
        sec5Sub: "Alignment matrix · weighted scoring",
        matrixTitle: "Simulation vs external data alignment",
        scoringTitle: "5-dimension alignment scoring (weighted average)",
        weightedAvg: "Weighted average",
        netVerdict: "Net reasonableness verdict",
        sec6Eyebrow: "06",
        sec6Title: "Risk Assessment",
        sec6Sub: "★ = severity. Review with mitigation before any decision.",
        sec7Eyebrow: "07",
        sec7Title: "Action Plan",
        sec7Sub: "3-phase execution roadmap",
        phase1Label: "PHASE 1",
        phase2Label: "PHASE 2",
        phase3Label: "PHASE 3",
        thStep: "Step",
        thGoal: "Goal",
        thDeliverable: "Deliverable",
        thNote: "Note",
        sec8Eyebrow: "08",
        sec8Title: "Limitations & Honest Disclosure",
        sec8Sub: "Limitations to acknowledge + per-area confidence grades",
        limitsTitle: "Limitations of this validation",
        gradesTitle: "Per-area confidence grades",
        thArea: "Area",
        thGrade: "Grade",
        thBasis: "Basis",
        overallLabel: "Overall recommendation grade",
        sec9Eyebrow: "09",
        sec9Title: "Appendix",
        sec9Sub: "Data sources · reference URLs · reproduction spec · publication spec",
        appendixA: "A. Data sources",
        appendixB: "B. External reference URLs",
        appendixC: "C. Simulation input reproduction spec",
        appendixD: "D. Publication spec",
        thCategory: "Category",
        thSource: "Source",
        thReliability: "Reliability",
        thKey: "Key",
        thValue: "Value",
        disclaimerLabel: "Disclaimer",
        contactLabel: "Contact",
      };

  // Reusable header / footer
  const pageHeader = (
    <View style={styles.pageHeader} fixed>
      <MText>{`${t.pageHeader} · ${stripUnsupportedGlyphs(meta.productName)} · ${generatedAt.toLocaleDateString(isKo ? "ko-KR" : "en-US", { year: "numeric", month: "short" })}`}</MText>
      <Text render={({ pageNumber, totalPages }) => `AI Market Twin · markettwin.ai · Page ${pageNumber} / ${totalPages}`} />
    </View>
  );
  const pageFooter = (
    <View style={styles.pageFooter} fixed>
      <MText>{`MARKET TWIN · ${meta.ensembleId.slice(0, 8)}`}</MText>
      <Text render={({ pageNumber }) => `Page ${pageNumber}`} />
    </View>
  );

  // Reusable Top-2 tie disclaimer banner — placed at the top of every
  // primary-only validation section (simResults / integrated / risk /
  // action) when the ensemble was flagged as a Top-2 tie. Tells the
  // reader the section focuses on the primary candidate and that the
  // dedicated secondary pages follow it inline.
  const tieBanner = topTwo ? (
    <View
      style={{
        backgroundColor: "#FFFBEB",
        borderLeftWidth: 3,
        borderLeftColor: C.warn,
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 3,
        marginTop: 4,
        marginBottom: 8,
      }}
      wrap={false}
    >
      <MText style={{ fontSize: 8, color: C.warn, fontWeight: 700, letterSpacing: 0.5 }}>
        {isKo ? "TOP-2 동등 후보 — 본 섹션은 1순위 기준" : "TOP-2 TIE — primary candidate covered in this section"}
      </MText>
      <MText style={{ fontSize: 9, color: C.body, marginTop: 2, lineHeight: 1.5 }}>
        {isKo
          ? `점수 격차가 작아 ${topTwo.primaryLabel}(${topTwo.primaryCode})와 ${topTwo.secondaryLabel}(${topTwo.secondaryCode})가 사실상 동등합니다. 2순위 ${topTwo.secondaryLabel} 검증은 다음 secondary 페이지에 동일 깊이로 별도 수록.`
          : `Score gap is narrow — ${topTwo.primaryLabel} (${topTwo.primaryCode}) and ${topTwo.secondaryLabel} (${topTwo.secondaryCode}) are effectively tied. ${topTwo.secondaryLabel} validation follows in the secondary page below at equal depth.`}
      </MText>
    </View>
  ) : null;

  // ── 1. COVER ─────────────────────────────────────────────────────
  const coverPage = (
    <Page size="A4" style={styles.coverPageWhite}>
      <View style={styles.pageAccent} />
      <View style={styles.coverHeader}>
        <MText style={styles.coverHeaderTitle}>{t.coverHeaderTitle}</MText>
        <MText style={styles.coverHeaderSub}>{t.coverHeaderSub}</MText>
      </View>
      <View style={styles.coverBrandBar}>
        <MText style={styles.coverBrandText}>{`MARKET TWIN · ${t.coverBrand}`}</MText>
      </View>
      <MText style={styles.coverEyebrow}>{t.coverEyebrow}</MText>
      <MText
        style={[
          styles.coverTitle,
          { fontSize: fitTitleSize(meta.brand ?? meta.productName) },
        ]}
      >
        {stripUnsupportedGlyphs(meta.brand ?? meta.productName)}
      </MText>
      <MText style={styles.coverSubtitle1}>{t.coverSubtitleRec}</MText>
      <MText style={styles.coverSubtitle2}>{t.coverSubtitleAnalysis}</MText>

      <View style={styles.coverInfoTable}>
        <View style={styles.coverInfoRow}>
          <MText style={styles.coverInfoLabel}>{t.infoProduct}</MText>
          <MText style={[styles.coverInfoValue, { fontWeight: 700 }]}>
            {stripUnsupportedGlyphs(meta.productName)}
          </MText>
        </View>
        {meta.brand && (
          <View style={styles.coverInfoRow}>
            <MText style={styles.coverInfoLabel}>{t.infoBrand}</MText>
            <MText style={styles.coverInfoValue}>
              {`${meta.brand}${meta.corporateName ? ` (${meta.corporateName})` : ""}`}
            </MText>
          </View>
        )}
        <View style={styles.coverInfoRow}>
          <MText style={styles.coverInfoLabel}>{t.infoPrice}</MText>
          <MText style={styles.coverInfoValue}>{meta.basePriceDisplay}</MText>
        </View>
        <View style={styles.coverInfoRow}>
          <MText style={styles.coverInfoLabel}>{t.infoCategory}</MText>
          <MText style={styles.coverInfoValue}>{meta.category ?? "—"}</MText>
        </View>
        <View style={[styles.coverInfoRow, styles.coverInfoRowLast]}>
          <MText style={styles.coverInfoLabel}>{t.infoDate}</MText>
          <MText style={styles.coverInfoValue}>{generatedAtStr}</MText>
        </View>
      </View>

      <View style={styles.coverConclusionCard}>
        <MText style={styles.coverConclusionLabel}>{t.conclusionLabel}</MText>
        {simResult.displayMode === "top2" && simResult.secondary ? (
          <MText style={styles.coverConclusionMain}>
            {/* Medal emojis (🥇🥈) were removed because Pretendard
                lacks emoji glyphs — PDF renderer fell back and
                miscalculated advance widths, causing the next Hangul
                syllable to overlap the emoji slot (자모 분리 현상). */}
            {isKo
              ? `Top 2 동등 후보  1위 ${winnerLabel} (${simResult.winner})  ·  2위 ${getCountryLabel(simResult.secondary.country, "ko")} (${simResult.secondary.country})`
              : `Top 2 candidates  #1 ${winnerLabel} (${simResult.winner})  ·  #2 ${getCountryLabel(simResult.secondary.country, "en")} (${simResult.secondary.country})`}
          </MText>
        ) : (
          <MText style={styles.coverConclusionMain}>
            {isKo
              ? `1순위 진출국  ${winnerLabel} (${simResult.winner})`
              : `Recommended market  ${winnerLabel} (${simResult.winner})`}
          </MText>
        )}
        <Text style={styles.coverConclusionMeta}>
          {(() => {
            // Top-2 tie: surface the actual 1st-place vote shares for
            // both candidates and frame the 96% as "top-3 hit rate" so
            // readers don't misread it as "96% picked winner".
            if (simResult.displayMode === "top2" && simResult.secondary) {
              const pv = simResult.voteDistribution.find((v) => v.country === simResult.winner)?.percent;
              const sv = simResult.voteDistribution.find((v) => v.country === simResult.secondary!.country)?.percent;
              return (
                <>
                  <Text style={{ fontWeight: 700 }}>
                    {isKo
                      ? `1순위 vote ${pv ?? "?"}% vs ${sv ?? "?"}%`
                      : `1st-place vote ${pv ?? "?"}% vs ${sv ?? "?"}%`}
                  </Text>
                  <Text>{` · ${isKo ? "Top-3 출현률" : "top-3 hit rate"} ${simResult.consensusPercent}% (${simResult.confidence})`}</Text>
                  <Text>{` · ${isKo ? "Top 2 격차" : "Top 2 gap"} ${simResult.secondary.gapToPrimary}pt`}</Text>
                </>
              );
            }
            return (
              <>
                <Text style={{ fontWeight: 700 }}>{`Multi-LLM ${simResult.consensusPercent}% ${t.consensusWord}`}</Text>
                <Text>{` · ${simResult.confidence} ${simResult.consensusType ?? ""}`}</Text>
              </>
            );
          })()}
          {alignmentScoring.weightedAverage > 0 && (
            <Text>{` · ${t.alignWord} ${alignmentScoring.weightedAverage}% ${t.alignSuffix}`}</Text>
          )}
        </Text>
      </View>
    </Page>
  );

  // ── 2. TABLE OF CONTENTS ─────────────────────────────────────────
  const tocRows = [
    { num: "1", label: t.sec1Title, page: 3 },
    { num: "2", label: t.sec2Title, page: 4 },
    { num: "3", label: t.sec3Title, page: 5 },
    { num: "4", label: `${t.sec4Title} (Source A·B·C·D)`, page: 6 },
    { num: "5", label: t.sec5Title, page: 10 },
    { num: "6", label: t.sec6Title, page: 11 },
    { num: "7", label: t.sec7Title, page: 12 },
    { num: "8", label: t.sec8Title, page: 13 },
    { num: "9", label: t.sec9Title, page: 14 },
  ];
  const tocPage = (
    <Page size="A4" style={styles.page}>
      <View style={styles.pageAccent} fixed />
      {pageHeader}
      <MText style={styles.tocTitle}>{t.tocTitle}</MText>
      {tocRows.map((r) => (
        <View key={r.num} style={styles.tocRow}>
          <MText style={styles.tocNum}>{r.num}</MText>
          <MText style={styles.tocLabel}>{stripUnsupportedGlyphs(r.label)}</MText>
          <MText style={styles.tocPage}>{String(r.page)}</MText>
        </View>
      ))}
      {pageFooter}
    </Page>
  );

  // ── 3. EXECUTIVE BRIEF ───────────────────────────────────────────
  const execBriefPage = (
    <Page size="A4" style={styles.page}>
      <View style={styles.pageAccent} fixed />
      {pageHeader}
      <View style={styles.pageTitleRow}>
        <MText style={styles.sectionNum}>1</MText>
        <MText style={styles.pageTitle}>{t.sec1Title}</MText>
      </View>
      <View style={styles.pageTitleRule} />
      <MText style={styles.pageSubtitle}>{t.sec1Sub}</MText>

      <View style={[styles.calloutCard, styles.calloutSuccessBg]}>
        <MText style={[styles.calloutTitle, styles.calloutTitleSuccess]}>{t.thirtySecLabel}</MText>
        <MText style={styles.calloutBody}>
          {stripUnsupportedGlyphs(executiveSummary.keyMessage)}
        </MText>
      </View>

      <MText style={styles.subSectionTitle}>{t.coreFiguresTitle}</MText>
      <View style={styles.kpiGrid}>
        <View style={styles.kpiCard}>
          <MText style={styles.kpiLabel}>{
            simResult.displayMode === "top2"
              ? (isKo ? "Top 2" : "Top 2")
              : (isKo ? "1순위" : "Winner")
          }</MText>
          <MText style={styles.kpiValue}>{
            simResult.displayMode === "top2" && simResult.secondary
              ? `${simResult.winner} · ${simResult.secondary.country}`
              : winnerLabel
          }</MText>
          <MText style={styles.kpiSub}>{
            simResult.displayMode === "top2" && simResult.secondary
              ? (isKo ? `격차 ${simResult.secondary.gapToPrimary}pt` : `gap ${simResult.secondary.gapToPrimary}pt`)
              : simResult.winner
          }</MText>
        </View>
        <View style={styles.kpiCard}>
          {/* Top-2 tie: relabel the KPI as "top-3 hit rate" and show
              both vote shares as the sub-line so readers don't read
              "96% consensus" as "96% picked winner" — those two are
              different metrics under Phase E aggregation. */}
          {simResult.displayMode === "top2" && simResult.secondary ? (
            (() => {
              const pv = simResult.voteDistribution.find((v) => v.country === simResult.winner)?.percent;
              const sv = simResult.voteDistribution.find((v) => v.country === simResult.secondary!.country)?.percent;
              return (
                <>
                  <MText style={styles.kpiLabel}>{isKo ? "Top-3 출현률" : "Top-3 hit rate"}</MText>
                  <MText style={styles.kpiValue}>{`${simResult.consensusPercent}%`}</MText>
                  <MText style={styles.kpiSub}>{
                    isKo
                      ? `1순위 vote ${pv ?? "?"}% vs ${sv ?? "?"}%`
                      : `1st-place ${pv ?? "?"}% vs ${sv ?? "?"}%`
                  }</MText>
                </>
              );
            })()
          ) : (
            <>
              <MText style={styles.kpiLabel}>{isKo ? "합의도" : "Consensus"}</MText>
              <MText style={styles.kpiValue}>{`${simResult.consensusPercent}%`}</MText>
              <MText style={styles.kpiSub}>{simResult.confidence}</MText>
            </>
          )}
        </View>
        <View style={styles.kpiCard}>
          <MText style={styles.kpiLabel}>{isKo ? "신뢰 등급" : "Confidence grade"}</MText>
          <MText style={[styles.kpiValue, { color: gradeColor(executiveSummary.confidenceGrade) }]}>
            {executiveSummary.confidenceGrade}
          </MText>
          <MText style={styles.kpiSub}>
            {stripUnsupportedGlyphs(executiveSummary.confidenceLabel)}
          </MText>
        </View>
      </View>

      <MText style={styles.subSectionTitle}>{t.momentumTitle}</MText>
      {(executiveSummary.momentumIndicators ?? []).map((m, i) => (
        <View key={i} style={styles.bulletRow}>
          <MText style={styles.bulletDot}>•</MText>
          <MText style={styles.bulletText}>{stripUnsupportedGlyphs(m)}</MText>
        </View>
      ))}

      <MText style={[styles.subSectionTitle, { marginTop: 14 }]}>
        {isKo ? "즉시 실행 3대 액션 (90일)" : "Top 3 actions — next 90 days"}
      </MText>
      {executiveSummary.threeActions.map((a, i) => (
        <View key={i} style={styles.bulletRow}>
          <MText style={[styles.bulletDot, { color: C.brand }]}>{`${i + 1}.`}</MText>
          <MText style={styles.bulletText}>{stripUnsupportedGlyphs(a)}</MText>
        </View>
      ))}
      {pageFooter}
    </Page>
  );

  // ── 4. METHODOLOGY ───────────────────────────────────────────────
  const methPage = (
    <Page size="A4" style={styles.page}>
      <View style={styles.pageAccent} fixed />
      {pageHeader}
      <View style={styles.pageTitleRow}>
        <MText style={styles.sectionNum}>2</MText>
        <MText style={styles.pageTitle}>{t.sec2Title}</MText>
      </View>
      <View style={styles.pageTitleRule} />
      <MText style={styles.pageSubtitle}>{t.sec2Sub}</MText>

      <MText style={styles.subSectionTitle}>{`2.1 ${t.infraTitle}`}</MText>
      <View style={styles.table}>
        {[
          { k: "Ensemble ID", v: meta.ensembleId },
          { k: isKo ? "시뮬 Tier" : "Tier", v: `${meta.tier} · ${meta.simCount} sims` },
          // personaCount is the TOTAL effective personas across all sims
          // (already includes simCount multiplier). Avoid double-multiplying.
          { k: isKo ? "페르소나 규모" : "Persona scale", v: `${(meta.personaCount / Math.max(1, meta.simCount)).toFixed(0)} × ${meta.simCount} = ${meta.personaCount.toLocaleString()} ${isKo ? "페르소나" : "personas"}` },
          { k: "Multi-LLM", v: meta.llmProviders.join(" · ") },
          ...(meta.durationMinutes ? [{ k: isKo ? "소요 시간" : "Duration", v: `${meta.durationMinutes} min` }] : []),
        ].map((row, i, arr) => (
          <View key={i} style={[styles.tableRow, i === arr.length - 1 ? styles.tableRowLast : {}]}>
            <MText style={[styles.thLight, { flex: 1.2, color: C.brand }]}>{row.k}</MText>
            <MText style={[styles.td, { flex: 2.5, fontWeight: 600 }]}>{stripUnsupportedGlyphs(row.v)}</MText>
          </View>
        ))}
      </View>

      <MText style={[styles.subSectionTitle, { marginTop: 14 }]}>{`2.2 ${t.crossSourceTitle}`}</MText>
      {methodology.sources.map((s) => (
        <View key={s.label} style={styles.bulletRow}>
          <MText style={[styles.bulletDot, { color: C.brand, fontWeight: 700 }]}>
            {`Source ${s.label}:`}
          </MText>
          <MText style={styles.bulletText}>
            {`${stripUnsupportedGlyphs(s.name)} — ${stripUnsupportedGlyphs(s.description)}`}
          </MText>
        </View>
      ))}

      <View style={[styles.calloutCard, styles.calloutCardBg, { marginTop: 14 }]}>
        <MText style={styles.calloutBody}>
          {stripUnsupportedGlyphs(methodology.biasNote)}
        </MText>
      </View>

      {pageFooter}
    </Page>
  );

  // ── 5. SIMULATION RESULTS ────────────────────────────────────────
  const simResultsPage = (
    <Page size="A4" style={styles.page}>
      <View style={styles.pageAccent} fixed />
      {pageHeader}
      <View style={styles.pageTitleRow}>
        <MText style={styles.sectionNum}>3</MText>
        <MText style={styles.pageTitle}>{t.sec3Title}</MText>
      </View>
      <View style={styles.pageTitleRule} />
      <MText style={styles.pageSubtitle}>{t.sec3Sub}</MText>

      {tieBanner}

      <View style={[styles.calloutCard, styles.calloutSuccessBg]}>
        <MText style={[styles.calloutTitle, styles.calloutTitleSuccess]}>{t.winnerLabel}</MText>
        <MText style={[styles.calloutBody, { fontWeight: 700, fontSize: 12 }]}>
          {(() => {
            if (topTwo) {
              const pv = simResult.voteDistribution.find((v) => v.country === simResult.winner)?.percent;
              const sv = simResult.voteDistribution.find((v) => v.country === topTwo.secondaryCode)?.percent;
              return isKo
                ? `Top 2 동등 후보: ${topTwo.primaryLabel} (${topTwo.primaryCode}) 1순위 vote ${pv ?? "?"}% · ${topTwo.secondaryLabel} (${topTwo.secondaryCode}) 1순위 vote ${sv ?? "?"}% — top-3 출현률 ${simResult.consensusPercent}% (${simResult.confidence})`
                : `Top 2 tied: ${topTwo.primaryLabel} (${topTwo.primaryCode}) 1st-place ${pv ?? "?"}% · ${topTwo.secondaryLabel} (${topTwo.secondaryCode}) 1st-place ${sv ?? "?"}% — top-3 hit rate ${simResult.consensusPercent}% (${simResult.confidence})`;
            }
            return `${winnerLabel} (${simResult.winner}) · Consensus: ${simResult.consensusPercent}% (${simResult.confidence})`;
          })()}
        </MText>
        <MText style={styles.calloutBody}>
          {`Sample: ${meta.personaCount.toLocaleString()} ${isKo ? "페르소나" : "personas"} · ${simResult.consensusType ?? ""}`}
        </MText>
      </View>

      <MText style={styles.subSectionTitle}>{`3.1 ${t.voteDistTitle}`}</MText>
      <View style={styles.table}>
        <View style={styles.tableHeader}>
          <MText style={[styles.th, { flex: 1.2 }]}>{isKo ? "국가" : "Country"}</MText>
          <MText style={[styles.th, { flex: 1, textAlign: "right" }]}>{isKo ? "표" : "Votes"}</MText>
          <MText style={[styles.th, { flex: 1, textAlign: "right" }]}>{isKo ? "비중" : "Share"}</MText>
        </View>
        {simResult.voteDistribution.slice(0, 7).map((row, idx, arr) => {
          const last = idx === arr.length - 1;
          const isWinner = idx === 0;
          return (
            <View key={row.country} style={[styles.tableRow, last ? styles.tableRowLast : {}, isWinner ? styles.tableRowAccent : {}]}>
              <MText style={[styles.td, { flex: 1.2, fontWeight: isWinner ? 700 : 400 }]}>
                {getCountryLabel(row.country, isKo ? "ko" : "en")}
              </MText>
              <MText style={[styles.td, { flex: 1, textAlign: "right", fontWeight: isWinner ? 700 : 400 }]}>
                {`${row.count} / ${meta.simCount}`}
              </MText>
              <MText style={[styles.td, { flex: 1, textAlign: "right", fontWeight: isWinner ? 700 : 400 }]}>
                {`${row.percent}%`}
              </MText>
            </View>
          );
        })}
      </View>

      <MText style={[styles.subSectionTitle, { marginTop: 10 }]}>{`3.2 ${t.scoreRankTitle}`}</MText>
      <View style={styles.table}>
        <View style={styles.tableHeader}>
          <MText style={[styles.th, { flex: 0.5 }]}>#</MText>
          <MText style={[styles.th, { flex: 1.2 }]}>{isKo ? "국가" : "Country"}</MText>
          <MText style={[styles.th, { flex: 1, textAlign: "right" }]}>Mean</MText>
          <MText style={[styles.th, { flex: 1, textAlign: "right" }]}>σ</MText>
        </View>
        {simResult.scoreRanking.slice(0, 7).map((row, idx, arr) => {
          const last = idx === arr.length - 1;
          const tiedLeader = idx === 0 && simResult.topCountriesTied;
          const isWinner = idx === 0;
          return (
            <View key={row.country} style={[styles.tableRow, last ? styles.tableRowLast : {}, isWinner ? styles.tableRowAccent : {}]}>
              <MText style={[styles.td, { flex: 0.5, fontWeight: 700, color: C.brand }]}>
                {tiedLeader ? "#1=" : `#${idx + 1}`}
              </MText>
              <MText style={[styles.td, { flex: 1.2, fontWeight: isWinner ? 700 : 400 }]}>
                {getCountryLabel(row.country, isKo ? "ko" : "en")}
              </MText>
              <MText style={[styles.td, { flex: 1, textAlign: "right", fontWeight: isWinner ? 700 : 400 }]}>
                {row.mean.toFixed(1)}
              </MText>
              <MText style={[styles.tdMuted, { flex: 1, textAlign: "right" }]}>
                {row.std.toFixed(1)}
              </MText>
            </View>
          );
        })}
      </View>

      {simResult.simExecutiveSummary && (
        <View style={[styles.calloutCard, styles.calloutBrandBg, { marginTop: 10 }]}>
          <MText style={styles.calloutTitle}>{t.simExecLabel}</MText>
          <MText style={styles.calloutBody}>
            {`"${stripUnsupportedGlyphs(simResult.simExecutiveSummary).slice(0, 400)}"`}
          </MText>
        </View>
      )}
      {pageFooter}
    </Page>
  );

  // ── External Cross-check Source pages (4) ────────────────────────
  function renderSourcePage(
    sourceCode: "A" | "B" | "C" | "D",
    sectionTitle: string,
    body: React.ReactNode,
  ) {
    return (
      <Page key={`src-${sourceCode}`} size="A4" style={styles.page}>
        <View style={styles.pageAccent} fixed />
        {pageHeader}
        <View style={styles.pageTitleRow}>
          <MText style={styles.sectionNum}>4</MText>
          <MText style={styles.pageTitle}>
            {`${t.sec4Title} — ${t.sourcePrefix} ${sourceCode}`}
          </MText>
        </View>
        <View style={styles.pageTitleRule} />
        <MText style={[styles.subSectionTitle, { marginTop: 0 }]}>
          {stripUnsupportedGlyphs(sectionTitle)}
        </MText>
        {body}
        {pageFooter}
      </Page>
    );
  }

  // Source A — Market Growth
  const srcA = externalCrossCheck.sourceA;
  const verdictAColor = verdictPalette(srcA.verdictKind);
  const sourceAPage = renderSourcePage(
    "A",
    srcA.title,
    <>
      <Text style={styles.exhibitCaption}>
        <Text style={styles.exhibitNum}>Citation: </Text>
        <Text>{srcA.citationLabel}</Text>
      </Text>
      {srcA.rows.length > 0 && (
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <MText style={[styles.th, { flex: 1.2 }]}>{isKo ? "항목" : "Metric"}</MText>
            <MText style={[styles.th, { flex: 1.4 }]}>{isKo ? "수치" : "Value"}</MText>
            <MText style={[styles.th, { flex: 2 }]}>{isKo ? "해석" : "Interpretation"}</MText>
          </View>
          {srcA.rows.map((r, i, arr) => (
            <View key={i} style={[styles.tableRow, i === arr.length - 1 ? styles.tableRowLast : {}]}>
              <MText style={[styles.tdBold, { flex: 1.2 }]}>{stripUnsupportedGlyphs(r.label)}</MText>
              <MText style={[styles.td, { flex: 1.4, color: C.brand, fontWeight: 700 }]}>
                {stripUnsupportedGlyphs(r.value)}
              </MText>
              <MText style={[styles.tdMuted, { flex: 2 }]}>
                {stripUnsupportedGlyphs(r.interpretation)}
              </MText>
            </View>
          ))}
        </View>
      )}
      <View
        style={[
          styles.calloutCard,
          { backgroundColor: verdictAColor.bg, borderLeft: `3pt solid ${verdictAColor.border}` },
        ]}
      >
        <MText style={[styles.calloutTitle, { color: verdictAColor.ink }]}>
          {`${verdictAColor.label} ${t.verdictWord}`}
        </MText>
        <MText style={styles.calloutBody}>{stripUnsupportedGlyphs(srcA.verdict)}</MText>
      </View>
      {srcA.citations.length > 0 && (
        <>
          <MText style={[styles.subSubTitle, { marginTop: 12 }]}>{t.citationLabel}</MText>
          {srcA.citations.map((c, i) => (
            <View key={i} style={styles.citeRow}>
              <MText style={styles.citeNum}>{`[${i + 1}]`}</MText>
              <MText style={styles.citeText}>
                {stripUnsupportedGlyphs(`${c.label}${c.url ? ` — ${c.url}` : ""}`)}
              </MText>
            </View>
          ))}
        </>
      )}
    </>,
  );

  // Source B — Peer Brand Patterns
  const srcB = externalCrossCheck.sourceB;
  const verdictBColor = verdictPalette(srcB.verdictKind);
  const sourceBPage = renderSourcePage(
    "B",
    srcB.title,
    <>
      <Text style={styles.exhibitCaption}>
        <Text style={styles.exhibitNum}>Citation: </Text>
        <Text>{srcB.citationLabel}</Text>
      </Text>
      {srcB.heroCase && (
        <>
          <MText style={styles.subSubTitle}>
            {`${srcB.heroCase.brand}  ★★★`}
          </MText>
          {srcB.heroCase.signals.map((s, i) => (
            <View key={i} style={styles.bulletRow}>
              <MText style={styles.bulletDot}>•</MText>
              <MText style={styles.bulletText}>{stripUnsupportedGlyphs(s)}</MText>
            </View>
          ))}
        </>
      )}
      {srcB.otherCases.length > 0 && (
        <>
          <MText style={[styles.subSubTitle, { marginTop: 10 }]}>
            {isKo ? "기타 brand 진출 동향" : "Other brand cases"}
          </MText>
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <MText style={[styles.th, { flex: 1.2 }]}>{isKo ? "Brand" : "Brand"}</MText>
              <MText style={[styles.th, { flex: 3 }]}>{isKo ? "진출 신호" : "Signal"}</MText>
            </View>
            {srcB.otherCases.map((c, i, arr) => (
              <View key={i} style={[styles.tableRow, i === arr.length - 1 ? styles.tableRowLast : {}]}>
                <MText style={[styles.tdBold, { flex: 1.2 }]}>{stripUnsupportedGlyphs(c.brand)}</MText>
                <MText style={[styles.td, { flex: 3 }]}>{stripUnsupportedGlyphs(c.signal)}</MText>
              </View>
            ))}
          </View>
        </>
      )}
      <View
        style={[
          styles.calloutCard,
          { backgroundColor: verdictBColor.bg, borderLeft: `3pt solid ${verdictBColor.border}` },
        ]}
      >
        <MText style={[styles.calloutTitle, { color: verdictBColor.ink }]}>
          {`${verdictBColor.label} ${t.verdictWord}`}
        </MText>
        <MText style={styles.calloutBody}>{stripUnsupportedGlyphs(srcB.verdict)}</MText>
      </View>
      {srcB.citations.length > 0 && (
        <>
          <MText style={[styles.subSubTitle, { marginTop: 12 }]}>{t.citationLabel}</MText>
          {srcB.citations.map((c, i) => (
            <View key={i} style={styles.citeRow}>
              <MText style={styles.citeNum}>{`[${i + 1}]`}</MText>
              <MText style={styles.citeText}>
                {stripUnsupportedGlyphs(`${c.label}${c.url ? ` — ${c.url}` : ""}`)}
              </MText>
            </View>
          ))}
        </>
      )}
    </>,
  );

  // Source C — Korean government data composite (4 sub-sources)
  // Each sub-source has its own dataAvailable flag and gets a separate
  // block. Missing data sections show a muted caveat instead of an empty
  // table, so the reader can tell "data infrastructure absent" apart from
  // "real zero on the dimension".
  const srcC = externalCrossCheck.sourceC;
  const sourceCPage = renderSourcePage(
    "C",
    srcC.title,
    <>
      <Text style={styles.exhibitCaption}>
        <Text style={styles.exhibitNum}>Citation: </Text>
        <Text>{srcC.citationLabel}</Text>
      </Text>

      {/* C1 — KOTRA korCompList (primary) */}
      <View wrap={false}>
      <MText style={[styles.subSubTitle, { marginTop: 12 }]}>
        {isKo ? "C1. 진출 한국법인 (KOTRA korCompList)" : "C1. Korean entities in market (KOTRA korCompList)"}
      </MText>
      {srcC.korCompanies.dataAvailable ? (
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <MText style={[styles.th, { flex: 1.4 }]}>{isKo ? "모기업" : "Parent"}</MText>
            <MText style={[styles.th, { flex: 1.6 }]}>{isKo ? "산업·취급분야" : "Industry/Category"}</MText>
            <MText style={[styles.th, { flex: 0.6 }]}>{isKo ? "진출연도" : "Year"}</MText>
            <MText style={[styles.th, { flex: 0.8 }]}>{isKo ? "진출형태" : "Form"}</MText>
          </View>
          {srcC.korCompanies.rows.map((r, i, arr) => (
            <View key={i} style={[styles.tableRow, i === arr.length - 1 ? styles.tableRowLast : {}]}>
              <MText style={[styles.tdBold, { flex: 1.4 }]}>
                {stripUnsupportedGlyphs(r.parentKo + (r.localKo ? ` (현지: ${r.localKo})` : ""))}
              </MText>
              <MText style={[styles.td, { flex: 1.6 }]}>{stripUnsupportedGlyphs(r.category || r.industry)}</MText>
              <MText style={[styles.td, { flex: 0.6 }]}>{r.year}</MText>
              <MText style={[styles.td, { flex: 0.8 }]}>{r.form}</MText>
            </View>
          ))}
        </View>
      ) : null}
      <View style={[styles.calloutCard, srcC.korCompanies.dataAvailable ? styles.calloutWarnBg : styles.calloutWarnBg]}>
        <MText style={[styles.calloutTitle, styles.calloutTitleWarn]}>
          {isKo ? "주의 사항" : "Caveat"}
        </MText>
        <MText style={styles.calloutBody}>{stripUnsupportedGlyphs(srcC.korCompanies.caveat)}</MText>
      </View>
      </View>{/* end C1 wrap */}

      {/* C2 — Comtrade (quantitative) */}
      <View wrap={false}>
      <MText style={[styles.subSubTitle, { marginTop: 16 }]}>
        {isKo ? "C2. 카테고리 수출액 추이 (UN Comtrade)" : "C2. Category export-value flow (UN Comtrade)"}
      </MText>
      {srcC.comtrade.dataAvailable ? (
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <MText style={[styles.th, { flex: 1 }]}>{isKo ? "연도" : "Year"}</MText>
            <MText style={[styles.th, { flex: 1.5 }]}>{isKo ? "HSCode" : "HS Codes"}</MText>
            <MText style={[styles.th, { flex: 2 }]}>{isKo ? `한국→${srcC.comtrade.countryKo} 수출액` : `KR→target export value`}</MText>
          </View>
          <View style={[styles.tableRow, styles.tableRowLast]}>
            <MText style={[styles.tdBold, { flex: 1 }]}>{String(srcC.comtrade.year)}</MText>
            <MText style={[styles.td, { flex: 1.5 }]}>{srcC.comtrade.hsCodes.slice(0, 4).join(", ")}</MText>
            <MText style={[styles.td, { flex: 2, color: C.brand, fontWeight: 700 }]}>
              {`$${((srcC.comtrade.exportValueUsd ?? 0) / 1e6).toFixed(2)}M`}
            </MText>
          </View>
        </View>
      ) : null}
      <View style={[styles.calloutCard, styles.calloutWarnBg]}>
        <MText style={[styles.calloutTitle, styles.calloutTitleWarn]}>
          {isKo ? "주의 사항" : "Caveat"}
        </MText>
        <MText style={styles.calloutBody}>{stripUnsupportedGlyphs(srcC.comtrade.caveat)}</MText>
      </View>
      </View>{/* end C2 wrap */}

      {/* C3 — DART (corporate filing) */}
      <View wrap={false}>
      <MText style={[styles.subSubTitle, { marginTop: 16 }]}>
        {isKo ? "C3. 기업 재무 신호 (DART 공시)" : "C3. Corporate filing signal (DART)"}
      </MText>
      {srcC.dart.dataAvailable && srcC.dart.revenueKrw != null ? (
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <MText style={[styles.th, { flex: 1.5 }]}>{isKo ? "기업명" : "Company"}</MText>
            <MText style={[styles.th, { flex: 0.7 }]}>{isKo ? "회계연도" : "FY"}</MText>
            <MText style={[styles.th, { flex: 1.4 }]}>{isKo ? "연결매출" : "Revenue"}</MText>
            <MText style={[styles.th, { flex: 1.4 }]}>{isKo ? "영업이익" : "Op Income"}</MText>
          </View>
          <View style={[styles.tableRow, styles.tableRowLast]}>
            <MText style={[styles.tdBold, { flex: 1.5 }]}>{stripUnsupportedGlyphs(srcC.dart.corpNameKo ?? "—")}</MText>
            <MText style={[styles.td, { flex: 0.7 }]}>{srcC.dart.bsnsYear != null ? String(srcC.dart.bsnsYear) : "—"}</MText>
            <MText style={[styles.td, { flex: 1.4, color: C.brand, fontWeight: 700 }]}>
              {`${(srcC.dart.revenueKrw / 1e12).toFixed(2)}T KRW`}
            </MText>
            <MText style={[styles.td, { flex: 1.4 }]}>
              {srcC.dart.opIncomeKrw != null ? `${(srcC.dart.opIncomeKrw / 1e12).toFixed(2)}T KRW` : "—"}
            </MText>
          </View>
        </View>
      ) : null}
      <View style={[styles.calloutCard, styles.calloutWarnBg]}>
        <MText style={[styles.calloutTitle, styles.calloutTitleWarn]}>
          {isKo ? "주의 사항" : "Caveat"}
        </MText>
        <MText style={styles.calloutBody}>{stripUnsupportedGlyphs(srcC.dart.caveat)}</MText>
      </View>
      </View>{/* end C3 wrap */}

      {/* C4 — compSucsCase totalCnt (supplementary, single-line note) */}
      <View wrap={false}>
      <MText style={[styles.subSubTitle, { marginTop: 16 }]}>
        {isKo ? "C4. KOTRA K-수출 성공사례 DB (보조 지표)" : "C4. KOTRA compSucsCase DB (supplementary)"}
      </MText>
      <View style={[styles.calloutCard, styles.calloutWarnBg]}>
        <MText style={styles.calloutBody}>{stripUnsupportedGlyphs(srcC.compSucsCase.caveat)}</MText>
      </View>
      </View>{/* end C4 wrap */}
    </>,
  );

  // Source D — Internal Growth
  const srcD = externalCrossCheck.sourceD;
  const verdictDColor = verdictPalette(srcD.verdictKind);
  const sourceDPage = renderSourcePage(
    "D",
    srcD.title,
    <>
      <Text style={styles.exhibitCaption}>
        <Text style={styles.exhibitNum}>Citation: </Text>
        <Text>{srcD.citationLabel}</Text>
      </Text>
      {srcD.rows.length > 0 && (
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <MText style={[styles.th, { flex: 1.2 }]}>{isKo ? "지표" : "Metric"}</MText>
            <MText style={[styles.th, { flex: 1.4 }]}>{isKo ? "값" : "Value"}</MText>
            <MText style={[styles.th, { flex: 2 }]}>{isKo ? "해석" : "Interpretation"}</MText>
          </View>
          {srcD.rows.map((r, i, arr) => (
            <View key={i} style={[styles.tableRow, i === arr.length - 1 ? styles.tableRowLast : {}]}>
              <MText style={[styles.tdBold, { flex: 1.2 }]}>{stripUnsupportedGlyphs(r.label)}</MText>
              <MText style={[styles.td, { flex: 1.4, color: C.brand, fontWeight: 700 }]}>
                {stripUnsupportedGlyphs(r.value)}
              </MText>
              <MText style={[styles.tdMuted, { flex: 2 }]}>
                {stripUnsupportedGlyphs(r.interpretation)}
              </MText>
            </View>
          ))}
        </View>
      )}
      <View
        style={[
          styles.calloutCard,
          { backgroundColor: verdictDColor.bg, borderLeft: `3pt solid ${verdictDColor.border}` },
        ]}
      >
        <MText style={[styles.calloutTitle, { color: verdictDColor.ink }]}>
          {`${verdictDColor.label} ${t.verdictWord}`}
        </MText>
        <MText style={styles.calloutBody}>{stripUnsupportedGlyphs(srcD.verdict)}</MText>
      </View>
      {srcD.citations.length > 0 && (
        <>
          <MText style={[styles.subSubTitle, { marginTop: 12 }]}>{t.citationLabel}</MText>
          {srcD.citations.map((c, i) => (
            <View key={i} style={styles.citeRow}>
              <MText style={styles.citeNum}>{`[${i + 1}]`}</MText>
              <MText style={styles.citeText}>
                {stripUnsupportedGlyphs(`${c.label}${c.url ? ` — ${c.url}` : ""}`)}
              </MText>
            </View>
          ))}
        </>
      )}
    </>,
  );

  // ── 10. INTEGRATED ANALYSIS ──────────────────────────────────────
  const integratedPage = (
    <Page size="A4" style={styles.page}>
      <View style={styles.pageAccent} fixed />
      {pageHeader}
      <View style={styles.pageTitleRow}>
        <MText style={styles.sectionNum}>5</MText>
        <MText style={styles.pageTitle}>{t.sec5Title}</MText>
      </View>
      <View style={styles.pageTitleRule} />
      <MText style={styles.pageSubtitle}>{t.sec5Sub}</MText>

      {tieBanner}

      <MText style={styles.subSectionTitle}>{`5.1 ${t.matrixTitle}`}</MText>
      <View style={styles.table}>
        <View style={styles.tableHeader}>
          <MText style={[styles.th, { flex: 1.1 }]}>{isKo ? "평가 차원" : "Dimension"}</MText>
          <MText style={[styles.th, { flex: 1.4 }]}>{isKo ? "시뮬" : "Sim"}</MText>
          <MText style={[styles.th, { flex: 1.4 }]}>{isKo ? "외부 데이터" : "External"}</MText>
          <MText style={[styles.th, { flex: 0.9, textAlign: "center" }]}>{isKo ? "정합성" : "Alignment"}</MText>
        </View>
        {alignmentMatrix.map((row, idx, arr) => {
          const last = idx === arr.length - 1;
          const palette = alignmentPalette(row.alignment);
          return (
            <View key={idx} style={[styles.tableRow, last ? styles.tableRowLast : {}]}>
              <View style={{ flex: 1.1 }}>
                <MText style={styles.tdBold}>{stripUnsupportedGlyphs(row.dimension)}</MText>
              </View>
              <MText style={[styles.td, { flex: 1.4 }]}>{stripUnsupportedGlyphs(row.simSignal)}</MText>
              <MText style={[styles.td, { flex: 1.4 }]}>{stripUnsupportedGlyphs(row.externalData)}</MText>
              <View style={{ flex: 0.9, alignItems: "center", justifyContent: "center" }}>
                <View style={[styles.alignPill, { backgroundColor: palette.bg }]}>
                  <MText style={[styles.alignPillText, { color: palette.ink }]}>
                    {alignmentLabel(row.alignment, isKo)}
                  </MText>
                </View>
              </View>
            </View>
          );
        })}
      </View>

      <MText style={[styles.subSectionTitle, { marginTop: 10 }]}>{`5.2 ${t.scoringTitle}`}</MText>
      {(alignmentScoring.rows ?? []).map((r, i) => {
        const dots = Math.round(r.percent / 20); // 0-5
        return (
          <View key={i} style={styles.scoreRow}>
            <MText style={styles.scoreLabel}>{stripUnsupportedGlyphs(r.dimension)}</MText>
            <View style={styles.scoreBarTrack}>
              <View style={[styles.scoreBarFill, { width: `${r.percent}%` }]} />
            </View>
            <MText style={styles.scorePercent}>{`${r.percent}%`}</MText>
            <MText style={styles.scoreDots}>
              {"●".repeat(dots) + "○".repeat(Math.max(0, 5 - dots))}
            </MText>
          </View>
        );
      })}
      <View style={[styles.scoreRow, { marginTop: 6, paddingTop: 8, borderTop: `0.5pt solid ${C.divider}` }]}>
        <MText style={[styles.scoreLabel, { fontWeight: 700, color: C.brand }]}>{t.weightedAvg}</MText>
        <View style={styles.scoreBarTrack}>
          <View
            style={[
              styles.scoreBarFill,
              { width: `${alignmentScoring.weightedAverage}%`, backgroundColor: C.success },
            ]}
          />
        </View>
        <MText style={[styles.scorePercent, { color: C.success, fontSize: 11 }]}>
          {`${alignmentScoring.weightedAverage}%`}
        </MText>
        <MText style={[styles.scoreDots, { color: C.success }]}>
          {stripUnsupportedGlyphs(alignmentScoring.label)}
        </MText>
      </View>

      <View style={[styles.calloutCard, styles.calloutSuccessBg, { marginTop: 12 }]}>
        <MText style={[styles.calloutTitle, styles.calloutTitleSuccess]}>{t.netVerdict}</MText>
        <MText style={styles.calloutBody}>{stripUnsupportedGlyphs(alignmentScoring.netVerdict)}</MText>
      </View>
      {pageFooter}
    </Page>
  );

  // ── 11. RISK ASSESSMENT ──────────────────────────────────────────
  const riskPage = (
    <Page size="A4" style={styles.page}>
      <View style={styles.pageAccent} fixed />
      {pageHeader}
      <View style={styles.pageTitleRow}>
        <MText style={styles.sectionNum}>6</MText>
        <MText style={styles.pageTitle}>{t.sec6Title}</MText>
      </View>
      <View style={styles.pageTitleRule} />
      <MText style={styles.pageSubtitle}>{t.sec6Sub}</MText>

      {tieBanner}

      {riskAssessment.map((r, i) => {
        const stars = r.severityStars;
        const borderColor = stars === 3 ? C.risk : stars === 2 ? C.warn : C.muted;
        const starColor = stars === 3 ? C.risk : stars === 2 ? C.warn : C.faint;
        return (
          <View key={i} style={[styles.riskRow, { borderLeftColor: borderColor }]}>
            <View style={styles.riskMain}>
              <MText style={styles.riskTitle}>{stripUnsupportedGlyphs(r.risk)}</MText>
              <Text style={styles.riskMitigation}>
                <Text style={{ fontWeight: 700, color: C.brand }}>{isKo ? "Mitigation: " : "Mitigation: "}</Text>
                <Text>{stripUnsupportedGlyphs(r.mitigation)}</Text>
              </Text>
            </View>
            <View style={styles.riskStarsCol}>
              <MText style={[styles.riskStars, { color: starColor }]}>
                {starsToText(stars)}
              </MText>
            </View>
          </View>
        );
      })}
      {pageFooter}
    </Page>
  );

  // ── 12. ACTION PLAN ──────────────────────────────────────────────
  const actionPage = (
    <Page size="A4" style={styles.page}>
      <View style={styles.pageAccent} fixed />
      {pageHeader}
      <View style={styles.pageTitleRow}>
        <MText style={styles.sectionNum}>7</MText>
        <MText style={styles.pageTitle}>{t.sec7Title}</MText>
      </View>
      <View style={styles.pageTitleRule} />
      <MText style={styles.pageSubtitle}>{t.sec7Sub}</MText>

      {tieBanner}

      {/* Phase 1 with step table */}
      <View style={styles.phaseRow}>
        <View style={styles.phaseLeft}>
          <MText style={styles.phaseLabel}>{t.phase1Label}</MText>
          <MText style={styles.phaseDuration}>
            {stripUnsupportedGlyphs(phasedExecution.phase1.duration)}
          </MText>
        </View>
        <View style={styles.phaseRight}>
          <MText style={styles.phaseGoal}>{stripUnsupportedGlyphs(phasedExecution.phase1.goal)}</MText>
          {phasedExecution.phase1.steps.length > 0 && (
            <View style={[styles.table, { marginTop: 4, marginBottom: 0 }]}>
              <View style={styles.tableHeaderLight}>
                <MText style={[styles.thLight, { flex: 0.5 }]}>{t.thStep}</MText>
                <MText style={[styles.thLight, { flex: 1.4 }]}>{t.thGoal}</MText>
                <MText style={[styles.thLight, { flex: 1.6 }]}>{t.thDeliverable}</MText>
                <MText style={[styles.thLight, { flex: 1.4 }]}>{t.thNote}</MText>
              </View>
              {phasedExecution.phase1.steps.map((s, i, arr) => (
                <View key={i} style={[styles.tableRow, i === arr.length - 1 ? styles.tableRowLast : {}]}>
                  <MText style={[styles.tdBold, { flex: 0.5, color: C.brand }]}>{String(s.stepNum)}</MText>
                  <MText style={[styles.td, { flex: 1.4 }]}>{stripUnsupportedGlyphs(s.goal)}</MText>
                  <MText style={[styles.td, { flex: 1.6 }]}>{stripUnsupportedGlyphs(s.deliverable)}</MText>
                  <MText style={[styles.tdMuted, { flex: 1.4 }]}>{stripUnsupportedGlyphs(s.note)}</MText>
                </View>
              ))}
            </View>
          )}
        </View>
      </View>

      {/* Phase 2 */}
      <View style={styles.phaseRow}>
        <View style={styles.phaseLeft}>
          <MText style={styles.phaseLabel}>{t.phase2Label}</MText>
          <MText style={styles.phaseDuration}>
            {stripUnsupportedGlyphs(phasedExecution.phase2.duration)}
          </MText>
        </View>
        <View style={styles.phaseRight}>
          <MText style={styles.phaseGoal}>{stripUnsupportedGlyphs(phasedExecution.phase2.goal)}</MText>
          {phasedExecution.phase2.deliverables.map((d, i) => (
            <MText key={i} style={styles.phaseDeliverable}>{`· ${stripUnsupportedGlyphs(d)}`}</MText>
          ))}
        </View>
      </View>

      {/* Phase 3 */}
      <View style={styles.phaseRow}>
        <View style={styles.phaseLeft}>
          <MText style={styles.phaseLabel}>{t.phase3Label}</MText>
          <MText style={styles.phaseDuration}>
            {stripUnsupportedGlyphs(phasedExecution.phase3.duration)}
          </MText>
        </View>
        <View style={styles.phaseRight}>
          <MText style={styles.phaseGoal}>{stripUnsupportedGlyphs(phasedExecution.phase3.goal)}</MText>
          {phasedExecution.phase3.deliverables.map((d, i) => (
            <MText key={i} style={styles.phaseDeliverable}>{`· ${stripUnsupportedGlyphs(d)}`}</MText>
          ))}
        </View>
      </View>

      {pageFooter}
    </Page>
  );

  // ── 13. HONEST DISCLOSURE ────────────────────────────────────────
  const honestPage = (
    <Page size="A4" style={styles.page}>
      <View style={styles.pageAccent} fixed />
      {pageHeader}
      <View style={styles.pageTitleRow}>
        <MText style={styles.sectionNum}>8</MText>
        <MText style={styles.pageTitle}>{t.sec8Title}</MText>
      </View>
      <View style={styles.pageTitleRule} />
      <MText style={styles.pageSubtitle}>{t.sec8Sub}</MText>

      <MText style={styles.subSectionTitle}>{`8.1 ${t.limitsTitle}`}</MText>
      {honestDisclosure.limitations.map((l, i) => (
        // alignItems flex-start + inner View flexDirection column + the
        // text nodes drop bulletText's `flex:1` (nested flex collided
        // with the wrapping View and stacked rows on top of each other).
        <View
          key={i}
          style={[styles.bulletRow, { alignItems: "flex-start", marginBottom: 10 }]}
        >
          <MText
            style={[
              styles.bulletDot,
              { color: C.brand, fontWeight: 700, width: 18 },
            ]}
          >
            {`${i + 1}.`}
          </MText>
          <View style={{ flex: 1, flexDirection: "column" }}>
            <MText
              style={{
                fontSize: 10,
                color: C.body,
                lineHeight: 1.5,
                fontWeight: 700,
              }}
            >
              {stripUnsupportedGlyphs(l.title)}
            </MText>
            <MText
              style={{
                fontSize: 9,
                color: C.muted,
                lineHeight: 1.55,
                marginTop: 2,
              }}
            >
              {stripUnsupportedGlyphs(l.description)}
            </MText>
          </View>
        </View>
      ))}

      <MText style={[styles.subSectionTitle, { marginTop: 14 }]}>{`8.2 ${t.gradesTitle}`}</MText>
      <View style={styles.table}>
        <View style={styles.tableHeader}>
          <MText style={[styles.th, { flex: 1.5 }]}>{t.thArea}</MText>
          <MText style={[styles.th, { width: 90, textAlign: "center" }]}>{t.thGrade}</MText>
          <MText style={[styles.th, { flex: 2.5 }]}>{t.thBasis}</MText>
        </View>
        {honestDisclosure.perAreaGrades.map((g, i, arr) => (
          <View key={i} style={[styles.tableRow, i === arr.length - 1 ? styles.tableRowLast : {}]}>
            <MText style={[styles.gradeArea, { flex: 1.5 }]}>
              {stripUnsupportedGlyphs(g.area)}
            </MText>
            <View style={{ width: 90, alignItems: "center" }}>
              <MText style={[styles.gradeValue, { color: gradeColor(g.grade) }]}>
                {g.grade}
              </MText>
              <MText style={{ fontSize: 8, color: C.muted, textAlign: "center" }}>
                {stripUnsupportedGlyphs(g.label)}
              </MText>
            </View>
            <MText style={[styles.gradeBasis, { flex: 2.5 }]}>
              {stripUnsupportedGlyphs(g.basis)}
            </MText>
          </View>
        ))}
      </View>

      <View style={[styles.calloutCard, styles.calloutBrandBg, { marginTop: 10 }]}>
        <MText style={styles.calloutTitle}>{t.overallLabel}</MText>
        <MText style={[styles.calloutBody, { fontWeight: 700 }]}>
          {stripUnsupportedGlyphs(honestDisclosure.overallVerdict)}
        </MText>
      </View>
      {pageFooter}
    </Page>
  );

  // ── 14. APPENDIX ─────────────────────────────────────────────────
  const appendixPage = (
    <Page size="A4" style={styles.page}>
      <View style={styles.pageAccent} fixed />
      {pageHeader}
      <View style={styles.pageTitleRow}>
        <MText style={styles.sectionNum}>9</MText>
        <MText style={styles.pageTitle}>{t.sec9Title}</MText>
      </View>
      <View style={styles.pageTitleRule} />
      <MText style={styles.pageSubtitle}>{t.sec9Sub}</MText>

      <MText style={styles.subSectionTitle}>{t.appendixA}</MText>
      <View style={styles.table}>
        <View style={styles.tableHeader}>
          <MText style={[styles.th, { flex: 1.2 }]}>{t.thCategory}</MText>
          <MText style={[styles.th, { flex: 2.5 }]}>{t.thSource}</MText>
          <MText style={[styles.th, { width: 60, textAlign: "center" }]}>{t.thReliability}</MText>
        </View>
        {appendix.dataSources.map((src, i, arr) => (
          <View key={i} style={[styles.tableRow, i === arr.length - 1 ? styles.tableRowLast : {}]}>
            <MText style={[styles.tdBold, { flex: 1.2 }]}>{stripUnsupportedGlyphs(src.category)}</MText>
            <MText style={[styles.td, { flex: 2.5 }]}>{stripUnsupportedGlyphs(src.source)}</MText>
            <View style={{ width: 60, alignItems: "center" }}>
              <MText style={{ fontSize: 10, fontWeight: 700, color: reliabilityColor(src.reliability) }}>
                {src.reliability}
              </MText>
            </View>
          </View>
        ))}
      </View>

      {appendix.referenceUrls.length > 0 && (
        <>
          <MText style={[styles.subSectionTitle, { marginTop: 12 }]}>{t.appendixB}</MText>
          {appendix.referenceUrls.slice(0, 8).map((u, i) => (
            <View key={i} style={styles.citeRow}>
              <MText style={styles.citeNum}>{`[${i + 1}]`}</MText>
              <MText style={styles.citeText}>
                {`${stripUnsupportedGlyphs(u.label)} — ${u.url}`}
              </MText>
            </View>
          ))}
        </>
      )}

      <View style={{ flexDirection: "row", gap: 12, marginTop: 14 }}>
        <View style={{ flex: 1 }}>
          <MText style={styles.subSectionTitle}>{t.appendixC}</MText>
          <View style={styles.table}>
            {appendix.reproductionSpec.map((s, i, arr) => (
              <View key={i} style={[styles.tableRow, i === arr.length - 1 ? styles.tableRowLast : {}]}>
                <MText style={[styles.thLight, { flex: 1.2, color: C.brand }]}>{s.key}</MText>
                <MText style={[styles.td, { flex: 2 }]}>{stripUnsupportedGlyphs(s.value)}</MText>
              </View>
            ))}
          </View>
        </View>
        <View style={{ flex: 1 }}>
          <MText style={styles.subSectionTitle}>{t.appendixD}</MText>
          <View style={styles.table}>
            {appendix.publicationSpec.map((s, i, arr) => (
              <View key={i} style={[styles.tableRow, i === arr.length - 1 ? styles.tableRowLast : {}]}>
                <MText style={[styles.thLight, { flex: 1.2, color: C.brand }]}>{stripUnsupportedGlyphs(s.key)}</MText>
                <MText style={[styles.td, { flex: 2 }]}>{stripUnsupportedGlyphs(s.value)}</MText>
              </View>
            ))}
          </View>
        </View>
      </View>

      <MText
        style={{
          fontSize: 8,
          color: C.faint,
          marginTop: 14,
          lineHeight: 1.5,
        }}
      >
        {stripUnsupportedGlyphs(appendix.disclaimer)}
      </MText>
      {pageFooter}
    </Page>
  );

  // ── 15. CLOSING ──────────────────────────────────────────────────
  const closingPage = (
    <Page size="A4" style={styles.page}>
      <View style={styles.pageAccent} fixed />
      {pageHeader}
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          paddingTop: 100,
        }}
      >
        <View
          style={{
            width: 200,
            height: 0.5,
            backgroundColor: C.divider,
            marginBottom: 24,
          }}
        />
        <MText
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: C.brand,
            marginBottom: 24,
            textAlign: "center",
          }}
        >
          {`「 ${stripUnsupportedGlyphs(appendix.tagline)} 」`}
        </MText>
        <MText style={{ fontSize: 11, color: C.muted, textAlign: "center" }}>
          {`AI Market Twin  ·  ${appendix.contact}  ·  markettwin.ai`}
        </MText>
      </View>
      {pageFooter}
    </Page>
  );

  // Top-2 secondary candidate pages — inserted INLINE next to each
  // corresponding primary section (not bolted on at the end) so the
  // exec reads "primary US risks → secondary TW risks → primary US
  // actions → secondary TW actions" as a parallel comparison instead
  // of "all US first, then a TW afterthought".
  const secondaryCtx = secondaryAnalysis
    ? {
        secondary: secondaryAnalysis,
        winnerLabel,
        winnerCode: simResult.winner,
        isKo,
        pageHeader,
        pageFooter,
      }
    : null;
  const secondaryMarketPage = secondaryCtx && secondaryAnalysis?.marketProfile
    ? renderSecondaryMarketPage(secondaryCtx)
    : null;
  const secondaryActionsPage =
    secondaryCtx && secondaryAnalysis?.actions && secondaryAnalysis.actions.length > 0
      ? renderSecondaryActionsPage(secondaryCtx)
      : null;
  const secondaryRisksPage =
    secondaryCtx && secondaryAnalysis?.risks && secondaryAnalysis.risks.length > 0
      ? renderSecondaryRisksPage(secondaryCtx)
      : null;
  const secondaryPricingPage =
    secondaryCtx && secondaryAnalysis?.pricing
      ? renderSecondaryPricingPage(secondaryCtx, meta.currency ?? "USD")
      : null;

  const doc = (
    <Document>
      {coverPage}
      {tocPage}
      {execBriefPage}
      {methPage}
      {simResultsPage}
      {sourceAPage}
      {sourceBPage}
      {sourceCPage}
      {sourceDPage}
      {integratedPage}
      {secondaryMarketPage}
      {riskPage}
      {secondaryRisksPage}
      {actionPage}
      {secondaryActionsPage}
      {/* Secondary pricing slots in after actions so the reader reads
          "primary actions → secondary actions → secondary pricing"
          as a complete secondary deck before the honest disclosure. */}
      {secondaryPricingPage}
      {honestPage}
      {appendixPage}
      {closingPage}
    </Document>
  );

  return await renderToBuffer(doc);
}

/**
 * Render the Top-2 secondary candidate as 3 separate A4 pages —
 * market profile / recommended actions / risks. The caller inserts
 * each page DIRECTLY AFTER its primary counterpart in the Document
 * so the reader gets "primary US risks → secondary TW risks →
 * primary US actions → secondary TW actions" as a parallel
 * comparison flow rather than "US first, TW at the end".
 *
 * All bullet rows use a flex-less `bulletTextSafe` style (not the
 * shared styles.bulletText which carries flex:1). The shared style's
 * flex collides with the inner View flex:1 wrappers we use for
 * two-line bullets (header + description) → react-pdf paints both
 * lines at the same y-coordinate and rows stack. Le Mouton
 * 1265510e PDF surfaced this with badly overlapping text on every
 * S1/S2/S3 page; this rewrite fixes that.
 */
function renderSecondaryAnalysisPages(opts: {
  secondary: NonNullable<ValidationReportData["secondaryAnalysis"]>;
  winnerLabel: string;
  winnerCode: string;
  isKo: boolean;
  pageHeader: React.ReactElement;
  pageFooter: React.ReactElement;
}): React.ReactElement[] {
  const { secondary, winnerLabel, winnerCode, isKo, pageHeader, pageFooter } = opts;
  const countryLabel = getCountryLabel(secondary.country, isKo ? "ko" : "en");
  const pages: React.ReactElement[] = [];

  // CRITICAL: styles.bulletText has `flex: 1` which collides with the
  // inner View flex:1 wrappers we use for two-line bullets (header +
  // description). react-pdf's layout engine resolves the nested flex
  // wrong → both lines get painted at the same y-coordinate and rows
  // stack on top of each other. Use this flex-less alias inside every
  // nested-bullet pattern below.
  const bulletTextSafe = { fontSize: 10, color: C.body, lineHeight: 1.55 };

  const sectionTitle = (text: string) => (
    <MText style={styles.subSectionTitle}>{text}</MText>
  );
  const intro = (
    <View style={{ marginBottom: 12 }}>
      <View style={[styles.coverConclusionCard, { padding: 12, marginBottom: 8 }]}>
        <MText style={[styles.coverConclusionLabel, { color: C.warn }]}>
          {isKo ? "Top 2 동등 후보" : "Top 2 secondary candidate"}
        </MText>
        <MText style={[styles.coverConclusionMain, { fontSize: 18, color: C.brand }]}>
          {`${countryLabel} (${secondary.country})`}
        </MText>
        <MText style={[styles.coverConclusionMeta, { color: C.muted }]}>
          {isKo
            ? `Winner ${winnerLabel} (${winnerCode})와 동등 후보 — 다음 페이지부터 같은 깊이로 검증`
            : `Tied with winner ${winnerLabel} (${winnerCode}) — same-depth validation follows`}
        </MText>
      </View>
    </View>
  );

  // ── Page A: Market profile ──────────────────────────────────────
  const mp = secondary.marketProfile;
  if (mp) {
    pages.push(
      <Page key="secondary-market" size="A4" style={styles.page}>
        <View style={styles.pageAccent} fixed />
        {pageHeader}
        <View style={styles.pageTitleRow}>
          <MText style={styles.sectionNum}>S1</MText>
          <MText style={styles.pageTitle}>
            {isKo
              ? `${countryLabel} — 시장 분석 (Top 2 동등 후보)`
              : `${countryLabel} — Market profile (Top 2 secondary)`}
          </MText>
        </View>
        {intro}

        {(mp.tam || mp.growth || mp.segment) && (
          <View style={{ marginBottom: 12 }}>
            {sectionTitle(isKo ? "시장 규모" : "Market size")}
            {mp.tam && (
              <View style={styles.bulletRow}>
                <MText style={[styles.bulletDot, { color: C.brand }]}>TAM</MText>
                <MText style={styles.bulletText}>{stripUnsupportedGlyphs(mp.tam)}</MText>
              </View>
            )}
            {mp.growth && (
              <View style={styles.bulletRow}>
                <MText style={[styles.bulletDot, { color: C.brand }]}>{isKo ? "성장" : "Growth"}</MText>
                <MText style={styles.bulletText}>{stripUnsupportedGlyphs(mp.growth)}</MText>
              </View>
            )}
            {mp.segment && (
              <View style={styles.bulletRow}>
                <MText style={[styles.bulletDot, { color: C.brand }]}>{isKo ? "세그먼트" : "Segment"}</MText>
                <MText style={styles.bulletText}>{stripUnsupportedGlyphs(mp.segment)}</MText>
              </View>
            )}
          </View>
        )}

        {mp.competitors.length > 0 && (
          <View style={{ marginBottom: 12 }}>
            {sectionTitle(isKo ? `경쟁자 (${mp.competitors.length})` : `Competitors (${mp.competitors.length})`)}
            {mp.competitors.slice(0, 6).map((c, i) => (
              <View key={i} style={[styles.bulletRow, { alignItems: "flex-start" }]}>
                <MText style={[styles.bulletDot, { color: C.brand, width: 14, fontWeight: 700 }]}>·</MText>
                <View style={{ flex: 1 }}>
                  <MText style={[styles.bulletText, { fontWeight: 700 }]}>
                    {`${stripUnsupportedGlyphs(c.name)}${c.threatLevel ? ` (${c.threatLevel})` : ""}`}
                  </MText>
                  {c.brandContext && (
                    <MText style={[styles.bulletText, { fontSize: 9, color: C.muted, marginTop: 1 }]}>
                      {stripUnsupportedGlyphs(c.brandContext)}
                    </MText>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}

        {mp.channels.length > 0 && (
          <View style={{ marginBottom: 12 }}>
            {sectionTitle(isKo ? "채널 환경" : "Channels")}
            {mp.channels.slice(0, 6).map((c, i) => (
              <View key={i} style={[styles.bulletRow, { alignItems: "flex-start" }]}>
                <MText style={[styles.bulletDot, { color: C.brand, width: 14 }]}>·</MText>
                <View style={{ flex: 1 }}>
                  <MText style={[styles.bulletText, { fontWeight: 700 }]}>
                    {stripUnsupportedGlyphs(c.name)}
                  </MText>
                  {c.rationale && (
                    <MText style={[styles.bulletText, { fontSize: 9, color: C.muted, marginTop: 1 }]}>
                      {stripUnsupportedGlyphs(c.rationale)}
                    </MText>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}

        {(mp.regulatory.barriers.length > 0 || mp.regulatory.requirements.length > 0) && (
          <View style={{ marginBottom: 12 }}>
            {sectionTitle(isKo ? "규제·진입 장벽" : "Regulatory / barriers")}
            {mp.regulatory.barriers.slice(0, 5).map((b, i) => (
              <View key={i} style={[styles.bulletRow, { alignItems: "flex-start" }]}>
                <MText
                  style={[
                    styles.bulletDot,
                    {
                      color: b.severity === "high" ? C.risk : b.severity === "medium" ? C.warn : C.muted,
                      fontWeight: 700,
                      width: 36,
                      fontSize: 9,
                    },
                  ]}
                >
                  {b.severity.toUpperCase()}
                </MText>
                <View style={{ flex: 1 }}>
                  <MText style={[styles.bulletText, { fontWeight: 700 }]}>
                    {stripUnsupportedGlyphs(b.name)}
                  </MText>
                  {b.description && (
                    <MText style={[styles.bulletText, { fontSize: 9, color: C.muted, marginTop: 1 }]}>
                      {stripUnsupportedGlyphs(b.description)}
                    </MText>
                  )}
                </View>
              </View>
            ))}
            {mp.regulatory.requirements.length > 0 && (
              <View style={{ marginTop: 6 }}>
                <MText style={[styles.bulletText, { fontSize: 9, color: C.muted, fontWeight: 700 }]}>
                  {isKo ? "필수 요구사항:" : "Requirements:"}
                </MText>
                {mp.regulatory.requirements.slice(0, 5).map((r, i) => (
                  <MText
                    key={i}
                    style={[styles.bulletText, { fontSize: 9, color: C.muted, marginLeft: 8 }]}
                  >
                    {`· ${stripUnsupportedGlyphs(r)}`}
                  </MText>
                ))}
              </View>
            )}
            {mp.regulatory.timeToCompliance && (
              <MText
                style={[styles.bulletText, { fontSize: 9, color: C.muted, marginTop: 4 }]}
              >
                {`${isKo ? "준수 소요시간" : "Time to compliance"}: ${stripUnsupportedGlyphs(mp.regulatory.timeToCompliance)}`}
              </MText>
            )}
          </View>
        )}

        {(mp.culturalNotes.valuesAlignment ||
          mp.culturalNotes.purchaseBehavior ||
          mp.culturalNotes.languageNotes ||
          mp.culturalNotes.seasonality) && (
          <View style={{ marginBottom: 12 }}>
            {sectionTitle(isKo ? "문화·소비자 인사이트" : "Cultural / consumer insights")}
            {mp.culturalNotes.valuesAlignment && (
              <View style={styles.bulletRow}>
                <MText style={[styles.bulletDot, { color: C.brand, width: 50 }]}>
                  {isKo ? "가치관" : "Values"}
                </MText>
                <MText style={styles.bulletText}>
                  {stripUnsupportedGlyphs(mp.culturalNotes.valuesAlignment)}
                </MText>
              </View>
            )}
            {mp.culturalNotes.purchaseBehavior && (
              <View style={styles.bulletRow}>
                <MText style={[styles.bulletDot, { color: C.brand, width: 50 }]}>
                  {isKo ? "구매 행동" : "Behavior"}
                </MText>
                <MText style={styles.bulletText}>
                  {stripUnsupportedGlyphs(mp.culturalNotes.purchaseBehavior)}
                </MText>
              </View>
            )}
          </View>
        )}

        {(mp.pricingBenchmarks.entry || mp.pricingBenchmarks.mid || mp.pricingBenchmarks.premium) && (
          <View style={{ marginBottom: 12 }}>
            {sectionTitle(isKo ? "가격 벤치마크" : "Pricing benchmarks")}
            <View style={{ flexDirection: "row", gap: 12, flexWrap: "wrap" }}>
              {mp.pricingBenchmarks.entry && (
                <MText style={[styles.bulletText, { fontSize: 10 }]}>
                  {`Entry: ${stripUnsupportedGlyphs(mp.pricingBenchmarks.entry)}`}
                </MText>
              )}
              {mp.pricingBenchmarks.mid && (
                <MText style={[styles.bulletText, { fontSize: 10 }]}>
                  {`Mid: ${stripUnsupportedGlyphs(mp.pricingBenchmarks.mid)}`}
                </MText>
              )}
              {mp.pricingBenchmarks.premium && (
                <MText style={[styles.bulletText, { fontSize: 10 }]}>
                  {`Premium: ${stripUnsupportedGlyphs(mp.pricingBenchmarks.premium)}`}
                </MText>
              )}
              {mp.pricingBenchmarks.yourPosition && (
                <MText style={[styles.bulletText, { fontSize: 10, fontWeight: 700, color: C.brand }]}>
                  {`${isKo ? "내 포지션" : "Your position"}: ${stripUnsupportedGlyphs(mp.pricingBenchmarks.yourPosition)}`}
                </MText>
              )}
            </View>
          </View>
        )}

        {(mp.gtm.keyMessage || mp.gtm.differentiators.length > 0 || mp.gtm.risks.length > 0) && (
          <View style={{ marginBottom: 12 }}>
            {sectionTitle(isKo ? "GTM 전략" : "GTM strategy")}
            {mp.gtm.keyMessage && (
              <View style={{ marginBottom: 6 }}>
                <MText style={[styles.bulletText, { fontSize: 9, color: C.muted, fontWeight: 700 }]}>
                  {isKo ? "핵심 메시지" : "Key message"}
                </MText>
                <MText style={[styles.bulletText, { fontWeight: 700 }]}>
                  {stripUnsupportedGlyphs(mp.gtm.keyMessage)}
                </MText>
              </View>
            )}
            {mp.gtm.primaryAudience && (
              <View style={{ marginBottom: 6 }}>
                <MText style={[styles.bulletText, { fontSize: 9, color: C.muted, fontWeight: 700 }]}>
                  {isKo ? "1차 타깃 (ICP)" : "Primary audience (ICP)"}
                </MText>
                <MText style={styles.bulletText}>
                  {stripUnsupportedGlyphs(mp.gtm.primaryAudience)}
                </MText>
              </View>
            )}
            {mp.gtm.differentiators.length > 0 && (
              <View style={{ marginBottom: 6 }}>
                <MText style={[styles.bulletText, { fontSize: 9, color: C.muted, fontWeight: 700 }]}>
                  {isKo ? "차별화 요소" : "Differentiators"}
                </MText>
                {mp.gtm.differentiators.slice(0, 5).map((d, i) => (
                  <MText key={i} style={[styles.bulletText, { fontSize: 9, marginLeft: 6 }]}>
                    {`✓ ${stripUnsupportedGlyphs(d)}`}
                  </MText>
                ))}
              </View>
            )}
            {mp.gtm.risks.length > 0 && (
              <View>
                <MText style={[styles.bulletText, { fontSize: 9, color: C.risk, fontWeight: 700 }]}>
                  {isKo ? "주요 진입 리스크" : "Market-entry risks"}
                </MText>
                {mp.gtm.risks.slice(0, 5).map((r, i) => (
                  <MText key={i} style={[styles.bulletText, { fontSize: 9, marginLeft: 6 }]}>
                    {`! ${stripUnsupportedGlyphs(r)}`}
                  </MText>
                ))}
              </View>
            )}
          </View>
        )}

        {pageFooter}
      </Page>,
    );
  }

  // ── Page B: Recommended actions ─────────────────────────────────
  if (secondary.actions.length > 0) {
    pages.push(
      <Page key="secondary-actions" size="A4" style={styles.page}>
        <View style={styles.pageAccent} fixed />
        {pageHeader}
        <View style={styles.pageTitleRow}>
          <MText style={styles.sectionNum}>S2</MText>
          <MText style={styles.pageTitle}>
            {isKo
              ? `${countryLabel} — 추천 액션 (Top 2 동등 후보)`
              : `${countryLabel} — Recommended actions (Top 2 secondary)`}
          </MText>
        </View>
        <MText style={[styles.bulletText, { fontSize: 9, color: C.muted, marginBottom: 10 }]}>
          {isKo
            ? `${secondary.actions.length}개 액션 · single LLM pass (cross-sim 합의 아님)`
            : `${secondary.actions.length} actions · single LLM pass (not cross-sim consensus)`}
        </MText>
        {secondary.actions.map((a, i) => (
          <View
            key={i}
            style={[styles.bulletRow, { alignItems: "flex-start", marginBottom: 10 }]}
          >
            <MText style={[styles.bulletDot, { color: C.brand, fontWeight: 700, width: 18 }]}>
              {`${i + 1}.`}
            </MText>
            <View style={{ flex: 1 }}>
              <MText style={[styles.bulletText, { lineHeight: 1.55 }]}>
                {stripUnsupportedGlyphs(a.action)}
              </MText>
              <MText style={[styles.bulletText, { fontSize: 8, color: C.muted, marginTop: 2 }]}>
                {[
                  a.impact ? `${isKo ? "영향" : "Impact"} ${a.impact}/3` : null,
                  a.effort ? `${isKo ? "난이도" : "Effort"} ${a.effort}/3` : null,
                  a.actionCategory ?? null,
                ]
                  .filter(Boolean)
                  .join("  ·  ")}
              </MText>
            </View>
          </View>
        ))}
        {pageFooter}
      </Page>,
    );
  }

  // ── Page C: Risks ───────────────────────────────────────────────
  if (secondary.risks.length > 0) {
    pages.push(
      <Page key="secondary-risks" size="A4" style={styles.page}>
        <View style={styles.pageAccent} fixed />
        {pageHeader}
        <View style={styles.pageTitleRow}>
          <MText style={styles.sectionNum}>S3</MText>
          <MText style={styles.pageTitle}>
            {isKo
              ? `${countryLabel} — 리스크 (Top 2 동등 후보)`
              : `${countryLabel} — Risks (Top 2 secondary)`}
          </MText>
        </View>
        <MText style={[styles.bulletText, { fontSize: 9, color: C.muted, marginBottom: 10 }]}>
          {isKo
            ? `${secondary.risks.length}개 리스크 · single LLM pass`
            : `${secondary.risks.length} risks · single LLM pass`}
        </MText>
        {secondary.risks.map((r, i) => (
          <View
            key={i}
            style={[styles.bulletRow, { alignItems: "flex-start", marginBottom: 10 }]}
          >
            <MText
              style={[
                styles.bulletDot,
                {
                  color: r.severity === "high" ? C.risk : r.severity === "medium" ? C.warn : C.muted,
                  fontWeight: 700,
                  width: 50,
                  fontSize: 9,
                },
              ]}
            >
              {r.severity.toUpperCase()}
            </MText>
            <View style={{ flex: 1 }}>
              <MText style={[styles.bulletText, { fontWeight: 700 }]}>
                {stripUnsupportedGlyphs(r.factor)}
              </MText>
              <MText style={[styles.bulletText, { fontSize: 9, color: C.muted, marginTop: 1, lineHeight: 1.5 }]}>
                {stripUnsupportedGlyphs(r.description)}
              </MText>
              {r.personaCategory && (
                <MText style={[styles.bulletText, { fontSize: 8, color: C.muted, marginTop: 2 }]}>
                  {`[${r.personaCategory}]`}
                </MText>
              )}
            </View>
          </View>
        ))}
        {pageFooter}
      </Page>,
    );
  }

  return pages;
}

// ────────────────────────────────────────────────────────────────────
// Inline secondary section renderers — used by the buildValidationPdf
// Document above to interleave the Top-2 secondary candidate next to
// each primary section. All use bulletTextSafe (no flex:1) inside
// nested View flex:1 wrappers so two-line bullets don't stack.
// ────────────────────────────────────────────────────────────────────

type SecondaryRenderOpts = {
  secondary: NonNullable<ValidationReportData["secondaryAnalysis"]>;
  winnerLabel: string;
  winnerCode: string;
  isKo: boolean;
  pageHeader: React.ReactElement;
  pageFooter: React.ReactElement;
};

const secondaryBulletTextSafe = { fontSize: 10, color: C.body, lineHeight: 1.55 };
const secondaryBulletTextSmall = { fontSize: 9, color: C.muted, lineHeight: 1.5, marginTop: 1 };

function renderSecondaryHeader(opts: SecondaryRenderOpts, label: string): React.ReactElement {
  const countryLabel = getCountryLabel(opts.secondary.country, opts.isKo ? "ko" : "en");
  return (
    <View style={{ marginBottom: 14 }}>
      <View
        style={{
          backgroundColor: "#FEF3C7",
          paddingHorizontal: 8,
          paddingVertical: 4,
          borderRadius: 3,
          alignSelf: "flex-start",
          marginBottom: 6,
        }}
      >
        <MText style={{ fontSize: 9, fontWeight: 700, color: C.warn }}>
          {opts.isKo
            ? `Top 2 동등 후보 — ${countryLabel} ${label}`
            : `Top 2 secondary — ${countryLabel} ${label}`}
        </MText>
      </View>
      <MText style={{ fontSize: 11, color: C.muted }}>
        {opts.isKo
          ? `Winner ${opts.winnerLabel} (${opts.winnerCode})와 동등 후보 — 같은 깊이로 검증`
          : `Tied with winner ${opts.winnerLabel} (${opts.winnerCode}) — same-depth validation`}
      </MText>
    </View>
  );
}

function renderSecondaryMarketPage(opts: SecondaryRenderOpts): React.ReactElement | null {
  const { secondary, isKo, pageHeader, pageFooter } = opts;
  const mp = secondary.marketProfile;
  if (!mp) return null;
  const countryLabel = getCountryLabel(secondary.country, isKo ? "ko" : "en");

  // Cross-check row builder — each row mirrors the primary alignment
  // matrix at Section 5: dimension | sim signal | external evidence /
  // confidence | alignment pill. Secondary lacks proper external data
  // sources (KOSIS / Comtrade / KOTRA / etc. are primary-only), so the
  // "external" column distinguishes Tavily-grounded items (citations
  // present) from AI-only inferences. Reader sees what's verified vs
  // what's LLM extrapolation — true cross-check framing, not a
  // disguised market profile.
  type CrossCheckRow = {
    dimension: string;
    simSignal: string;
    externalEvidence: string;
    alignment: "high" | "medium" | "low" | "concern";
  };
  const crossCheckRows: CrossCheckRow[] = [];
  if (mp.tam) {
    crossCheckRows.push({
      dimension: isKo ? "TAM (시장 규모)" : "TAM (market size)",
      simSignal: mp.tam,
      externalEvidence: isKo
        ? "AI 추정 (외부 통계 미연결 — primary 시장만 KOSIS·Comtrade·KOTRA cross-check 수행)"
        : "AI estimate (no external stats linked — only primary covered by KOSIS / Comtrade / KOTRA cross-check)",
      alignment: "low",
    });
  }
  if (mp.growth) {
    crossCheckRows.push({
      dimension: isKo ? "성장 추세" : "Growth trend",
      simSignal: mp.growth,
      externalEvidence: isKo
        ? "AI 추정 — 외부 시장조사 데이터로 미검증"
        : "AI estimate — not externally validated",
      alignment: "low",
    });
  }
  if (mp.segment) {
    crossCheckRows.push({
      dimension: isKo ? "도달 세그먼트" : "Addressable segment",
      simSignal: mp.segment,
      externalEvidence: isKo
        ? "AI 추정 (페르소나 시뮬 신호 기반)"
        : "AI estimate (derived from persona sim signal)",
      alignment: "medium",
    });
  }
  if (mp.competitors.length > 0) {
    const compNames = mp.competitors.slice(0, 5).map((c) => c.name).join(", ");
    crossCheckRows.push({
      dimension: isKo ? "현지 경쟁자" : "Local competitors",
      simSignal: compNames,
      externalEvidence: isKo
        ? `${mp.competitors.length}개 브랜드 명명 — 실재 브랜드 (수동 cross-check 가능). 시장 점유율·매출 수치는 AI 추정.`
        : `${mp.competitors.length} named brands — real brands (manually cross-checkable). Share / revenue figures are AI estimates.`,
      alignment: "medium",
    });
  }
  if (mp.channels.length > 0) {
    const ch = mp.channels.slice(0, 4).map((c) => c.name).join(", ");
    crossCheckRows.push({
      dimension: isKo ? "유통 채널" : "Distribution channels",
      simSignal: ch,
      externalEvidence: isKo
        ? "실재 채널명 — 채널 존재는 verifiable, 페르소나 시뮬에서 추출한 신뢰 신호."
        : "Real channel names — verifiable existence, derived from persona sim trust signals.",
      alignment: "medium",
    });
  }
  if (mp.regulatory.barriers.length > 0 || mp.regulatory.requirements.length > 0) {
    const barriers = mp.regulatory.barriers.slice(0, 3).map((b) => b.name).join(", ");
    crossCheckRows.push({
      dimension: isKo ? "규제 / 진입 장벽" : "Regulatory / Barriers",
      simSignal: barriers || (isKo ? "요구사항 명시" : "Requirements listed"),
      externalEvidence: isKo
        ? "규제 기관·법령은 실재 (BSMI·관세청 등). 적용 범위와 timeline은 AI 추정 — 현지 법무 검토 필요."
        : "Regulators / statutes are real (BSMI / customs, etc.). Scope and timelines are AI estimates — local counsel review needed.",
      alignment: "medium",
    });
  }
  if (mp.pricingBenchmarks.entry || mp.pricingBenchmarks.mid || mp.pricingBenchmarks.premium) {
    const tier =
      [
        mp.pricingBenchmarks.entry ? `entry ${mp.pricingBenchmarks.entry}` : null,
        mp.pricingBenchmarks.mid ? `mid ${mp.pricingBenchmarks.mid}` : null,
        mp.pricingBenchmarks.premium ? `premium ${mp.pricingBenchmarks.premium}` : null,
      ]
        .filter(Boolean)
        .join(" / ");
    crossCheckRows.push({
      dimension: isKo ? "가격 벤치마크" : "Pricing benchmarks",
      simSignal: tier,
      externalEvidence: isKo
        ? "AI 추정 — 경쟁자 retail price 직접 추출은 별도 secondary pricing 모듈에서 수행."
        : "AI estimate — competitor retail prices not directly extracted here; see secondary pricing module.",
      alignment: "medium",
    });
  }
  if (mp.gtm.keyMessage) {
    crossCheckRows.push({
      dimension: isKo ? "GTM 핵심 메시지" : "GTM key message",
      simSignal: mp.gtm.keyMessage,
      externalEvidence: isKo
        ? "AI 합성 — 외부 광고 효과·메시지 테스트 데이터 미연결."
        : "AI synthesis — no ad-effectiveness or message-testing data linked.",
      alignment: "low",
    });
  }

  return (
    <Page key="secondary-market" size="A4" style={styles.page}>
      <View style={styles.pageAccent} fixed />
      {pageHeader}
      <View style={styles.pageTitleRow}>
        <MText style={styles.sectionNum}>S1</MText>
        <MText style={styles.pageTitle}>
          {isKo
            ? `${countryLabel} — 진출 Cross-Check (Top 2 동등 후보)`
            : `${countryLabel} — Entry Cross-Check (Top 2 secondary)`}
        </MText>
      </View>
      {renderSecondaryHeader(opts, isKo ? "진출 Cross-Check" : "entry cross-check")}

      {/* Cross-check scope disclaimer — explicit about what's
          externally validated vs AI-only for this secondary candidate. */}
      <View
        style={{
          backgroundColor: "#FFFBEB",
          borderLeftWidth: 3,
          borderLeftColor: C.warn,
          padding: 8,
          borderRadius: 3,
          marginBottom: 12,
        }}
        wrap={false}
      >
        <MText style={{ fontSize: 8, color: C.warn, fontWeight: 700, letterSpacing: 0.4 }}>
          {isKo
            ? `⚠ ${countryLabel} CROSS-CHECK 범위 안내`
            : `⚠ ${countryLabel} CROSS-CHECK SCOPE`}
        </MText>
        <MText style={{ fontSize: 8.5, color: C.body, marginTop: 2, lineHeight: 1.5 }}>
          {isKo
            ? `본 페이지는 ${countryLabel} 진출 가능성에 대한 시뮬 신호와 그에 대한 외부 데이터 cross-check 가능성을 정리합니다. 1순위 시장과 달리 ${countryLabel}는 KOSIS / Comtrade / KOTRA / DART 4-source 외부 데이터 cross-check를 거치지 않았습니다 — 현지 진출 전 별도 1차 자료 검증 필요.`
            : `This page summarises the ${countryLabel} entry signal from the sim and what external cross-check is/isn't applied. Unlike the primary market, ${countryLabel} has NOT been validated against the 4-source external dataset (KOSIS / Comtrade / KOTRA / DART) — independent verification required before any commitment.`}
        </MText>
      </View>

      {/* Alignment matrix — mirrors Section 5 (Integrated Analysis) chrome */}
      {crossCheckRows.length > 0 && (
        <View style={{ marginBottom: 14 }}>
          <MText style={styles.subSectionTitle}>
            {isKo ? `S1.1 ${countryLabel} 정합성 매트릭스` : `S1.1 ${countryLabel} alignment matrix`}
          </MText>
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <MText style={[styles.th, { flex: 1.1 }]}>{isKo ? "평가 차원" : "Dimension"}</MText>
              <MText style={[styles.th, { flex: 1.4 }]}>{isKo ? "시뮬 신호" : "Sim signal"}</MText>
              <MText style={[styles.th, { flex: 1.6 }]}>{isKo ? "외부 검증" : "External evidence"}</MText>
              <MText style={[styles.th, { flex: 0.9, textAlign: "center" }]}>{isKo ? "정합성" : "Alignment"}</MText>
            </View>
            {crossCheckRows.map((row, idx, arr) => {
              const last = idx === arr.length - 1;
              const palette = alignmentPalette(row.alignment);
              return (
                <View key={idx} style={[styles.tableRow, last ? styles.tableRowLast : {}]}>
                  <View style={{ flex: 1.1 }}>
                    <MText style={styles.tdBold}>{stripUnsupportedGlyphs(row.dimension)}</MText>
                  </View>
                  <MText style={[styles.td, { flex: 1.4 }]}>{stripUnsupportedGlyphs(row.simSignal)}</MText>
                  <MText style={[styles.td, { flex: 1.6 }]}>{stripUnsupportedGlyphs(row.externalEvidence)}</MText>
                  <View style={{ flex: 0.9, alignItems: "center", justifyContent: "center" }}>
                    <View style={[styles.alignPill, { backgroundColor: palette.bg }]}>
                      <MText style={[styles.alignPillText, { color: palette.ink }]}>
                        {alignmentLabel(row.alignment, isKo)}
                      </MText>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* Sim-side detail dump — kept so a reader who wants to see the
          raw market profile (competitors, channels, regulatory detail,
          cultural notes, GTM) doesn't have to click through. Framed as
          "S1.2 시뮬 신호 상세" to keep cross-check framing. */}
      <MText style={[styles.subSectionTitle, { marginTop: 14 }]}>
        {isKo ? `S1.2 시뮬 신호 상세 (${countryLabel})` : `S1.2 Sim signal detail (${countryLabel})`}
      </MText>

      {mp.competitors.length > 0 && (
        <View style={{ marginBottom: 10 }}>
          <MText style={{ fontSize: 9.5, color: C.muted, fontWeight: 700, marginBottom: 3 }}>
            {isKo ? `명명된 경쟁자 (${mp.competitors.length})` : `Named competitors (${mp.competitors.length})`}
          </MText>
          {mp.competitors.slice(0, 6).map((c, i) => (
            <View key={i} style={{ marginBottom: 4 }}>
              <MText style={{ fontSize: 10, color: C.body, fontWeight: 700 }}>
                {`· ${stripUnsupportedGlyphs(c.name)}${c.threatLevel ? ` (${c.threatLevel})` : ""}`}
              </MText>
              {c.brandContext && (
                <MText style={[secondaryBulletTextSmall, { marginLeft: 10 }]}>
                  {stripUnsupportedGlyphs(c.brandContext)}
                </MText>
              )}
            </View>
          ))}
        </View>
      )}

      {mp.channels.length > 0 && (
        <View style={{ marginBottom: 10 }}>
          <MText style={{ fontSize: 9.5, color: C.muted, fontWeight: 700, marginBottom: 3 }}>
            {isKo ? "주요 채널" : "Primary channels"}
          </MText>
          {mp.channels.slice(0, 6).map((c, i) => (
            <View key={i} style={{ marginBottom: 4 }}>
              <MText style={{ fontSize: 10, color: C.body, fontWeight: 700 }}>
                {`· ${stripUnsupportedGlyphs(c.name)}`}
              </MText>
              {c.rationale && (
                <MText style={[secondaryBulletTextSmall, { marginLeft: 10 }]}>
                  {stripUnsupportedGlyphs(c.rationale)}
                </MText>
              )}
            </View>
          ))}
        </View>
      )}

      {(mp.regulatory.barriers.length > 0 || mp.regulatory.requirements.length > 0) && (
        <View style={{ marginBottom: 10 }}>
          <MText style={{ fontSize: 9.5, color: C.muted, fontWeight: 700, marginBottom: 3 }}>
            {isKo ? "규제 / 진입 장벽 상세" : "Regulatory / Barriers detail"}
          </MText>
          {mp.regulatory.barriers.slice(0, 5).map((b, i) => {
            const sevColor = b.severity === "high" ? C.risk : b.severity === "medium" ? C.warn : C.muted;
            return (
              <View key={i} style={{ marginBottom: 4 }}>
                <View style={{ flexDirection: "row" }}>
                  <MText style={{ fontSize: 9, color: sevColor, fontWeight: 700, width: 50 }}>
                    {b.severity.toUpperCase()}
                  </MText>
                  <MText style={{ fontSize: 10, color: C.body, fontWeight: 700, flex: 1 }}>
                    {stripUnsupportedGlyphs(b.name)}
                  </MText>
                </View>
                {b.description && (
                  <MText style={[secondaryBulletTextSmall, { marginLeft: 50 }]}>
                    {stripUnsupportedGlyphs(b.description)}
                  </MText>
                )}
              </View>
            );
          })}
          {mp.regulatory.requirements.length > 0 && (
            <View style={{ marginTop: 4 }}>
              <MText style={{ fontSize: 9, color: C.muted, fontWeight: 700 }}>
                {isKo ? "필수 요구사항:" : "Requirements:"}
              </MText>
              {mp.regulatory.requirements.slice(0, 5).map((r, i) => (
                <MText key={i} style={[secondaryBulletTextSmall, { marginLeft: 12 }]}>
                  {`· ${stripUnsupportedGlyphs(r)}`}
                </MText>
              ))}
            </View>
          )}
          {mp.regulatory.timeToCompliance && (
            <MText style={[secondaryBulletTextSmall, { marginTop: 4 }]}>
              {`${isKo ? "준수 소요시간" : "Time to compliance"}: ${stripUnsupportedGlyphs(mp.regulatory.timeToCompliance)}`}
            </MText>
          )}
        </View>
      )}

      {(mp.culturalNotes.valuesAlignment || mp.culturalNotes.purchaseBehavior) && (
        <View style={{ marginBottom: 12 }}>
          <MText style={styles.subSectionTitle}>
            {isKo ? "문화·소비자 인사이트" : "Cultural / consumer insights"}
          </MText>
          {mp.culturalNotes.valuesAlignment && (
            <View style={{ flexDirection: "row", marginBottom: 4 }}>
              <MText style={{ fontSize: 10, color: C.brand, fontWeight: 700, width: 70 }}>
                {isKo ? "가치관" : "Values"}
              </MText>
              <MText style={[secondaryBulletTextSafe, { flex: 1 }]}>
                {stripUnsupportedGlyphs(mp.culturalNotes.valuesAlignment)}
              </MText>
            </View>
          )}
          {mp.culturalNotes.purchaseBehavior && (
            <View style={{ flexDirection: "row", marginBottom: 4 }}>
              <MText style={{ fontSize: 10, color: C.brand, fontWeight: 700, width: 70 }}>
                {isKo ? "구매 행동" : "Behavior"}
              </MText>
              <MText style={[secondaryBulletTextSafe, { flex: 1 }]}>
                {stripUnsupportedGlyphs(mp.culturalNotes.purchaseBehavior)}
              </MText>
            </View>
          )}
        </View>
      )}

      {(mp.pricingBenchmarks.entry || mp.pricingBenchmarks.mid || mp.pricingBenchmarks.premium) && (
        <View style={{ marginBottom: 12 }}>
          <MText style={styles.subSectionTitle}>{isKo ? "가격 벤치마크" : "Pricing benchmarks"}</MText>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {mp.pricingBenchmarks.entry && (
              <MText style={[secondaryBulletTextSafe, { marginRight: 16 }]}>
                {`Entry: ${stripUnsupportedGlyphs(mp.pricingBenchmarks.entry)}`}
              </MText>
            )}
            {mp.pricingBenchmarks.mid && (
              <MText style={[secondaryBulletTextSafe, { marginRight: 16 }]}>
                {`Mid: ${stripUnsupportedGlyphs(mp.pricingBenchmarks.mid)}`}
              </MText>
            )}
            {mp.pricingBenchmarks.premium && (
              <MText style={[secondaryBulletTextSafe, { marginRight: 16 }]}>
                {`Premium: ${stripUnsupportedGlyphs(mp.pricingBenchmarks.premium)}`}
              </MText>
            )}
            {mp.pricingBenchmarks.yourPosition && (
              <MText style={[secondaryBulletTextSafe, { fontWeight: 700, color: C.brand }]}>
                {`${isKo ? "내 포지션" : "Your position"}: ${stripUnsupportedGlyphs(mp.pricingBenchmarks.yourPosition)}`}
              </MText>
            )}
          </View>
        </View>
      )}

      {(mp.gtm.keyMessage || mp.gtm.differentiators.length > 0 || mp.gtm.risks.length > 0) && (
        <View style={{ marginBottom: 12 }}>
          <MText style={styles.subSectionTitle}>{isKo ? "GTM 전략" : "GTM strategy"}</MText>
          {mp.gtm.keyMessage && (
            <View style={{ marginBottom: 6 }}>
              <MText style={{ fontSize: 9, color: C.muted, fontWeight: 700 }}>
                {isKo ? "핵심 메시지" : "Key message"}
              </MText>
              <MText style={[secondaryBulletTextSafe, { fontWeight: 700 }]}>
                {stripUnsupportedGlyphs(mp.gtm.keyMessage)}
              </MText>
            </View>
          )}
          {mp.gtm.primaryAudience && (
            <View style={{ marginBottom: 6 }}>
              <MText style={{ fontSize: 9, color: C.muted, fontWeight: 700 }}>
                {isKo ? "1차 타깃 (ICP)" : "Primary audience (ICP)"}
              </MText>
              <MText style={secondaryBulletTextSafe}>{stripUnsupportedGlyphs(mp.gtm.primaryAudience)}</MText>
            </View>
          )}
          {mp.gtm.differentiators.length > 0 && (
            <View style={{ marginBottom: 6 }}>
              <MText style={{ fontSize: 9, color: C.muted, fontWeight: 700 }}>
                {isKo ? "차별화 요소" : "Differentiators"}
              </MText>
              {mp.gtm.differentiators.slice(0, 5).map((d, i) => (
                <MText key={i} style={[secondaryBulletTextSmall, { marginLeft: 8 }]}>
                  {`✓ ${stripUnsupportedGlyphs(d)}`}
                </MText>
              ))}
            </View>
          )}
          {mp.gtm.risks.length > 0 && (
            <View>
              <MText style={{ fontSize: 9, color: C.risk, fontWeight: 700 }}>
                {isKo ? "주요 진입 리스크" : "Market-entry risks"}
              </MText>
              {mp.gtm.risks.slice(0, 5).map((r, i) => (
                <MText key={i} style={[secondaryBulletTextSmall, { marginLeft: 8 }]}>
                  {`! ${stripUnsupportedGlyphs(r)}`}
                </MText>
              ))}
            </View>
          )}
        </View>
      )}

      {pageFooter}
    </Page>
  );
}

function renderSecondaryActionsPage(opts: SecondaryRenderOpts): React.ReactElement | null {
  const { secondary, isKo, pageHeader, pageFooter } = opts;
  if (secondary.actions.length === 0) return null;
  const countryLabel = getCountryLabel(secondary.country, isKo ? "ko" : "en");
  return (
    <Page key="secondary-actions" size="A4" style={styles.page}>
      <View style={styles.pageAccent} fixed />
      {pageHeader}
      <View style={styles.pageTitleRow}>
        <MText style={styles.sectionNum}>S2</MText>
        <MText style={styles.pageTitle}>
          {isKo
            ? `${countryLabel} — 추천 액션 (Top 2 동등 후보)`
            : `${countryLabel} — Recommended actions (Top 2 secondary)`}
        </MText>
      </View>
      {renderSecondaryHeader(opts, isKo ? "추천 액션" : "actions")}
      <MText style={[secondaryBulletTextSmall, { marginBottom: 10 }]}>
        {isKo
          ? `${secondary.actions.length}개 액션 · single LLM pass (cross-sim 합의 아님)`
          : `${secondary.actions.length} actions · single LLM pass (not cross-sim consensus)`}
      </MText>
      {/* Use the primary phasedExecution row chrome (phaseRow +
          phaseLeft + phaseRight + phaseLabel + phaseGoal +
          phaseDeliverable) for each action so the secondary actions
          page looks like a peer of the primary action plan page.
          Secondary doesn't have phases, so the left column shows the
          action number + impact/effort badges instead of phase label
          + duration. The right column carries the action prose + a
          single deliverable-style meta line. */}
      {secondary.actions.map((a, i) => {
        const impactLabel =
          a.impact === 3
            ? isKo ? "결정적" : "Pivotal"
            : a.impact === 2
              ? isKo ? "의미 있음" : "Meaningful"
              : a.impact === 1
                ? isKo ? "경미" : "Small"
                : null;
        const effortLabel =
          a.effort === 3
            ? isKo ? "몇 달" : "Months"
            : a.effort === 2
              ? isKo ? "몇 주" : "Weeks"
              : a.effort === 1
                ? isKo ? "며칠" : "Days"
                : null;
        return (
          <View key={i} style={styles.phaseRow}>
            <View style={styles.phaseLeft}>
              <MText style={styles.phaseLabel}>{`#${i + 1}`}</MText>
              {effortLabel && (
                <MText style={styles.phaseDuration}>{effortLabel}</MText>
              )}
            </View>
            <View style={styles.phaseRight}>
              <MText style={styles.phaseGoal}>{stripUnsupportedGlyphs(a.action)}</MText>
              {(impactLabel || effortLabel || a.actionCategory) && (
                <MText style={[styles.phaseDeliverable, { color: C.muted, fontSize: 8.5 }]}>
                  {[
                    impactLabel ? `${isKo ? "영향" : "Impact"} ${a.impact}/3 · ${impactLabel}` : null,
                    effortLabel ? `${isKo ? "난이도" : "Effort"} ${a.effort}/3 · ${effortLabel}` : null,
                    a.actionCategory,
                  ]
                    .filter(Boolean)
                    .join("  ·  ")}
                </MText>
              )}
            </View>
          </View>
        );
      })}
      {pageFooter}
    </Page>
  );
}

/**
 * Top-2 secondary pricing page — renders the LLM-generated parallel
 * pricing analysis (recommended price + curve + margin) at the same
 * depth as the primary winner's pricing. Returns null when the user
 * hasn't yet generated the secondary pricing via the dashboard CTA.
 */
function renderSecondaryPricingPage(
  opts: SecondaryRenderOpts,
  currency: string,
): React.ReactElement | null {
  const { secondary, isKo, pageHeader, pageFooter } = opts;
  const pricing = secondary.pricing;
  if (!pricing) return null;
  const countryLabel = getCountryLabel(secondary.country, isKo ? "ko" : "en");
  const fmt = (cents: number) => formatPrice(cents, currency);
  const maxConv = Math.max(...pricing.curve.map((p) => p.meanConversionProbability), 0.0001);
  const peakPoint = pricing.curve.reduce<typeof pricing.curve[number] | null>(
    (best, p) => (best === null || p.meanConversionProbability > best.meanConversionProbability ? p : best),
    null,
  );
  return (
    <Page key="secondary-pricing" size="A4" style={styles.page}>
      <View style={styles.pageAccent} fixed />
      {pageHeader}
      <View style={styles.pageTitleRow}>
        <MText style={styles.sectionNum}>S4</MText>
        <MText style={styles.pageTitle}>
          {isKo
            ? `${countryLabel} — 가격 분석 (Top 2 동등 후보)`
            : `${countryLabel} — Pricing (Top 2 secondary)`}
        </MText>
      </View>
      {renderSecondaryHeader(opts, isKo ? "가격 분석" : "pricing")}

      <View
        style={{
          flexDirection: "row",
          gap: 24,
          alignItems: "flex-end",
          paddingBottom: 12,
          borderBottomWidth: 0.5,
          borderBottomColor: C.divider,
          marginBottom: 12,
        }}
      >
        <View style={{ flex: 1 }}>
          <MText style={{ fontSize: 8, color: C.muted, fontWeight: 700, letterSpacing: 0.6 }}>
            {isKo ? "권장 가격" : "RECOMMENDED"}
          </MText>
          <MText style={{ fontSize: 22, fontWeight: 700, color: C.ink, marginTop: 2 }}>
            {fmt(pricing.recommendedPriceCents)}
          </MText>
          <MText style={{ fontSize: 9, color: C.muted, marginTop: 2 }}>
            {isKo
              ? `추정 신뢰구간 ${fmt(pricing.recommendedPriceP25)}–${fmt(pricing.recommendedPriceP75)} (±15%)`
              : `Inferred band ${fmt(pricing.recommendedPriceP25)}–${fmt(pricing.recommendedPriceP75)} (±15%)`}
          </MText>
        </View>
        {peakPoint && (
          <View>
            <MText style={{ fontSize: 8, color: C.muted, fontWeight: 700, letterSpacing: 0.6 }}>
              {isKo ? "최고 전환" : "PEAK"}
            </MText>
            <MText style={{ fontSize: 14, fontWeight: 700, color: C.ink, marginTop: 2 }}>
              {fmt(peakPoint.priceCents)}
            </MText>
            <MText style={{ fontSize: 9, color: C.muted, marginTop: 2 }}>
              {`${(peakPoint.meanConversionProbability * 100).toFixed(1)}%`}
            </MText>
          </View>
        )}
        {pricing.curveRevenueMaxCents != null && (
          <View>
            <MText style={{ fontSize: 8, color: C.muted, fontWeight: 700, letterSpacing: 0.6 }}>
              {isKo ? "매출 최대" : "REV MAX"}
            </MText>
            <MText style={{ fontSize: 14, fontWeight: 700, color: C.ink, marginTop: 2 }}>
              {fmt(pricing.curveRevenueMaxCents)}
            </MText>
          </View>
        )}
      </View>

      <MText style={{ fontSize: 10, color: C.body, lineHeight: 1.55, marginBottom: 12 }}>
        {pricing.rationale}
      </MText>

      {pricing.curve.length > 0 && (
        <View style={{ marginBottom: 12 }}>
          <MText
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: C.brand,
              marginBottom: 6,
            }}
          >
            {isKo ? "가격 – 전환 곡선" : "Price – conversion curve"}
          </MText>
          {pricing.curve.map((p) => (
            <View
              key={p.priceCents}
              style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 3 }}
            >
              <MText style={{ width: 56, fontSize: 9, color: C.body }}>{fmt(p.priceCents)}</MText>
              <View
                style={{
                  flex: 1,
                  height: 6,
                  backgroundColor: "#F1F5F9",
                  borderRadius: 2,
                }}
              >
                <View
                  style={{
                    width: `${(p.meanConversionProbability / maxConv) * 100}%`,
                    height: 6,
                    backgroundColor: C.brand,
                    borderRadius: 2,
                  }}
                />
              </View>
              <MText style={{ width: 56, fontSize: 9, color: C.body, textAlign: "right" }}>
                {`${(p.meanConversionProbability * 100).toFixed(1)}%`}
              </MText>
            </View>
          ))}
        </View>
      )}

      {pricing.marginEstimate && (
        <View>
          <MText style={{ fontSize: 11, fontWeight: 700, color: C.brand, marginBottom: 4 }}>
            {isKo ? "예상 마진" : "Margin estimate"}
          </MText>
          <MText style={{ fontSize: 10, color: C.body, lineHeight: 1.55 }}>
            {pricing.marginEstimate}
          </MText>
          {pricing.marginEstimatePct != null && (
            <MText style={{ fontSize: 9, color: C.muted, marginTop: 3 }}>
              {isKo
                ? `약 ${pricing.marginEstimatePct}% 매출총이익률`
                : `~${pricing.marginEstimatePct}% gross margin`}
            </MText>
          )}
        </View>
      )}

      {pageFooter}
    </Page>
  );
}

function renderSecondaryRisksPage(opts: SecondaryRenderOpts): React.ReactElement | null {
  const { secondary, isKo, pageHeader, pageFooter } = opts;
  if (secondary.risks.length === 0) return null;
  const countryLabel = getCountryLabel(secondary.country, isKo ? "ko" : "en");
  // Map severity → star count to match primary risk page chrome.
  // High = ★★★, Medium = ★★, Low = ★ — same starsToText helper the
  // primary uses, just derived from the secondary's severity field.
  const sevStars = (s: "low" | "medium" | "high"): 1 | 2 | 3 =>
    s === "high" ? 3 : s === "medium" ? 2 : 1;
  return (
    <Page key="secondary-risks" size="A4" style={styles.page}>
      <View style={styles.pageAccent} fixed />
      {pageHeader}
      <View style={styles.pageTitleRow}>
        <MText style={styles.sectionNum}>S3</MText>
        <MText style={styles.pageTitle}>
          {isKo
            ? `${countryLabel} — 리스크 (Top 2 동등 후보)`
            : `${countryLabel} — Risks (Top 2 secondary)`}
        </MText>
      </View>
      {renderSecondaryHeader(opts, isKo ? "리스크" : "risks")}
      <MText style={[secondaryBulletTextSmall, { marginBottom: 10 }]}>
        {isKo
          ? `${secondary.risks.length}개 리스크 · single LLM pass`
          : `${secondary.risks.length} risks · single LLM pass`}
      </MText>
      {/* Use the primary RiskRow chrome: borderLeftColor + riskMain +
          riskTitle + riskMitigation + riskStarsCol + riskStars so the
          secondary risks page looks like a peer of the primary page,
          not a thin alternate. The "Mitigation:" prefix is reused
          even though secondary uses `description` (not a separate
          mitigation field) — the visual chrome is what matters. */}
      {secondary.risks.map((r, i) => {
        const stars = sevStars(r.severity);
        const borderColor = stars === 3 ? C.risk : stars === 2 ? C.warn : C.muted;
        const starColor = stars === 3 ? C.risk : stars === 2 ? C.warn : C.faint;
        return (
          <View key={i} style={[styles.riskRow, { borderLeftColor: borderColor }]}>
            <View style={styles.riskMain}>
              <MText style={styles.riskTitle}>{stripUnsupportedGlyphs(r.factor)}</MText>
              <Text style={styles.riskMitigation}>
                <Text>{stripUnsupportedGlyphs(r.description)}</Text>
              </Text>
              {r.personaCategory && (
                <Text style={{ fontSize: 8, color: C.muted, marginTop: 4 }}>
                  {`[${r.personaCategory}]`}
                </Text>
              )}
            </View>
            <View style={styles.riskStarsCol}>
              <MText style={[styles.riskStars, { color: starColor }]}>
                {starsToText(stars)}
              </MText>
            </View>
          </View>
        );
      })}
      {pageFooter}
    </Page>
  );
}

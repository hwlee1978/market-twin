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
  Link,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { Style } from "@react-pdf/types";
import { splitByFont } from "./fonts";
import type { EnsembleAggregate } from "@/lib/simulation/ensemble";
import {
  computePricingSensitivity,
  computeCurveRevenueMaxCents,
  getDisplayPriceCents,
} from "@/lib/simulation/pricing-sensitivity";
import { analyzeIncomeIntent } from "@/lib/simulation/segment-analysis";
import { getCountryLabel } from "@/lib/countries";
import { formatPrice } from "@/lib/format/price";
import {
  tokenize,
  tokenizeStripGeo,
  overlapCoefficient,
  isPersonaMismatchNoise,
} from "@/lib/simulation/surfaced-recount";
import {
  COMPONENT_LABEL,
  COMPONENT_STRESS_SCENARIOS,
  flipThresholdPt,
  type ComponentKey,
} from "@/lib/decision-aid/stress-scenarios";

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
    /** Channel/brand mention table inline on personas page — decision_plus 이상. */
    showChannels: boolean;
    /** Per-segment intent breakdown (gender/age/income) — decision_plus 이상. */
    showSegments: boolean;
    /** Per-country drilldown (rationale + objections + persona summary) — decision_plus 이상. */
    showCountryDetail: boolean;
    /** Top-N countries to render with full detail blocks. */
    countryDetailLimit: number;
    showPricingCurve: boolean;
    showProviderConsensus: boolean; // gated additionally by lineup size
    showMethodology: boolean;
    showAppendix: boolean;

    // ── Tier-gated "wow" pages — added in stages so each tier above
    //   hypothesis brings something visibly new to the report. The
    //   gradient is intentional: lower-cost tiers stay focused so the
    //   user perceives the higher tiers as bringing real new analysis,
    //   not just bigger numbers on the same charts.

    /** Income × intent matrix page. Decision+ — early decision aid. */
    showIncomeIntent: boolean;
    /** Trust factors vs Objections (recommended country) page. Decision+. */
    showTrustVsObjection: boolean;
    /** Per-profession intent ranking page. Decision_plus+. */
    showProfessionRanking: boolean;
    /** Channel mention priority page. Decision_plus+. */
    showChannelPriority: boolean;
    /** Risk × Action heuristic mapping page. Decision_plus+. */
    showRiskActionMapping: boolean;
    /** Behavioural persona archetype clustering page. Deep+. */
    showArchetypes: boolean;
    /** Per-country funnel comparison page. Deep+. */
    showFunnelComparison: boolean;
    /** Cross-LLM disagreement page. Deep+ (also requires ≥2 providers). */
    showProviderDisagreement: boolean;
    /** Universal vs market-specific objections page. Decision+. */
    showCommonObjections: boolean;
    /** Champion vs Skeptic profile comparison page. Decision+. */
    showChampionVsSkeptic: boolean;
    /** Go / No-Go verdict synthesis page. Decision+. */
    showGoNoGo: boolean;
    /** Country decision matrix (every candidate compared). Decision+. */
    showCountryDecisionMatrix: boolean;
    /** 30/60/90 phased execution plan. Decision+. */
    showExecutionTimeline: boolean;
    /** Recommended-country market profile (competitors, channels, regulatory). Decision+. */
    showMarketProfile: boolean;
    /** Investment + ROI projection (volume tiers, break-even). Decision_plus+. */
    showInvestmentROI: boolean;
    /** Recommendation robustness + sensitivity. Decision_plus+. */
    showSensitivityAnalysis: boolean;
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
    showChannels: false,
    showSegments: false,
    showCountryDetail: false,
    countryDetailLimit: 0,
    showPricingCurve: true,
    showProviderConsensus: false,
    showMethodology: true,
    showAppendix: false,
    // Hypothesis is the lean tier — keeps the existing 17-page report
    // shape intact so users running cheap initial validations get a
    // tight, focused output.
    showIncomeIntent: false,
    showTrustVsObjection: false,
    showProfessionRanking: false,
    showChannelPriority: false,
    showRiskActionMapping: false,
    showArchetypes: false,
    showFunnelComparison: false,
    showProviderDisagreement: false,
    showCommonObjections: false,
    showChampionVsSkeptic: false,
    showGoNoGo: false,
    showCountryDecisionMatrix: false,
    showExecutionTimeline: false,
    showMarketProfile: false,
    showInvestmentROI: false,
    showSensitivityAnalysis: false,
  },
  decision: {
    rank: 2,
    voices: 6,
    risks: 8,
    actions: 7,
    countriesInRanking: 8,
    professions: 8,
    showDemographics: true,
    showChannels: false,
    showSegments: false,
    showCountryDetail: false,
    countryDetailLimit: 0,
    showPricingCurve: true,
    showProviderConsensus: false,
    showMethodology: true,
    showAppendix: false,
    // Decision adds the four highest-value decision-aid pages —
    // income×intent + trust vs objection (price + messaging) plus
    // champion-vs-skeptic + universal-vs-local objections (the
    // visceral "where's the gap" content).
    showIncomeIntent: true,
    showTrustVsObjection: true,
    showProfessionRanking: false,
    showChannelPriority: false,
    showRiskActionMapping: false,
    showArchetypes: false,
    showFunnelComparison: false,
    showProviderDisagreement: false,
    showCommonObjections: true,
    showChampionVsSkeptic: true,
    showGoNoGo: true,
    showCountryDecisionMatrix: true,
    showExecutionTimeline: true,
    showMarketProfile: true,
    // Decision tier intentionally LACKS investment ROI + sensitivity
    // — those are Decision+ exclusives so the tier ladder feels real.
    showInvestmentROI: false,
    showSensitivityAnalysis: false,
  },
  decision_plus: {
    rank: 3,
    voices: 8,
    risks: 10,
    actions: 8,
    countriesInRanking: 10,
    professions: 10,
    showDemographics: true,
    showChannels: true,
    showSegments: true,
    showCountryDetail: true,
    countryDetailLimit: 3,
    showPricingCurve: true,
    showProviderConsensus: false,
    showMethodology: true,
    showAppendix: true,
    // Decision+ adds analysis-depth pages — profession breakdown +
    // channel priority + risk-action audit. Country detail also opens.
    showIncomeIntent: true,
    showTrustVsObjection: true,
    showProfessionRanking: true,
    showChannelPriority: true,
    showRiskActionMapping: true,
    showArchetypes: false,
    showFunnelComparison: false,
    showProviderDisagreement: false,
    showCommonObjections: true,
    showChampionVsSkeptic: true,
    showGoNoGo: true,
    showCountryDecisionMatrix: true,
    showExecutionTimeline: true,
    showMarketProfile: true,
    // Decision+ unlocks investment ROI + sensitivity analysis — the
    // tier-exclusive decision-critical content.
    showInvestmentROI: true,
    showSensitivityAnalysis: true,
  },
  deep: {
    rank: 4,
    voices: 10,
    risks: 12,
    actions: 10,
    countriesInRanking: 12,
    professions: 12,
    showDemographics: true,
    showChannels: true,
    showSegments: true,
    showCountryDetail: true,
    countryDetailLimit: 5,
    showPricingCurve: true,
    showProviderConsensus: true,
    showMethodology: true,
    showAppendix: true,
    // Deep is the multi-LLM tier — adds full segmentation (archetypes),
    // per-country funnel side-by-side, and cross-model consensus +
    // disagreement. This is where "premium" actually unlocks.
    showIncomeIntent: true,
    showTrustVsObjection: true,
    showProfessionRanking: true,
    showChannelPriority: true,
    showRiskActionMapping: true,
    showArchetypes: true,
    showFunnelComparison: true,
    showProviderDisagreement: true,
    showCommonObjections: true,
    showChampionVsSkeptic: true,
    showGoNoGo: true,
    showCountryDecisionMatrix: true,
    showExecutionTimeline: true,
    showMarketProfile: true,
    showInvestmentROI: true,
    showSensitivityAnalysis: true,
  },
  deep_pro: {
    rank: 5,
    voices: 12,
    risks: 14,
    actions: 12,
    countriesInRanking: 12,
    professions: 12,
    showDemographics: true,
    showChannels: true,
    showSegments: true,
    showCountryDetail: true,
    countryDetailLimit: 5,
    showPricingCurve: true,
    showProviderConsensus: true,
    showMethodology: true,
    showAppendix: true,
    showIncomeIntent: true,
    showTrustVsObjection: true,
    showProfessionRanking: true,
    showChannelPriority: true,
    showRiskActionMapping: true,
    showArchetypes: true,
    showFunnelComparison: true,
    showProviderDisagreement: true,
    showCommonObjections: true,
    showChampionVsSkeptic: true,
    showGoNoGo: true,
    showCountryDecisionMatrix: true,
    showExecutionTimeline: true,
    showMarketProfile: true,
    showInvestmentROI: true,
    showSensitivityAnalysis: true,
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
  /**
   * "executive" — 2-3 page condensed decision deck (hot take + recommendation
   *               + top actions/risks + price + funnel snapshot).
   * "detailed" — full analyst-grade report with every drilldown page
   *              (default; existing behaviour).
   * Routed inside buildEnsemblePdf to either renderExecutiveDoc or the
   * existing render path.
   */
  variant?: "executive" | "detailed";
}

/**
 * Strips characters react-pdf's bundled font can't render. Without this,
 * an emoji like 👉 in the project description ends up as a horizontal
 * line / tofu glyph that looks like an unintended strikethrough on the
 * adjacent text. Conservative: targets the Extended_Pictographic range
 * plus the variation selector / ZWJ joiners that pad multi-codepoint
 * emoji sequences. Regular punctuation, math symbols, and CJK pass through.
 */
function stripUnsupportedGlyphs(text: string): string {
  if (!text) return text;
  return text
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/[‍️︎]/g, "") // ZWJ + variation selectors
    .replace(/[\u{1F1E6}-\u{1F1FF}]/gu, "") // regional indicator letters (flag emoji halves)
    .replace(/  +/g, " ") // collapse double spaces left behind
    .trim();
}

/**
 * Picks a cover-title font size that keeps the product name on a single
 * line. The cover frame is A4 (595pt) minus 56pt padding on each side =
 * 483pt of usable width. Pretendard SemiBold averages ~0.6em per Latin
 * char; CJK glyphs are wider so we weight Hangul / kana / CJK at 1.6×.
 * Default 28pt drops in steps to 16pt for very long names — anything
 * past ~46 weighted chars gets the smallest size and may still wrap,
 * but that's by far better than mid-word hyphenation at 28pt.
 */
function fitCoverTitleSize(text: string): number {
  let weight = 0;
  for (const ch of text) {
    weight += /[가-힯぀-ヿ一-鿿]/.test(ch) ? 1.6 : 1;
  }
  if (weight <= 18) return 28;
  if (weight <= 24) return 24;
  if (weight <= 30) return 22;
  if (weight <= 38) return 20;
  if (weight <= 46) return 18;
  return 16;
}

const TIER_DISPLAY: Record<
  TierName,
  { ko: string; en: string; eyebrowKo: string; eyebrowEn: string }
> = {
  hypothesis: { ko: "초기검증", en: "Hypothesis", eyebrowKo: "초기검증 분석", eyebrowEn: "Hypothesis analysis" },
  decision: { ko: "검증분석", en: "Consensus", eyebrowKo: "검증분석", eyebrowEn: "Consensus analysis" },
  decision_plus: { ko: "검증분석+", en: "Consensus+", eyebrowKo: "검증분석+", eyebrowEn: "Consensus+ analysis" },
  deep: { ko: "심층분석", en: "Triangulated", eyebrowKo: "심층분석", eyebrowEn: "Triangulated analysis" },
  deep_pro: { ko: "심층분석 Pro", en: "Triangulated Pro", eyebrowKo: "심층분석 Pro", eyebrowEn: "Triangulated Pro analysis" },
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
      <MText style={{ fontSize: 8, color: C.faint }}>{stripUnsupportedGlyphs(productName)}</MText>
    </View>
  );
  const pageFooter = (
    <View style={styles.pageFooter} fixed>
      <MText style={{ fontSize: 8, color: C.faint }}>{t.footerLeft}</MText>
      <MText style={{ fontSize: 8, color: C.faint }}>{`Ensemble ${ensembleId.slice(0, 8)}`}</MText>
    </View>
  );

  // ── helper renderers (closed over t / styles / aggregate) ──────────────

  /**
   * One-page executive brief — the "30-second view" that lets a busy
   * exec read the recommendation, the hot take, and the must-act risks
   * without scrolling. Sits at the very front of the report so even a
   * reader who only skims page 1 walks away with a decision.
   *
   * Tier gating: hypothesis (1 sim) and decision (5 sims) skip this
   * page — the hot take and consensus signals need ≥15 sims to be
   * meaningful. decision_plus / deep / deep_pro all show it.
   */
  const renderOnePageBriefPage = () => {
    if (!tierBudget.showAppendix) return null; // appendix flag doubles as "richer-tier" signal
    const narrative = aggregate.narrative;
    const recommendation = aggregate.recommendation;
    const variance = aggregate.varianceAssessment;
    if (!narrative) return null;

    const confidenceColor =
      recommendation.confidence === "STRONG"
        ? C.success
        : recommendation.confidence === "MODERATE"
          ? C.warn
          : C.risk;

    const topRisks = (narrative.mergedRisks ?? []).slice(0, 3);
    const topActions = (narrative.mergedActions ?? []).slice(0, 3);

    return (
      <Page size="A4" style={styles.page}>
        {pageHeader}

        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
          <MText style={{ fontSize: 9, fontWeight: 700, color: C.brand, letterSpacing: 0.6, textTransform: "uppercase" }}>
            {isKo ? "30초 브리핑" : "30-second brief"}
          </MText>
          <MText style={{ fontSize: 8, color: C.muted }}>
            {`${aggregate.simCount} sims · ${aggregate.effectivePersonas.toLocaleString()} personas · ${tierDisplay.en}`}
          </MText>
        </View>
        <MText style={[styles.pageTitle, { fontSize: 22, marginBottom: 14 }]}>
          {stripUnsupportedGlyphs(project?.product_name ?? productName)}
        </MText>

        {/* Hot take — biggest text on the page so it's the first thing
            the eye lands on. Wrap in a tinted bg so it reads as a
            distinct "headline" element vs body text. */}
        {narrative.hotTake && (
          <View
            style={{
              backgroundColor: "#F0F7FF",
              borderLeftWidth: 4,
              borderLeftColor: C.brand,
              padding: 14,
              borderRadius: 6,
              marginBottom: 16,
            }}
          >
            <MText style={{ fontSize: 13.5, lineHeight: 1.5, color: C.ink, fontWeight: 600 }}>
              {stripUnsupportedGlyphs(narrative.hotTake)}
            </MText>
          </View>
        )}

        {/* 3-column KPI strip: recommended market / variance / overall risk */}
        <View style={{ flexDirection: "row", gap: 10, marginBottom: 16 }}>
          <View style={[styles.kpiCard, { flex: 1 }]}>
            <MText style={styles.kpiLabel}>{isKo ? "추천 진출국" : "Recommended"}</MText>
            <MText style={[styles.kpiValue, { color: confidenceColor }]}>
              {recommendation.country}
            </MText>
            <MText style={styles.kpiSub}>
              {`${recommendation.consensusPercent}% ${isKo ? "합의" : "consensus"} · ${recommendation.confidence}`}
            </MText>
          </View>
          <View style={[styles.kpiCard, { flex: 1 }]}>
            <MText style={styles.kpiLabel}>{isKo ? "변동성" : "Variance"}</MText>
            <MText style={[styles.kpiValue, { color: variance.label === "high" ? C.warn : variance.label === "moderate" ? C.muted : C.success }]}>
              {variance.label.toUpperCase()}
            </MText>
            <MText style={styles.kpiSub}>
              {isKo
                ? `최대 ${variance.maxFinalScoreRange}점`
                : `max range ${variance.maxFinalScoreRange}pt`}
            </MText>
          </View>
          <View style={[styles.kpiCard, { flex: 1 }]}>
            <MText style={styles.kpiLabel}>{isKo ? "종합 리스크" : "Risk level"}</MText>
            <MText
              style={[
                styles.kpiValue,
                {
                  color:
                    narrative.overallRiskLevel === "high"
                      ? C.risk
                      : narrative.overallRiskLevel === "medium"
                        ? C.warn
                        : C.success,
                },
              ]}
            >
              {narrative.overallRiskLevel.toUpperCase()}
            </MText>
            <MText style={styles.kpiSub}>
              {`${topRisks.length} ${isKo ? "주요 리스크" : "top risks"}`}
            </MText>
          </View>
        </View>

        {/* Two-column grid: top risks + top actions */}
        <View style={{ flexDirection: "row", gap: 14, marginBottom: 14 }}>
          <View style={{ flex: 1 }}>
            <MText style={styles.sectionEyebrow}>
              {isKo ? `핵심 리스크 (Top ${topRisks.length})` : `Top risks (${topRisks.length})`}
            </MText>
            {topRisks.length === 0 ? (
              <MText style={styles.tdMuted}>—</MText>
            ) : (
              topRisks.map((r, i) => (
                <View
                  key={i}
                  style={{
                    marginBottom: 8,
                    paddingLeft: 8,
                    borderLeftWidth: 2,
                    borderLeftColor:
                      r.severity === "high" ? C.risk : r.severity === "medium" ? C.warn : C.muted,
                  }}
                >
                  <MText
                    style={{
                      fontSize: 7.5,
                      fontWeight: 700,
                      letterSpacing: 0.5,
                      color:
                        r.severity === "high" ? C.risk : r.severity === "medium" ? C.warn : C.muted,
                    }}
                  >
                    {r.severity.toUpperCase()}
                  </MText>
                  <MText style={{ fontSize: 9.5, color: C.ink, fontWeight: 600, marginTop: 1 }}>
                    {stripUnsupportedGlyphs(r.factor)}
                  </MText>
                </View>
              ))
            )}
          </View>

          <View style={{ flex: 1 }}>
            <MText style={styles.sectionEyebrow}>
              {isKo ? `1순위 액션 (Top ${topActions.length})` : `Top actions (${topActions.length})`}
            </MText>
            {topActions.length === 0 ? (
              <MText style={styles.tdMuted}>—</MText>
            ) : (
              topActions.map((a, i) => (
                <View
                  key={i}
                  style={{
                    marginBottom: 8,
                    flexDirection: "row",
                    gap: 6,
                  }}
                >
                  <MText
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: C.brand,
                      minWidth: 14,
                    }}
                  >
                    {`${i + 1}.`}
                  </MText>
                  <MText style={{ fontSize: 9.5, color: C.ink, lineHeight: 1.45, flex: 1 }}>
                    {stripUnsupportedGlyphs(a.action)}
                  </MText>
                </View>
              ))
            )}
          </View>
        </View>

        {/* Footer pointer — tells reader the rest of the report is just below */}
        <View
          style={{
            marginTop: "auto",
            paddingTop: 12,
            borderTopWidth: 0.5,
            borderTopColor: C.divider,
          }}
        >
          <MText style={{ fontSize: 8.5, color: C.muted, lineHeight: 1.5 }}>
            {isKo
              ? "본 페이지는 30초 안에 결정 가능한 요약입니다. 다음 페이지부터 프로젝트 컨텍스트, 국가별 점수, 페르소나 분석, 가격 분석, 리스크/액션 상세, 멀티 LLM 합의도가 이어집니다."
              : "This is the decision-in-30-seconds summary. The pages that follow break out project context, country scoring, persona analysis, pricing, full risk / action detail, and multi-LLM consensus."}
          </MText>
        </View>

        {pageFooter}
      </Page>
    );
  };

  const renderProjectInfoPage = () => {
    if (!project) return null;
    const fmtPrice = () => {
      if (project.base_price_cents == null) return "—";
      return formatPrice(project.base_price_cents, project.currency);
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
            <MText style={styles.infoValue}>{stripUnsupportedGlyphs(project.product_name ?? productName)}</MText>
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
              <MText style={styles.infoLong}>{stripUnsupportedGlyphs(project.description)}</MText>
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
      typeof cents === "number" ? formatPrice(cents, project?.currency) : "—";
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
              text={(() => {
                const fs = winnerStats?.finalScore;
                const headKo = `${recCountryLabel} 진출이 합의 우위 (${aggregate.recommendation.consensusPercent}% / ${aggregate.recommendation.confidence})`;
                const headEn = `${recCountryLabel} leads consensus (${aggregate.recommendation.consensusPercent}% / ${aggregate.recommendation.confidence})`;
                if (!fs) return isKo ? `${headKo}.` : `${headEn}.`;
                const within = fs.withinSimStdMean;
                const noise =
                  within && within > 0
                    ? isKo
                      ? `, 시뮬 내부 noise ±${within.toFixed(1)}`
                      : `, within-sim noise ±${within.toFixed(1)}`
                    : "";
                // Hypothesis tier (1 sim): "all sims" framing reads weird;
                // just show the score + within-sim noise from LLM rolls.
                if (aggregate.simCount === 1) {
                  return isKo
                    ? `${headKo} — 점수 ${fs.mean.toFixed(0)}점${noise}.`
                    : `${headEn} — score ${fs.mean.toFixed(0)}${noise}.`;
                }
                const acrossZero = fs.std < 0.05;
                if (acrossZero) {
                  return isKo
                    ? `${headKo} — 모든 시뮬이 ${fs.mean.toFixed(0)}점으로 수렴${noise}.`
                    : `${headEn} — all sims converged on ${fs.mean.toFixed(0)}${noise}.`;
                }
                return isKo
                  ? `${headKo} — 평균 점수 ${fs.mean.toFixed(0)}, 표준편차 ${fs.std.toFixed(1)}.`
                  : `${headEn} — mean ${fs.mean.toFixed(0)}, std ${fs.std.toFixed(1)}.`;
              })()}
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
                text={(() => {
                  const p = aggregate.pricing!;
                  // Headline price stays in sync with the Pricing analysis
                  // page via the shared helper — auto-corrects when LLM is
                  // anchored on the base price.
                  const { displayCents } = getDisplayPriceCents(
                    p.recommendedPriceCents,
                    p.curve,
                    p.curveRevenueMaxCents,
                  );
                  const unanimous = p.recommendedPriceUnanimousAt;
                  const within = p.recommendedPriceWithinSimStdMean ?? 0;
                  const noiseSuffix = within > 0
                    ? (isKo
                        ? ` · 시뮬 내부 noise ±${fmtPrice(within)}`
                        : ` · within-sim noise ±${fmtPrice(within)}`)
                    : "";
                  // Hypothesis tier (1 sim): "all sims converged" framing
                  // is misleading; legacy mid-50% range collapses to "$X – $X".
                  if (aggregate.simCount === 1) {
                    return isKo
                      ? `권장 가격 ${fmtPrice(displayCents)}${noiseSuffix}.`
                      : `Recommended price ${fmtPrice(displayCents)}${noiseSuffix}.`;
                  }
                  if (unanimous != null && unanimous > 0) {
                    const noise = within > 0
                      ? (isKo
                          ? `, 시뮬 내부 noise ±${fmtPrice(within)}`
                          : `, within-sim noise ±${fmtPrice(within)}`)
                      : "";
                    return isKo
                      ? `권장 가격 ${fmtPrice(displayCents)} — 모든 시뮬이 ${fmtPrice(unanimous)}로 수렴${noise}.`
                      : `Recommended price ${fmtPrice(displayCents)} — all sims converged on ${fmtPrice(unanimous)}${noise}.`;
                  }
                  return isKo
                    ? `권장 가격 ${fmtPrice(displayCents)} (시뮬 50% 구간 ${fmtPrice(p.recommendedPriceP25)}–${fmtPrice(p.recommendedPriceP75)}).`
                    : `Recommended price ${fmtPrice(displayCents)} (mid-50% ${fmtPrice(p.recommendedPriceP25)}–${fmtPrice(p.recommendedPriceP75)}).`;
                })()}
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

  /**
   * Go / No-Go verdict — synthesises confidence score + recommendation
   * strength + risk level into a single decision. The most "decision-
   * critical" page in the report: a CEO can land on this page and
   * walk away with an answer plus the conditions that would change it.
   *
   * Verdict logic:
   *   - GO: confidence ≥ 75 AND recommendation confidence STRONG/MODERATE
   *         AND no critical quality warnings
   *   - CAUTION: confidence 60-74 OR recommendation WEAK, but no
   *              quarantining warnings
   *   - NO-GO: confidence < 60 OR systemic critical warnings present
   *
   * Falls back gracefully when quality data is missing (legacy
   * ensembles): defaults to CAUTION with a "data missing" note.
   */
  const renderGoNoGoVerdictPage = () => {
    if (!tierBudget.showGoNoGo) return null;
    const conf = aggregate.quality?.confidenceScore;
    const recConf = aggregate.recommendation.confidence;
    const riskLevel = aggregate.narrative?.overallRiskLevel ?? "medium";
    const criticalWarnings =
      aggregate.quality?.systemicWarnings?.filter((w) => w.severity === "critical") ?? [];

    type Verdict = "go" | "caution" | "nogo";
    let verdict: Verdict;
    if (typeof conf === "number") {
      if (conf >= 75 && recConf !== "WEAK" && criticalWarnings.length === 0) verdict = "go";
      else if (conf < 60 || criticalWarnings.length > 0) verdict = "nogo";
      else verdict = "caution";
    } else {
      verdict = "caution";
    }

    const verdictMeta: Record<Verdict, { label: { ko: string; en: string }; tone: string; bg: string; tagline: { ko: string; en: string } }> = {
      go: {
        label: { ko: "GO — 진출 권장", en: "GO — proceed with launch" },
        tone: C.success,
        bg: "#F0FDF4",
        tagline: {
          ko: "데이터가 일관된 합의를 보입니다. 액션 플랜대로 진행하세요.",
          en: "Data shows strong consensus. Execute the action plan.",
        },
      },
      caution: {
        label: { ko: "주의 — 조건부 진출", en: "CAUTION — conditional go" },
        tone: C.warn,
        bg: "#FFFBEB",
        tagline: {
          ko: "신호는 긍정적이나 핵심 조건 충족 후 진행 — 검증 마일스톤 설정 권장.",
          en: "Signal is positive but condition checks needed — set validation milestones.",
        },
      },
      nogo: {
        label: { ko: "NO-GO — 진출 보류", en: "NO-GO — defer launch" },
        tone: C.risk,
        bg: "#FEF2F2",
        tagline: {
          ko: "현 데이터로는 진출 결정 불가. 핵심 블로커 해결 후 재시뮬 권장.",
          en: "Current data doesn't support launch. Resolve blockers and re-validate.",
        },
      },
    };
    const v = verdictMeta[verdict];
    const labelText = isKo ? v.label.ko : v.label.en;
    const tagline = isKo ? v.tagline.ko : v.tagline.en;

    // Conditions that, if met, would move verdict UP one notch.
    // Computed from the same signals that drove the verdict.
    const conditions: string[] = [];
    if (verdict !== "go") {
      if (typeof conf === "number" && conf < 75) {
        conditions.push(
          isKo
            ? `결과 신뢰도를 75+로 올림 (현재 ${conf}, 더 많은 시뮬 / 심층분석 tier 검증)`
            : `Lift confidence to 75+ (currently ${conf} — more sims / Triangulated tier validation)`,
        );
      }
      if (recConf === "WEAK") {
        conditions.push(
          isKo
            ? `추천국 합의도 강화 (현재 WEAK — 시뮬 간 의견 분산)`
            : `Strengthen recommendation consensus (currently WEAK — sims disagree)`,
        );
      }
      if (riskLevel === "high") {
        conditions.push(
          isKo
            ? `종합 리스크 수준을 medium 이하로 낮춤 (Top 리스크 해결)`
            : `Bring overall risk to medium or below (resolve top risks)`,
        );
      }
      for (const w of criticalWarnings.slice(0, 2)) {
        conditions.push(
          isKo
            ? `시스템적 경고 해소: ${w.message}`
            : `Resolve systemic warning: ${w.message}`,
        );
      }
    }

    // Critical signals — facts that the verdict depends on. Render
    // 4-6 of them so the reader sees WHY the verdict landed where it did.
    const signals: Array<{ label: string; value: string; status: "ok" | "warn" | "fail" }> = [];
    if (typeof conf === "number") {
      signals.push({
        label: isKo ? "결과 신뢰도" : "Result confidence",
        value: `${conf}/100`,
        status: conf >= 75 ? "ok" : conf >= 60 ? "warn" : "fail",
      });
    }
    signals.push({
      label: isKo ? "추천 합의도" : "Recommendation strength",
      value: `${aggregate.recommendation.consensusPercent}% (${recConf})`,
      status: recConf === "STRONG" ? "ok" : recConf === "MODERATE" ? "warn" : "fail",
    });
    signals.push({
      label: isKo ? "종합 리스크" : "Overall risk",
      value: riskLevel.toUpperCase(),
      status: riskLevel === "low" ? "ok" : riskLevel === "medium" ? "warn" : "fail",
    });
    if (criticalWarnings.length > 0) {
      signals.push({
        label: isKo ? "시스템적 경고" : "Systemic warnings",
        value: isKo ? `${criticalWarnings.length}건 critical` : `${criticalWarnings.length} critical`,
        status: "fail",
      });
    }
    signals.push({
      label: isKo ? "추천 시장" : "Target market",
      value: aggregate.recommendation.country,
      status: "ok",
    });
    if (aggregate.pricing?.recommendedPriceCents) {
      // Use shared helper so this signal stays in sync with the Pricing
      // analysis page. Otherwise the verdict shows $49.95 (raw LLM) while
      // the Pricing page shows $56 (curve revenue max), confusing the user.
      const { displayCents } = getDisplayPriceCents(
        aggregate.pricing.recommendedPriceCents,
        aggregate.pricing.curve,
        aggregate.pricing.curveRevenueMaxCents,
      );
      signals.push({
        label: isKo ? "권장 가격" : "Recommended price",
        value: formatPrice(displayCents, project?.currency ?? undefined),
        status: "ok",
      });
    }

    return (
      <Page size="A4" style={styles.page}>
        {pageHeader}
        <MText style={styles.pageTitle}>
          {isKo ? "Go / No-Go 판정" : "Go / No-Go decision"}
        </MText>
        <MText style={styles.pageSubtitle}>
          {isKo
            ? "이 페이지는 분석 전체를 한 줄로 요약합니다. 데이터에 기반한 진출 권장 + 그 결정이 바뀌려면 어떤 조건이 충족돼야 하는지."
            : "One-page synthesis of the entire analysis: data-driven verdict + the conditions that would change it."}
        </MText>

        {/* Verdict hero */}
        <View
          style={{
            backgroundColor: v.bg,
            borderTopWidth: 5,
            borderTopColor: v.tone,
            padding: 18,
            borderRadius: 4,
            marginBottom: 14,
          }}
          wrap={false}
        >
          <MText
            style={{
              fontSize: 8,
              color: v.tone,
              fontWeight: 700,
              letterSpacing: 0.8,
              marginBottom: 4,
            }}
          >
            {isKo ? "데이터 기반 판정" : "DATA-DRIVEN VERDICT"}
          </MText>
          <MText style={{ fontSize: 22, color: v.tone, fontWeight: 700, marginBottom: 6 }}>
            {labelText}
          </MText>
          <MText style={{ fontSize: 10, color: C.body, lineHeight: 1.5 }}>
            {tagline}
          </MText>
        </View>

        {/* Critical signals */}
        <View style={styles.sectionBlock}>
          <MText style={styles.sectionEyebrow}>
            {isKo ? "이 판정의 근거 신호" : "Signals supporting this verdict"}
          </MText>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 6,
              marginTop: 4,
            }}
          >
            {signals.map((s, i) => {
              const tone =
                s.status === "ok" ? C.success : s.status === "warn" ? C.warn : C.risk;
              return (
                <View
                  key={i}
                  style={{
                    width: "48%",
                    backgroundColor: C.card,
                    borderLeftWidth: 2,
                    borderLeftColor: tone,
                    padding: 8,
                    borderRadius: 3,
                  }}
                  wrap={false}
                >
                  <MText style={{ fontSize: 7, color: C.muted, fontWeight: 600 }}>
                    {s.label}
                  </MText>
                  <MText
                    style={{
                      fontSize: 11,
                      color: tone,
                      fontWeight: 700,
                      marginTop: 2,
                    }}
                  >
                    {s.value}
                  </MText>
                </View>
              );
            })}
          </View>
        </View>

        {/* Conditions — when verdict is below GO, list what would
            move the needle. */}
        {conditions.length > 0 && (
          <View style={styles.sectionBlock}>
            <MText style={[styles.sectionEyebrow, { color: v.tone }]}>
              {isKo
                ? `판정을 ${verdict === "nogo" ? "주의 / GO" : "GO"}로 이동시키는 조건`
                : `Conditions to move verdict to ${verdict === "nogo" ? "Caution / Go" : "Go"}`}
            </MText>
            {conditions.map((c, i) => (
              <View
                key={i}
                style={{
                  flexDirection: "row",
                  alignItems: "flex-start",
                  paddingVertical: 4,
                  gap: 8,
                }}
                wrap={false}
              >
                <MText style={{ fontSize: 10, color: v.tone, fontWeight: 700, width: 16 }}>
                  {`${i + 1}.`}
                </MText>
                <MText style={{ fontSize: 9, color: C.body, flex: 1, lineHeight: 1.5 }}>
                  {c}
                </MText>
              </View>
            ))}
          </View>
        )}

        {pageFooter}
      </Page>
    );
  };

  /**
   * Country decision matrix — every candidate country in one table
   * with the columns that matter for picking: final score, components
   * snapshot, top blocker, recommendation level (GO / CAUTION / NO-GO).
   * Designed so a reader can compare all markets at once instead of
   * paging back and forth between per-country drilldowns.
   */
  /**
   * Market profile for the recommended country — competitor list with
   * threat levels, channel landscape, cultural notes, regulatory
   * barriers, pricing benchmarks, GTM strategy summary. Generated by
   * a separate LLM call after recommendation; rendered as one rich
   * page that gives the launch decision its real-world context.
   *
   * Each section gracefully hides when its underlying field is empty —
   * the LLM may have skipped low-confidence categories rather than
   * fabricate. Better empty than wrong.
   */
  const renderMarketProfilePage = () => {
    if (!tierBudget.showMarketProfile) return null;
    const mp = aggregate.marketProfile;
    if (!mp) return null;

    const competitors = mp.competitors ?? [];
    const channels = mp.channels;
    const cult = mp.culturalNotes;
    const reg = mp.regulatory;
    const pricing = mp.pricingBenchmarks;
    const gtm = mp.goToMarketStrategy;

    // Skip the page entirely if everything is empty — happens if the
    // LLM bailed on the call.
    const anyContent =
      competitors.length > 0 ||
      (mp.marketSize?.estimateUsd?.length ?? 0) > 0 ||
      (channels?.primary?.length ?? 0) > 0 ||
      (reg?.barriers?.length ?? 0) > 0 ||
      (pricing?.entryLevel?.length ?? 0) > 0 ||
      (gtm?.keyMessage?.length ?? 0) > 0;
    if (!anyContent) return null;

    const threatColor = (t: string) =>
      t === "high" ? C.risk : t === "medium" ? C.warn : C.muted;
    const sevColor = (s: string) =>
      s === "high" ? C.risk : s === "medium" ? C.warn : C.muted;
    const compTypeLabel = (t: string) => {
      if (t === "direct") return isKo ? "직접 경쟁" : "Direct";
      if (t === "indirect") return isKo ? "간접" : "Indirect";
      return isKo ? "대체재" : "Substitute";
    };

    return (
      <Page size="A4" style={styles.page} wrap>
        {pageHeader}
        <MText style={styles.pageTitle}>
          {isKo
            ? `${mp.country} — 시장 상황 + 경쟁자 분석`
            : `${mp.country} — Market profile + competitive analysis`}
        </MText>
        <MText style={styles.pageSubtitle}>
          {isKo
            ? "추천 진출국에 대한 시장 규모, 명명된 경쟁자, 채널 환경, 규제, 가격 벤치마크, GTM 전략 요약. 진출 의사결정의 실세계 맥락."
            : "Recommended-market deep-dive: TAM, named competitors, channel landscape, regulatory, pricing benchmarks, and GTM strategy."}
        </MText>

        {/* Market size */}
        {mp.marketSize?.estimateUsd && (
          <View style={styles.sectionBlock}>
            <MText style={styles.sectionEyebrow}>
              {isKo ? "시장 규모" : "Market size"}
            </MText>
            <View
              style={{
                backgroundColor: C.card,
                padding: 10,
                borderRadius: 4,
                gap: 4,
              }}
              wrap={false}
            >
              <View style={{ flexDirection: "row", gap: 16 }}>
                <View style={{ flex: 1 }}>
                  <MText style={{ fontSize: 7, color: C.muted, fontWeight: 600 }}>
                    {isKo ? "TAM 추정" : "TAM"}
                  </MText>
                  {(() => {
                    // Short ≤50-char figures keep the 12pt bold headline
                    // treatment. Anything longer (Tavily-grounded prose)
                    // renders in the same 9pt body style as the sibling
                    // growthTrend / addressableSegment columns so the
                    // three sit visually balanced as a unified row.
                    const len = mp.marketSize.estimateUsd!.length;
                    const isShort = len <= 50;
                    return (
                      <MText
                        style={{
                          fontSize: isShort ? 12 : 9,
                          color: isShort ? C.ink : C.body,
                          fontWeight: isShort ? 700 : 400,
                          marginTop: 2,
                          lineHeight: 1.5,
                        }}
                      >
                        {mp.marketSize.estimateUsd}
                      </MText>
                    );
                  })()}
                </View>
                {mp.marketSize.growthTrend && (
                  <View style={{ flex: 1 }}>
                    <MText style={{ fontSize: 7, color: C.muted, fontWeight: 600 }}>
                      {isKo ? "성장 추세" : "Growth trend"}
                    </MText>
                    <MText style={{ fontSize: 9, color: C.body, marginTop: 2, lineHeight: 1.5 }}>
                      {mp.marketSize.growthTrend}
                    </MText>
                  </View>
                )}
                {mp.marketSize.addressableSegment && (
                  <View style={{ flex: 1 }}>
                    <MText style={{ fontSize: 7, color: C.muted, fontWeight: 600 }}>
                      {isKo ? "도달 세그먼트" : "Addressable"}
                    </MText>
                    <MText style={{ fontSize: 9, color: C.body, marginTop: 2, lineHeight: 1.5 }}>
                      {mp.marketSize.addressableSegment}
                    </MText>
                  </View>
                )}
              </View>
              {(mp.marketSize.citations?.length ?? 0) > 0 ? (
                <View style={{ marginTop: 6, gap: 2 }}>
                  <MText style={{ fontSize: 7, color: C.muted, fontWeight: 600 }}>
                    {isKo ? "출처" : "Sources"}
                  </MText>
                  {mp.marketSize.citations!.slice(0, 3).map((c, i) => (
                    <Link key={i} src={c.url} style={{ fontSize: 7, color: C.brand, textDecoration: "none" }}>
                      {`${i + 1}. ${c.title.length > 80 ? c.title.slice(0, 80) + "…" : c.title}`}
                    </Link>
                  ))}
                </View>
              ) : (
                <MText style={{ fontSize: 7, color: C.faint, marginTop: 4 }}>
                  {isKo ? "AI 추정 — 외부 시장조사 미검증" : "AI estimate — not externally sourced"}
                </MText>
              )}
            </View>
          </View>
        )}

        {/* Competitors */}
        {competitors.length > 0 && (
          <View style={styles.sectionBlock}>
            <MText style={styles.sectionEyebrow}>
              {isKo ? "경쟁자 분석" : "Competitive landscape"}
            </MText>
            {competitors.map((c, i) => (
              <View
                key={i}
                style={{
                  borderLeftWidth: 3,
                  borderLeftColor: threatColor(c.threatLevel),
                  paddingLeft: 8,
                  paddingVertical: 4,
                  marginBottom: 6,
                  backgroundColor: C.card,
                }}
                wrap={false}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "baseline",
                    gap: 8,
                    marginBottom: 2,
                  }}
                >
                  <MText style={{ fontSize: 12, color: C.ink, fontWeight: 700 }}>
                    {c.name}
                  </MText>
                  <MText style={{ fontSize: 7, color: C.muted, fontWeight: 600 }}>
                    {compTypeLabel(c.type)}
                  </MText>
                  <View
                    style={{
                      backgroundColor: threatColor(c.threatLevel),
                      paddingHorizontal: 5,
                      paddingVertical: 1,
                      borderRadius: 2,
                    }}
                  >
                    <MText style={{ fontSize: 7, color: "#FFFFFF", fontWeight: 700 }}>
                      {isKo
                        ? `위협 ${c.threatLevel === "high" ? "높음" : c.threatLevel === "medium" ? "중" : "낮음"}`
                        : `${c.threatLevel.toUpperCase()} threat`}
                    </MText>
                  </View>
                  {c.pricePoint && (
                    <MText style={{ fontSize: 8, color: C.muted, marginLeft: "auto" }}>
                      {c.pricePoint}
                    </MText>
                  )}
                </View>
                {c.marketShareEstimate && (
                  <MText style={{ fontSize: 8, color: C.muted, marginBottom: 3 }}>
                    {c.marketShareEstimate}
                  </MText>
                )}
                <View style={{ flexDirection: "row", gap: 12 }}>
                  {c.strengths.length > 0 && (
                    <View style={{ flex: 1 }}>
                      <MText style={{ fontSize: 7, color: C.success, fontWeight: 600, marginBottom: 1 }}>
                        {isKo ? "강점" : "Strengths"}
                      </MText>
                      {c.strengths.map((s, idx) => (
                        <MText
                          key={idx}
                          style={{ fontSize: 8, color: C.body, lineHeight: 1.4 }}
                        >
                          {`• ${s}`}
                        </MText>
                      ))}
                    </View>
                  )}
                  {c.weaknesses.length > 0 && (
                    <View style={{ flex: 1 }}>
                      <MText style={{ fontSize: 7, color: C.risk, fontWeight: 600, marginBottom: 1 }}>
                        {isKo ? "약점" : "Weaknesses"}
                      </MText>
                      {c.weaknesses.map((w, idx) => (
                        <MText
                          key={idx}
                          style={{ fontSize: 8, color: C.body, lineHeight: 1.4 }}
                        >
                          {`• ${w}`}
                        </MText>
                      ))}
                    </View>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Pricing benchmarks */}
        {pricing &&
          (pricing.entryLevel || pricing.mid || pricing.premium || pricing.yourPosition) && (
            <View style={styles.sectionBlock}>
              <MText style={styles.sectionEyebrow}>
                {isKo ? "현지 가격 벤치마크" : "Local pricing benchmarks"}
              </MText>
              <View style={{ flexDirection: "row", gap: 6 }}>
                {pricing.entryLevel && (
                  <View
                    style={{
                      flex: 1,
                      backgroundColor: C.card,
                      padding: 8,
                      borderRadius: 3,
                    }}
                  >
                    <MText style={{ fontSize: 7, color: C.muted, fontWeight: 600 }}>
                      {isKo ? "엔트리" : "Entry"}
                    </MText>
                    <MText style={{ fontSize: 10, color: C.ink, fontWeight: 700, marginTop: 2 }}>
                      {pricing.entryLevel}
                    </MText>
                  </View>
                )}
                {pricing.mid && (
                  <View
                    style={{
                      flex: 1,
                      backgroundColor: C.card,
                      padding: 8,
                      borderRadius: 3,
                    }}
                  >
                    <MText style={{ fontSize: 7, color: C.muted, fontWeight: 600 }}>
                      {isKo ? "미드" : "Mid"}
                    </MText>
                    <MText style={{ fontSize: 10, color: C.ink, fontWeight: 700, marginTop: 2 }}>
                      {pricing.mid}
                    </MText>
                  </View>
                )}
                {pricing.premium && (
                  <View
                    style={{
                      flex: 1,
                      backgroundColor: C.card,
                      padding: 8,
                      borderRadius: 3,
                    }}
                  >
                    <MText style={{ fontSize: 7, color: C.muted, fontWeight: 600 }}>
                      {isKo ? "프리미엄" : "Premium"}
                    </MText>
                    <MText style={{ fontSize: 10, color: C.ink, fontWeight: 700, marginTop: 2 }}>
                      {pricing.premium}
                    </MText>
                  </View>
                )}
              </View>
              {pricing.yourPosition && (() => {
                // Anchor price label — see EnsembleView.MarketProfileTab
                // for full explanation. yourPositionPriceCents present
                // on new sims; fall back to user's input base price for
                // legacy data.
                const anchorCents =
                  pricing.yourPositionPriceCents ?? project?.base_price_cents ?? null;
                const anchorLabel = anchorCents != null
                  ? formatPrice(anchorCents, project?.currency ?? undefined)
                  : null;
                return (
                  <View
                    style={{
                      marginTop: 6,
                      padding: 8,
                      backgroundColor: "#EFF6FF",
                      borderLeftWidth: 2,
                      borderLeftColor: C.brand,
                      borderRadius: 3,
                    }}
                  >
                    <MText style={{ fontSize: 7, color: C.brand, fontWeight: 700, marginBottom: 2 }}>
                      {isKo
                        ? anchorLabel
                          ? `${anchorLabel} 기준 포지션`
                          : "포지션"
                        : anchorLabel
                          ? `Position at ${anchorLabel}`
                          : "Price position"}
                    </MText>
                    <MText style={{ fontSize: 9, color: C.body, lineHeight: 1.5 }}>
                      {pricing.yourPosition}
                    </MText>
                  </View>
                );
              })()}
            </View>
          )}

        {/* Channels */}
        {channels &&
          ((channels.primary?.length ?? 0) > 0 ||
            (channels.secondary?.length ?? 0) > 0 ||
            (channels.emerging?.length ?? 0) > 0) && (
            <View style={styles.sectionBlock}>
              <MText style={styles.sectionEyebrow}>
                {isKo ? "채널 환경" : "Channel landscape"}
              </MText>
              {(["primary", "secondary", "emerging"] as const).map((tier) => {
                const items = channels[tier] ?? [];
                if (items.length === 0) return null;
                const tierLabel =
                  tier === "primary"
                    ? isKo ? "1차 (필수)" : "Primary (must-have)"
                    : tier === "secondary"
                      ? isKo ? "2차 (확장)" : "Secondary (expand)"
                      : isKo ? "신흥 (실험)" : "Emerging (test)";
                return (
                  <View key={tier} style={{ marginBottom: 4 }}>
                    <MText style={{ fontSize: 8, color: C.muted, fontWeight: 600, marginBottom: 2 }}>
                      {tierLabel}
                    </MText>
                    {items.map((item, idx) => (
                      <Text
                        key={idx}
                        style={{ fontSize: 9, color: C.body, lineHeight: 1.4, marginLeft: 6, fontFamily: "AppFont" }}
                      >
                        {"• "}
                        <Text style={{ fontWeight: 600 }}>{item.name}</Text>
                        {item.rationale ? ` — ${item.rationale}` : ""}
                      </Text>
                    ))}
                  </View>
                );
              })}
            </View>
          )}

        {/* Regulatory */}
        {reg && ((reg.barriers?.length ?? 0) > 0 || (reg.requirements?.length ?? 0) > 0) && (
          <View style={styles.sectionBlock}>
            <MText style={styles.sectionEyebrow}>
              {isKo ? "규제 / 진입 장벽" : "Regulatory / entry barriers"}
            </MText>
            {(reg.barriers ?? []).map((b, i) => (
              <View
                key={i}
                style={{
                  flexDirection: "row",
                  marginBottom: 3,
                  gap: 6,
                }}
                wrap={false}
              >
                <View
                  style={{
                    backgroundColor: sevColor(b.severity),
                    paddingHorizontal: 4,
                    paddingVertical: 1,
                    borderRadius: 2,
                    width: 36,
                    alignItems: "center",
                  }}
                >
                  <MText style={{ fontSize: 7, color: "#FFFFFF", fontWeight: 700 }}>
                    {b.severity.toUpperCase()}
                  </MText>
                </View>
                <View style={{ flex: 1 }}>
                  <MText style={{ fontSize: 9, color: C.ink, fontWeight: 600 }}>
                    {b.name}
                  </MText>
                  {b.description && (
                    <MText style={{ fontSize: 8, color: C.body, lineHeight: 1.4, marginTop: 1 }}>
                      {b.description}
                    </MText>
                  )}
                </View>
              </View>
            ))}
            {reg.timeToCompliance && (
              <MText style={{ fontSize: 8, color: C.muted, marginTop: 4 }}>
                {`${isKo ? "준수 소요시간: " : "Time to compliance: "}${reg.timeToCompliance}`}
              </MText>
            )}
          </View>
        )}

        {/* Cultural notes */}
        {cult &&
          (cult.valuesAlignment ||
            cult.purchaseBehavior ||
            cult.languageNotes ||
            cult.seasonality) && (
            <View style={styles.sectionBlock}>
              <MText style={styles.sectionEyebrow}>
                {isKo ? "문화 / 소비자 인사이트" : "Cultural & consumer insights"}
              </MText>
              {cult.valuesAlignment && (
                <View style={{ marginBottom: 4 }}>
                  <MText style={{ fontSize: 7, color: C.muted, fontWeight: 600 }}>
                    {isKo ? "가치관" : "Values"}
                  </MText>
                  <MText style={{ fontSize: 9, color: C.body, lineHeight: 1.5 }}>
                    {cult.valuesAlignment}
                  </MText>
                </View>
              )}
              {cult.purchaseBehavior && (
                <View style={{ marginBottom: 4 }}>
                  <MText style={{ fontSize: 7, color: C.muted, fontWeight: 600 }}>
                    {isKo ? "구매 행동" : "Purchase behavior"}
                  </MText>
                  <MText style={{ fontSize: 9, color: C.body, lineHeight: 1.5 }}>
                    {cult.purchaseBehavior}
                  </MText>
                </View>
              )}
              {cult.languageNotes && (
                <View style={{ marginBottom: 4 }}>
                  <MText style={{ fontSize: 7, color: C.muted, fontWeight: 600 }}>
                    {isKo ? "언어 / 네이밍" : "Language / naming"}
                  </MText>
                  <MText style={{ fontSize: 9, color: C.body, lineHeight: 1.5 }}>
                    {cult.languageNotes}
                  </MText>
                </View>
              )}
              {cult.seasonality && (
                <View>
                  <MText style={{ fontSize: 7, color: C.muted, fontWeight: 600 }}>
                    {isKo ? "시즌성" : "Seasonality"}
                  </MText>
                  <MText style={{ fontSize: 9, color: C.body, lineHeight: 1.5 }}>
                    {cult.seasonality}
                  </MText>
                </View>
              )}
            </View>
          )}

        {/* GTM strategy */}
        {gtm &&
          (gtm.keyMessage ||
            gtm.primaryAudience ||
            (gtm.differentiators?.length ?? 0) > 0 ||
            (gtm.risks?.length ?? 0) > 0) && (
            <View
              style={{
                marginTop: 8,
                padding: 12,
                backgroundColor: "#F0FDF4",
                borderTopWidth: 3,
                borderTopColor: C.success,
                borderRadius: 4,
              }}
              wrap={false}
            >
              <MText style={[styles.sectionEyebrow, { color: C.success, marginBottom: 6 }]}>
                {isKo ? "GTM 전략 요약" : "GTM strategy summary"}
              </MText>
              {gtm.keyMessage && (
                <View style={{ marginBottom: 6 }}>
                  <MText style={{ fontSize: 7, color: C.muted, fontWeight: 600 }}>
                    {isKo ? "핵심 메시지" : "Key message"}
                  </MText>
                  <MText style={{ fontSize: 10, color: C.ink, fontWeight: 600, lineHeight: 1.5 }}>
                    {gtm.keyMessage}
                  </MText>
                </View>
              )}
              {gtm.primaryAudience && (
                <View style={{ marginBottom: 6 }}>
                  <MText style={{ fontSize: 7, color: C.muted, fontWeight: 600 }}>
                    {isKo ? "1차 타겟 (ICP)" : "Primary audience (ICP)"}
                  </MText>
                  <MText style={{ fontSize: 9, color: C.body, lineHeight: 1.5 }}>
                    {gtm.primaryAudience}
                  </MText>
                </View>
              )}
              {(gtm.differentiators?.length ?? 0) > 0 && (
                <View style={{ marginBottom: 6 }}>
                  <MText style={{ fontSize: 7, color: C.muted, fontWeight: 600, marginBottom: 2 }}>
                    {isKo ? "차별화 요소" : "Differentiators"}
                  </MText>
                  {(gtm.differentiators ?? []).map((d, i) => (
                    <MText key={i} style={{ fontSize: 9, color: C.body, lineHeight: 1.4 }}>
                      {`✓ ${d}`}
                    </MText>
                  ))}
                </View>
              )}
              {(gtm.risks?.length ?? 0) > 0 && (
                <View>
                  <MText style={{ fontSize: 7, color: C.risk, fontWeight: 600, marginBottom: 2 }}>
                    {isKo ? "주요 시장 진입 리스크" : "Market-entry risks"}
                  </MText>
                  {(gtm.risks ?? []).map((r, i) => (
                    <MText key={i} style={{ fontSize: 9, color: C.body, lineHeight: 1.4 }}>
                      {`⚠ ${r}`}
                    </MText>
                  ))}
                </View>
              )}
            </View>
          )}

        {pageFooter}
      </Page>
    );
  };

  const renderCountryDecisionMatrixPage = () => {
    if (!tierBudget.showCountryDecisionMatrix) return null;
    const stats = aggregate.countryStats.slice(0, 10);
    if (stats.length === 0) return null;

    // Per-country verdict logic. Final score thresholds are
    // intentionally conservative — "GO" requires meaningful confidence,
    // not just being the best of a bad bunch.
    const perCountryVerdict = (
      finalMean: number,
      regulatory: number | null,
    ): { label: { ko: string; en: string }; tone: string } => {
      if (regulatory != null && regulatory < 30) {
        return {
          label: { ko: "NO-GO (규제)", en: "NO-GO (regulatory)" },
          tone: C.risk,
        };
      }
      if (finalMean >= 70)
        return { label: { ko: "GO", en: "GO" }, tone: C.success };
      if (finalMean >= 55)
        return { label: { ko: "주의", en: "CAUTION" }, tone: C.warn };
      return { label: { ko: "NO-GO", en: "NO-GO" }, tone: C.risk };
    };

    return (
      <Page size="A4" style={styles.page}>
        {pageHeader}
        <MText style={styles.pageTitle}>
          {isKo ? "국가 의사결정 매트릭스" : "Country decision matrix"}
        </MText>
        <MText style={styles.pageSubtitle}>
          {isKo
            ? "후보 국가 전체를 한 표에. 점수 · 채널 · 규제 · 최대 블로커 · 진출 권장도까지 — 시장 간 직접 비교."
            : "All candidate markets in one table. Score · channel · regulatory · top blocker · go-rating — direct cross-market comparison."}
        </MText>

        <View
          style={{
            flexDirection: "row",
            paddingHorizontal: 4,
            paddingBottom: 4,
            borderBottomWidth: 1,
            borderBottomColor: C.divider,
          }}
        >
          <MText style={{ fontSize: 7, color: C.muted, fontWeight: 700, width: 36 }}>
            {isKo ? "국가" : "Country"}
          </MText>
          <MText
            style={{ fontSize: 7, color: C.muted, fontWeight: 700, width: 40, textAlign: "right" }}
          >
            {isKo ? "점수" : "Score"}
          </MText>
          <MText
            style={{ fontSize: 7, color: C.muted, fontWeight: 700, width: 40, textAlign: "right" }}
          >
            {isKo ? "채널" : "Channel"}
          </MText>
          <MText
            style={{ fontSize: 7, color: C.muted, fontWeight: 700, width: 40, textAlign: "right" }}
          >
            {isKo ? "규제" : "Reg."}
          </MText>
          <MText style={{ fontSize: 7, color: C.muted, fontWeight: 700, flex: 1, paddingLeft: 6 }}>
            {isKo ? "최대 블로커" : "Top blocker"}
          </MText>
          <MText
            style={{ fontSize: 7, color: C.muted, fontWeight: 700, width: 70, textAlign: "right" }}
          >
            {isKo ? "판정" : "Verdict"}
          </MText>
        </View>

        {stats.map((c) => {
          const final = c.finalScore.mean;
          const channel = c.components?.channelMatch.mean ?? null;
          const reg = c.components?.regulatory.mean ?? null;
          const topBlocker = pickMarketBlocker(c.detail?.topObjections);
          const verdict = perCountryVerdict(final, reg);
          const verdictLabel = isKo ? verdict.label.ko : verdict.label.en;

          const numTone = (n: number | null) =>
            n == null ? C.muted : n >= 65 ? C.success : n >= 50 ? C.warn : C.risk;

          return (
            <View
              key={c.country}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: 6,
                borderBottomWidth: 0.5,
                borderBottomColor: C.divider,
              }}
              wrap={false}
            >
              <MText style={{ fontSize: 10, color: C.ink, fontWeight: 700, width: 36 }}>
                {c.country}
              </MText>
              <MText
                style={{
                  fontSize: 10,
                  color: numTone(final),
                  fontWeight: 700,
                  width: 40,
                  textAlign: "right",
                }}
              >
                {final.toFixed(0)}
              </MText>
              <MText
                style={{
                  fontSize: 9,
                  color: numTone(channel),
                  width: 40,
                  textAlign: "right",
                }}
              >
                {channel != null ? channel.toFixed(0) : "—"}
              </MText>
              <MText
                style={{
                  fontSize: 9,
                  color: numTone(reg),
                  width: 40,
                  textAlign: "right",
                }}
              >
                {reg != null ? reg.toFixed(0) : "—"}
              </MText>
              <MText
                style={{
                  fontSize: 8,
                  color: C.body,
                  flex: 1,
                  paddingLeft: 6,
                  lineHeight: 1.4,
                }}
              >
                {topBlocker.length > 65 ? topBlocker.slice(0, 64) + "…" : topBlocker}
              </MText>
              <View
                style={{
                  backgroundColor: verdict.tone,
                  paddingHorizontal: 6,
                  paddingVertical: 2,
                  borderRadius: 3,
                  width: 70,
                  alignItems: "center",
                }}
              >
                <MText style={{ fontSize: 8, color: "#FFFFFF", fontWeight: 700 }}>
                  {verdictLabel}
                </MText>
              </View>
            </View>
          );
        })}

        <MText style={{ fontSize: 7, color: C.muted, marginTop: 8, lineHeight: 1.5 }}>
          {isKo
            ? "메타: 점수 / 채널 / 규제 모두 0-100 (높을수록 좋음). 규제 30 미만은 launch-blocker로 자동 NO-GO. 판정은 finalScore + 규제 종합 — 70+ GO / 55-69 주의 / 그 외 NO-GO."
            : "Meta: score/channel/regulatory all 0-100 (higher = better). Regulatory <30 auto-flags NO-GO. Verdict combines finalScore + regulatory — 70+ GO / 55-69 CAUTION / else NO-GO."}
        </MText>

        {pageFooter}
      </Page>
    );
  };

  /**
   * 30 / 60 / 90 day execution timeline — recommended actions sorted
   * onto a phased roadmap. Effort 1 (days) → Phase 1 foundation,
   * effort 2 (weeks) → Phase 2 validation, effort 3 (months) → Phase 3
   * scale. Within each phase, sorted by impact descending.
   *
   * Concrete answer to "what do I do Monday morning?".
   */
  const renderExecutionTimelinePage = () => {
    if (!tierBudget.showExecutionTimeline) return null;
    const actions = aggregate.narrative?.mergedActions ?? [];
    if (actions.length === 0) return null;

    type Phase = { id: 1 | 2 | 3; label: { ko: string; en: string }; period: string; tone: string };
    const phases: Phase[] = [
      {
        id: 1,
        label: { ko: "Phase 1 — 기반 구축", en: "Phase 1 — Foundation" },
        period: "0-30",
        tone: C.success,
      },
      {
        id: 2,
        label: { ko: "Phase 2 — 검증", en: "Phase 2 — Validation" },
        period: "30-60",
        tone: C.brand,
      },
      {
        id: 3,
        label: { ko: "Phase 3 — 확장", en: "Phase 3 — Scale" },
        period: "60-90+",
        tone: C.warn,
      },
    ];

    // Group actions by effort score. The LLM is supposed to set this
    // 1/2/3 per the merge prompt, but in practice it often defaults
    // most actions to effort=2 — leaving Phase 1 and Phase 3 empty.
    // Detect that imbalance and fall back to a leverage-balanced
    // 1/3 split. Honest signal beats lazy LLM defaults.
    const byEffort: Record<1 | 2 | 3, typeof actions> = { 1: [], 2: [], 3: [] };
    for (const a of actions) {
      const e = (a.effort ?? 2) as 1 | 2 | 3;
      byEffort[e].push(a);
    }

    // "Imbalanced" = at least one phase empty AND we have ≥3 actions
    // (otherwise an empty phase is genuine, not a labelling bug).
    const emptyCount =
      (byEffort[1].length === 0 ? 1 : 0) +
      (byEffort[2].length === 0 ? 1 : 0) +
      (byEffort[3].length === 0 ? 1 : 0);
    const useFallback = actions.length >= 3 && emptyCount >= 1;

    let grouped: Record<1 | 2 | 3, typeof actions>;
    if (useFallback) {
      // Leverage = impact × 10 − effort. High-impact + low-effort
      // (Quick Win) lands at top; high-impact + high-effort
      // (Strategic) lands middle-to-late; low-impact lands later.
      const sorted = [...actions].sort((a, b) => {
        const aL = (a.impact ?? 2) * 10 - (a.effort ?? 2);
        const bL = (b.impact ?? 2) * 10 - (b.effort ?? 2);
        return bL - aL;
      });
      const n = sorted.length;
      const p1End = Math.max(1, Math.ceil(n / 3));
      const p2End = Math.max(p1End + 1, Math.ceil((n * 2) / 3));
      grouped = {
        1: sorted.slice(0, p1End),
        2: sorted.slice(p1End, p2End),
        3: sorted.slice(p2End),
      };
      // Honour explicit effort=3 markers — if the LLM DID flag a
      // months-long action, keep it in Phase 3 even if the leverage
      // sort would have placed it earlier.
      for (const id of [1, 2] as const) {
        for (let i = grouped[id].length - 1; i >= 0; i--) {
          if (grouped[id][i].effort === 3) {
            grouped[3].push(grouped[id].splice(i, 1)[0]);
          }
        }
      }
    } else {
      grouped = byEffort;
    }

    // Sort each phase by impact desc so the highest-leverage action
    // surfaces first within its phase.
    for (const id of [1, 2, 3] as const) {
      grouped[id].sort((a, b) => (b.impact ?? 2) - (a.impact ?? 2));
    }

    return (
      <Page size="A4" style={styles.page}>
        {pageHeader}
        <MText style={styles.pageTitle}>
          {isKo ? "30 / 60 / 90일 실행 타임라인" : "30 / 60 / 90 execution timeline"}
        </MText>
        <MText style={styles.pageSubtitle}>
          {isKo
            ? "권장 액션을 effort 기준으로 단계별 배치. Phase 1은 출시 후 한 달 내 완료, Phase 2는 검증 마일스톤, Phase 3는 본격 확장."
            : "Recommended actions placed by effort: Phase 1 done in 30d, Phase 2 = validation milestones, Phase 3 = scale."}
        </MText>

        {phases.map((phase) => {
          const items = grouped[phase.id];
          return (
            <View key={phase.id} style={{ marginBottom: 12 }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "baseline",
                  borderBottomWidth: 2,
                  borderBottomColor: phase.tone,
                  paddingBottom: 4,
                  marginBottom: 6,
                }}
              >
                <MText style={{ fontSize: 11, color: phase.tone, fontWeight: 700 }}>
                  {isKo ? phase.label.ko : phase.label.en}
                </MText>
                <MText style={{ fontSize: 9, color: C.muted, marginLeft: 8 }}>
                  {`Day ${phase.period}`}
                </MText>
                <MText style={{ fontSize: 8, color: C.muted, marginLeft: "auto" }}>
                  {isKo ? `${items.length}개 액션` : `${items.length} actions`}
                </MText>
              </View>

              {items.length === 0 ? (
                <MText style={{ fontSize: 8, color: C.muted, marginLeft: 6 }}>
                  {isKo ? "이 단계에 배치된 액션 없음" : "No actions assigned to this phase"}
                </MText>
              ) : (
                items.map((a, i) => {
                  const impactBadge =
                    a.impact === 3
                      ? { tone: C.risk, label: isKo ? "결정적" : "Pivotal" }
                      : a.impact === 1
                        ? { tone: C.muted, label: isKo ? "경미" : "Minor" }
                        : { tone: C.warn, label: isKo ? "중요" : "Material" };
                  return (
                    <View
                      key={i}
                      style={{
                        flexDirection: "row",
                        alignItems: "flex-start",
                        paddingVertical: 4,
                        gap: 8,
                      }}
                      wrap={false}
                    >
                      <View
                        style={{
                          backgroundColor: impactBadge.tone,
                          paddingHorizontal: 4,
                          paddingVertical: 1,
                          borderRadius: 2,
                          width: 50,
                          alignItems: "center",
                        }}
                      >
                        <MText style={{ fontSize: 7, color: "#FFFFFF", fontWeight: 700 }}>
                          {impactBadge.label}
                        </MText>
                      </View>
                      <MText style={{ fontSize: 9, color: C.body, flex: 1, lineHeight: 1.5 }}>
                        {a.action}
                      </MText>
                    </View>
                  );
                })
              )}
            </View>
          );
        })}

        <MText style={{ fontSize: 7, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>
          {useFallback
            ? isKo
              ? "메타: LLM이 모든 액션을 동일한 effort로 분류해 phase 1/3이 비어 있었습니다. 영향력(impact) × 난이도(effort) leverage 기준으로 자동 재분배했습니다 — Quick Win이 phase 1, 장기 strategic이 phase 3로 이동. 액션 텍스트의 명시 일정(예: \"2027년 상반기\")이 phase 표시와 다르면 텍스트를 우선 신뢰하세요."
              : "Meta: the LLM rated all actions with the same effort, leaving Phase 1/3 empty. We auto-redistributed by leverage (impact × low-effort) — Quick Wins to Phase 1, strategic bets to Phase 3. If an action's text mentions an explicit date that contradicts its phase, trust the text."
            : isKo
              ? "메타: 액션이 한 phase에 너무 몰리면 — 모두 effort 1이면 \"빠르지만 임팩트 작은\" 일이 많고, effort 3이면 30일 내 가시 성과 어려움. 전 phase에 골고루 분포되도록 액션 plan 검토 권장."
              : "Meta: too many actions in one phase = imbalance. All effort 1 = lots of fast low-impact work; all effort 3 = no early wins. Review for balanced distribution."}
        </MText>

        {pageFooter}
      </Page>
    );
  };

  const renderRecommendationPage = () => {
    const championQuote = pickQuote(aggregate, {
      country: aggregate.recommendation.country,
      polarity: "positive",
    });
    return (
    <Page size="A4" style={styles.page}>
      {pageHeader}
      <MText style={styles.pageTitle}>{isKo ? "추천 결정" : "Recommendation"}</MText>
      <MText style={styles.pageSubtitle}>
        {isKo
          ? "시뮬 합의 기반 1순위 시장과 전략별 대안입니다."
          : "Consensus-driven primary market and strategy-specific alternatives."}
      </MText>

      {championQuote && (
        <QuoteCallout
          quote={championQuote}
          tone="success"
          isKo={isKo}
          label={
            isKo
              ? `${aggregate.recommendation.country} 챔피언의 목소리`
              : `Voice from ${aggregate.recommendation.country}'s champion`
          }
        />
      )}

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
            // Localised label — older aggregates have seg.labelKo in
            // Korean only. Mirror EnsembleView.segmentLabel for the EN side.
            const segLabelText = isKo
              ? seg.labelKo
              : seg.id === "volume"
                ? "Speed first (HIGHEST DEMAND)"
                : seg.id === "cac"
                  ? "Cost efficient (LOWEST CAC)"
                  : seg.id === "competition"
                    ? "Avoid competition (LOWEST COMPETITION)"
                    : seg.id === "overall"
                      ? "Balanced (HIGHEST FINALSCORE)"
                      : seg.labelKo;
            return (
              <View key={seg.id} style={styles.segCard} wrap={false}>
                <MText style={styles.segLabel}>{segLabelText}</MText>
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
  };

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

  // Per-country drilldown — same shape as the dashboard's expandable
  // country row. Tier-gated so only decision_plus and above print this
  // (the lighter tiers keep the report short). Render as one A4 with
  // top-N country blocks; each block wraps={false} so a single country's
  // section never gets split across pages.
  const renderCountryDetailPage = () => {
    if (!tierBudget.showCountryDetail) return null;
    const detailed = aggregate.countryStats
      .filter((c) => !!c.detail)
      .slice(0, tierBudget.countryDetailLimit);
    if (detailed.length === 0) return null;
    return (
      <Page size="A4" style={styles.page}>
        {pageHeader}
        <MText style={styles.pageTitle}>
          {isKo ? "국가별 디테일" : "Country detail"}
        </MText>
        <MText style={styles.pageSubtitle}>
          {isKo
            ? `상위 ${detailed.length}개 시장의 선정 사유 · 페르소나 요약 · 거부 요인입니다.`
            : `Selection rationale, persona summary, and objections for the top ${detailed.length} markets.`}
        </MText>

        {detailed.map((c) => {
          const d = c.detail;
          if (!d) return null;
          return (
            <View key={c.country} style={styles.sectionBlock} wrap={false}>
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
                <MText style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{c.country}</MText>
                <MText style={{ fontSize: 9, color: C.muted }}>
                  {isKo
                    ? `평균 ${c.finalScore.mean.toFixed(1)} · 중앙값 ${c.finalScore.median.toFixed(1)} · CAC $${c.cacEstimateUsd.median.toFixed(2)}`
                    : `mean ${c.finalScore.mean.toFixed(1)} · median ${c.finalScore.median.toFixed(1)} · CAC $${c.cacEstimateUsd.median.toFixed(2)}`}
                </MText>
              </View>

              {c.components && (
                <View style={{ marginBottom: 8 }}>
                  <MText style={[styles.infoLabel, { marginBottom: 3 }]}>
                    {isKo ? "점수 분해 (왜 이 점수인가)" : "Score decomposition"}
                  </MText>
                  <ComponentBars components={c.components} isKo={isKo} />
                </View>
              )}

              {d.funnel && (
                <View style={{ marginBottom: 8 }}>
                  <MText style={[styles.infoLabel, { marginBottom: 3 }]}>
                    {isKo ? "구매 퍼널 (광고 → 클릭 → 구매)" : "Conversion funnel"}
                  </MText>
                  <FunnelBars funnel={d.funnel} isKo={isKo} />
                </View>
              )}

              {d.rationaleSamples.length > 0 && (
                <View style={{ marginBottom: 8 }}>
                  <MText style={[styles.infoLabel, { marginBottom: 3 }]}>
                    {isKo
                      ? `선정 사유 (시뮬 샘플 ${d.rationaleSamples.length}건)`
                      : `Rationale (${d.rationaleSamples.length} sim samples)`}
                  </MText>
                  <MText
                    style={{ fontSize: 7, color: C.muted, marginBottom: 4, lineHeight: 1.4 }}
                  >
                    {isKo
                      ? "각 sim이 emit한 원문 그대로 — 본문 내 수치(가격·CAC·기간 등)는 해당 sim의 자체 추정치이며 위 헤더의 합산 평균과 차이가 있을 수 있습니다."
                      : "Verbatim from each sim — internal numbers (price / CAC / timelines) reflect that sim's own estimate and may differ from the aggregate above."}
                  </MText>
                  {d.rationaleSamples.map((r, i) => (
                    <MText
                      key={i}
                      style={{
                        fontSize: 9,
                        color: C.body,
                        lineHeight: 1.5,
                        marginBottom: 4,
                        paddingLeft: 8,
                        borderLeft: `1.5pt solid ${C.divider}`,
                      }}
                    >
                      {r}
                    </MText>
                  ))}
                </View>
              )}

              <View style={{ flexDirection: "row", gap: 14 }}>
                <View style={{ flex: 1.4 }}>
                  {d.topObjections.length > 0 && (
                    <View>
                      <MText style={[styles.infoLabel, { marginBottom: 3 }]}>
                        {isKo ? "공통 거부 요인 TOP 5" : "Top objections"}
                      </MText>
                      {d.topObjections.map((o) => {
                        // Count = clustered objection-instances; persona
                        // count = unique-persona denominator. Many
                        // personas emit 2-3 strings each, so the count
                        // can be greater than the persona count
                        // semantically (multiple mentions per persona)
                        // OR less (when each persona only raised it
                        // once). Showing % share of personas makes the
                        // magnitude readable.
                        const sharePct =
                          d.persona.count > 0
                            ? Math.round((o.count / d.persona.count) * 100)
                            : null;
                        return (
                          <View
                            key={o.text}
                            style={{ flexDirection: "row", marginBottom: 2, gap: 6 }}
                          >
                            <MText
                              style={{
                                fontSize: 8,
                                color: C.muted,
                                minWidth: 38,
                                textAlign: "right",
                              }}
                            >
                              {sharePct != null ? `${sharePct}%` : String(o.count)}
                            </MText>
                            <MText style={{ fontSize: 9, color: C.body, flex: 1, lineHeight: 1.45 }}>
                              {o.text}
                            </MText>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <MText style={[styles.infoLabel, { marginBottom: 3 }]}>
                    {isKo ? "이 국가 페르소나 요약" : "Persona summary"}
                  </MText>
                  {d.persona.count === 0 ? (
                    <MText style={styles.tdMuted}>—</MText>
                  ) : (() => {
                    // Share-of-pool context lets the user judge whether
                    // the country sample is "thin" (single-market split
                    // among many candidates) or anomalously low.
                    const totalPersonas = aggregate.effectivePersonas ?? 0;
                    const sharePct =
                      totalPersonas > 0
                        ? ((d.persona.count / totalPersonas) * 100).toFixed(1)
                        : null;
                    const personasValue = sharePct
                      ? `${d.persona.count.toLocaleString()} / ${totalPersonas.toLocaleString()} (${sharePct}%)`
                      : d.persona.count.toLocaleString();
                    // Absolute-demand alarm: high-intent share <5% means
                    // even the recommended market has a very thin
                    // "would actually buy" cohort. Flag explicitly so
                    // the relative ranking doesn't read as endorsement.
                    const highIntentPct =
                      d.persona.count > 0
                        ? (d.persona.highIntent / d.persona.count) * 100
                        : 0;
                    const lowAbsoluteDemand = highIntentPct < 5;
                    return (
                      <View style={{ gap: 2 }}>
                        <SummaryRow
                          label={isKo ? "페르소나 수" : "Personas"}
                          value={personasValue}
                        />
                        <SummaryRow
                          label={isKo ? "평균 구매의향" : "Mean intent"}
                          value={`${d.persona.meanIntent}/100`}
                        />
                        <SummaryRow
                          label={isKo ? "고의향 (≥70)" : "High (≥70)"}
                          value={`${d.persona.highIntent} (${highIntentPct.toFixed(1)}%)`}
                          valueColor={C.success}
                        />
                        <SummaryRow
                          label={isKo ? "저의향 (<35)" : "Low (<35)"}
                          value={String(d.persona.lowIntent)}
                          valueColor={C.risk}
                        />
                        {lowAbsoluteDemand && (
                          <MText
                            style={{
                              fontSize: 7,
                              color: C.risk,
                              marginTop: 4,
                              lineHeight: 1.4,
                            }}
                          >
                            {isKo
                              ? `⚠ 고의향 비율 ${highIntentPct.toFixed(1)}% (5% 미만) — 상대 순위 1위지만 절대 수요 매우 낮음. 진출 결정 전 추가 검증 권장.`
                              : `⚠ High-intent share ${highIntentPct.toFixed(1)}% (<5%) — top-ranked market but absolute demand is thin. Verify before commit.`}
                          </MText>
                        )}
                      </View>
                    );
                  })()}
                </View>
              </View>
            </View>
          );
        })}

        {aggregate.sources && aggregate.sources.length > 0 && (
          <View style={styles.sectionBlock}>
            <MText style={styles.sectionEyebrow}>
              {isKo ? "통계 근거" : "Data sources"}
            </MText>
            <MText style={{ fontSize: 8, color: C.muted, lineHeight: 1.5 }}>
              {aggregate.sources.join(" · ")}
            </MText>
          </View>
        )}

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
          <MText style={[styles.sectionEyebrow, { marginBottom: 6 }]}>
            {isKo ? "구매의향 분포 (히스토그램)" : "Intent distribution"}
          </MText>
          <View style={{ flexDirection: "row", alignItems: "flex-end", height: 90, gap: 4 }}>
            {p.intentHistogram.map((b) => {
              const h = (b.count / histMax) * 100;
              const fill = b.binStart >= 70 ? C.success : b.binStart < 35 ? C.warn : C.brand;
              return (
                <View
                  key={b.binStart}
                  style={{ flex: 1, height: "100%", justifyContent: "flex-end" }}
                >
                  <View
                    style={{
                      width: "100%",
                      height: `${h}%`,
                      backgroundColor: fill,
                      borderTopLeftRadius: 2,
                      borderTopRightRadius: 2,
                    }}
                  />
                </View>
              );
            })}
          </View>
          <View style={{ flexDirection: "row", gap: 4, marginTop: 2 }}>
            {p.intentHistogram.map((b) => (
              <View key={b.binStart} style={{ flex: 1, alignItems: "center" }}>
                <Text style={{ fontSize: 7, color: C.faint }}>{b.binStart}</Text>
              </View>
            ))}
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

        {/* Channel/brand mentions table previously rendered here was a
            verbatim duplicate of the dedicated "Channel priority" page
            (renderChannelPriorityPage) — both pull from
            aggregate.personas.channelMentions and ship together on
            decision_plus+. The dedicated page has a bar visualisation,
            priority framing, and Top 12; keeping that one and dropping
            the inline table avoids the side-by-side duplication the
            user flagged in PDF review. */}

        {tierBudget.showSegments &&
          p.segmentBreakdown &&
          (p.segmentBreakdown.byGender.length > 0 ||
            p.segmentBreakdown.byAge.length > 0 ||
            p.segmentBreakdown.byIncome.length > 0) && (
            <View style={styles.sectionBlock}>
              <MText style={styles.sectionEyebrow}>
                {isKo ? "세그먼트별 구매의향" : "Intent by segment"}
              </MText>
              <View style={{ flexDirection: "row", gap: 10 }}>
                {p.segmentBreakdown.byGender.length > 0 && (
                  <SegmentBlock
                    title={isKo ? "성별" : "Gender"}
                    rows={p.segmentBreakdown.byGender}
                    isKo={isKo}
                  />
                )}
                {p.segmentBreakdown.byAge.length > 0 && (
                  <SegmentBlock
                    title={isKo ? "연령" : "Age"}
                    rows={p.segmentBreakdown.byAge}
                    isKo={isKo}
                  />
                )}
                {p.segmentBreakdown.byIncome.length > 0 && (
                  <SegmentBlock
                    title={isKo ? "소득" : "Income"}
                    rows={[...p.segmentBreakdown.byIncome].sort((a, b) => {
                      const order: Record<string, number> = {
                        "<$30k": 0,
                        "$30-60k": 1,
                        "$60-100k": 2,
                        "$100-150k": 3,
                        "$150k+": 4,
                      };
                      return (order[a.bucket] ?? 99) - (order[b.bucket] ?? 99);
                    })}
                    isKo={isKo}
                  />
                )}
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
    const fmt = (cents: number) => formatPrice(cents, project?.currency);
    const peakPoint = pr.curve.reduce<typeof pr.curve[number] | null>(
      (best, p) =>
        best === null || p.meanConversionProbability > best.meanConversionProbability ? p : best,
      null,
    );
    const maxConv = Math.max(...pr.curve.map((p) => p.meanConversionProbability), 0.0001);
    // Recompute curveRevenueMax at render time using the monotonic-
    // envelope helper. Legacy ensembles persisted a naive-argmax value
    // that picked high-price noise bumps; render-time recompute fixes
    // those without re-aggregating.
    const recomputedCurveMax =
      computeCurveRevenueMaxCents(pr.curve) ?? pr.curveRevenueMaxCents;
    const recComputedMatchesCurve =
      recomputedCurveMax != null && pr.recommendedPriceCents > 0
        ? Math.abs(recomputedCurveMax / pr.recommendedPriceCents - 1) <= 0.1
        : null;
    const wasCorrected =
      recComputedMatchesCurve === false && recomputedCurveMax != null;
    // Negative quote for the pricing callout — must actually mention
    // price/cost vocabulary. pickQuote returns null if no price-content
    // match exists (rather than surfacing an unrelated low-intent voice
    // under a "price-sensitive" label), and the callout simply hides.
    const priceSkepticQuote = pickQuote(aggregate, {
      polarity: "negative",
      filter: isPriceObjectionText,
    });
    return (
      <Page size="A4" style={styles.page}>
        {pageHeader}
        <MText style={styles.pageTitle}>{isKo ? "가격 분석" : "Pricing analysis"}</MText>
        <MText style={styles.pageSubtitle}>
          {isKo
            ? "시뮬 합산 권장 가격, 50% 구간, 전환 곡선을 제공합니다."
            : "Cross-sim recommended price, mid-50% range, and conversion curve."}
        </MText>

        {priceSkepticQuote && (
          <QuoteCallout
            quote={priceSkepticQuote}
            tone="warn"
            isKo={isKo}
            label={isKo ? "가격에 민감한 페르소나" : "A price-sensitive persona"}
          />
        )}

        {/* Auto-corrected headline price — same logic as the dashboard.
            When the LLM-claimed recommendation diverges from the curve's
            revenue-max point, we trust the data and surface the curve
            value as the headline; the LLM number becomes a small
            annotation. */}
        {(() => {
          const headlineCents = wasCorrected
            ? recomputedCurveMax!
            : pr.recommendedPriceCents;
          return (
            <View style={styles.priceHero}>
              <View style={{ flex: 1 }}>
                <MText style={styles.kpiLabel}>
                  {wasCorrected
                    ? isKo
                      ? "권장 가격 (곡선 매출 최대점)"
                      : "Recommended (curve revenue max)"
                    : isKo
                      ? "권장 가격 (중앙값)"
                      : "Recommended"}
                </MText>
                <View style={{ flexDirection: "row", alignItems: "baseline" }}>
                  <MText style={styles.priceBig}>{fmt(headlineCents)}</MText>
                  <MText style={styles.priceMeta}>
                    {(() => {
                      const unanimous = pr.recommendedPriceUnanimousAt;
                      const within = pr.recommendedPriceWithinSimStdMean ?? 0;
                      const noise = within > 0 ? ` · within-sim noise ±${fmt(within)}` : "";
                      const noiseKo = within > 0 ? ` · 시뮬 내부 noise ±${fmt(within)}` : "";
                      // Hypothesis tier (1 sim): no "all sims" framing,
                      // no zero-width mid-50% range — within-sim noise only.
                      if (aggregate.simCount === 1) {
                        return isKo
                          ? `시뮬 내부 noise ${within > 0 ? `±${fmt(within)}` : "0"}`
                          : `Within-sim noise ${within > 0 ? `±${fmt(within)}` : "0"}`;
                      }
                      if (unanimous != null && unanimous > 0) {
                        return isKo
                          ? `${aggregate.simCount}개 시뮬 모두 ${fmt(unanimous)}로 수렴${noiseKo}`
                          : `All ${aggregate.simCount} sims converged on ${fmt(unanimous)}${noise}`;
                      }
                      return isKo
                        ? `중간 50%: ${fmt(pr.recommendedPriceP25)}–${fmt(pr.recommendedPriceP75)}`
                        : `Mid-50%: ${fmt(pr.recommendedPriceP25)}–${fmt(pr.recommendedPriceP75)}`;
                    })()}
                  </MText>
                </View>
                {wasCorrected && (
                  <MText style={{ fontSize: 8, color: C.muted, marginTop: 4, lineHeight: 1.4 }}>
                    {isKo
                      ? `LLM 안내가는 ${fmt(pr.recommendedPriceCents)}였으나 기본가 anchor로 보여 곡선 매출 최대점으로 자동 보정.`
                      : `LLM said ${fmt(pr.recommendedPriceCents)}, but appeared anchored on base — auto-corrected to curve revenue max.`}
                  </MText>
                )}
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
          );
        })()}

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

        {(() => {
          // When auto-correction triggers, recompute sensitivity against
          // the corrected baseline so ±10% scenarios anchor on the
          // headline price the user is reading, not the LLM's stale
          // anchored value.
          const effectiveBaseline = wasCorrected
            ? recomputedCurveMax!
            : pr.recommendedPriceCents;
          const effectiveSensitivity = wasCorrected
            ? computePricingSensitivity(pr.curve, effectiveBaseline)
            : pr.sensitivity;
          if (!effectiveSensitivity) return null;
          return (
            <View style={styles.sectionBlock}>
              <MText style={styles.sectionEyebrow}>
                {isKo ? "가격 민감도 매트릭스" : "Pricing sensitivity matrix"}
              </MText>
              <PricingSensitivityBlock
                sensitivity={effectiveSensitivity}
                recommendedPriceCents={effectiveBaseline}
                currency={project?.currency ?? undefined}
                isKo={isKo}
              />
            </View>
          );
        })()}

        {pr.marginEstimate && pr.marginEstimate !== "—" && !wasCorrected && (
          <View style={styles.sectionBlock}>
            <MText style={styles.sectionEyebrow}>{isKo ? "예상 마진 분석" : "Margin analysis"}</MText>
            <View style={styles.summaryBox}>
              <MText style={{ fontSize: 10, color: C.body, lineHeight: 1.6 }}>
                {pr.marginEstimate}
              </MText>
            </View>
          </View>
        )}

        {wasCorrected && pr.marginEstimate && (
          <View style={styles.sectionBlock}>
            <MText style={styles.sectionEyebrow}>{isKo ? "예상 마진 분석" : "Margin analysis"}</MText>
            <View
              style={{
                backgroundColor: "#F1F5F9",
                padding: 10,
                borderLeftWidth: 2,
                borderLeftColor: C.muted,
                borderRadius: 4,
              }}
            >
              <MText style={{ fontSize: 9, color: C.muted, lineHeight: 1.5 }}>
                {isKo
                  ? `LLM 마진 분석은 기본가(${fmt(pr.recommendedPriceCents)}) anchor 가정 하에 작성되어 보정된 권장가(${fmt(recomputedCurveMax!)})와 모순됩니다. 보정된 권장가 기준 마진 분석은 새 시뮬에서 LLM이 anchor를 벗어나야 신뢰 가능 — 현재 분석은 표시 생략.`
                  : `The LLM margin analysis was written assuming the base price (${fmt(pr.recommendedPriceCents)}) was optimal, contradicting the auto-corrected recommended price (${fmt(recomputedCurveMax!)}). Skipped here; a margin analysis grounded in the corrected price requires a fresh sim with the LLM not anchored on base.`}
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
    const skepticQuote = pickQuote(aggregate, { polarity: "negative" });
    return (
      <Page size="A4" style={styles.page}>
        {pageHeader}
        <MText style={styles.pageTitle}>{isKo ? "주요 리스크" : "Key risks"}</MText>
        <MText style={styles.pageSubtitle}>
          {isKo
            ? `${aggregate.simCount}개 시뮬에서 자주 등장한 리스크를 통합한 결과 — 종합 리스크 수준: ${riskLevelLabel(aggregate.narrative.overallRiskLevel, true)}.`
            : `Risks dedup'd across ${aggregate.simCount} sims — overall: ${riskLevelLabel(aggregate.narrative.overallRiskLevel, false)}.`}
        </MText>

        {skepticQuote && (
          <QuoteCallout
            quote={skepticQuote}
            tone="warn"
            isKo={isKo}
            label={isKo ? "회의론자가 본 것" : "What a skeptic flagged"}
          />
        )}

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
    // Champion quote with offset 1 so we don't reuse the same quote
    // that's already on the recommendation page. Falls back to overall
    // top if no second-best is available.
    const motivationQuote =
      pickQuote(aggregate, {
        country: aggregate.recommendation.country,
        polarity: "positive",
        offset: 1,
      }) ?? pickQuote(aggregate, { polarity: "positive", offset: 1 });
    return (
      <Page size="A4" style={styles.page}>
        {pageHeader}
        <MText style={styles.pageTitle}>{isKo ? "권장 액션" : "Recommended actions"}</MText>
        <MText style={styles.pageSubtitle}>
          {isKo
            ? `시뮬 합의 기반 우선순위 액션 플랜입니다.`
            : `Cross-sim consensus action plan, in priority order.`}
        </MText>

        {motivationQuote && (
          <QuoteCallout
            quote={motivationQuote}
            tone="success"
            isKo={isKo}
            label={isKo ? "이 액션을 끌어낸 한 마디" : "What pushed these actions"}
          />
        )}

        <View>
          {actions.map((a, i) => {
            // Concreteness label — surfaced inline so PDF readers see
            // what the dashboard sees. Tone matches the badge (≥75
            // green, ≥50 amber, <50 red); ≥75 hides the missing-list
            // because everything is present.
            const spec = a.specificity;
            const specColor = spec
              ? spec.score >= 75
                ? C.success
                : spec.score >= 50
                  ? C.warn
                  : C.risk
              : null;
            const specLabel = spec
              ? spec.score >= 75
                ? isKo
                  ? "구체적"
                  : "Concrete"
                : spec.score >= 50
                  ? isKo
                    ? "부분"
                    : "Partial"
                  : isKo
                    ? "추상적"
                    : "Vague"
              : null;
            return (
              <View key={i} style={styles.actionRow} wrap={false}>
                <MText style={styles.actionText}>{`${i + 1}. ${a.action}`}</MText>
                <View style={{ flexDirection: "row", gap: 6, alignItems: "center", marginTop: 2 }}>
                  <MText style={styles.actionMeta}>
                    {isKo
                      ? `${a.surfacedInSims}개 시뮬에서 권장`
                      : `Recommended by ${a.surfacedInSims} sim${a.surfacedInSims === 1 ? "" : "s"}`}
                  </MText>
                  {spec && specColor && specLabel && (
                    <MText
                      style={{
                        fontSize: 8,
                        color: specColor,
                        fontWeight: 600,
                      }}
                    >
                      {`· ${specLabel} ${spec.score}`}
                    </MText>
                  )}
                </View>
              </View>
            );
          })}
        </View>

        {pageFooter}
      </Page>
    );
  };

  // ────────────────────────────────────────────────────────────────────
  // "Wow factor" pages — only included in the detailed variant. Each one
  // expands a slice of the aggregate that the regular pages only graze.
  // Designed to give a reader the "I didn't know we had this data"
  // reaction. All gracefully render nothing when their underlying field
  // is missing (legacy aggregates).
  // ────────────────────────────────────────────────────────────────────

  /**
   * Income × Intent heatmap — segmentBreakdown.byIncome rendered as a
   * row-per-income bar with the segment's mean intent + which country
   * that income segment most often targets. Surfaces "buyers in $X bracket
   * gravitate toward Y country" — a price-positioning insight you can't
   * get from the headline.
   */
  const renderIncomeIntentPage = () => {
    if (!tierBudget.showIncomeIntent) return null;
    const rowsRaw = aggregate.personas?.segmentBreakdown?.byIncome ?? [];
    if (rowsRaw.length === 0) return null;
    const incomeOrder: Record<string, number> = {
      "<$30k": 0,
      "$30-60k": 1,
      "$60-100k": 2,
      "$100-150k": 3,
      "$150k+": 4,
    };
    const rows = [...rowsRaw].sort(
      (a, b) => (incomeOrder[a.bucket] ?? 99) - (incomeOrder[b.bucket] ?? 99),
    );
    return (
      <Page size="A4" style={styles.page}>
        {pageHeader}
        <MText style={styles.pageTitle}>
          {isKo ? "소득대 × 구매의향 매트릭스" : "Income × intent matrix"}
        </MText>
        <MText style={styles.pageSubtitle}>
          {isKo
            ? "소득대별 평균 구매의향과 그 세그먼트가 가장 많이 선택한 시장. 가격 포지셔닝 결정에 직접 사용."
            : "Mean purchase intent per income bracket and the country each bracket most often chooses. Drives price positioning."}
        </MText>

        <View style={styles.sectionBlock}>
          {rows.map((r) => {
            const tone =
              r.meanIntent >= 65 ? C.success : r.meanIntent >= 50 ? C.warn : C.risk;
            return (
              <View
                key={r.bucket}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  paddingVertical: 6,
                  borderBottomWidth: 0.5,
                  borderBottomColor: C.divider,
                }}
                wrap={false}
              >
                <MText style={{ fontSize: 10, color: C.ink, fontWeight: 600, width: 110 }}>
                  {r.bucket}
                </MText>
                <View style={{ flex: 1, height: 10, backgroundColor: C.divider, borderRadius: 5 }}>
                  <View
                    style={{
                      width: `${Math.max(0, Math.min(100, r.meanIntent))}%`,
                      height: 10,
                      backgroundColor: tone,
                      borderRadius: 5,
                    }}
                  />
                </View>
                <MText style={{ fontSize: 9, color: C.ink, width: 60, textAlign: "right" }}>
                  {`${r.meanIntent}/100`}
                </MText>
                <MText style={{ fontSize: 8, color: C.muted, width: 80 }}>
                  {`n=${r.count}`}
                </MText>
                <MText style={{ fontSize: 8, color: C.muted, width: 100 }}>
                  {isKo
                    ? `→ ${r.topCountry} (${r.topCountryShare}%)`
                    : `→ ${r.topCountry} (${r.topCountryShare}%)`}
                </MText>
              </View>
            );
          })}
        </View>

        <MText style={{ fontSize: 8, color: C.muted, marginTop: 8, lineHeight: 1.5 }}>
          {isKo
            ? "메타: 막대 색상은 의향 임계점입니다. 65+ 강 / 50-64 보통 / 50 미만 약. \"→ 국가\"는 그 소득대 페르소나가 가장 많이 #1로 꼽은 시장."
            : "Bar tone: 65+ strong / 50-64 moderate / <50 weak. \"→ country\" = the market this income bracket most often picks as #1."}
        </MText>

        {/* Analysis commentary — deterministic interpretation of the
            table above. Surfaces the trend, the champion segment, the
            country-shift insight, and a strategic headline. */}
        {(() => {
          const analysis = analyzeIncomeIntent(rows, isKo ? "ko" : "en");
          if (analysis.bullets.length === 0) return null;
          const headlineColor =
            analysis.tone === "success"
              ? C.success
              : analysis.tone === "warn"
                ? C.warn
                : analysis.tone === "risk"
                  ? C.risk
                  : C.brand;
          return (
            <View style={[styles.sectionBlock, { marginTop: 12 }]} wrap={false}>
              <MText style={[styles.sectionEyebrow, { marginBottom: 4 }]}>
                {isKo ? "분석 해석" : "Analysis"}
              </MText>
              <View
                style={{
                  borderLeftWidth: 3,
                  borderLeftColor: headlineColor,
                  paddingLeft: 10,
                  paddingVertical: 6,
                  marginBottom: 8,
                }}
              >
                <MText
                  style={{
                    fontSize: 10,
                    color: C.ink,
                    fontWeight: 700,
                    lineHeight: 1.5,
                  }}
                >
                  {analysis.headline}
                </MText>
              </View>
              {analysis.bullets.map((b, i) => (
                <View
                  key={i}
                  style={{ flexDirection: "row", gap: 6, marginBottom: 4 }}
                  wrap={false}
                >
                  <MText style={{ fontSize: 9, color: C.muted, width: 12 }}>
                    {`${i + 1}.`}
                  </MText>
                  <MText
                    style={{ fontSize: 9, color: C.body, flex: 1, lineHeight: 1.5 }}
                  >
                    {b}
                  </MText>
                </View>
              ))}
            </View>
          );
        })()}

        {pageFooter}
      </Page>
    );
  };

  /**
   * Profession ranking — top 10 professions with mean intent.
   * Surfaces direction-of-fit for ad targeting and ICP refinement.
   * Each row colour-coded by intent so the eye lands on champions
   * vs skeptics quickly.
   */
  const renderProfessionRankingPage = () => {
    if (!tierBudget.showProfessionRanking) return null;
    const rows = (aggregate.personas?.professionTopN ?? []).filter(
      (r) => typeof r.meanIntent === "number",
    );
    if (rows.length === 0) return null;
    // Re-sort by mean intent descending so champions land at the top.
    // The aggregator sorts by count for the dashboard table; for the
    // PDF we want "who LOVES this product" up top.
    const sorted = [...rows].sort((a, b) => (b.meanIntent ?? 0) - (a.meanIntent ?? 0));
    const overallMean = aggregate.personas?.intentMean ?? 0;
    return (
      <Page size="A4" style={styles.page}>
        {pageHeader}
        <MText style={styles.pageTitle}>
          {isKo ? "직업별 구매의향 랭킹" : "Intent by profession"}
        </MText>
        <MText style={styles.pageSubtitle}>
          {isKo
            ? `어떤 직업군이 이 제품을 가장 좋아하고 가장 회의적인지. 전체 평균 ${overallMean.toFixed(1)}/100 대비 위/아래 표시.`
            : `Which jobs love this product, which doubt it. Bar tone marks variance vs the overall mean (${overallMean.toFixed(1)}).`}
        </MText>

        <View style={styles.sectionBlock}>
          {sorted.map((r) => {
            const intent = r.meanIntent ?? 0;
            const delta = intent - overallMean;
            const tone = intent >= 65 ? C.success : intent >= 50 ? C.warn : C.risk;
            return (
              <View
                key={r.profession}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  paddingVertical: 5,
                  borderBottomWidth: 0.5,
                  borderBottomColor: C.divider,
                }}
                wrap={false}
              >
                <MText style={{ fontSize: 9, color: C.ink, width: 150 }}>
                  {r.profession}
                </MText>
                <MText style={{ fontSize: 8, color: C.muted, width: 36, textAlign: "right" }}>
                  {`n=${r.count}`}
                </MText>
                <View style={{ flex: 1, height: 8, backgroundColor: C.divider, borderRadius: 4 }}>
                  <View
                    style={{
                      width: `${Math.max(0, Math.min(100, intent))}%`,
                      height: 8,
                      backgroundColor: tone,
                      borderRadius: 4,
                    }}
                  />
                </View>
                <MText style={{ fontSize: 9, color: C.ink, width: 36, textAlign: "right" }}>
                  {`${intent}`}
                </MText>
                <MText
                  style={{
                    fontSize: 8,
                    color: delta > 0 ? C.success : delta < 0 ? C.risk : C.muted,
                    width: 50,
                    textAlign: "right",
                    fontWeight: 600,
                  }}
                >
                  {`${delta > 0 ? "+" : ""}${delta.toFixed(1)}`}
                </MText>
              </View>
            );
          })}
        </View>

        <MText style={{ fontSize: 8, color: C.muted, marginTop: 8, lineHeight: 1.5 }}>
          {isKo
            ? "메타: 마지막 컬럼은 전체 평균 대비 편차 (+면 챔피언, −면 회의자). 페이드 광고 타겟팅 / ICP 정의에 활용하세요."
            : "Final column = delta vs overall mean (+ champion, − skeptic). Use for paid-ads targeting and ICP refinement."}
        </MText>

        {pageFooter}
      </Page>
    );
  };

  /**
   * Channel mention priority — extracted brand/channel names from
   * persona free-text, ranked by mention count. Each row has the mean
   * intent of personas who mentioned it: high mention + high intent =
   * launch-priority touchpoint. This is the page that answers
   * "where should we actually plant our flag first?".
   */
  const renderChannelPriorityPage = () => {
    if (!tierBudget.showChannelPriority) return null;
    const rows = aggregate.personas?.channelMentions ?? [];
    if (rows.length === 0) return null;
    // Tier-trim to the top 12 to keep the page readable; channels with
    // <2 mentions are noise for a channel-priority recommendation.
    const top = rows.filter((r) => r.mentions >= 2).slice(0, 12);
    if (top.length === 0) return null;
    const maxMentions = Math.max(...top.map((r) => r.mentions));
    return (
      <Page size="A4" style={styles.page}>
        {pageHeader}
        <MText style={styles.pageTitle}>
          {isKo ? "채널 우선순위" : "Channel priority"}
        </MText>
        <MText style={styles.pageSubtitle}>
          {isKo
            ? "페르소나의 voice/objection/trust factor에서 자동 추출한 채널 언급 빈도. 우측 숫자는 그 채널을 언급한 페르소나의 평균 구매의향 — 높을수록 진출 우선순위."
            : "Channel names auto-extracted from persona voice / objections / trust factors. Right-side number = mean intent of personas who mentioned it; higher = stronger launch priority."}
        </MText>

        <View style={styles.sectionBlock}>
          {top.map((r) => {
            const intentTone =
              r.meanIntent >= 65 ? C.success : r.meanIntent >= 50 ? C.warn : C.risk;
            return (
              <View
                key={r.channel}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  paddingVertical: 5,
                  borderBottomWidth: 0.5,
                  borderBottomColor: C.divider,
                }}
                wrap={false}
              >
                <MText style={{ fontSize: 10, color: C.ink, width: 130, fontWeight: 600 }}>
                  {r.channel}
                </MText>
                <View style={{ flex: 1, height: 8, backgroundColor: C.divider, borderRadius: 4 }}>
                  <View
                    style={{
                      width: `${(r.mentions / maxMentions) * 100}%`,
                      height: 8,
                      backgroundColor: C.brand,
                      borderRadius: 4,
                    }}
                  />
                </View>
                <MText style={{ fontSize: 9, color: C.ink, width: 70, textAlign: "right" }}>
                  {isKo ? `${r.mentions}회 (${r.share}%)` : `${r.mentions} · ${r.share}%`}
                </MText>
                <MText
                  style={{
                    fontSize: 9,
                    color: intentTone,
                    width: 60,
                    textAlign: "right",
                    fontWeight: 600,
                  }}
                >
                  {`${isKo ? "의향" : "intent"} ${r.meanIntent}`}
                </MText>
              </View>
            );
          })}
        </View>

        <MText style={{ fontSize: 8, color: C.muted, marginTop: 8, lineHeight: 1.5 }}>
          {isKo
            ? "메타: 막대는 언급 횟수, 우측 숫자는 그 채널 언급자의 평균 구매의향. 추천 우선순위 = 언급 많음 × 의향 높음 — 두 조건 모두 만족하는 채널부터 진출하세요."
            : "Bar = mentions; right number = mean intent of mentioners. Launch priority = high mentions × high intent — start with channels strong on both."}
        </MText>

        {pageFooter}
      </Page>
    );
  };

  /**
   * Persona Archetypes — rule-based clustering of personas into 5 GTM-
   * relevant buckets (Champion / Curious / Conditional / Skeptic /
   * Walker). Each bucket gets demographic mode + top trust + top
   * objection + a representative voice quote. Answers "who do I sell
   * to first?" with substance instead of headcounts.
   */
  const renderArchetypesPage = () => {
    if (!tierBudget.showArchetypes) return null;
    const archetypes = aggregate.personas?.archetypes ?? [];
    if (archetypes.length === 0) return null;
    const archetypeLabels: Record<string, { ko: string; en: string; tone: string; tagline: { ko: string; en: string } }> = {
      champion: {
        ko: "챔피언",
        en: "Champion",
        tone: C.success,
        tagline: { ko: "이미 설득됨 — 첫 타겟 acquisition 우선순위", en: "Already sold — primary acquisition target" },
      },
      curious: {
        ko: "관찰자",
        en: "Curious",
        tone: C.brand,
        tagline: { ko: "관심 있지만 구매까지 못 옴 — 컨버전 갭의 핵심", en: "Interested but not buying — the conversion gap" },
      },
      conditional: {
        ko: "설득 가능층",
        en: "Conditional",
        tone: C.warn,
        tagline: { ko: "복귀 가능한 중간층 — 카피·가격이 결정 요인", en: "The persuadable middle — copy + price decide them" },
      },
      skeptic: {
        ko: "회의론자",
        en: "Skeptic",
        tone: C.risk,
        tagline: { ko: "여러 거부 요인 — 시간 투자 우선순위 낮음", en: "Multiple objections — low ROI to convince" },
      },
      walker: {
        ko: "지나가는 행인",
        en: "Walker",
        tone: C.muted,
        tagline: { ko: "관심 없고 시장 외부 — 그냥 통과", en: "Not in market — pass them by" },
      },
    };
    return (
      <Page size="A4" style={styles.page}>
        {pageHeader}
        <MText style={styles.pageTitle}>
          {isKo ? "페르소나 아키타입 — 5가지 행동 세그먼트" : "Persona archetypes — 5 behavior segments"}
        </MText>
        <MText style={styles.pageSubtitle}>
          {isKo
            ? "구매의향 + 광고 호기심 + 클릭 의향을 결합한 행동 클러스터링. 각 세그먼트의 평균 인상, 직업/소득 모드, 대표 인용을 보여 \"누구부터 공략할지\" 결정에 직결."
            : "Behavioral clustering on intent + ad curiosity + click signal. Each segment shows mean profile, modal demo, and a representative voice — driving the 'who first?' GTM decision."}
        </MText>

        {archetypes.map((arch) => {
          const meta = archetypeLabels[arch.id];
          const label = isKo ? meta.ko : meta.en;
          const tagline = isKo ? meta.tagline.ko : meta.tagline.en;
          return (
            <View
              key={arch.id}
              style={{
                borderLeftWidth: 3,
                borderLeftColor: meta.tone,
                paddingLeft: 8,
                marginBottom: 10,
                paddingVertical: 4,
                backgroundColor: C.card,
              }}
              wrap={false}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  marginBottom: 3,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
                  <MText style={{ fontSize: 12, color: meta.tone, fontWeight: 700 }}>
                    {label}
                  </MText>
                  <MText style={{ fontSize: 9, color: C.muted }}>
                    {`${arch.count}명 · ${Math.round(arch.share * 100)}%`}
                  </MText>
                </View>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <MText style={{ fontSize: 8, color: C.muted }}>
                    {isKo ? "평균 의향" : "intent"}
                  </MText>
                  <MText style={{ fontSize: 10, color: C.ink, fontWeight: 700 }}>
                    {String(arch.meanIntent)}
                  </MText>
                  {arch.meanCuriosity != null && (
                    <>
                      <MText style={{ fontSize: 8, color: C.muted }}>
                        {isKo ? "호기심" : "curiosity"}
                      </MText>
                      <MText style={{ fontSize: 10, color: C.ink, fontWeight: 700 }}>
                        {String(arch.meanCuriosity)}
                      </MText>
                    </>
                  )}
                </View>
              </View>
              <MText style={{ fontSize: 8, color: C.muted, marginBottom: 4 }}>
                {`— ${tagline}`}
              </MText>

              <View style={{ flexDirection: "row", gap: 10, marginBottom: 4 }}>
                <View style={{ flex: 1 }}>
                  <MText style={{ fontSize: 7, color: C.muted, fontWeight: 600 }}>
                    {isKo ? "전형적 프로필" : "Typical profile"}
                  </MText>
                  <MText style={{ fontSize: 9, color: C.body, marginTop: 1 }}>
                    {[arch.topProfession, arch.topAgeBucket, arch.topIncomeBucket]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </MText>
                </View>
              </View>

              <View style={{ flexDirection: "row", gap: 10, marginBottom: 4 }}>
                {arch.topTrustFactor && (
                  <View style={{ flex: 1 }}>
                    <MText style={{ fontSize: 7, color: C.success, fontWeight: 600 }}>
                      {isKo ? "신뢰 요인" : "Top trust"}
                    </MText>
                    <MText style={{ fontSize: 9, color: C.body, marginTop: 1 }}>
                      {arch.topTrustFactor}
                    </MText>
                  </View>
                )}
                {arch.topObjection && (
                  <View style={{ flex: 1 }}>
                    <MText style={{ fontSize: 7, color: C.risk, fontWeight: 600 }}>
                      {isKo ? "거부 요인" : "Top objection"}
                    </MText>
                    <MText style={{ fontSize: 9, color: C.body, marginTop: 1 }}>
                      {arch.topObjection}
                    </MText>
                  </View>
                )}
              </View>

              {arch.representativeQuote && (
                <View
                  style={{
                    marginTop: 4,
                    borderTopWidth: 0.5,
                    borderTopColor: C.divider,
                    paddingTop: 4,
                  }}
                >
                  <MText style={{ fontSize: 9, color: C.body, lineHeight: 1.5 }}>
                    {`"${arch.representativeQuote.text}"`}
                  </MText>
                  <MText style={{ fontSize: 7, color: C.muted, marginTop: 2 }}>
                    {[
                      arch.representativeQuote.country,
                      arch.representativeQuote.profession,
                      `${isKo ? "구매의향" : "intent"} ${arch.representativeQuote.intent}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </MText>
                </View>
              )}
            </View>
          );
        })}

        {pageFooter}
      </Page>
    );
  };

  /**
   * Risk × Action mapping — for each top-3 risk, show which action(s)
   * address it via heuristic keyword overlap (factor + description vs
   * action text). Demonstrates the action plan actually answers the
   * risks identified, not floating in space.
   */
  /**
   * Investment + ROI projection — Decision+ exclusive. Pure math from
   * existing aggregate data (no LLM call). Shows the user concrete
   * marketing budget tiers + revenue projection so they can plan
   * spend in absolute terms instead of "high recommendation, go".
   *
   * Inputs used (all already in aggregate):
   *   - recommendedPriceCents (price per unit)
   *   - countryStats[recommended].cacEstimateUsd (CAC per country)
   *   - personas.highIntentCount / total (conversion proxy)
   *
   * Volume tiers (100 / 1,000 / 10,000) chosen so users see linear
   * scaling — first tier is "MVP launch", second "real product
   * traction", third "scale".
   */
  const renderInvestmentROIPage = () => {
    if (!tierBudget.showInvestmentROI) return null;
    if (!aggregate.pricing || !aggregate.personas) return null;
    const recCountry = aggregate.recommendation.country;
    const recCountryStats = aggregate.countryStats.find(
      (c) => c.country.toUpperCase() === recCountry.toUpperCase(),
    );
    const cacUsd = recCountryStats?.cacEstimateUsd.mean ?? null;
    if (cacUsd == null) return null;

    const fmt = (cents: number) => formatPrice(cents, project?.currency);
    // CAC stored in USD across the schema; convert to project currency
    // via fixed rate (matches the snapshot in competitor-prices.ts).
    const usdToTarget: Record<string, number> = {
      USD: 1, KRW: 1390, JPY: 152, CNY: 7.2, TWD: 32, HKD: 7.8,
      SGD: 1.35, THB: 36, VND: 25500, IDR: 16200, MYR: 4.7, PHP: 58,
      INR: 84, GBP: 0.79, EUR: 0.93, CAD: 1.4, AUD: 1.55,
    };
    const targetCurrency = (project?.currency ?? "USD").toUpperCase();
    const usdRate = usdToTarget[targetCurrency] ?? 1;
    const cacInTargetCents = Math.round(cacUsd * 100 * usdRate);

    // Recompute curve max via the shared monotonic-envelope helper —
    // legacy ensembles persisted naive-argmax values that picked
    // high-price noise bumps (e.g. ₩280k from a 25%-conv bump
    // between two 19%-conv neighbours). Render-time recompute keeps
    // PDF and dashboard aligned.
    const recomputedCurveMax =
      computeCurveRevenueMaxCents(aggregate.pricing.curve) ??
      aggregate.pricing.curveRevenueMaxCents ??
      null;
    const matchesCurveLocal =
      recomputedCurveMax != null && aggregate.pricing.recommendedPriceCents > 0
        ? Math.abs(recomputedCurveMax / aggregate.pricing.recommendedPriceCents - 1) <= 0.1
        : null;
    const headlinePrice =
      matchesCurveLocal === false && recomputedCurveMax != null
        ? recomputedCurveMax
        : aggregate.pricing.recommendedPriceCents;

    // High-intent ratio — proxy for "what fraction of impressions
    // become customers". Conservative: we use highIntent (≥70) as
    // the conversion baseline, knowing real conversion is typically
    // a small fraction of expressed intent.
    const totalPersonas = aggregate.personas.total;
    const highIntentRatio =
      totalPersonas > 0 ? aggregate.personas.highIntentCount / totalPersonas : 0;

    // Three volume tiers + 3 confidence scenarios per tier
    const volumeTiers = [100, 1000, 10000];
    const scenarioFactor = { pessimistic: 0.7, base: 1.0, optimistic: 1.3 };

    return (
      <Page size="A4" style={styles.page}>
        {pageHeader}
        <MText style={styles.pageTitle}>
          {isKo ? "투자 요구치 + ROI 추정" : "Investment + ROI projection"}
        </MText>
        <MText style={styles.pageSubtitle}>
          {isKo
            ? `추천 시장 ${recCountry} 기준. 각 볼륨 티어별 마케팅 예산 + 예상 매출 + 시나리오별 변동. 실제 결과는 ±30% 변동 가능.`
            : `Based on the recommended market ${recCountry}. Marketing budget + projected revenue per volume tier, with optimistic / base / pessimistic scenarios. Actual outcomes can vary ±30%.`}
        </MText>

        <View style={styles.sectionBlock}>
          <MText style={styles.sectionEyebrow}>
            {isKo ? "주요 입력값" : "Key inputs"}
          </MText>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
            <View style={{ flex: 1, padding: 8, backgroundColor: C.card, borderRadius: 4 }}>
              <MText style={{ fontSize: 7, color: C.muted, fontWeight: 600 }}>
                {isKo ? "단가" : "Unit price"}
              </MText>
              <MText style={{ fontSize: 11, color: C.ink, fontWeight: 700, marginTop: 2 }}>
                {fmt(headlinePrice)}
              </MText>
            </View>
            <View style={{ flex: 1, padding: 8, backgroundColor: C.card, borderRadius: 4 }}>
              <MText style={{ fontSize: 7, color: C.muted, fontWeight: 600 }}>
                {isKo ? "CAC (고객 획득 비용)" : "CAC"}
              </MText>
              <MText style={{ fontSize: 11, color: C.ink, fontWeight: 700, marginTop: 2 }}>
                {fmt(cacInTargetCents)}
              </MText>
              <MText style={{ fontSize: 7, color: C.muted, marginTop: 1 }}>
                {`($${cacUsd.toFixed(2)})`}
              </MText>
            </View>
            <View style={{ flex: 1, padding: 8, backgroundColor: C.card, borderRadius: 4 }}>
              <MText style={{ fontSize: 7, color: C.muted, fontWeight: 600 }}>
                {isKo ? "고의향 비율" : "High-intent ratio"}
              </MText>
              <MText style={{ fontSize: 11, color: C.ink, fontWeight: 700, marginTop: 2 }}>
                {`${(highIntentRatio * 100).toFixed(1)}%`}
              </MText>
              <MText style={{ fontSize: 7, color: C.muted, marginTop: 1 }}>
                {isKo
                  ? `구매의향 70+ ${aggregate.personas.highIntentCount}/${totalPersonas}명`
                  : `${aggregate.personas.highIntentCount}/${totalPersonas} personas`}
              </MText>
            </View>
          </View>
        </View>

        <View style={styles.sectionBlock}>
          <MText style={styles.sectionEyebrow}>
            {isKo ? "볼륨 티어별 투자 + 매출" : "Investment + revenue per volume tier"}
          </MText>

          {/* Marketing efficiency callout — M:R ratio (CAC / price) is
              constant across volume tiers, so it lives here as a single
              colored badge instead of a redundant per-row column. */}
          {(() => {
            const ratio = cacInTargetCents / headlinePrice;
            const ratioPct = (ratio * 100).toFixed(0);
            const tone =
              ratio < 0.3 ? C.success : ratio < 0.6 ? C.warn : C.risk;
            const verdict =
              ratio < 0.3
                ? isKo
                  ? "건강 (acquisition 부담 낮음)"
                  : "Healthy"
                : ratio < 0.6
                  ? isKo
                    ? "주의 (LTV uplift 없으면 압박)"
                    : "Caution (tight without LTV uplift)"
                  : isKo
                    ? "위험 (재구매·LTV 없이 지속 불가)"
                    : "Unsustainable without repeat / LTV";
            return (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  marginBottom: 6,
                  borderWidth: 0.5,
                  borderColor: tone,
                  backgroundColor: C.card,
                  borderRadius: 4,
                }}
              >
                <MText style={{ fontSize: 7, color: C.muted, fontWeight: 700 }}>
                  {isKo ? "마케팅 효율 (M:R)" : "Marketing efficiency (M:R)"}
                </MText>
                <MText style={{ fontSize: 14, color: tone, fontWeight: 700 }}>
                  {`${ratioPct}%`}
                </MText>
                <MText style={{ fontSize: 8, color: C.body, flex: 1 }}>
                  {isKo
                    ? `매출 ${fmt(headlinePrice)}당 마케팅 ${fmt(cacInTargetCents)} → ${verdict}. 기준: <30% 건강, 30-60% 주의, 60%+ 위험.`
                    : `Every ${fmt(headlinePrice)} of revenue requires ${fmt(cacInTargetCents)} in marketing → ${verdict}. Bands: <30% healthy, 30-60% caution, 60%+ risk.`}
                </MText>
              </View>
            );
          })()}

          <View style={{ flexDirection: "row", paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: C.divider }}>
            <MText style={{ fontSize: 7, color: C.muted, fontWeight: 700, width: 70 }}>
              {isKo ? "고객 수" : "Customers"}
            </MText>
            <MText style={{ fontSize: 7, color: C.muted, fontWeight: 700, flex: 1, textAlign: "right" }}>
              {isKo ? "마케팅 (CAC × N)" : "Marketing (CAC × N)"}
            </MText>
            <MText style={{ fontSize: 7, color: C.muted, fontWeight: 700, flex: 1, textAlign: "right" }}>
              {isKo ? "매출 (기본)" : "Revenue (base)"}
            </MText>
            <MText style={{ fontSize: 7, color: C.muted, fontWeight: 700, flex: 1.4, textAlign: "right" }}>
              {isKo ? "매출 (비관 −30% / 낙관 +30%)" : "Revenue (pess −30% / opt +30%)"}
            </MText>
          </View>

          {volumeTiers.map((vol) => {
            const marketing = cacInTargetCents * vol;
            const revenueBase = headlinePrice * vol;
            const revenuePess = Math.round(revenueBase * scenarioFactor.pessimistic);
            const revenueOpt = Math.round(revenueBase * scenarioFactor.optimistic);
            return (
              <View
                key={vol}
                style={{
                  flexDirection: "row",
                  paddingVertical: 6,
                  alignItems: "center",
                  borderBottomWidth: 0.5,
                  borderBottomColor: C.divider,
                }}
                wrap={false}
              >
                <MText style={{ fontSize: 11, color: C.ink, fontWeight: 700, width: 70 }}>
                  {vol.toLocaleString()}
                </MText>
                <MText style={{ fontSize: 9, color: C.body, flex: 1, textAlign: "right" }}>
                  {fmt(marketing)}
                </MText>
                <MText style={{ fontSize: 10, color: C.ink, fontWeight: 700, flex: 1, textAlign: "right" }}>
                  {fmt(revenueBase)}
                </MText>
                <MText style={{ fontSize: 8, color: C.muted, flex: 1.4, textAlign: "right" }}>
                  {`${fmt(revenuePess)} / ${fmt(revenueOpt)}`}
                </MText>
              </View>
            );
          })}
        </View>

        <View style={styles.sectionBlock}>
          <MText style={styles.sectionEyebrow}>
            {isKo ? "Break-even 시나리오 (마진별)" : "Break-even sensitivity (by margin)"}
          </MText>
          {(() => {
            // Three-scenario break-even — anchored on LLM-emitted typical
            // category margin (marginEstimatePct) when present, falls
            // back to 35% for legacy data. ±10pp brackets give pess /
            // base / opt. Mirrors the dashboard PricingTab logic so
            // numbers match across surfaces.
            const llmMarginPct = aggregate.pricing?.marginEstimatePct;
            const baseMarginPct = llmMarginPct ?? 35;
            const clamp = (n: number) => Math.max(10, Math.min(85, n));
            const scenarios = [
              {
                labelKo: "비관 (마진 −10pp)",
                labelEn: "Pessimistic (−10pp)",
                marginPct: clamp(baseMarginPct - 10),
              },
              {
                labelKo: llmMarginPct != null ? "기본 (AI 추정)" : "기본",
                labelEn: llmMarginPct != null ? "Base (AI-estimated)" : "Base",
                marginPct: baseMarginPct,
              },
              {
                labelKo: "낙관 (마진 +10pp)",
                labelEn: "Optimistic (+10pp)",
                marginPct: clamp(baseMarginPct + 10),
              },
            ];
            return (
              <View
                style={{
                  padding: 8,
                  backgroundColor: C.card,
                  borderRadius: 4,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    paddingBottom: 4,
                    borderBottomWidth: 0.5,
                    borderBottomColor: C.divider,
                  }}
                >
                  <MText style={{ fontSize: 7, color: C.muted, fontWeight: 600, flex: 1.9 }}>
                    {isKo ? "시나리오" : "Scenario"}
                  </MText>
                  <MText style={{ fontSize: 7, color: C.muted, fontWeight: 600, flex: 0.7, textAlign: "right" }}>
                    {isKo ? "마진" : "Margin"}
                  </MText>
                  <MText style={{ fontSize: 7, color: C.muted, fontWeight: 600, flex: 1.0, textAlign: "right" }}>
                    {isKo ? "단위 gross" : "Gross/unit"}
                  </MText>
                  <MText style={{ fontSize: 7, color: C.muted, fontWeight: 600, flex: 1.2, textAlign: "right" }}>
                    {isKo ? "단위 net" : "Net/unit"}
                  </MText>
                  <MText style={{ fontSize: 7, color: C.muted, fontWeight: 600, flex: 1.8, textAlign: "right" }}>
                    {isKo ? "1,000명 회수 BE (개)" : "BE units @ 1k CAC"}
                  </MText>
                </View>
                {scenarios.map((s, i) => {
                  const margin = s.marginPct / 100;
                  const grossPerUnit = Math.round(headlinePrice * margin);
                  const netPerUnit = grossPerUnit - cacInTargetCents;
                  const breakEvenN =
                    netPerUnit > 0
                      ? Math.ceil((cacInTargetCents / netPerUnit) * 1000)
                      : null;
                  return (
                    <View
                      key={i}
                      style={{
                        flexDirection: "row",
                        paddingVertical: 4,
                        borderTopWidth: i === 0 ? 0 : 0.25,
                        borderTopColor: C.divider,
                      }}
                    >
                      <MText style={{ fontSize: 9, color: C.body, flex: 1.9 }}>
                        {isKo ? s.labelKo : s.labelEn}
                      </MText>
                      <MText style={{ fontSize: 9, color: C.body, flex: 0.7, textAlign: "right" }}>
                        {`${s.marginPct}%`}
                      </MText>
                      <MText style={{ fontSize: 9, color: C.body, flex: 1.0, textAlign: "right" }}>
                        {fmt(grossPerUnit)}
                      </MText>
                      <MText
                        style={{
                          fontSize: 9,
                          color: netPerUnit > 0 ? C.success : C.risk,
                          fontWeight: 600,
                          flex: 1.2,
                          textAlign: "right",
                        }}
                      >
                        {fmt(netPerUnit)}
                      </MText>
                      <MText style={{ fontSize: 9, color: C.body, flex: 1.8, textAlign: "right" }}>
                        {breakEvenN != null
                          ? breakEvenN.toLocaleString()
                          : isKo
                            ? "불가"
                            : "n/a"}
                      </MText>
                    </View>
                  );
                })}
                <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 6 }}>
                  <MText style={{ fontSize: 7, color: C.muted, lineHeight: 1.4 }}>
                    {isKo
                      ? `${llmMarginPct != null ? "AI 추정" : "기본값"} 마진 ${baseMarginPct}% 기준 ±10pp. `
                      : `${llmMarginPct != null ? "AI-estimated" : "Default"} ${baseMarginPct}% margin ± 10pp. `}
                  </MText>
                  <MText style={{ fontSize: 7, color: C.body, fontWeight: 600, lineHeight: 1.4 }}>
                    {isKo ? "가정: 1인당 1개 구매. " : "Assumes single unit per customer. "}
                  </MText>
                  <MText style={{ fontSize: 7, color: C.muted, lineHeight: 1.4 }}>
                    {isKo
                      ? "재구매·LTV 미반영 — 실제 LTV가 단가의 1.3배 이상이면 위 BE는 보수적."
                      : "LTV not modeled — if actual LTV > unit price ×1.3, BE above is conservative."}
                  </MText>
                </View>
                <MText style={{ fontSize: 7, color: C.muted, lineHeight: 1.4, marginTop: 4 }}>
                  {isKo
                    ? "1,000명 회수 BE = 1,000명 분의 CAC 예산을 단위 net으로 회수하는 데 필요한 판매 수량 (= CAC × 1,000 ÷ 단위 net)."
                    : "BE units @ 1k CAC = sales needed to recover a 1,000-customer CAC budget at the per-unit net contribution (= CAC × 1,000 ÷ net/unit)."}
                </MText>
              </View>
            );
          })()}
        </View>

        <MText style={{ fontSize: 7, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>
          {isKo
            ? "메타: 위 추정치는 페르소나 시그널 기반의 단순 모델 — 실제 CAC는 채널/시즌/광고 효율에 따라 ±50% 변동 가능. 실 투자 전 첫 100명 대상 small-batch test로 검증 권장."
            : "Meta: estimates are first-order from persona signal. Real CAC varies ±50% with channel/season/ad efficiency. Run a 100-customer small-batch test to validate before scaling."}
        </MText>

        {pageFooter}
      </Page>
    );
  };

  /**
   * Recommendation robustness / sensitivity analysis — Decision+
   * exclusive. Shows whether the recommended country is a strong
   * pick or a fragile one. Pure math.
   *
   * Components:
   *   1. Gap to runner-up (finalScore margin) — wider = more robust
   *   2. Per-component vulnerability — which dimension is closest
   *      to flipping the recommendation if it drops 10pt
   *   3. Confidence overlay — confidenceScore from quality audit
   *
   * Answers "how confident should I be in this pick?" with concrete
   * numbers, not just the headline confidence label.
   */
  const renderSensitivityAnalysisPage = () => {
    if (!tierBudget.showSensitivityAnalysis) return null;
    const stats = aggregate.countryStats;
    if (stats.length < 2) return null;
    // Top two countries
    const sorted = [...stats].sort((a, b) => b.finalScore.mean - a.finalScore.mean);
    const top = sorted[0];
    const runnerUp = sorted[1];
    const gap = top.finalScore.mean - runnerUp.finalScore.mean;
    const gapPct = top.finalScore.mean > 0 ? (gap / top.finalScore.mean) * 100 : 0;

    // Component vulnerabilities for top country — uses the dashboard's
    // stress-scenario library so PDF and dashboard show the same
    // analysis. Generic "10pt → flip" placeholder replaced with
    // mathematically-correct flip threshold (gap × 6 under equal-
    // weight assumption) and named adverse scenarios per component.
    const topComp = top.components;
    const vulnerableDim: Array<{
      key: ComponentKey;
      score: number;
    }> = topComp
      ? (
          [
            { key: "marketSize", score: topComp.marketSize.mean },
            { key: "culturalFit", score: topComp.culturalFit.mean },
            { key: "channelMatch", score: topComp.channelMatch.mean },
            { key: "priceCompat", score: topComp.priceCompat.mean },
            { key: "competition", score: topComp.competition.mean },
            { key: "regulatory", score: topComp.regulatory.mean },
          ] as Array<{ key: ComponentKey; score: number }>
        ).sort((a, b) => a.score - b.score)
      : [];
    const flipThreshold = flipThresholdPt(gap);

    // Robustness verdict
    let robustnessLabel: { ko: string; en: string };
    let robustnessTone: string;
    if (gap >= 15) {
      robustnessLabel = { ko: "매우 견고", en: "Very robust" };
      robustnessTone = C.success;
    } else if (gap >= 8) {
      robustnessLabel = { ko: "견고", en: "Robust" };
      robustnessTone = C.success;
    } else if (gap >= 4) {
      robustnessLabel = { ko: "보통", en: "Moderate" };
      robustnessTone = C.warn;
    } else {
      robustnessLabel = { ko: "취약", en: "Fragile" };
      robustnessTone = C.risk;
    }

    return (
      <Page size="A4" style={styles.page}>
        {pageHeader}
        <MText style={styles.pageTitle}>
          {isKo ? "추천 견고성 + 민감도 분석" : "Recommendation robustness + sensitivity"}
        </MText>
        <MText style={styles.pageSubtitle}>
          {isKo
            ? "추천 시장이 흔들리지 않는지 검증. 1순위와 2순위의 점수 격차, 각 component dimension의 취약성, 어떤 변동에서 추천이 flip될지 분석."
            : "Stress-test the recommendation. How wide is the gap to the runner-up, which component dimensions are vulnerable, and what changes would flip the call."}
        </MText>

        {/* Robustness hero */}
        <View
          style={{
            backgroundColor: C.card,
            borderTopWidth: 4,
            borderTopColor: robustnessTone,
            padding: 14,
            borderRadius: 4,
            marginBottom: 12,
          }}
          wrap={false}
        >
          <MText
            style={{ fontSize: 8, color: robustnessTone, fontWeight: 700, letterSpacing: 0.6, marginBottom: 4 }}
          >
            {isKo ? "추천 견고성" : "RECOMMENDATION ROBUSTNESS"}
          </MText>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 12, marginBottom: 6 }}>
            <MText style={{ fontSize: 22, color: robustnessTone, fontWeight: 700 }}>
              {isKo ? robustnessLabel.ko : robustnessLabel.en}
            </MText>
            <MText style={{ fontSize: 11, color: C.body }}>
              {isKo
                ? `1순위(${top.country}) ${top.finalScore.mean.toFixed(1)}점 vs 2순위(${runnerUp.country}) ${runnerUp.finalScore.mean.toFixed(1)}점 — 격차 ${gap.toFixed(1)}점 (${gapPct.toFixed(0)}%)`
                : `Top (${top.country}) ${top.finalScore.mean.toFixed(1)} vs runner-up (${runnerUp.country}) ${runnerUp.finalScore.mean.toFixed(1)} — gap ${gap.toFixed(1)}pt (${gapPct.toFixed(0)}%)`}
            </MText>
          </View>
          <MText style={{ fontSize: 9, color: C.body, lineHeight: 1.5 }}>
            {gap >= 15
              ? isKo
                ? "1순위가 충분히 앞서 있어 component 변동에 영향받기 어려움. 추가 검증 우선순위 낮음 — 진출 결정 가능."
                : "Top country is far enough ahead that component-level shifts won't flip it. Low priority for further validation — proceed with launch."
              : gap >= 8
                ? isKo
                  ? "1순위가 앞서 있으나 큰 component 변동(15pt+)이 발생하면 flip 가능성 있음. 핵심 component(아래) 추가 검증 권장."
                  : "Top is ahead but a significant component shift (15pt+) could flip the call. Validate the key components (below)."
                : gap >= 4
                  ? isKo
                    ? "격차가 좁아 추천이 흔들릴 수 있음. 1순위 진출 전 핵심 가정 (가격, 채널, 규제) 별도 확인 강력 권장."
                    : "Gap is tight — recommendation could flip with modest changes. Strongly recommend verifying key assumptions (pricing, channel, regulatory) before commit."
                  : isKo
                    ? "1순위와 2순위가 사실상 동률. 단일 추천보다 두 시장 동시 진출 또는 추가 시뮬 검증을 통한 격차 확보 권장."
                    : "Top and runner-up are statistically tied. Consider parallel launch or additional sims to widen the gap before committing to a single market."}
          </MText>
        </View>

        {/* Component vulnerability — concrete stress scenarios per
            component (mirrors dashboard layout). Replaces the generic
            "10pt drop" with mathematically-correct flip threshold and
            named adverse scenarios with magnitude estimates. */}
        {vulnerableDim.length > 0 && (
          <View style={styles.sectionBlock}>
            <MText style={styles.sectionEyebrow}>
              {isKo ? `${top.country}의 component별 취약성` : `${top.country} component vulnerability`}
            </MText>
            <MText style={{ fontSize: 8, color: C.muted, lineHeight: 1.4, marginBottom: 6 }}>
              {isKo
                ? `2순위까지의 격차가 ${gap.toFixed(1)}pt. 6개 component 균등 가중 가정 시, 한 component가 단독으로 ${Math.round(flipThreshold)}pt 하락하면 추천이 flip. 아래 시나리오의 추정 drop이 임계값을 넘으면 단독 flip 발생.`
                : `Gap to runner-up is ${gap.toFixed(1)}pt. Under equal-weight components (1/6 each), a single component must drop ${Math.round(flipThreshold)}pt for the recommendation to flip. Each scenario shows the estimated drop and whether it alone exceeds the threshold.`}
            </MText>
            {vulnerableDim.map((d) => {
              const label = COMPONENT_LABEL[d.key];
              const scenarios = COMPONENT_STRESS_SCENARIOS[d.key];
              const tone = d.score >= 65 ? C.success : d.score >= 50 ? C.warn : C.risk;
              const cumulative = scenarios.reduce((s, sc) => s + sc.dropPt, 0);
              const cumulativeFlips = cumulative >= flipThreshold;
              return (
                <View
                  key={d.key}
                  style={{
                    paddingVertical: 5,
                    borderBottomWidth: 0.5,
                    borderBottomColor: C.divider,
                  }}
                  wrap={false}
                >
                  {/* Component header row */}
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 3,
                    }}
                  >
                    <MText
                      style={{ fontSize: 9, color: C.ink, fontWeight: 600, width: 110 }}
                    >
                      {isKo ? label.ko : label.en}
                    </MText>
                    <View
                      style={{
                        flex: 1,
                        height: 6,
                        backgroundColor: C.divider,
                        borderRadius: 3,
                      }}
                    >
                      <View
                        style={{
                          width: `${Math.max(0, Math.min(100, d.score))}%`,
                          height: 6,
                          backgroundColor: tone,
                          borderRadius: 3,
                        }}
                      />
                    </View>
                    <MText
                      style={{
                        fontSize: 9,
                        color: tone,
                        fontWeight: 700,
                        width: 36,
                        textAlign: "right",
                      }}
                    >
                      {d.score.toFixed(0)}
                    </MText>
                  </View>
                  {/* Scenario rows */}
                  {scenarios.map((sc, j) => {
                    const flips = sc.dropPt >= flipThreshold;
                    return (
                      <View
                        key={j}
                        style={{
                          flexDirection: "row",
                          paddingLeft: 118,
                          gap: 6,
                          marginTop: 1,
                        }}
                      >
                        <MText style={{ fontSize: 7, color: C.muted, width: 8 }}>•</MText>
                        <MText
                          style={{ fontSize: 7, color: C.body, flex: 1, lineHeight: 1.4 }}
                        >
                          {isKo ? sc.ko : sc.en}
                        </MText>
                        <MText
                          style={{
                            fontSize: 7,
                            color: C.muted,
                            width: 32,
                            textAlign: "right",
                          }}
                        >
                          {`−${sc.dropPt}pt`}
                        </MText>
                        <MText
                          style={{
                            fontSize: 7,
                            color: flips ? C.risk : C.muted,
                            width: 32,
                            textAlign: "right",
                            fontWeight: flips ? 700 : 400,
                          }}
                        >
                          {flips
                            ? isKo ? "→ flip" : "→ flip"
                            : isKo ? "안정" : "stable"}
                        </MText>
                      </View>
                    );
                  })}
                  {/* Cumulative worst case */}
                  <View
                    style={{
                      flexDirection: "row",
                      paddingLeft: 118,
                      gap: 6,
                      marginTop: 2,
                      paddingTop: 2,
                      borderTopWidth: 0.25,
                      borderTopColor: C.divider,
                    }}
                  >
                    <MText style={{ fontSize: 7, color: C.muted, width: 8 }}>∑</MText>
                    <MText
                      style={{
                        fontSize: 7,
                        color: C.muted,
                        flex: 1,
                        fontWeight: 600,
                        lineHeight: 1.4,
                      }}
                    >
                      {isKo ? "동시 다발 (누적 worst case)" : "All hit simultaneously (worst case)"}
                    </MText>
                    <MText
                      style={{ fontSize: 7, color: C.muted, width: 32, textAlign: "right" }}
                    >
                      {`−${cumulative}pt`}
                    </MText>
                    <MText
                      style={{
                        fontSize: 7,
                        color: cumulativeFlips ? C.risk : C.muted,
                        width: 32,
                        textAlign: "right",
                        fontWeight: cumulativeFlips ? 700 : 400,
                      }}
                    >
                      {cumulativeFlips
                        ? isKo ? "→ flip" : "→ flip"
                        : isKo ? "안정" : "stable"}
                    </MText>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Confidence overlay */}
        {aggregate.quality?.confidenceScore != null && (
          <View style={styles.sectionBlock}>
            <MText style={styles.sectionEyebrow}>
              {isKo ? "결과 신뢰도 overlay" : "Confidence overlay"}
            </MText>
            <View style={{ padding: 10, backgroundColor: C.card, borderRadius: 4 }}>
              <MText style={{ fontSize: 9, color: C.body, lineHeight: 1.5 }}>
                {(() => {
                  const conf = aggregate.quality!.confidenceScore;
                  if (conf >= 75 && gap >= 8) {
                    return isKo
                      ? `결과 신뢰도 ${conf}점 + 견고한 격차(${gap.toFixed(1)}pt). 추천을 의사결정에 사용 가능 — 추가 검증 우선순위 낮음.`
                      : `Confidence ${conf} + robust gap (${gap.toFixed(1)}pt). Recommendation is decision-ready — low priority for further validation.`;
                  }
                  if (conf < 60 && gap < 4) {
                    return isKo
                      ? `⚠ 결과 신뢰도 ${conf}점 + 격차 거의 없음(${gap.toFixed(1)}pt). 무료 재실행 또는 더 높은 tier 시뮬로 검증 강력 권장. 현 추천만으로 진출 결정 위험.`
                      : `⚠ Confidence ${conf} + tight gap (${gap.toFixed(1)}pt). Strongly recommend a free rerun or higher-tier sim before committing.`;
                  }
                  return isKo
                    ? `결과 신뢰도 ${conf}점 + 격차 ${gap.toFixed(1)}pt. 일반적 검증 절차 (액션 plan 실행 + 첫 100명 small-batch test)로 충분.`
                    : `Confidence ${conf} + gap ${gap.toFixed(1)}pt. Standard validation path (execute action plan + run a 100-customer pilot) is sufficient.`;
                })()}
              </MText>
            </View>
          </View>
        )}

        {pageFooter}
      </Page>
    );
  };

  const renderRiskActionMappingPage = () => {
    if (!tierBudget.showRiskActionMapping) return null;
    const risks = aggregate.narrative?.mergedRisks?.slice(0, 5) ?? [];
    const actions = aggregate.narrative?.mergedActions?.slice(0, 8) ?? [];
    if (risks.length === 0 || actions.length === 0) return null;

    // Cheap keyword extraction — pull the noun-like tokens from a
    // risk/action string. CJK runs and Latin words ≥4 chars. Stopwords
    // dropped. The result is a Set we can intersect across risk/action.
    const STOPWORDS_KO = new Set([
      "수있","입니다","됩니다","합니다","하고","하지","하는","대한","위한","위해","관한","에서","에게","으로","에는","입니","않다","적인","적으","적이","따른","따라","리스크","액션",
    ]);
    const STOPWORDS_EN = new Set([
      "the","and","with","that","this","from","into","over","when","what","more","than","they","will","also","such","very","just","like","each","other","some","most","need",
    ]);
    const tokenize = (s: string): Set<string> => {
      const out = new Set<string>();
      const cleaned = s.toLowerCase().replace(/[^\w가-힣\s]/g, " ");
      for (const w of cleaned.split(/\s+/)) {
        if (!w) continue;
        if (/^[가-힣]+$/.test(w)) {
          // CJK: emit overlapping bigrams of length 2
          for (let i = 0; i + 1 < w.length; i++) {
            const bi = w.slice(i, i + 2);
            if (!STOPWORDS_KO.has(bi)) out.add(bi);
          }
        } else if (w.length >= 4 && !STOPWORDS_EN.has(w)) {
          out.add(w);
        }
      }
      return out;
    };
    const overlap = (a: Set<string>, b: Set<string>): number => {
      let n = 0;
      for (const t of a) if (b.has(t)) n++;
      return n;
    };

    // For each risk, find actions with highest overlap. We only call
    // an action a "match" if overlap ≥ 2 — single-token coincidence
    // is noise.
    const riskTokens = risks.map((r) => tokenize(`${r.factor} ${r.description}`));
    const actionTokens = actions.map((a) => tokenize(a.action));
    const matches: Array<{ riskIdx: number; matchedActions: number[] }> = [];
    for (let i = 0; i < risks.length; i++) {
      const scored = actionTokens
        .map((tok, j) => ({ idx: j, score: overlap(riskTokens[i], tok) }))
        .filter((s) => s.score >= 2)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map((s) => s.idx);
      matches.push({ riskIdx: i, matchedActions: scored });
    }

    return (
      <Page size="A4" style={styles.page}>
        {pageHeader}
        <MText style={styles.pageTitle}>
          {isKo ? "리스크 × 액션 매핑" : "Risk × action mapping"}
        </MText>
        <MText style={styles.pageSubtitle}>
          {isKo
            ? "각 리스크에 대응하는 액션을 자동 매핑. 액션 플랜이 식별된 리스크를 실제로 다루는지 한 페이지에서 검증."
            : "Auto-mapped actions that address each risk. One-page check that the plan answers the risks — not just floating recommendations."}
        </MText>

        <View style={{ marginBottom: 10 }}>
          <MText style={[styles.sectionEyebrow, { marginBottom: 4 }]}>
            {isKo ? "참조 — 액션 목록" : "Reference — action list"}
          </MText>
          {actions.map((a, i) => (
            <MText key={i} style={{ fontSize: 8, color: C.muted, lineHeight: 1.5 }}>
              {`A${i + 1}. ${a.action.length > 110 ? a.action.slice(0, 109) + "…" : a.action}`}
            </MText>
          ))}
        </View>

        {risks.map((r, i) => {
          const sevColor =
            r.severity === "high" ? C.risk : r.severity === "medium" ? C.warn : C.muted;
          const matched = matches[i].matchedActions;
          return (
            <View
              key={i}
              style={{
                borderLeftWidth: 2,
                borderLeftColor: sevColor,
                paddingLeft: 8,
                marginBottom: 8,
                paddingVertical: 3,
              }}
              wrap={false}
            >
              <MText style={{ fontSize: 10, color: C.ink, fontWeight: 700 }}>
                {`R${i + 1}. ${r.factor}`}
              </MText>
              <MText style={{ fontSize: 8, color: C.body, lineHeight: 1.4, marginTop: 1 }}>
                {r.description}
              </MText>
              <MText
                style={{
                  fontSize: 8,
                  color: matched.length > 0 ? C.success : C.risk,
                  fontWeight: 600,
                  marginTop: 3,
                }}
              >
                {matched.length > 0
                  ? isKo
                    ? `대응 액션: ${matched.map((idx) => `A${idx + 1}`).join(", ")}`
                    : `Addressed by: ${matched.map((idx) => `A${idx + 1}`).join(", ")}`
                  : isKo
                    ? "대응 액션 없음 — 추가 액션 검토 필요"
                    : "No matched action — consider adding one"}
              </MText>
            </View>
          );
        })}

        <MText style={{ fontSize: 8, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>
          {isKo
            ? "메타: 매핑은 키워드 중첩 기반 휴리스틱입니다 (≥2 token 일치). 의미적으로 더 적합한 액션이 있을 수 있으니 보조 자료로 사용하세요. \"대응 액션 없음\"은 액션 plan에 빈틈이 있다는 시그널 — 새 액션 추가 검토하세요."
            : "Mapping is keyword-overlap heuristic (≥2 token match). A semantically better fit may exist; treat this as a check, not a final answer. 'No matched action' is a signal of a gap in the plan — consider adding one."}
        </MText>

        {pageFooter}
      </Page>
    );
  };

  /**
   * Per-country funnel comparison — funnel from each candidate country
   * stacked side-by-side. Lets the user spot "Vietnam ad-curiosity high
   * but click rate low" type patterns where the leak differs by market.
   */
  const renderCountryFunnelComparisonPage = () => {
    if (!tierBudget.showFunnelComparison) return null;
    const rows = aggregate.countryStats
      .filter((c) => !!c.detail?.funnel)
      .slice(0, 8); // tier-budget alternative — 8 fits A4 cleanly
    if (rows.length === 0) return null;
    return (
      <Page size="A4" style={styles.page}>
        {pageHeader}
        <MText style={styles.pageTitle}>
          {isKo ? "국가별 퍼널 비교" : "Per-country funnel comparison"}
        </MText>
        <MText style={styles.pageSubtitle}>
          {isKo
            ? "광고 호기심 → 클릭 의향 → 구매 의향까지의 깔때기를 국가별로 나란히 비교. 어느 시장에서 어느 단계에서 leak가 발생하는지 한눈에."
            : "Curiosity → click → buy funnel laid out per market. Spot at-a-glance which markets leak at which stage."}
        </MText>

        <View
          style={{
            flexDirection: "row",
            paddingHorizontal: 4,
            marginBottom: 4,
            borderBottomWidth: 0.5,
            borderBottomColor: C.divider,
            paddingBottom: 3,
          }}
        >
          <MText style={{ fontSize: 7, color: C.muted, fontWeight: 600, width: 45 }}>
            {isKo ? "국가" : "Country"}
          </MText>
          <MText
            style={{ fontSize: 7, color: C.muted, fontWeight: 600, flex: 1, textAlign: "right" }}
          >
            {isKo ? "광고 호기심 (0-100)" : "Ad curiosity (0-100)"}
          </MText>
          <MText
            style={{ fontSize: 7, color: C.muted, fontWeight: 600, flex: 1, textAlign: "right" }}
          >
            {isKo ? "클릭 의향 (%)" : "Click rate (%)"}
          </MText>
          <MText
            style={{ fontSize: 7, color: C.muted, fontWeight: 600, flex: 1, textAlign: "right" }}
          >
            {isKo ? "구매 의향 (%)" : "Buy rate (%)"}
          </MText>
          <MText style={{ fontSize: 7, color: C.muted, fontWeight: 600, width: 90, textAlign: "right" }}>
            {isKo ? "주요 leak" : "Main leak"}
          </MText>
        </View>

        {rows.map((c) => {
          const f = c.detail!.funnel!;
          const tone = (v: number, t1: number, t2: number) =>
            v >= t1 ? C.success : v >= t2 ? C.warn : C.risk;
          // Diagnose where the funnel leaks. If curiosity high but click
          // low → ad copy issue. If click high but buy low → landing
          // page / pricing issue. Otherwise just say "balanced".
          const leak =
            f.curiosityMean - f.clickRatePct >= 25
              ? isKo
                ? "광고→클릭"
                : "ad→click"
              : f.clickRatePct - f.buyRatePct >= 25
                ? isKo
                  ? "클릭→구매"
                  : "click→buy"
                : isKo
                  ? "균형"
                  : "balanced";
          return (
            <View
              key={c.country}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: 4,
                borderBottomWidth: 0.5,
                borderBottomColor: C.divider,
              }}
              wrap={false}
            >
              <MText style={{ fontSize: 9, color: C.ink, fontWeight: 600, width: 45 }}>
                {c.country}
              </MText>
              <MiniBar value={f.curiosityMean} max={100} color={tone(f.curiosityMean, 60, 40)} suffix={`${f.curiosityMean.toFixed(0)}`} />
              <MiniBar value={f.clickRatePct} max={100} color={tone(f.clickRatePct, 50, 30)} suffix={`${f.clickRatePct}%`} />
              <MiniBar value={f.buyRatePct} max={100} color={tone(f.buyRatePct, 40, 25)} suffix={`${f.buyRatePct}%`} />
              <MText
                style={{
                  fontSize: 8,
                  color: leak === (isKo ? "균형" : "balanced") ? C.success : C.warn,
                  fontWeight: 600,
                  width: 90,
                  textAlign: "right",
                }}
              >
                {leak}
              </MText>
            </View>
          );
        })}

        <MText style={{ fontSize: 8, color: C.muted, marginTop: 6, lineHeight: 1.5 }}>
          {isKo
            ? "메타: \"광고→클릭\" leak = 카피·CTA 점검. \"클릭→구매\" leak = 가격·랜딩 컨텐츠 점검. 같은 제품도 시장마다 leak 위치가 다름 → 시장별 채널 전략 차별화 근거."
            : "Read: 'ad→click' leak = revisit copy/CTA. 'click→buy' leak = revisit pricing/landing. Same product, different leak by market — basis for differentiated channel strategy."}
        </MText>

        {pageFooter}
      </Page>
    );
  };

  /**
   * Cross-country common objections — top objections that surface in
   * 2+ candidate countries. Universal blockers (= product-level
   * issues to fix) versus country-specific blockers (= localisation
   * issues to handle per market). Answers "what should we fix
   * everywhere vs only here?".
   *
   * Picks the top frequency-ranked objections that appear in multiple
   * countries. Each row shows the objection + which countries flagged
   * it + total mention count.
   */
  const renderCommonObjectionsPage = () => {
    if (!tierBudget.showCommonObjections) return null;
    // Cross-country aggregation. Per-country topObjections are already
    // fuzzy-clustered (clusterStrings in ensemble.ts), but cross-country
    // matching requires another pass — slight wording differences
    // between countries' top entries shouldn't fragment the universal
    // list. Approach: collect every per-country objection (with the
    // country tag), filter persona-mismatch noise, then fuzzy-cluster
    // again across all countries with the same overlap algorithm.
    const allEntries: Array<{ text: string; country: string; count: number }> = [];
    for (const c of aggregate.countryStats) {
      const objs = c.detail?.topObjections;
      if (!objs) continue;
      for (const o of objs) {
        const key = o.text.trim();
        if (!key) continue;
        if (isPersonaMismatchNoise(key)) continue;
        allEntries.push({ text: key, country: c.country, count: o.count });
      }
    }

    // Token-overlap union-find clustering on the cross-country list.
    // Strip geo tokens (country names, regulators, major cities) before
    // matching — same conceptual concern phrased with different
    // local anchors ("프랑스 ANSM 절차" vs "영국 MHRA 절차") would
    // otherwise show zero overlap. Lower threshold (0.4) since the
    // stripped sets are smaller and less forgiving of partial matches.
    const tokenSets = allEntries.map((e) => tokenizeStripGeo(e.text));
    const parentArr = allEntries.map((_, i) => i);
    const find = (x: number): number => {
      while (parentArr[x] !== x) {
        parentArr[x] = parentArr[parentArr[x]];
        x = parentArr[x];
      }
      return x;
    };
    const union = (a: number, b: number) => {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parentArr[ra] = rb;
    };
    for (let i = 0; i < allEntries.length; i++) {
      for (let j = i + 1; j < allEntries.length; j++) {
        if (overlapCoefficient(tokenSets[i], tokenSets[j]) >= 0.4) {
          union(i, j);
        }
      }
    }
    const byCluster = new Map<
      number,
      { texts: Map<string, number>; countries: Set<string>; count: number }
    >();
    for (let i = 0; i < allEntries.length; i++) {
      const root = find(i);
      const e = allEntries[i];
      const cur = byCluster.get(root) ?? {
        texts: new Map<string, number>(),
        countries: new Set<string>(),
        count: 0,
      };
      cur.texts.set(e.text, (cur.texts.get(e.text) ?? 0) + e.count);
      cur.countries.add(e.country);
      cur.count += e.count;
      byCluster.set(root, cur);
    }
    // Pick representative text per cluster — most-mentioned variant,
    // ties broken by shortest.
    const clustered = [...byCluster.values()].map((c) => {
      const rep = [...c.texts.entries()].sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1];
        return a[0].length - b[0].length;
      })[0][0];
      return {
        text: rep,
        countries: [...c.countries],
        count: c.count,
      };
    });

    // Universal: appears in ≥2 countries. Sort by country count
    // descending, then total mention count.
    const universal = clustered
      .filter((r) => r.countries.length >= 2)
      .sort(
        (a, b) =>
          b.countries.length - a.countries.length || b.count - a.count,
      )
      .slice(0, 10);
    const local = clustered
      .filter((r) => r.countries.length === 1)
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    if (universal.length === 0 && local.length === 0) return null;

    return (
      <Page size="A4" style={styles.page}>
        {pageHeader}
        <MText style={styles.pageTitle}>
          {isKo ? "공통 거부 vs 시장별 거부" : "Universal vs market-specific objections"}
        </MText>
        <MText style={styles.pageSubtitle}>
          {isKo
            ? "여러 시장에서 동시에 등장한 거부 요인은 제품 자체의 이슈 — 한 시장에서만 보이는 거부 요인은 현지화 이슈. 두 가지를 분리하면 \"어디 먼저 손볼지\"가 명확해집니다."
            : "Objections surfacing across multiple markets point at product-level fixes; objections in one market only are localisation issues. Separating them tells you what to address first."}
        </MText>

        <View style={styles.sectionBlock}>
          <MText style={[styles.sectionEyebrow, { color: C.risk }]}>
            {isKo
              ? `공통 거부 (2개 이상 시장 — 제품 이슈)`
              : `Universal (in ≥2 markets — product-level)`}
          </MText>
          {universal.length === 0 ? (
            <MText style={{ fontSize: 9, color: C.muted, marginTop: 4 }}>
              {isKo ? "—" : "—"}
            </MText>
          ) : (
            universal.map((r) => (
              <View
                key={r.text}
                style={{
                  flexDirection: "row",
                  alignItems: "flex-start",
                  paddingVertical: 5,
                  borderBottomWidth: 0.5,
                  borderBottomColor: C.divider,
                  gap: 8,
                }}
                wrap={false}
              >
                <View
                  style={{
                    width: 70,
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: 3,
                  }}
                >
                  {r.countries.map((c) => (
                    <View
                      key={c}
                      style={{
                        backgroundColor: C.card,
                        paddingHorizontal: 4,
                        paddingVertical: 1,
                        borderRadius: 2,
                      }}
                    >
                      <MText style={{ fontSize: 7, color: C.ink, fontWeight: 600 }}>
                        {c}
                      </MText>
                    </View>
                  ))}
                </View>
                <MText style={{ fontSize: 9, color: C.body, flex: 1, lineHeight: 1.5 }}>
                  {r.text}
                </MText>
                <MText style={{ fontSize: 8, color: C.muted, width: 36, textAlign: "right" }}>
                  {`${r.count}회`}
                </MText>
              </View>
            ))
          )}
        </View>

        {local.length > 0 && (
          <View style={styles.sectionBlock}>
            <MText style={[styles.sectionEyebrow, { color: C.warn }]}>
              {isKo
                ? `시장별 거부 (단일 시장 — 현지화 이슈)`
                : `Market-specific (single market — localisation)`}
            </MText>
            {local.map((r) => (
              <View
                key={r.text}
                style={{
                  flexDirection: "row",
                  alignItems: "flex-start",
                  paddingVertical: 4,
                  borderBottomWidth: 0.5,
                  borderBottomColor: C.divider,
                  gap: 8,
                }}
                wrap={false}
              >
                <View
                  style={{
                    backgroundColor: C.card,
                    paddingHorizontal: 4,
                    paddingVertical: 1,
                    borderRadius: 2,
                    width: 36,
                  }}
                >
                  <MText style={{ fontSize: 7, color: C.ink, fontWeight: 600 }}>
                    {r.countries[0]}
                  </MText>
                </View>
                <MText style={{ fontSize: 9, color: C.body, flex: 1, lineHeight: 1.5 }}>
                  {r.text}
                </MText>
                <MText style={{ fontSize: 8, color: C.muted, width: 36, textAlign: "right" }}>
                  {`${r.count}회`}
                </MText>
              </View>
            ))}
          </View>
        )}

        <MText style={{ fontSize: 8, color: C.muted, marginTop: 6, lineHeight: 1.5 }}>
          {isKo
            ? "활용: 상단 \"공통\"은 제품 spec / 메시지 / 가격대로 해결 (전 시장 영향). 하단 \"시장별\"은 현지 인증, 채널 선택, 카피 번역 등으로 해결 (해당 시장 한정)."
            : "How to use: 'Universal' calls for product/message/price fixes (affects all markets). 'Market-specific' calls for local cert / channel / copy fixes (one market only)."}
        </MText>

        {pageFooter}
      </Page>
    );
  };

  /**
   * Champion vs Skeptic profile — the strongest advocate persona vs
   * the strongest critic, side-by-side. Quote + demographics + their
   * trust factors / objections. Visceral comparison that maps
   * directly to "who's our 1st customer" and "who's the bar to
   * convert".
   */
  const renderChampionVsSkepticPage = () => {
    if (!tierBudget.showChampionVsSkeptic) return null;
    const champion = aggregate.personas?.topPositiveVoices?.[0];
    const skeptic = aggregate.personas?.topNegativeVoices?.[0];
    if (!champion && !skeptic) return null;
    return (
      <Page size="A4" style={styles.page}>
        {pageHeader}
        <MText style={styles.pageTitle}>
          {isKo ? "챔피언 vs 회의론자 — 양극의 목소리" : "Champion vs Skeptic — the two poles"}
        </MText>
        <MText style={styles.pageSubtitle}>
          {isKo
            ? "가장 강한 옹호자와 가장 강한 비판자를 나란히. 챔피언은 \"누구부터 팔지\"의 답이고, 회의론자는 \"무엇을 해결해야 모두를 설득할지\"의 답입니다."
            : "Strongest advocate vs strongest critic. The champion answers 'who do we sell first?'; the skeptic answers 'what must we fix to win everyone?'."}
        </MText>

        <View style={{ flexDirection: "row", gap: 14 }}>
          {/* Champion side */}
          <View style={{ flex: 1 }}>
            <View
              style={{
                backgroundColor: "#F0FDF4",
                borderTopWidth: 4,
                borderTopColor: C.success,
                padding: 12,
                borderRadius: 4,
              }}
              wrap={false}
            >
              <MText
                style={{
                  fontSize: 8,
                  color: C.success,
                  fontWeight: 700,
                  letterSpacing: 0.6,
                  marginBottom: 4,
                }}
              >
                {isKo ? "챔피언 — 즉시 구매 후보" : "CHAMPION — primary 1st-buyer"}
              </MText>
              {champion ? (
                <>
                  <MText style={{ fontSize: 18, color: C.success, marginBottom: 4 }}>
                    {"“"}
                  </MText>
                  <MText style={{ fontSize: 11, color: C.ink, lineHeight: 1.5, marginBottom: 8 }}>
                    {champion.text}
                  </MText>
                  <View style={{ borderTopWidth: 0.5, borderTopColor: C.divider, paddingTop: 6 }}>
                    <MText style={{ fontSize: 8, color: C.muted, marginBottom: 2 }}>
                      {isKo ? "프로필" : "Profile"}
                    </MText>
                    <MText style={{ fontSize: 9, color: C.ink, fontWeight: 600 }}>
                      {[
                        champion.country,
                        champion.ageRange,
                        champion.profession,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </MText>
                    <MText style={{ fontSize: 8, color: C.muted, marginTop: 6, marginBottom: 2 }}>
                      {isKo ? "구매 의향" : "Purchase intent"}
                    </MText>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <View
                        style={{
                          flex: 1,
                          height: 6,
                          backgroundColor: C.divider,
                          borderRadius: 3,
                        }}
                      >
                        <View
                          style={{
                            width: `${champion.intent}%`,
                            height: 6,
                            backgroundColor: C.success,
                            borderRadius: 3,
                          }}
                        />
                      </View>
                      <MText style={{ fontSize: 9, color: C.success, fontWeight: 700 }}>
                        {`${champion.intent}/100`}
                      </MText>
                    </View>
                  </View>
                </>
              ) : (
                <MText style={{ fontSize: 9, color: C.muted }}>—</MText>
              )}
            </View>
          </View>

          {/* Skeptic side */}
          <View style={{ flex: 1 }}>
            <View
              style={{
                backgroundColor: "#FEF2F2",
                borderTopWidth: 4,
                borderTopColor: C.risk,
                padding: 12,
                borderRadius: 4,
              }}
              wrap={false}
            >
              <MText
                style={{
                  fontSize: 8,
                  color: C.risk,
                  fontWeight: 700,
                  letterSpacing: 0.6,
                  marginBottom: 4,
                }}
              >
                {isKo ? "회의론자 — 마지막 설득 대상" : "SKEPTIC — last to convert"}
              </MText>
              {skeptic ? (
                <>
                  <MText style={{ fontSize: 18, color: C.risk, marginBottom: 4 }}>
                    {"“"}
                  </MText>
                  <MText style={{ fontSize: 11, color: C.ink, lineHeight: 1.5, marginBottom: 8 }}>
                    {skeptic.text}
                  </MText>
                  <View style={{ borderTopWidth: 0.5, borderTopColor: C.divider, paddingTop: 6 }}>
                    <MText style={{ fontSize: 8, color: C.muted, marginBottom: 2 }}>
                      {isKo ? "프로필" : "Profile"}
                    </MText>
                    <MText style={{ fontSize: 9, color: C.ink, fontWeight: 600 }}>
                      {[
                        skeptic.country,
                        skeptic.ageRange,
                        skeptic.profession,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </MText>
                    <MText style={{ fontSize: 8, color: C.muted, marginTop: 6, marginBottom: 2 }}>
                      {isKo ? "구매 의향" : "Purchase intent"}
                    </MText>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <View
                        style={{
                          flex: 1,
                          height: 6,
                          backgroundColor: C.divider,
                          borderRadius: 3,
                        }}
                      >
                        <View
                          style={{
                            width: `${skeptic.intent}%`,
                            height: 6,
                            backgroundColor: C.risk,
                            borderRadius: 3,
                          }}
                        />
                      </View>
                      <MText style={{ fontSize: 9, color: C.risk, fontWeight: 700 }}>
                        {`${skeptic.intent}/100`}
                      </MText>
                    </View>
                  </View>
                </>
              ) : (
                <MText style={{ fontSize: 9, color: C.muted }}>—</MText>
              )}
            </View>
          </View>
        </View>

        <View style={{ marginTop: 14, padding: 10, backgroundColor: C.card, borderRadius: 4 }}>
          <MText style={{ fontSize: 9, color: C.body, lineHeight: 1.6 }}>
            {isKo
              ? "이 두 사람의 차이를 좁히는 게 곧 GTM 전략입니다. 챔피언이 \"왜 사겠다\"고 한 이유를 카피·랜딩으로 증폭하고 (메시지 무기화), 회의론자가 \"왜 안 사겠다\"고 한 이유를 가격·인증·CS로 차단하면 (반론 무력화) 평균 의향이 위로 끌려옵니다."
              : "Closing the gap between these two voices IS the GTM. Amplify the champion's reason for buying through copy + landing (weaponise the message), and neutralise the skeptic's reason for not buying through price + cert + CS (kill the objection). The mean intent rises."}
          </MText>
        </View>

        {pageFooter}
      </Page>
    );
  };

  /**
   * Trust factors vs Objections — for the recommended country only,
   * show top 5 of each side-by-side. Answers "what convinces vs what
   * blocks" buyers in the priority market — direct input for messaging
   * and FAQ.
   */
  const renderTrustVsObjectionPage = () => {
    if (!tierBudget.showTrustVsObjection) return null;
    const rec = aggregate.recommendation.country;
    if (!rec) return null;
    const stats = aggregate.countryStats.find(
      (c) => c.country.toUpperCase() === rec.toUpperCase(),
    );
    // Strip persona-mismatch noise ("non-smoker, this product isn't for
    // me" type objections) — same filter as elsewhere. Trust factors
    // don't suffer the same pattern; left untouched.
    const objections = (stats?.detail?.topObjections ?? []).filter(
      (o) => !isPersonaMismatchNoise(o.text),
    );
    const trustFactors = stats?.detail?.topTrustFactors ?? [];
    const personasInCountry = aggregate.personas?.byCountry?.find(
      (b) => b.country.toUpperCase() === rec.toUpperCase(),
    );
    if (objections.length === 0 && trustFactors.length === 0 && !personasInCountry) return null;
    return (
      <Page size="A4" style={styles.page}>
        {pageHeader}
        <MText style={styles.pageTitle}>
          {isKo
            ? `${rec} — 무엇이 설득하고 무엇이 막는가`
            : `${rec} — What convinces vs what blocks`}
        </MText>
        <MText style={styles.pageSubtitle}>
          {isKo
            ? "추천 진출국 페르소나의 신뢰 요인 vs 거부 요인 Top 5. 메시징, FAQ, 안심 신호 디자인의 직접 input."
            : "Top trust factors and top objections from personas in the recommended market — direct input for messaging, FAQ, and reassurance design."}
        </MText>

        <View style={{ flexDirection: "row", gap: 12 }}>
          <View
            style={{
              flex: 1,
              borderLeftWidth: 3,
              borderLeftColor: C.success,
              paddingLeft: 8,
            }}
          >
            <MText
              style={{
                fontSize: 11,
                color: C.success,
                fontWeight: 700,
                marginBottom: 6,
              }}
            >
              {isKo ? "신뢰 요인 (설득의 지렛대)" : "Trust factors (the levers)"}
            </MText>
            <MText style={{ fontSize: 8, color: C.muted, marginBottom: 8 }}>
              {isKo ? "이걸 강조하면 의향 상승" : "Emphasize these → intent rises"}
            </MText>
            {trustFactors.length === 0 ? (
              <MText style={{ fontSize: 9, color: C.muted }}>—</MText>
            ) : (
              trustFactors.map((t, i) => {
                const denom = personasInCountry?.count ?? 0;
                const sharePct =
                  denom > 0 ? Math.round((t.count / denom) * 100) : null;
                return (
                  <View
                    key={i}
                    style={{
                      flexDirection: "row",
                      marginBottom: 4,
                      gap: 6,
                    }}
                    wrap={false}
                  >
                    <MText
                      style={{
                        fontSize: 9,
                        color: C.muted,
                        width: 36,
                        textAlign: "right",
                        fontWeight: 700,
                      }}
                    >
                      {sharePct != null ? `${sharePct}%` : String(t.count)}
                    </MText>
                    <MText
                      style={{
                        fontSize: 9,
                        color: C.body,
                        flex: 1,
                        lineHeight: 1.5,
                      }}
                    >
                      {t.text}
                    </MText>
                  </View>
                );
              })
            )}
            {personasInCountry?.count != null && (
              <MText style={{ fontSize: 8, color: C.muted, marginTop: 8, lineHeight: 1.5 }}>
                {isKo
                  ? `이 국가 페르소나 ${personasInCountry.count}명 · 평균 의향 ${personasInCountry.meanIntent}/100`
                  : `${personasInCountry.count} personas · mean intent ${personasInCountry.meanIntent}/100`}
              </MText>
            )}
          </View>

          <View
            style={{
              flex: 1,
              borderLeftWidth: 3,
              borderLeftColor: C.risk,
              paddingLeft: 8,
            }}
          >
            <MText
              style={{
                fontSize: 11,
                color: C.risk,
                fontWeight: 700,
                marginBottom: 6,
              }}
            >
              {isKo ? "거부 요인 Top 5 (막는 벽)" : "Top 5 objections (the walls)"}
            </MText>
            <MText style={{ fontSize: 8, color: C.muted, marginBottom: 8 }}>
              {isKo ? "이걸 못 풀면 의향 하락" : "Fail to address → intent drops"}
            </MText>
            {objections.length === 0 ? (
              <MText style={{ fontSize: 9, color: C.muted }}>—</MText>
            ) : (
              objections.map((o, i) => {
                const denom = personasInCountry?.count ?? 0;
                const sharePct =
                  denom > 0 ? Math.round((o.count / denom) * 100) : null;
                return (
                  <View
                    key={i}
                    style={{
                      flexDirection: "row",
                      marginBottom: 4,
                      gap: 6,
                    }}
                    wrap={false}
                  >
                    <MText
                      style={{
                        fontSize: 9,
                        color: C.muted,
                        width: 36,
                        textAlign: "right",
                        fontWeight: 700,
                      }}
                    >
                      {sharePct != null ? `${sharePct}%` : String(o.count)}
                    </MText>
                    <MText
                      style={{
                        fontSize: 9,
                        color: C.body,
                        flex: 1,
                        lineHeight: 1.5,
                      }}
                    >
                      {o.text}
                    </MText>
                  </View>
                );
              })
            )}
          </View>
        </View>

        <MText style={{ fontSize: 8, color: C.muted, marginTop: 12, lineHeight: 1.5 }}>
          {isKo
            ? "활용 가이드: 신뢰 요인 Top 3 → 랜딩 hero 카피 / FAQ. 거부 요인 Top 3 → 안심 배지 (인증·환불·CS) + 사회적 증거 (리뷰·인플루언서)로 직접 무력화. 양쪽 모두 답변 못한 페이지 = 의향 = 0."
            : "Use this: Top 3 trust → landing hero copy + FAQ. Top 3 objections → reassurance badges (cert, returns, CS) + social proof (reviews, influencers) to defuse directly. A page that answers neither side will hold intent at zero."}
        </MText>

        {pageFooter}
      </Page>
    );
  };

  /**
   * Cross-LLM disagreement — when 2+ providers disagreed on the
   * recommended country, surface the split with each provider's pick
   * and the reason inferable from their support count. Only renders
   * when ≥2 providers AND the providers picked different bestCountries.
   * Quietly skips otherwise — no-disagreement pages are filler.
   */
  const renderProviderDisagreementPage = () => {
    if (!tierBudget.showProviderDisagreement) return null;
    if (!aggregate.providerBreakdown || aggregate.providerBreakdown.length < 2) return null;
    // Each provider's top pick. If all top picks are the same, skip.
    const picks = aggregate.providerBreakdown.map((pb) => ({
      provider: pb.provider,
      simCount: pb.simCount,
      top: pb.bestCountryDistribution[0],
      agreement: pb.agreementWithOverallPercent,
      runnerUp: pb.bestCountryDistribution[1],
    }));
    const uniqueTopCountries = new Set(picks.map((p) => p.top?.country).filter(Boolean));
    if (uniqueTopCountries.size < 2) return null;

    return (
      <Page size="A4" style={styles.page}>
        {pageHeader}
        <MText style={styles.pageTitle}>
          {isKo ? "LLM 교차 의견 차이 — 모델별 추천 분기점" : "Cross-model disagreement"}
        </MText>
        <MText style={styles.pageSubtitle}>
          {isKo
            ? "모델끼리 의견이 갈린 지점. 단일 모델 편향이 아닌, 진짜 데이터 모호성에서 비롯된 분기점입니다 — 각 모델이 무엇을 우선시했는지 비교해 보세요."
            : "Where the LLMs split. Not single-model bias — a genuine data ambiguity. Compare what each model weighted to see why."}
        </MText>

        <View style={styles.sectionBlock}>
          {picks.map((p) => {
            const top = p.top;
            const ru = p.runnerUp;
            const tone =
              p.agreement >= 75 ? C.success : p.agreement >= 50 ? C.warn : C.risk;
            return (
              <View
                key={p.provider}
                style={{
                  borderWidth: 1,
                  borderColor: tone,
                  borderRadius: 4,
                  padding: 8,
                  marginBottom: 8,
                  backgroundColor: C.card,
                }}
                wrap={false}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "baseline",
                    justifyContent: "space-between",
                    marginBottom: 4,
                  }}
                >
                  <MText style={{ fontSize: 10, color: C.ink, fontWeight: 700 }}>
                    {`${providerLabelPdf(p.provider)} · ${p.simCount} sims`}
                  </MText>
                  <MText style={{ fontSize: 8, color: tone, fontWeight: 600 }}>
                    {isKo
                      ? `전체 합의 일치 ${p.agreement}%`
                      : `${p.agreement}% aligned with overall`}
                  </MText>
                </View>
                <View style={{ flexDirection: "row", gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <MText style={{ fontSize: 7, color: C.muted, fontWeight: 600 }}>
                      {isKo ? "이 모델의 1순위" : "This model's pick"}
                    </MText>
                    <MText style={{ fontSize: 13, color: C.ink, fontWeight: 700, marginTop: 2 }}>
                      {top?.country ?? "—"}
                    </MText>
                    {top && (
                      <MText style={{ fontSize: 8, color: C.muted, marginTop: 2 }}>
                        {`${top.percent}% ${isKo ? "이 모델 시뮬에서 1위" : "of this model's sims"}`}
                      </MText>
                    )}
                  </View>
                  {ru && (
                    <View style={{ flex: 1 }}>
                      <MText style={{ fontSize: 7, color: C.muted, fontWeight: 600 }}>
                        {isKo ? "차순위" : "Runner-up"}
                      </MText>
                      <MText style={{ fontSize: 11, color: C.body, marginTop: 2 }}>
                        {ru.country}
                      </MText>
                      <MText style={{ fontSize: 8, color: C.muted, marginTop: 2 }}>
                        {`${ru.percent}%`}
                      </MText>
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </View>

        <MText style={{ fontSize: 8, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>
          {isKo
            ? "해석 가이드: 합의 일치 50% 미만인 모델은 \"전체 합의에서 멀리 떨어진 의견\"을 가지고 있습니다. 그 모델의 1순위가 합리적 시나리오일 수 있으니 이유를 검토하세요. 75% 이상은 강한 합의 — 추가 검증 불필요."
            : "Read the agreement %: < 50% means this model dissented from the room — its pick is a credible alt-scenario worth examining. ≥ 75% means strong consensus — no further verification needed."}
        </MText>

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

  // Variant fork. The executive deck reuses the same renderers but
  // selects a tighter page set + a different cover; the detailed
  // report keeps the existing comprehensive layout. Both share every
  // helper component below — the variant boundary is purely the page
  // ordering.
  const variant = args.variant ?? "detailed";

  const coverPage = (
    <Page size="A4" style={styles.coverPage}>
      <View style={styles.coverInner}>
        <View>
          <MText style={styles.coverEyebrow}>
            {variant === "executive"
              ? `${t.coverEyebrow} · ${isKo ? "임원용" : "EXECUTIVE"}`
              : t.coverEyebrow}
          </MText>
          <MText
            style={[
              styles.coverTitle,
              { fontSize: fitCoverTitleSize(productName) },
            ]}
          >
            {stripUnsupportedGlyphs(productName)}
          </MText>
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
  );

  const doc = (
    <Document>
      {coverPage}

      {variant === "executive" ? (
        // Executive deck: 1-page brief + verdict + recommendation +
        // actions/risks + pricing. Skip drilldowns / per-persona /
        // provider consensus / variance / appendix — they belong in
        // the detailed report. Go/No-Go is the most decision-critical
        // page so it lands right after the brief.
        <>
          {renderOnePageBriefPage()}
          {renderGoNoGoVerdictPage()}
          {renderRecommendationPage()}
          {renderMarketProfilePage()}
          {renderActionsPage()}
          {renderRisksPage()}
          {renderPricingPage()}
        </>
      ) : (
        // Detailed report: every page, in the order that gives a
        // narrative arc — context → recommendation → drilldown → support.
        <>
          {renderOnePageBriefPage()}
          {renderGoNoGoVerdictPage()}
          {renderProjectInfoPage()}
          {renderExecutiveSummaryPage()}
          {renderRecommendationPage()}
          {renderMarketProfilePage()}
          {renderCountryDecisionMatrixPage()}
          {renderExecutionTimelinePage()}
          {renderCountriesPage()}
          {renderCountryDetailPage()}
          {renderCountryFunnelComparisonPage()}
          {renderIncomeIntentPage()}
          {renderProfessionRankingPage()}
          {renderChannelPriorityPage()}
          {renderArchetypesPage()}
          {renderPersonasPage()}
          {renderVoicesPage()}
          {renderChampionVsSkepticPage()}
          {renderCommonObjectionsPage()}
          {renderTrustVsObjectionPage()}
          {renderPricingPage()}
          {renderRisksPage()}
          {renderActionsPage()}
          {renderInvestmentROIPage()}
          {renderSensitivityAnalysisPage()}
          {renderRiskActionMappingPage()}
          {renderProviderConsensusPage()}
          {renderProviderDisagreementPage()}
          {renderVariancePage()}
          {renderAppendixPage()}
        </>
      )}
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

function SummaryRow({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <MText style={{ fontSize: 9, color: C.muted }}>{label}</MText>
      <MText style={{ fontSize: 9, color: valueColor ?? C.ink, fontWeight: 600 }}>
        {value}
      </MText>
    </View>
  );
}

/**
 * Per-country score decomposition rendered as 6 horizontal bars.
 * Mirrors the CountryComponentBreakdown component in EnsembleView.tsx
 * so the PDF and the dashboard look intentionally aligned. Bar colour
 * follows the same threshold (≥70 success / ≥50 warn / else risk).
 */
/**
 * Inline persona-quote callout for sprinkling through the body of the
 * report. Bigger and more visually distinctive than the dense voiceCard
 * in the dedicated voices page — designed to break up text-heavy pages
 * and give them an emotional anchor. Tone (success / warn / brand)
 * reflects the polarity of the quote so a reader scanning the report
 * sees green for "champion" callouts, amber for "skeptic", brand for
 * neutral / contextual.
 *
 * "Big quote mark" effect via a literal " glyph rendered at 28pt above
 * the quote text. The bundled font supports CJK punctuation so this
 * works in Korean. No real italic available — we lean on quote marks
 * + size + colour for emphasis instead.
 */
function QuoteCallout({
  quote,
  tone = "brand",
  isKo,
  label,
}: {
  quote: { text: string; country: string; intent: number; profession?: string; ageRange?: string };
  tone?: "success" | "warn" | "brand";
  isKo: boolean;
  /** Optional eyebrow ("페르소나의 목소리" / "한 chempion의 인용" 등). */
  label?: string;
}) {
  const accent = tone === "success" ? C.success : tone === "warn" ? C.warn : C.brand;
  const bg =
    tone === "success"
      ? "#F0FDF4"
      : tone === "warn"
        ? "#FFFBEB"
        : "#EFF6FF";
  return (
    <View
      style={{
        backgroundColor: bg,
        borderLeftWidth: 3,
        borderLeftColor: accent,
        paddingLeft: 14,
        paddingRight: 14,
        paddingTop: 10,
        paddingBottom: 12,
        marginVertical: 12,
        borderRadius: 4,
      }}
      wrap={false}
    >
      {label && (
        <MText
          style={{
            fontSize: 7,
            color: accent,
            fontWeight: 700,
            letterSpacing: 0.6,
            marginBottom: 6,
          }}
        >
          {label.toUpperCase()}
        </MText>
      )}
      <View style={{ flexDirection: "row", gap: 6 }}>
        <MText style={{ fontSize: 22, color: accent, lineHeight: 1, fontWeight: 700 }}>
          {"“"}
        </MText>
        <View style={{ flex: 1, paddingTop: 2 }}>
          <MText style={{ fontSize: 11, color: C.ink, lineHeight: 1.5 }}>
            {quote.text}
          </MText>
          <MText style={{ fontSize: 8, color: C.muted, marginTop: 6 }}>
            {[
              quote.country,
              quote.ageRange,
              quote.profession,
              isKo ? `구매의향 ${quote.intent}/100` : `intent ${quote.intent}/100`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </MText>
        </View>
      </View>
    </View>
  );
}

/**
 * Pick a representative quote from the aggregate, optionally biased
 * toward a specific country and polarity. Returns null when nothing
 * fits — caller should hide the callout in that case.
 *
 *   polarity "positive" → topPositiveVoices (champions)
 *   polarity "negative" → topNegativeVoices (skeptics)
 *
 * Country filter does best-effort: if the country has no quote in the
 * polarity bucket, we fall back to overall top of that polarity.
 */
function pickQuote(
  aggregate: EnsembleAggregate,
  opts: {
    country?: string;
    polarity: "positive" | "negative";
    offset?: number;
    /** Optional content filter — first voice whose text matches the
     *  predicate wins. Used by the price-sensitivity callout to avoid
     *  surfacing a category-mismatch voice ("vape near a baby is
     *  inappropriate") as if it were a price objection. */
    filter?: (text: string) => boolean;
  },
): {
  text: string;
  country: string;
  intent: number;
  profession?: string;
  ageRange?: string;
} | null {
  const pool =
    opts.polarity === "positive"
      ? aggregate.personas?.topPositiveVoices
      : aggregate.personas?.topNegativeVoices;
  if (!pool || pool.length === 0) return null;
  const offset = opts.offset ?? 0;
  // Always strip persona-mismatch noise — these voices ("not for me /
  // doesn't apply to me") aren't useful as product feedback regardless
  // of polarity, and they crowd out actually-actionable feedback.
  const cleanPool = pool.filter((v) => !isPersonaMismatchNoise(v.text));
  // When a content filter is supplied (e.g. price vocabulary for the
  // "price-sensitive persona" callout), the caller is asserting the
  // quote MUST be on-topic. Falling back to the unfiltered pool would
  // surface a pregnant-nurse quote ("doctors would tell me to stop")
  // under a "price-sensitive" label, which is exactly the mislabeling
  // we are trying to avoid. So: if a filter is provided and nothing
  // matches, return null and let the caller hide the callout.
  const finalPool = opts.filter
    ? cleanPool.filter((v) => opts.filter!(v.text))
    : cleanPool;
  if (finalPool.length === 0) return null;
  if (opts.country) {
    const wanted = opts.country.toUpperCase();
    const filtered = finalPool.filter((v) => v.country.toUpperCase() === wanted);
    if (filtered.length > offset) return filtered[offset];
  }
  if (finalPool.length > offset) return finalPool[offset];
  return finalPool[0] ?? null;
}

/**
 * Price-vocabulary heuristic — used to verify a "price-sensitive
 * persona" callout actually quotes someone complaining about price,
 * not category fit or some unrelated angle. Bilingual KO + EN.
 */
function isPriceObjectionText(text: string): boolean {
  const t = text.toLowerCase();
  if (
    /가격|비용|비싸|비쌈|비싸|부담|저렴|가성비|비용\s*효율|예산|월정액|구독\s*비|단가|할인|세일|반복\s*구매\s*비용|소모품|총\s*비용|연간\s*비용|매월/.test(
      text,
    )
  ) return true;
  if (
    /\b(price|pricing|cost|costly|expensive|cheap|affordable|budget|spend|spending|monthly fee|subscription cost|recurring|refill|cheaper|pricier|too high)\b/.test(
      t,
    )
  ) return true;
  // Currency / number patterns — "$20", "€15", "₩50000", "20,000원"
  if (/[$€£￥¥₩]\s*\d|\d[,.]?\d*\s*원|\d+\s*달러/.test(text)) return true;
  return false;
}

/**
 * Compact horizontal bar used in the per-country funnel comparison
 * page. Each call renders one cell of a row: bar + numeric suffix.
 * Designed to fit 4-5 across a row at A4 width.
 */
/**
 * Pick the most decision-relevant blocker from a country's objection
 * list. The aggregator's top-objection is just frequency-based, which
 * lets persona-product mismatch noise ("이 제품은 성인용이라 아이 신발
 * 찾는 나에겐 무관") rise to the top when a persona was the wrong ICP
 * for the product. Those aren't market blockers — they're sample-
 * generation noise.
 *
 * Strategy: walk the top-N objections, skip ones matching mismatch
 * patterns (persona's category mismatch, "no interest", "not the
 * target", etc.), return the first remaining. Falls back to the
 * raw top-1 if all are filtered out — better some content than none.
 */
function pickMarketBlocker(
  objections: Array<{ text: string; count: number }> | undefined,
): string {
  if (!objections || objections.length === 0) return "—";
  for (const o of objections) {
    if (!isPersonaMismatchNoise(o.text)) return o.text;
  }
  // All filtered → still surface top-1 so the column isn't empty.
  return objections[0].text;
}

function MiniBar({
  value,
  max,
  color,
  suffix,
}: {
  value: number;
  max: number;
  color: string;
  suffix: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 4, marginRight: 4 }}>
      <View style={{ flex: 1, height: 6, backgroundColor: C.divider, borderRadius: 3 }}>
        <View
          style={{
            width: `${pct}%`,
            height: 6,
            backgroundColor: color,
            borderRadius: 3,
          }}
        />
      </View>
      <MText style={{ fontSize: 8, color: C.ink, width: 32, textAlign: "right" }}>
        {suffix}
      </MText>
    </View>
  );
}

function ComponentBars({
  components,
  isKo,
}: {
  components: NonNullable<EnsembleAggregate["countryStats"][number]["components"]>;
  isKo: boolean;
}) {
  const rows = [
    { label: isKo ? "시장 크기" : "Market size", value: components.marketSize.mean },
    { label: isKo ? "문화 적합" : "Cultural fit", value: components.culturalFit.mean },
    { label: isKo ? "채널 매치" : "Channel match", value: components.channelMatch.mean },
    { label: isKo ? "가격 수용" : "Price fit", value: components.priceCompat.mean },
    { label: isKo ? "경쟁 (역치)" : "Competition (inv)", value: components.competition.mean },
    { label: isKo ? "규제 (역치)" : "Regulatory (inv)", value: components.regulatory.mean },
  ];
  return (
    <View style={{ gap: 3 }}>
      {rows.map((r) => {
        const color = r.value >= 70 ? C.success : r.value >= 50 ? C.warn : C.risk;
        const pct = Math.max(0, Math.min(100, r.value));
        return (
          <View key={r.label} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <MText style={{ fontSize: 8, color: C.muted, width: 80 }}>{r.label}</MText>
            <View style={{ flex: 1, height: 6, backgroundColor: C.divider, borderRadius: 3 }}>
              <View
                style={{
                  width: `${pct}%`,
                  height: 6,
                  backgroundColor: color,
                  borderRadius: 3,
                }}
              />
            </View>
            <MText style={{ fontSize: 8, color: C.ink, width: 22, textAlign: "right" }}>
              {r.value.toFixed(0)}
            </MText>
          </View>
        );
      })}
    </View>
  );
}

/**
 * Conversion funnel as 3 horizontal bars (ad curiosity → click → buy).
 * Mirrors the FunnelStrip dashboard component so the printed report
 * and the live page tell the same story.
 */
function FunnelBars({
  funnel,
  isKo,
}: {
  funnel: NonNullable<
    NonNullable<EnsembleAggregate["countryStats"][number]["detail"]>["funnel"]
  >;
  isKo: boolean;
}) {
  const rows = [
    {
      label: isKo ? "광고 호기심" : "Ad curiosity",
      value: funnel.curiosityMean,
      suffix: "/100",
    },
    {
      label: isKo ? "클릭 의향" : "Click rate",
      value: funnel.clickRatePct,
      suffix: "%",
    },
    {
      label: isKo ? "구매 의향" : "Buy rate",
      value: funnel.buyRatePct,
      suffix: "%",
    },
  ];
  return (
    <View style={{ gap: 3 }}>
      {rows.map((r, idx) => {
        const color = r.value >= 60 || (idx === 1 && r.value >= 50)
          ? C.success
          : r.value >= 40 || (idx >= 1 && r.value >= 25)
            ? C.warn
            : C.risk;
        const pct = Math.max(0, Math.min(100, r.value));
        return (
          <View key={r.label} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <MText style={{ fontSize: 8, color: C.muted, width: 80 }}>{r.label}</MText>
            <View style={{ flex: 1, height: 6, backgroundColor: C.divider, borderRadius: 3 }}>
              <View
                style={{
                  width: `${pct}%`,
                  height: 6,
                  backgroundColor: color,
                  borderRadius: 3,
                }}
              />
            </View>
            <MText style={{ fontSize: 8, color: C.ink, width: 36, textAlign: "right" }}>
              {`${r.value.toFixed(idx === 0 ? 1 : 0)}${r.suffix}`}
            </MText>
          </View>
        );
      })}
      <MText style={{ fontSize: 7, color: C.muted, marginTop: 1 }}>
        {isKo
          ? `샘플 ${funnel.sample.toLocaleString()}명 · 광고→클릭→구매 전환율`
          : `${funnel.sample.toLocaleString()} personas · ad→click→buy conversion`}
      </MText>
    </View>
  );
}

/**
 * Pricing sensitivity matrix as a compact 3-cell threshold strip + two
 * scenario boxes for ±10%. Mirrors PricingSensitivityPanel in the
 * dashboard so the PDF and the live page stay in sync.
 */
function PricingSensitivityBlock({
  sensitivity,
  recommendedPriceCents,
  currency,
  isKo,
}: {
  sensitivity: NonNullable<NonNullable<EnsembleAggregate["pricing"]>["sensitivity"]>;
  recommendedPriceCents: number;
  currency: string | undefined;
  isKo: boolean;
}) {
  const fmt = (cents: number) => formatPrice(cents, currency);
  const thresholds: Array<{ label: string; value: number | null; color: string; desc: string }> = [
    {
      label: isKo ? "안심 상한" : "Comfort ceiling",
      value: sensitivity.comfortCeilingCents,
      color: C.success,
      desc: isKo ? "이 가격 이하 → 50%+ 구매" : "Below: ≥ 50% convert",
    },
    {
      label: isKo ? "수요 변곡점" : "Demand knee",
      value: sensitivity.inflectionCents,
      color: C.warn,
      desc: isKo ? "여기서 수요 급락" : "Steepest drop here",
    },
    {
      label: isKo ? "거부 하한" : "Rejection floor",
      value: sensitivity.rejectionFloorCents,
      color: C.risk,
      desc: isKo ? "이상이면 90%+ 거부" : "Above: ≥ 90% reject",
    },
  ];
  const visible = thresholds.filter((t) => t.value != null);

  return (
    <View>
      {visible.length > 0 && (
        <View style={{ flexDirection: "row", gap: 6, marginBottom: 6 }}>
          {visible.map((t) => (
            <View
              key={t.label}
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: t.color,
                borderRadius: 4,
                padding: 6,
                backgroundColor: C.card,
              }}
            >
              <MText style={{ fontSize: 7, color: C.muted, fontWeight: 600, marginBottom: 2 }}>
                {t.label}
              </MText>
              <MText style={{ fontSize: 11, color: C.ink, fontWeight: 700 }}>
                {fmt(t.value!)}
              </MText>
              <MText style={{ fontSize: 7, color: C.muted, marginTop: 1 }}>{t.desc}</MText>
            </View>
          ))}
        </View>
      )}

      {(sensitivity.ifPriceDown10Pct || sensitivity.ifPriceUp10Pct) && (
        <View style={{ flexDirection: "row", gap: 6 }}>
          {sensitivity.ifPriceDown10Pct && (
            <View
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: C.divider,
                borderRadius: 4,
                padding: 6,
                backgroundColor: C.card,
              }}
            >
              <MText style={{ fontSize: 7, color: C.muted, fontWeight: 600 }}>
                {isKo ? "권장가 −10%" : "−10% from rec"}
              </MText>
              <MText style={{ fontSize: 10, color: C.ink, fontWeight: 700, marginVertical: 2 }}>
                {fmt(recommendedPriceCents * 0.9)}
              </MText>
              <MText style={{ fontSize: 8, color: C.body }}>
                {isKo
                  ? `전환 ${sensitivity.ifPriceDown10Pct.conversionPct.toFixed(1)}% · 매출 ${
                      sensitivity.ifPriceDown10Pct.revenueIndexDelta > 0 ? "+" : ""
                    }${sensitivity.ifPriceDown10Pct.revenueIndexDelta.toFixed(1)}%`
                  : `Conv ${sensitivity.ifPriceDown10Pct.conversionPct.toFixed(1)}% · Rev ${
                      sensitivity.ifPriceDown10Pct.revenueIndexDelta > 0 ? "+" : ""
                    }${sensitivity.ifPriceDown10Pct.revenueIndexDelta.toFixed(1)}%`}
              </MText>
            </View>
          )}
          {sensitivity.ifPriceUp10Pct && (
            <View
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: C.divider,
                borderRadius: 4,
                padding: 6,
                backgroundColor: C.card,
              }}
            >
              <MText style={{ fontSize: 7, color: C.muted, fontWeight: 600 }}>
                {isKo ? "권장가 +10%" : "+10% from rec"}
              </MText>
              <MText style={{ fontSize: 10, color: C.ink, fontWeight: 700, marginVertical: 2 }}>
                {fmt(recommendedPriceCents * 1.1)}
              </MText>
              <MText style={{ fontSize: 8, color: C.body }}>
                {isKo
                  ? `전환 ${sensitivity.ifPriceUp10Pct.conversionPct.toFixed(1)}% · 매출 ${
                      sensitivity.ifPriceUp10Pct.revenueIndexDelta > 0 ? "+" : ""
                    }${sensitivity.ifPriceUp10Pct.revenueIndexDelta.toFixed(1)}%`
                  : `Conv ${sensitivity.ifPriceUp10Pct.conversionPct.toFixed(1)}% · Rev ${
                      sensitivity.ifPriceUp10Pct.revenueIndexDelta > 0 ? "+" : ""
                    }${sensitivity.ifPriceUp10Pct.revenueIndexDelta.toFixed(1)}%`}
              </MText>
            </View>
          )}
        </View>
      )}

      {sensitivity.elasticityAtRec != null && (
        <MText style={{ fontSize: 8, color: C.muted, marginTop: 4 }}>
          {isKo
            ? `권장가 탄력성 ${sensitivity.elasticityAtRec.toFixed(2)} · ${
                Math.abs(sensitivity.elasticityAtRec) >= 1 ? "탄력적 (할인 효과 큼)" : "비탄력적 (프리미엄 가능)"
              }`
            : `Elasticity at rec ${sensitivity.elasticityAtRec.toFixed(2)} · ${
                Math.abs(sensitivity.elasticityAtRec) >= 1 ? "elastic (discounts move volume)" : "inelastic (premium viable)"
              }`}
        </MText>
      )}
    </View>
  );
}

function SegmentBlock({
  title,
  rows,
  isKo,
}: {
  title: string;
  rows: NonNullable<NonNullable<EnsembleAggregate["personas"]>["segmentBreakdown"]>["byGender"];
  isKo: boolean;
}) {
  return (
    <View style={{ flex: 1, backgroundColor: C.card, padding: 8, borderRadius: 4 }}>
      <MText style={{ fontSize: 8, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 }}>
        {title}
      </MText>
      {rows.map((r) => (
        <View key={r.bucket} style={{ marginBottom: 4 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <MText style={{ fontSize: 9, color: C.ink, fontWeight: 600 }}>{r.bucket}</MText>
            <MText style={{ fontSize: 9, color: C.ink, fontFamily: "AppFont" }}>
              {`${r.meanIntent}%`}
            </MText>
          </View>
          <MText style={{ fontSize: 7, color: C.muted }}>
            {`n=${r.count} · ${isKo ? "1순위" : "Top"}: ${r.topCountry} (${r.topCountryShare}%)`}
          </MText>
        </View>
      ))}
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

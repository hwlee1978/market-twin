import {
  Document,
  Font,
  Page,
  StyleSheet,
  Svg,
  Path,
  Rect,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { SimulationResult } from "@/lib/simulation/schemas";
import { getCountryLabel } from "@/lib/countries";

// Pretendard for Korean. react-pdf only supports TTF/OTF (NOT woff) and
// fetches the font over HTTP at render time.
Font.register({
  family: "AppFont",
  fonts: [
    {
      src: "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/public/static/Pretendard-Regular.otf",
      fontWeight: 400,
    },
    {
      src: "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/public/static/Pretendard-Medium.otf",
      fontWeight: 500,
    },
    {
      src: "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/public/static/Pretendard-SemiBold.otf",
      fontWeight: 600,
    },
    {
      src: "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/public/static/Pretendard-Bold.otf",
      fontWeight: 700,
    },
  ],
});

// Pretendard misses Japanese kana and most extended CJK ideographs — register
// Noto Sans JP as a fallback for source citations like "厚生労働省".
Font.register({
  family: "AppFontCJK",
  fonts: [
    {
      src: "https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Sans/SubsetOTF/JP/NotoSansJP-Regular.otf",
      fontWeight: 400,
    },
    {
      src: "https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Sans/SubsetOTF/JP/NotoSansJP-Bold.otf",
      fontWeight: 700,
    },
  ],
});

/**
 * True if the string contains characters Pretendard can't render — Japanese
 * kana, or CJK ideographs without surrounding Korean Hangul. Used to switch
 * source/citation text to the JP-capable font.
 */
function containsExtendedCJK(text: string): boolean {
  if (/[぀-ゟ゠-ヿ]/.test(text)) return true;
  const hasIdeographs = /[一-鿿]/.test(text);
  const hasHangul = /[가-힯]/.test(text);
  return hasIdeographs && !hasHangul;
}

const C = {
  brand: "#0A1F4D",
  brandSoft: "#EAF0FB",
  brandText: "#0A1F4D",
  accent: "#06B6D4",
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
    paddingTop: 64,
    paddingBottom: 56,
    paddingHorizontal: 48,
    fontSize: 10,
    fontFamily: "AppFont",
    color: C.ink,
  },
  // Page chrome (running header + footer) — used on every non-cover page.
  pageHeader: {
    position: "absolute",
    top: 24,
    left: 48,
    right: 48,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: 8,
    borderBottom: `0.5pt solid ${C.divider}`,
    fontSize: 8,
    color: C.muted,
  },
  pageHeaderBrand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  pageHeaderText: {
    fontSize: 8,
    color: C.muted,
    fontWeight: 600,
    letterSpacing: 0.4,
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
  // (Padding moved to `page` so chrome margins survive page breaks. The
  // <View style={styles.body}> wrapper has been removed from each page.)

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
  coverBrand: { flexDirection: "row", alignItems: "center", gap: 10 },
  coverBrandName: { fontSize: 14, fontWeight: 600, letterSpacing: -0.2 },
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
    lineHeight: 1.2,
    letterSpacing: -0.4,
    marginBottom: 18,
  },
  coverProductName: {
    fontSize: 18,
    fontWeight: 500,
    color: "#CCD8F0",
    marginBottom: 30,
  },
  coverHeroRow: { flexDirection: "row", gap: 14, marginTop: 40 },
  coverHeroCard: {
    flexGrow: 1,
    flexBasis: 0,
    padding: 16,
    borderRadius: 8,
    border: "1pt solid rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  coverHeroLabel: {
    fontSize: 8,
    color: "#94CFEA",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  coverHeroValue: { fontSize: 22, fontWeight: 700, letterSpacing: -0.4 },
  coverHeroSub: { fontSize: 9, color: "#CCD8F0", marginTop: 4 },
  coverMetaRow: {
    flexDirection: "row",
    gap: 18,
    marginTop: 30,
    paddingTop: 16,
    borderTop: "0.5pt solid rgba(255,255,255,0.18)",
  },
  coverMetaItem: { flexBasis: 0, flexGrow: 1 },
  coverMetaLabel: {
    fontSize: 8,
    color: "#94CFEA",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 3,
  },
  coverMetaValue: { fontSize: 11, fontWeight: 500, color: "#FFFFFF" },

  // Section primitives
  sectionEyebrow: {
    fontSize: 8,
    fontWeight: 600,
    color: C.brand,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  h2: {
    fontSize: 16,
    fontWeight: 700,
    color: C.ink,
    marginBottom: 14,
    letterSpacing: -0.2,
  },
  sectionGap: { marginTop: 24 },
  para: { fontSize: 10, lineHeight: 1.65, color: C.body },
  paraTight: { fontSize: 9.5, lineHeight: 1.5, color: C.body },
  microLabel: {
    fontSize: 8,
    color: C.muted,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    fontWeight: 600,
  },

  // KPI strip
  kpiRow: { flexDirection: "row", gap: 10, marginBottom: 6 },
  kpi: {
    flexGrow: 1,
    flexBasis: 0,
    padding: 12,
    borderRadius: 6,
    border: `0.5pt solid ${C.divider}`,
    backgroundColor: C.card,
  },
  kpiLabel: {
    fontSize: 8,
    color: C.muted,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    fontWeight: 600,
    marginBottom: 6,
  },
  kpiValue: { fontSize: 17, fontWeight: 700, color: C.brand, letterSpacing: -0.3 },
  kpiSub: { fontSize: 8, color: C.muted, marginTop: 3 },

  // Tables
  table: { marginTop: 8 },
  trHead: {
    flexDirection: "row",
    backgroundColor: C.card,
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderTop: `0.5pt solid ${C.divider}`,
    borderBottom: `0.5pt solid ${C.divider}`,
    fontSize: 8,
    color: C.muted,
    fontWeight: 600,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  tr: {
    flexDirection: "row",
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderBottom: `0.3pt solid ${C.divider}`,
    fontSize: 9.5,
    color: C.ink,
    minHeight: 22,
  },
  tdRank: { width: 24, color: C.brand, fontWeight: 700 },
  tdGrow: { flexGrow: 1, flexBasis: 0 },
  tdNum: { width: 50, textAlign: "right", fontFamily: "AppFont" },
  tdNumWide: { width: 70, textAlign: "right" },

  // Bullets and lists
  bullet: { fontSize: 9.5, lineHeight: 1.55, color: C.body, marginBottom: 5 },
  numberedItem: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 7,
  },
  numberedDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: C.brandSoft,
    color: C.brand,
    fontSize: 9,
    fontWeight: 700,
    textAlign: "center",
    paddingTop: 3,
  },
  numberedText: {
    flexGrow: 1,
    flexBasis: 0,
    fontSize: 9.5,
    lineHeight: 1.55,
    color: C.body,
    paddingTop: 2,
  },

  // Pills + badges
  pill: {
    fontSize: 8,
    fontWeight: 600,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 5,
    marginBottom: 4,
  },
  severityHigh: { color: C.risk, backgroundColor: "#FEE2E2" },
  severityMedium: { color: C.warn, backgroundColor: "#FEF3C7" },
  severityLow: { color: C.success, backgroundColor: "#D1FAE5" },

  // Sources card
  sourcesCard: {
    padding: 14,
    borderRadius: 6,
    backgroundColor: C.card,
    border: `0.5pt solid ${C.divider}`,
  },
  sourceLine: {
    fontSize: 9,
    lineHeight: 1.5,
    color: C.body,
    marginBottom: 3,
  },
});

interface ReportLabels {
  title: string;
  subtitle: string;
  cover: {
    eyebrow: string;
    successScore: string;
    bestCountry: string;
    bestPrice: string;
    bestSegment: string;
    riskLevel: string;
    runDate: string;
    personas: string;
    model: string;
  };
  executiveSummary: string;
  keyMetrics: string;
  countryRanking: string;
  countryCol: { rank: string; country: string; demand: string; comp: string; score: string };
  pricingRecommendation: string;
  pricingRecommendedPrice: string;
  pricingMargin: string;
  pricingCurve: string;
  pricingCol: { price: string; conversion: string; revenue: string };
  personaInsights: string;
  personaCount: string;
  personaAvgIntent: string;
  personaHigh: string;
  personaLow: string;
  personaByCountry: string;
  risks: string;
  actionPlan: string;
  channels: string;
  dataSources: string;
  regulatoryTitle: string;
  regulatoryExcluded: string;
  regulatoryRestricted: string;
  generatedBy: string;
  page: string;
}

export interface RegulatoryWarningPdf {
  country: string;
  status: "banned" | "restricted" | "allowed";
  reason?: string;
  source?: string;
}

interface BuildOptions {
  result: SimulationResult;
  labels: ReportLabels;
  productName: string;
  sources?: string[];
  regulatory?: { regulatedCategory?: string; warnings: RegulatoryWarningPdf[] };
  locale?: string;
  // Sim metadata for the cover.
  meta?: {
    simulationId?: string;
    runDate?: string;
    personaCount?: number;
    modelProvider?: string | null;
    modelVersion?: string | null;
  };
}

export async function buildReportPdf(opts: BuildOptions): Promise<Buffer> {
  const {
    result,
    labels,
    productName,
    sources = [],
    regulatory,
    locale = "en",
    meta = {},
  } = opts;
  const { overview, countries, personas, pricing, risks, recommendations } = result;
  const cn = (code: string) => getCountryLabel(code, locale) || code;
  const fmtPrice = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  // Persona aggregates for the persona insights page.
  const personaCount = personas?.length ?? 0;
  const avgIntent =
    personaCount > 0
      ? Math.round(personas.reduce((s, p) => s + (p.purchaseIntent ?? 0), 0) / personaCount)
      : 0;
  const highIntent = personas.filter((p) => (p.purchaseIntent ?? 0) >= 70).length;
  const lowIntent = personas.filter((p) => (p.purchaseIntent ?? 0) < 35).length;

  // Per-country aggregates (top 5 by count desc).
  const byCountry = new Map<
    string,
    { count: number; intentSum: number }
  >();
  for (const p of personas) {
    const k = p.country;
    const cur = byCountry.get(k) ?? { count: 0, intentSum: 0 };
    cur.count += 1;
    cur.intentSum += p.purchaseIntent ?? 0;
    byCountry.set(k, cur);
  }
  const countryAgg = Array.from(byCountry.entries())
    .map(([code, v]) => ({
      code,
      count: v.count,
      avgIntent: v.count > 0 ? Math.round(v.intentSum / v.count) : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  const runDate = meta.runDate ?? new Date().toISOString().slice(0, 10);
  const modelLabel = meta.modelVersion ?? meta.modelProvider ?? "—";

  // SVG logo mark — same shape as the in-app component.
  const Logo = ({ size = 14, color = "#FFFFFF" }: { size?: number; color?: string }) => (
    <Svg width={size} height={size} viewBox="0 0 32 32">
      <Rect x={3} y={3} width={18} height={18} rx={3} fill={color} />
      <Path
        d="M11 13 h14 a2 2 0 0 1 2 2 v12 a2 2 0 0 1 -2 2 h-12 a2 2 0 0 1 -2 -2 v-12 a2 2 0 0 1 2 -2 z"
        stroke={color}
        strokeWidth={2.2}
        fill="none"
      />
    </Svg>
  );

  const PageChrome = ({ pageNum, totalPages }: { pageNum: number; totalPages: number }) => (
    <>
      <View style={styles.pageHeader} fixed>
        <View style={styles.pageHeaderBrand}>
          <Logo size={11} color={C.brand} />
          <Text style={styles.pageHeaderText}>MARKET TWIN</Text>
        </View>
        <Text style={[styles.pageHeaderText, { textTransform: "none", letterSpacing: 0 }]}>
          {productName}
        </Text>
      </View>
      <View style={styles.pageFooter} fixed>
        <Text>{labels.generatedBy} · {runDate}</Text>
        <Text>{labels.page} {pageNum} / {totalPages}</Text>
      </View>
    </>
  );

  const TOTAL_PAGES = 4;

  const doc = (
    <Document>
      {/* PAGE 1 — COVER */}
      <Page size="A4" style={styles.coverPage}>
        <View style={styles.coverInner}>
          <View>
            <View style={styles.coverBrand}>
              <Logo size={20} color="#FFFFFF" />
              <Text style={styles.coverBrandName}>Market Twin</Text>
            </View>
          </View>

          <View>
            <Text style={styles.coverEyebrow}>{labels.cover.eyebrow}</Text>
            <Text style={styles.coverTitle}>{labels.title}</Text>
            <Text style={styles.coverProductName}>{productName}</Text>

            <View style={styles.coverHeroRow}>
              <View style={styles.coverHeroCard}>
                <Text style={styles.coverHeroLabel}>{labels.cover.successScore}</Text>
                <Text style={styles.coverHeroValue}>{overview.successScore}%</Text>
                <Text style={styles.coverHeroSub}>{labels.subtitle}</Text>
              </View>
              <View style={styles.coverHeroCard}>
                <Text style={styles.coverHeroLabel}>{labels.cover.bestCountry}</Text>
                <Text
                  style={[
                    styles.coverHeroValue,
                    containsExtendedCJK(cn(overview.bestCountry))
                      ? { fontFamily: "AppFontCJK" }
                      : {},
                  ]}
                >
                  {cn(overview.bestCountry)}
                </Text>
                <Text style={styles.coverHeroSub}>
                  {overview.bestSegment}
                </Text>
              </View>
              <View style={styles.coverHeroCard}>
                <Text style={styles.coverHeroLabel}>{labels.cover.bestPrice}</Text>
                <Text style={styles.coverHeroValue}>{fmtPrice(overview.bestPriceCents)}</Text>
                <Text style={styles.coverHeroSub}>
                  {labels.cover.riskLevel}: {overview.riskLevel.toUpperCase()}
                </Text>
              </View>
            </View>

            <View style={styles.coverMetaRow}>
              <View style={styles.coverMetaItem}>
                <Text style={styles.coverMetaLabel}>{labels.cover.runDate}</Text>
                <Text style={styles.coverMetaValue}>{runDate}</Text>
              </View>
              <View style={styles.coverMetaItem}>
                <Text style={styles.coverMetaLabel}>{labels.cover.personas}</Text>
                <Text style={styles.coverMetaValue}>
                  {(meta.personaCount ?? personaCount).toLocaleString()}
                </Text>
              </View>
              <View style={styles.coverMetaItem}>
                <Text style={styles.coverMetaLabel}>{labels.cover.model}</Text>
                <Text
                  style={[
                    styles.coverMetaValue,
                    { fontFamily: "AppFont", fontSize: 10 },
                  ]}
                >
                  {modelLabel}
                </Text>
              </View>
            </View>
          </View>

          <Text style={{ fontSize: 9, color: "#94CFEA" }}>
            {labels.generatedBy} · marketTwin.app
          </Text>
        </View>
      </Page>

      {/* PAGE 2 — EXECUTIVE SUMMARY + KEY METRICS */}
      <Page size="A4" style={styles.page}>
        <PageChrome pageNum={2} totalPages={TOTAL_PAGES} />
        <View>
          <Text style={styles.sectionEyebrow}>01 · {labels.executiveSummary}</Text>
          <Text style={styles.h2}>{labels.executiveSummary}</Text>
          <Text style={styles.para}>
            {recommendations.executiveSummary || overview.headline}
          </Text>

          <View style={styles.sectionGap}>
            <Text style={styles.sectionEyebrow}>{labels.keyMetrics}</Text>
            <View style={styles.kpiRow}>
              <View style={styles.kpi}>
                <Text style={styles.kpiLabel}>{labels.cover.successScore}</Text>
                <Text style={styles.kpiValue}>{overview.successScore}%</Text>
              </View>
              <View style={styles.kpi}>
                <Text style={styles.kpiLabel}>{labels.cover.bestCountry}</Text>
                <Text
                  style={[
                    styles.kpiValue,
                    { fontSize: 14 },
                    containsExtendedCJK(cn(overview.bestCountry))
                      ? { fontFamily: "AppFontCJK" }
                      : {},
                  ]}
                >
                  {cn(overview.bestCountry)}
                </Text>
              </View>
              <View style={styles.kpi}>
                <Text style={styles.kpiLabel}>{labels.cover.bestPrice}</Text>
                <Text style={styles.kpiValue}>{fmtPrice(overview.bestPriceCents)}</Text>
              </View>
              <View style={styles.kpi}>
                <Text style={styles.kpiLabel}>{labels.cover.riskLevel}</Text>
                <Text
                  style={[
                    styles.kpiValue,
                    {
                      color:
                        overview.riskLevel === "high"
                          ? C.risk
                          : overview.riskLevel === "medium"
                            ? C.warn
                            : C.success,
                    },
                  ]}
                >
                  {overview.riskLevel.toUpperCase()}
                </Text>
              </View>
            </View>
          </View>

          {regulatory && regulatory.warnings.length > 0 && (
            <View style={styles.sectionGap}>
              <Text style={styles.sectionEyebrow}>{labels.regulatoryTitle}</Text>
              {regulatory.warnings
                .filter((w) => w.status !== "allowed")
                .map((w, i) => {
                  const tag =
                    w.status === "banned"
                      ? labels.regulatoryExcluded
                      : labels.regulatoryRestricted;
                  const color = w.status === "banned" ? C.risk : C.warn;
                  const line = `${cn(w.country)}: ${w.reason ?? ""}${w.source ? ` (${w.source})` : ""}`;
                  return (
                    <View key={`reg-${i}`} wrap={false} style={{ flexDirection: "row", marginBottom: 6 }}>
                      <Text
                        style={[
                          styles.pill,
                          w.status === "banned" ? styles.severityHigh : styles.severityMedium,
                        ]}
                      >
                        {tag}
                      </Text>
                      <Text
                        style={[
                          styles.paraTight,
                          { color, flexGrow: 1, flexBasis: 0 },
                          containsExtendedCJK(line) ? { fontFamily: "AppFontCJK" } : {},
                        ]}
                      >
                        {line}
                      </Text>
                    </View>
                  );
                })}
            </View>
          )}
        </View>
      </Page>

      {/* PAGE 3 — COUNTRY ANALYSIS + PRICING */}
      <Page size="A4" style={styles.page}>
        <PageChrome pageNum={3} totalPages={TOTAL_PAGES} />
        <View>
          <Text style={styles.sectionEyebrow}>02 · {labels.countryRanking}</Text>
          <Text style={styles.h2}>{labels.countryRanking}</Text>

          <View style={styles.table}>
            <View style={styles.trHead}>
              <Text style={styles.tdRank}>#</Text>
              <Text style={styles.tdGrow}>{labels.countryCol.country}</Text>
              <Text style={styles.tdNum}>{labels.countryCol.demand}</Text>
              <Text style={styles.tdNum}>{labels.countryCol.comp}</Text>
              <Text style={styles.tdNum}>{labels.countryCol.score}</Text>
            </View>
            {countries.slice(0, 10).map((c) => (
              <View style={styles.tr} wrap={false} key={c.country}>
                <Text style={styles.tdRank}>{c.rank}</Text>
                <Text
                  style={[
                    styles.tdGrow,
                    containsExtendedCJK(cn(c.country)) ? { fontFamily: "AppFontCJK" } : {},
                  ]}
                >
                  {cn(c.country)}
                </Text>
                <Text style={styles.tdNum}>{c.demandScore.toFixed(0)}</Text>
                <Text style={styles.tdNum}>{c.competitionScore.toFixed(0)}</Text>
                <Text style={[styles.tdNum, { fontWeight: 700, color: C.brand }]}>
                  {c.finalScore.toFixed(0)}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.sectionGap}>
            <Text style={styles.sectionEyebrow}>03 · {labels.pricingRecommendation}</Text>
            <Text style={styles.h2}>{labels.pricingRecommendation}</Text>

            <View style={[styles.kpiRow, { marginBottom: 12 }]}>
              <View style={styles.kpi}>
                <Text style={styles.kpiLabel}>{labels.pricingRecommendedPrice}</Text>
                <Text style={styles.kpiValue}>{fmtPrice(pricing.recommendedPriceCents)}</Text>
              </View>
              <View style={[styles.kpi, { flexGrow: 2 }]}>
                <Text style={styles.kpiLabel}>{labels.pricingMargin}</Text>
                <Text style={[styles.paraTight, { marginTop: 4 }]}>
                  {pricing.marginEstimate}
                </Text>
              </View>
            </View>

            {pricing.curve && pricing.curve.length > 0 && (
              <>
                <Text style={[styles.microLabel, { marginBottom: 4 }]}>
                  {labels.pricingCurve}
                </Text>
                <View style={styles.table}>
                  <View style={styles.trHead}>
                    <Text style={styles.tdGrow}>{labels.pricingCol.price}</Text>
                    <Text style={styles.tdNumWide}>{labels.pricingCol.conversion}</Text>
                    <Text style={styles.tdNumWide}>{labels.pricingCol.revenue}</Text>
                  </View>
                  {pricing.curve.map((p, i) => (
                    <View style={styles.tr} wrap={false} key={`curve-${i}`}>
                      <Text style={styles.tdGrow}>{fmtPrice(p.priceCents)}</Text>
                      <Text style={styles.tdNumWide}>
                        {(p.conversionProbability * 100).toFixed(1)}%
                      </Text>
                      <Text style={styles.tdNumWide}>
                        {p.estimatedRevenueIndex.toFixed(2)}
                      </Text>
                    </View>
                  ))}
                </View>
              </>
            )}
          </View>
        </View>
      </Page>

      {/* PAGE 4 — PERSONAS + RISKS + ACTION + SOURCES */}
      <Page size="A4" style={styles.page}>
        <PageChrome pageNum={4} totalPages={TOTAL_PAGES} />
        <View>
          <Text style={styles.sectionEyebrow}>04 · {labels.personaInsights}</Text>
          <Text style={styles.h2}>{labels.personaInsights}</Text>

          <View style={[styles.kpiRow, { marginBottom: 10 }]}>
            <View style={styles.kpi}>
              <Text style={styles.kpiLabel}>{labels.personaCount}</Text>
              <Text style={styles.kpiValue}>{personaCount.toLocaleString()}</Text>
            </View>
            <View style={styles.kpi}>
              <Text style={styles.kpiLabel}>{labels.personaAvgIntent}</Text>
              <Text style={styles.kpiValue}>{avgIntent}/100</Text>
            </View>
            <View style={styles.kpi}>
              <Text style={styles.kpiLabel}>{labels.personaHigh}</Text>
              <Text style={[styles.kpiValue, { color: C.success }]}>{highIntent}</Text>
            </View>
            <View style={styles.kpi}>
              <Text style={styles.kpiLabel}>{labels.personaLow}</Text>
              <Text style={[styles.kpiValue, { color: C.risk }]}>{lowIntent}</Text>
            </View>
          </View>

          {countryAgg.length > 0 && (
            <>
              <Text style={[styles.microLabel, { marginBottom: 4, marginTop: 8 }]}>
                {labels.personaByCountry}
              </Text>
              <View style={styles.table}>
                <View style={styles.trHead}>
                  <Text style={styles.tdGrow}>{labels.countryCol.country}</Text>
                  <Text style={styles.tdNum}>{labels.personaCount}</Text>
                  <Text style={styles.tdNum}>{labels.personaAvgIntent}</Text>
                </View>
                {countryAgg.map((c) => (
                  <View style={styles.tr} wrap={false} key={`agg-${c.code}`}>
                    <Text
                      style={[
                        styles.tdGrow,
                        containsExtendedCJK(cn(c.code)) ? { fontFamily: "AppFontCJK" } : {},
                      ]}
                    >
                      {cn(c.code)}
                    </Text>
                    <Text style={styles.tdNum}>{c.count}</Text>
                    <Text style={styles.tdNum}>{c.avgIntent}/100</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          <View style={styles.sectionGap}>
            <Text style={styles.sectionEyebrow}>05 · {labels.risks}</Text>
            <Text style={styles.h2}>{labels.risks}</Text>
            {risks.length === 0 ? (
              <Text style={styles.paraTight}>—</Text>
            ) : (
              risks.map((r, i) => {
                const sevStyle =
                  r.severity === "high"
                    ? styles.severityHigh
                    : r.severity === "medium"
                      ? styles.severityMedium
                      : styles.severityLow;
                return (
                  <View
                    key={`risk-${i}`}
                    wrap={false}
                    style={{ flexDirection: "row", marginBottom: 7 }}
                  >
                    <Text style={[styles.pill, sevStyle]}>{r.severity.toUpperCase()}</Text>
                    <View style={{ flexGrow: 1, flexBasis: 0 }}>
                      <Text style={{ fontSize: 9.5, fontWeight: 600, color: C.ink }}>
                        {r.factor}
                      </Text>
                      <Text style={[styles.paraTight, { marginTop: 2 }]}>
                        {r.description}
                      </Text>
                    </View>
                  </View>
                );
              })
            )}
          </View>

          <View style={styles.sectionGap}>
            <Text style={styles.sectionEyebrow}>06 · {labels.actionPlan}</Text>
            <Text style={styles.h2}>{labels.actionPlan}</Text>
            {recommendations.actionPlan.map((s, i) => (
              <View key={`act-${i}`} wrap={false} style={styles.numberedItem}>
                <Text style={styles.numberedDot}>{i + 1}</Text>
                <Text style={styles.numberedText}>{s}</Text>
              </View>
            ))}
          </View>

          {recommendations.channels && recommendations.channels.length > 0 && (
            <View style={styles.sectionGap}>
              <Text style={[styles.microLabel, { marginBottom: 6 }]}>
                {labels.channels}
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                {recommendations.channels.map((c, i) => (
                  <Text
                    key={`chn-${i}`}
                    style={[styles.pill, { backgroundColor: C.brandSoft, color: C.brand }]}
                  >
                    {c}
                  </Text>
                ))}
              </View>
            </View>
          )}

          {sources.length > 0 && (
            <View style={styles.sectionGap}>
              <Text style={[styles.microLabel, { marginBottom: 6 }]}>
                {labels.dataSources}
              </Text>
              <View style={styles.sourcesCard}>
                {sources.map((src, i) => (
                  <Text
                    key={`src-${i}`}
                    style={[
                      styles.sourceLine,
                      containsExtendedCJK(src) ? { fontFamily: "AppFontCJK" } : {},
                    ]}
                  >
                    · {src}
                  </Text>
                ))}
              </View>
            </View>
          )}
        </View>
      </Page>
    </Document>
  );

  return await renderToBuffer(doc);
}

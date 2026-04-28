import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { SimulationResult } from "@/lib/simulation/schemas";

// Register Pretendard so Korean text renders correctly.
// react-pdf only supports TTF/OTF (NOT woff), and fetches the font over HTTP at render time.
Font.register({
  family: "AppFont",
  fonts: [
    {
      src: "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/public/static/Pretendard-Regular.otf",
      fontWeight: 400,
    },
    {
      src: "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/public/static/Pretendard-Bold.otf",
      fontWeight: 700,
    },
  ],
});

const styles = StyleSheet.create({
  page: { padding: 48, fontSize: 11, fontFamily: "AppFont", color: "#0f172a" },
  brand: { fontSize: 10, color: "#0B2A5B", marginBottom: 6, letterSpacing: 1 },
  h1: { fontSize: 22, fontWeight: 700, marginBottom: 16, color: "#0B2A5B" },
  h2: { fontSize: 13, fontWeight: 700, marginTop: 18, marginBottom: 8, color: "#0B2A5B" },
  para: { fontSize: 10, lineHeight: 1.5, color: "#1f2937" },
  kpiRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  kpi: {
    width: "31%",
    padding: 10,
    border: "1pt solid #e2e8f0",
    borderRadius: 6,
    marginRight: 8,
    marginBottom: 8,
  },
  kpiLabel: { fontSize: 8, color: "#64748b", textTransform: "uppercase" },
  kpiValue: { fontSize: 16, fontWeight: 700, color: "#0B2A5B", marginTop: 4 },
  table: { marginTop: 6 },
  trHead: {
    flexDirection: "row",
    backgroundColor: "#f1f5f9",
    paddingVertical: 5,
    paddingHorizontal: 6,
    fontSize: 9,
    color: "#64748b",
  },
  tr: {
    flexDirection: "row",
    borderBottom: "0.5pt solid #e2e8f0",
    paddingVertical: 5,
    paddingHorizontal: 6,
    fontSize: 9,
  },
  td: { flexGrow: 1, flexBasis: 0 },
  tdNum: { width: 22, color: "#0B2A5B", fontWeight: 700 },
  tdScore: { width: 50, textAlign: "right" },
  bullet: { fontSize: 10, marginBottom: 4 },
  footer: { position: "absolute", bottom: 24, left: 48, right: 48, fontSize: 8, color: "#94a3b8" },
});

interface ReportLabels {
  title: string;
  executiveSummary: string;
  keyMetrics: string;
  countryRanking: string;
  pricingRecommendation: string;
  personaInsights: string;
  risks: string;
  actionPlan: string;
  successScore: string;
  bestCountry: string;
  bestSegment: string;
  bestPrice: string;
  riskLevel: string;
  dataSources: string;
}

export async function buildReportPdf(
  result: SimulationResult,
  labels: ReportLabels,
  productName: string,
  sources: string[] = [],
): Promise<Buffer> {
  const { overview, countries, pricing, risks, recommendations } = result;

  const doc = (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.brand}>AI MARKET TWIN</Text>
        <Text style={styles.h1}>{labels.title}</Text>
        <Text style={styles.para}>{productName}</Text>

        <Text style={styles.h2}>{labels.keyMetrics}</Text>
        <View style={styles.kpiRow}>
          <View style={styles.kpi}>
            <Text style={styles.kpiLabel}>{labels.successScore}</Text>
            <Text style={styles.kpiValue}>{overview.successScore}%</Text>
          </View>
          <View style={styles.kpi}>
            <Text style={styles.kpiLabel}>{labels.bestCountry}</Text>
            <Text style={styles.kpiValue}>{overview.bestCountry}</Text>
          </View>
          <View style={styles.kpi}>
            <Text style={styles.kpiLabel}>{labels.riskLevel}</Text>
            <Text style={styles.kpiValue}>{overview.riskLevel.toUpperCase()}</Text>
          </View>
          <View style={styles.kpi}>
            <Text style={styles.kpiLabel}>{labels.bestSegment}</Text>
            <Text style={styles.kpiValue}>{overview.bestSegment}</Text>
          </View>
          <View style={styles.kpi}>
            <Text style={styles.kpiLabel}>{labels.bestPrice}</Text>
            <Text style={styles.kpiValue}>${(overview.bestPriceCents / 100).toFixed(2)}</Text>
          </View>
        </View>

        <Text style={styles.h2}>{labels.executiveSummary}</Text>
        <Text style={styles.para}>{recommendations.executiveSummary || overview.headline}</Text>

        <Text style={styles.h2}>{labels.countryRanking}</Text>
        <View style={styles.table}>
          <View style={styles.trHead}>
            <Text style={styles.tdNum}>#</Text>
            <Text style={styles.td}>Country</Text>
            <Text style={styles.tdScore}>Demand</Text>
            <Text style={styles.tdScore}>Comp.</Text>
            <Text style={styles.tdScore}>Score</Text>
          </View>
          {countries.slice(0, 10).map((c) => (
            <View style={styles.tr} key={c.country}>
              <Text style={styles.tdNum}>{c.rank}</Text>
              <Text style={styles.td}>{c.country}</Text>
              <Text style={styles.tdScore}>{c.demandScore.toFixed(0)}</Text>
              <Text style={styles.tdScore}>{c.competitionScore.toFixed(0)}</Text>
              <Text style={styles.tdScore}>{c.finalScore.toFixed(0)}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.footer}>
          Generated by AI Market Twin • {new Date().toISOString().slice(0, 10)}
        </Text>
      </Page>

      <Page size="A4" style={styles.page}>
        <Text style={styles.h2}>{labels.pricingRecommendation}</Text>
        <Text style={styles.para}>
          Recommended price: ${(pricing.recommendedPriceCents / 100).toFixed(2)}.{" "}
          {pricing.marginEstimate}
        </Text>

        <Text style={styles.h2}>{labels.risks}</Text>
        {risks.length === 0 ? (
          <Text style={styles.para}>No significant risks flagged.</Text>
        ) : (
          risks.map((r, i) => (
            <Text key={i} style={styles.bullet}>
              • [{r.severity.toUpperCase()}] {r.factor} — {r.description}
            </Text>
          ))
        )}

        <Text style={styles.h2}>{labels.actionPlan}</Text>
        {recommendations.actionPlan.map((s, i) => (
          <Text key={i} style={styles.bullet}>
            {i + 1}. {s}
          </Text>
        ))}

        {sources.length > 0 && (
          <View style={{ marginTop: 18 }}>
            <Text style={styles.h2}>{labels.dataSources}</Text>
            {sources.map((src, i) => (
              <Text key={i} style={[styles.bullet, { color: "#64748b" }]}>
                • {src}
              </Text>
            ))}
          </View>
        )}

        <Text style={styles.footer}>
          Generated by AI Market Twin • {new Date().toISOString().slice(0, 10)}
        </Text>
      </Page>
    </Document>
  );

  return await renderToBuffer(doc);
}

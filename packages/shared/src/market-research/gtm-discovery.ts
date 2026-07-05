/**
 * Brand-specific GTM discovery — the accuracy lever the macro anchors miss.
 *
 * The N=20 backtest showed the true winner is often decided by BRAND-level
 * factors (an existing footprint, a distribution/licensing partner) rather
 * than macro market attractiveness — e.g. Shake Shack → UAE via the Alshaya
 * licensing group, not a macro signal. This module surfaces two such signals
 * from the live web (Tavily), two calls per sim:
 *
 *   1. Existing footprint — where the brand ALREADY sells / ships / is
 *      stocked. A market with organic presence is validated demand + entry
 *      infrastructure already in place.
 *   2. Distribution-partner ecosystem — for the category, which candidate
 *      markets have accessible importers / retail / licensing partners a
 *      foreign brand can actually enter through.
 *
 * LIVE / forward-looking by design (present footprint reflects the present),
 * so it is skipped for historical back-test runs. Best-effort — empty block
 * on any miss; never throws. Gated on TAVILY_API_KEY at the call site.
 */

import { tavilySearch, type TavilyResult } from "./tavily";

const COUNTRY_NAMES: Record<string, string> = {
  KR: "South Korea", JP: "Japan", CN: "China", TW: "Taiwan", HK: "Hong Kong",
  SG: "Singapore", TH: "Thailand", VN: "Vietnam", ID: "Indonesia",
  MY: "Malaysia", PH: "Philippines", IN: "India", US: "United States",
  CA: "Canada", GB: "United Kingdom", DE: "Germany", FR: "France",
  IT: "Italy", ES: "Spain", NL: "Netherlands", AU: "Australia",
  NZ: "New Zealand", AE: "United Arab Emirates", SA: "Saudi Arabia",
  BR: "Brazil", MX: "Mexico",
};

function name(iso: string): string {
  return COUNTRY_NAMES[iso.toUpperCase()] ?? iso;
}

function footprintQuery(brand: string): string {
  return `${brand} where to buy stockists international retail partners distributors "ships to" available countries`;
}

function ecosystemQuery(category: string, country: string): string {
  return `leading ${category} importers distributors retail groups in ${name(country)} for foreign brands 2026 market entry partners`;
}

function firstSentences(content: string, cap: number): string {
  const s = content.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s/)[0] ?? "";
  return s.length > cap ? s.slice(0, cap - 3) + "..." : s;
}

/**
 * Run the two discovery searches and render a single GTM-signal block for the
 * country-ranking prompt. Returns "" when TAVILY is unset or both searches
 * come back empty.
 */
export async function buildGtmDiscoveryBlock(opts: {
  brand: string;
  category: string;
  candidateCountries: string[];
  locale?: "ko" | "en";
}): Promise<{ block: string }> {
  if (!process.env.TAVILY_API_KEY) return { block: "" };
  const isKo = opts.locale === "ko";

  // Footprint = 1 brand-level call; ecosystem = per-country fan-out (concrete
  // entry partners differ by market — single-query returns only generic
  // advice). All concurrent.
  const [footprint, ...ecoByCountry] = await Promise.all([
    tavilySearch({
      query: footprintQuery(opts.brand),
      searchDepth: "advanced",
      maxResults: 5,
      includeAnswer: false,
    }),
    ...opts.candidateCountries.map((c) =>
      tavilySearch({
        query: ecosystemQuery(opts.category, c),
        searchDepth: "advanced",
        maxResults: 3,
        includeAnswer: false,
      }).then((r) => ({ country: c.toUpperCase(), result: r })),
    ),
  ]);

  const fpTop = (footprint?.results ?? [])
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 3);
  const ecoLines = ecoByCountry
    .map(({ country, result }) => {
      const top = (result?.results ?? []).sort(
        (a, b) => (b.score ?? 0) - (a.score ?? 0),
      )[0];
      return top ? `  [${country}] ${firstSentences(top.content, 140)}` : null;
    })
    .filter((l): l is string => l !== null);
  if (fpTop.length === 0 && ecoLines.length === 0) return { block: "" };

  const header = isKo
    ? "═══ 브랜드 GTM 신호 (실제 웹 발굴 · 추정) ═══\n거시 지표가 못 보는 brand-specific 신호. ①이미 파는 시장(검증된 수요·인프라) ②카테고리 진입 파트너(수입사·리테일·라이선싱) 존재 시장. brand-strategy가 파트너십/유통 주도면 country score에 가중 — 규모와 다른 축. 추정이니 정성적으로:"
    : "═══ BRAND GTM SIGNALS (live web discovery · estimate) ═══\nBrand-specific signals the macro anchors can't see. (1) markets where the brand ALREADY sells (validated demand + infrastructure); (2) markets with accessible category entry partners (importers/retail/licensing). Weight into the country score when the GTM is partnership/distribution-led — a separate axis from market size. Estimate; weigh qualitatively:";

  const parts: string[] = [];
  if (fpTop.length) {
    const fpLabel = isKo ? "[기존 발자국 — 이미 판매/유통 중]" : "[EXISTING FOOTPRINT — already selling / distributed]";
    parts.push(
      `${fpLabel}\n` +
        fpTop.map((r) => `  - ${firstSentences(r.content, 150)}`).join("\n"),
    );
  }
  if (ecoLines.length) {
    const ecoLabel = isKo
      ? "[국가별 유통·진입 파트너 생태계]"
      : "[ENTRY-PARTNER ECOSYSTEM BY MARKET]";
    parts.push(`${ecoLabel}\n${ecoLines.join("\n")}`);
  }
  return { block: `${header}\n${parts.join("\n")}` };
}

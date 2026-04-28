/**
 * KR (KOSIS) fetcher.
 *
 * KOSIS provides an Open API at https://kosis.kr/openapi/index/index.jsp.
 * Registration is free; an API key is required and supplied via env var KOSIS_API_KEY.
 *
 * The API returns numbers but doesn't provide profession-level localized labels
 * or USD equivalents directly — those mappings live in this file. When KOSIS
 * publishes new data we fetch the latest median wages and recompute USD bands
 * with the year's average exchange rate.
 *
 * This implementation is intentionally a SCAFFOLD:
 *  • Without KOSIS_API_KEY set, it returns the existing hand-curated bundle so
 *    the fetcher doesn't break — letting us ship the framework now and wire up
 *    the real API call later when an API key is available.
 *  • With KOSIS_API_KEY set, it would issue real requests against tables like
 *    DT_1ES4901S (직업·연령별 임금구조) and rebuild the bundle. This call path
 *    is stubbed with a TODO marker because KOSIS table IDs require manual
 *    selection per profession — not worth automating until we know which 10-15
 *    occupations we want consistently.
 *
 * To run:
 *   KOSIS_API_KEY=... npx tsx scripts/fetch-reference/index.ts kr
 */
import type { CountryFetcher, CountryReferenceBundle } from "../types";

// Average KRW/USD exchange rate for the data year. Update annually.
const EXCHANGE_RATE_KRW_PER_USD = 1310;

function usd(krwAmount: number): number {
  return Math.round(krwAmount / EXCHANGE_RATE_KRW_PER_USD);
}

function krwBand(p25: number, p75: number, locale: "ko" | "en"): string {
  const p25M = (p25 / 1_000_000).toFixed(0);
  const p75M = (p75 / 1_000_000).toFixed(0);
  const p25Usd = usd(p25);
  const p75Usd = usd(p75);
  if (locale === "ko") {
    return `연 ₩${p25M}M-₩${p75M}M (~$${(p25Usd / 1000).toFixed(0)}-${(p75Usd / 1000).toFixed(0)}k USD)`;
  }
  return `₩${p25M}M-₩${p75M}M annually (~$${(p25Usd / 1000).toFixed(0)}-${(p75Usd / 1000).toFixed(0)}k USD)`;
}

/**
 * The hand-curated bundle, mirrors supabase/seeds/0001_kr_reference_data.sql.
 * When the real KOSIS API call is wired up, this gets replaced.
 */
function buildCuratedBundle(): CountryReferenceBundle {
  const dataYear = 2024;
  const professions = [
    {
      key: "elementary_teacher",
      labels: { ko: "초등학교 교사", en: "Elementary School Teacher" },
      bands: [
        ["20-29", 30_000_000, 35_000_000, 40_000_000],
        ["30-39", 42_000_000, 48_000_000, 55_000_000],
        ["40-49", 55_000_000, 65_000_000, 75_000_000],
      ] as const,
      lifeStage: "employed" as const,
    },
    {
      key: "office_worker",
      labels: { ko: "사무직 회사원", en: "Office Worker" },
      bands: [
        ["20-29", 28_000_000, 35_000_000, 42_000_000],
        ["30-39", 38_000_000, 48_000_000, 60_000_000],
        ["40-49", 50_000_000, 65_000_000, 80_000_000],
      ] as const,
      lifeStage: "employed" as const,
    },
    {
      key: "senior_software_engineer",
      labels: { ko: "시니어 소프트웨어 엔지니어", en: "Senior Software Engineer" },
      bands: [
        ["30-39", 75_000_000, 95_000_000, 130_000_000],
        ["40-49", 100_000_000, 130_000_000, 180_000_000],
      ] as const,
      lifeStage: "employed" as const,
    },
    // ... abbreviated; full list lives in the SQL seed for now
  ];

  return {
    stats: {
      countryCode: "KR",
      dataYear,
      countryNameEn: "South Korea",
      countryNameLocal: "대한민국",
      currency: "KRW",
      population: 51_740_000,
      medianHouseholdIncome: 67_500_000,
      gdpPerCapitaUsd: 33_800,
      source: "KOSIS 가계금융복지조사 2023",
      sourceUrl: "https://kosis.kr",
    },
    professions: professions.flatMap((p) =>
      p.bands.map(([age, p25, median, p75]) => ({
        professionCanonical: p.key,
        professionLocalized: p.labels,
        lifeStage: p.lifeStage,
        ageGroup: age,
        incomeP25: p25,
        incomeMedian: median,
        incomeP75: p75,
        displayBand: {
          ko: krwBand(p25, p75, "ko"),
          en: krwBand(p25, p75, "en"),
        },
      })),
    ),
    norms: [], // Hand-curated norms remain in SQL seed; auto-fetcher will not regenerate them.
    professionIncomeSource: "KOSIS 임금구조 기본통계조사 2023",
  };
}

export const krFetcher: CountryFetcher = {
  countryCode: "KR",
  label: "South Korea (KOSIS)",
  async fetch(): Promise<CountryReferenceBundle> {
    const apiKey = process.env.KOSIS_API_KEY;
    if (!apiKey) {
      console.log(
        "  [kr] KOSIS_API_KEY not set — returning hand-curated bundle (no live fetch).",
      );
      return buildCuratedBundle();
    }

    // TODO: real KOSIS Open API integration
    // Reference: https://kosis.kr/openapi/index/index.jsp
    // Steps once we activate this:
    //   1. Hit /Param/statisticsParameterData.do with our orgId/tblId for 임금구조 기본통계조사
    //   2. Parse the rows by profession × age group
    //   3. Map KOSIS profession codes → our profession_canonical via a lookup table
    //   4. Convert wage figures (KOSIS reports monthly; we want annual) and rebuild displayBand
    // For now we still return the curated bundle so the orchestrator workflow is exercised end-to-end.
    console.log("  [kr] KOSIS_API_KEY detected, but live integration is TODO.");
    return buildCuratedBundle();
  },
};

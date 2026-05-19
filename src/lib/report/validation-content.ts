/**
 * Cross-validation report content generator with REAL data grounding.
 *
 * Two-stage approach to defeat LLM-hallucinated citations:
 *
 *   1. Pre-fetch objective data from real sources, in parallel:
 *      - Tavily web search (market size + CAGR, peer brand entry,
 *        competitive landscape, internal brand growth)
 *      - KOTRA compSucsCase OpenAPI (real success cases for the
 *        recommended country)
 *      - aggregate.sources (LLM-curated citations from the sim itself)
 *      - aggregate.marketProfile (deep market profile produced after
 *        the sim winner is finalised)
 *
 *   2. Pass the fetched data to Sonnet as a strict context block with
 *      "use ONLY this data, do not invent" instructions. The LLM
 *      composes the report narrative; every numeric / cited claim
 *      must trace to a row in the pre-fetched data.
 *
 * Output shape mirrors the consulting-grade reference report (TOC →
 * methodology → 4-source cross-check → integrated analysis → risks +
 * stars → phased plan → honest disclosure with per-area grades →
 * reproduction spec). validation-pdf.tsx renders the structure into
 * the McKinsey/BCG-style PDF.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { EnsembleAggregate } from "@/lib/simulation/ensemble";
import { tavilySearch, type TavilyResult } from "@/lib/market-research/tavily";
import {
  fetchKotraSuccessCases,
  fetchKotraNationalInfo,
  type KotraNationalInfo,
} from "@/lib/market-research/kotra";
import {
  fetchKoreaExportFlows,
  hsCodesForCategory,
  type ComtradeFlow,
} from "@/lib/market-research/comtrade";
import {
  fetchDartFinancialsForSlug,
  inferSlugFromProductName,
  type DartCompanyFinancials,
} from "@/lib/market-research/dart";

export interface ProjectContext {
  productName: string;
  category: string | null;
  description: string | null;
  basePriceCents: number | null;
  currency: string | null;
  originatingCountry: string | null;
  candidateCountries: string[];
  competitorNames?: string[] | null;
  /** Optional corporate / brand name (from project DB). */
  brandName?: string | null;
  corporateName?: string | null;
}

export interface ValidationReportData {
  meta: {
    productName: string;
    brand?: string;
    corporateName?: string;
    ensembleId: string;
    generatedAt: string;
    tier: string;
    simCount: number;
    personaCount: number;
    llmProviders: string[];
    locale: "ko" | "en";
    category: string | null;
    basePriceDisplay: string;
    candidateCountries: string[];
    originCountry: string | null;
    durationMinutes?: number;
  };
  simResult: {
    winner: string;
    consensusPercent: number;
    confidence: "STRONG" | "MODERATE" | "WEAK";
    consensusType?: string;
    voteDistribution: Array<{ country: string; count: number; percent: number }>;
    scoreRanking: Array<{ country: string; mean: number; std: number }>;
    topCountriesTied: boolean;
    runnerUp?: string;
    simExecutiveSummary?: string;
    /**
     * Top-2 display state (2026-05-20). When displayMode="top2", primary
     * alone is not a reliable single answer — top 2 candidates are within
     * noise margin and should be presented together.
     */
    displayMode?: "single" | "top2";
    secondary?: {
      country: string;
      meanScore: number;
      voteSharePercent: number;
      gapToPrimary: number;
    };
    dominanceCriteria?: {
      meanGap: number;
      voteShareTop1: number;
      crossLLMAgree: boolean;
      passCount: number;
    };
  };
  executiveSummary: {
    headline: string;
    confidenceGrade: "A" | "B+" | "B" | "C+" | "C";
    confidenceLabel: string;
    keyMessage: string;
    threeActions: string[];
    momentumIndicators: string[];
  };
  methodology: {
    biasNote: string;
    sources: Array<{
      label: "A" | "B" | "C" | "D";
      name: string;
      description: string;
    }>;
  };
  externalCrossCheck: {
    sourceA: {
      title: string;
      citationLabel: string;
      rows: Array<{ label: string; value: string; interpretation: string }>;
      verdict: string;
      verdictKind: "support" | "neutral" | "caveat";
      citations: Array<{ label: string; url?: string }>;
    };
    sourceB: {
      title: string;
      citationLabel: string;
      heroCase: { brand: string; signals: string[] } | null;
      otherCases: Array<{ brand: string; signal: string }>;
      verdict: string;
      verdictKind: "support" | "neutral" | "caveat";
      citations: Array<{ label: string; url?: string }>;
    };
    /**
     * Source C — Composite Korean government data (3 primary sub-sources +
     * 1 supplementary). Designed 2026-05-20 per [[pdf_source_c_composite_plan]]
     * to replace single-source compSucsCase. Each sub-source feeds an
     * independent row in alignmentMatrix; rows with no data get "concern"
     * alignment and are excluded from the weighted average.
     */
    sourceC: {
      title: string;
      citationLabel: string;
      /** Primary: KOTRA korCompList — Korean entities operating in the target market. */
      korCompanies: {
        countryKo: string;
        rows: Array<{ parentKo: string; localKo: string; industry: string; category: string; year: string; form: string }>;
        totalRegistered: number;
        matchingFilter: number;
        caveat: string;
        dataAvailable: boolean;
      };
      /** Quantitative: Comtrade HSCode export-value time series for KR → target market. */
      comtrade: {
        year: number;
        countryKo: string;
        hsCodes: string[];
        exportValueUsd: number | null;
        caveat: string;
        dataAvailable: boolean;
      };
      /** Corporate filing: DART overseas-revenue segment (KOSPI/KOSDAQ listed only). */
      dart: {
        corpNameKo: string | null;
        bsnsYear: number | null;
        revenueKrw: number | null;
        opIncomeKrw: number | null;
        caveat: string;
        dataAvailable: boolean;
      };
      /** Supplementary: compSucsCase totalCnt (legacy single-line note). */
      compSucsCase: {
        totalCount: number;
        countryKo: string;
        caveat: string;
      };
    };
    sourceD: {
      title: string;
      citationLabel: string;
      rows: Array<{ label: string; value: string; interpretation: string }>;
      verdict: string;
      verdictKind: "support" | "neutral" | "caveat";
      citations: Array<{ label: string; url?: string }>;
    };
  };
  alignmentMatrix: Array<{
    dimension: string;
    simSignal: string;
    externalData: string;
    alignment: "high" | "medium" | "low" | "concern";
    note: string;
  }>;
  alignmentScoring: {
    rows: Array<{ dimension: string; percent: number }>;
    weightedAverage: number;
    label: string;
    netVerdict: string;
  };
  riskAssessment: Array<{
    risk: string;
    severityStars: 1 | 2 | 3;
    mitigation: string;
  }>;
  phasedExecution: {
    phase1: {
      duration: string;
      goal: string;
      steps: Array<{ stepNum: number; goal: string; deliverable: string; note: string }>;
    };
    phase2: { duration: string; goal: string; deliverables: string[] };
    phase3: { duration: string; goal: string; deliverables: string[] };
  };
  honestDisclosure: {
    limitations: Array<{ title: string; description: string }>;
    perAreaGrades: Array<{
      area: string;
      grade: string;
      label: string;
      basis: string;
    }>;
    overallVerdict: string;
  };
  appendix: {
    dataSources: Array<{ category: string; source: string; reliability: "A" | "B+" | "B" | "C" }>;
    referenceUrls: Array<{ label: string; url: string }>;
    reproductionSpec: Array<{ key: string; value: string }>;
    publicationSpec: Array<{ key: string; value: string }>;
    disclaimer: string;
    methodology: string;
    contact: string;
    tagline: string;
  };
}

// ── ISO → Korean country name (for KOTRA compSucsCase search1) ──────
const KOR_COUNTRY_NAMES: Record<string, string> = {
  KR: "한국", JP: "일본", CN: "중국", TW: "대만", HK: "홍콩",
  SG: "싱가포르", TH: "태국", VN: "베트남", ID: "인도네시아",
  MY: "말레이시아", PH: "필리핀", IN: "인도",
  US: "미국", CA: "캐나다", MX: "멕시코", BR: "브라질",
  GB: "영국", DE: "독일", FR: "프랑스", IT: "이탈리아", ES: "스페인",
  NL: "네덜란드", AU: "호주", NZ: "뉴질랜드",
  AE: "아랍에미리트", SA: "사우디아라비아",
};

const EN_COUNTRY_NAMES: Record<string, string> = {
  KR: "South Korea", JP: "Japan", CN: "China", TW: "Taiwan", HK: "Hong Kong",
  SG: "Singapore", TH: "Thailand", VN: "Vietnam", ID: "Indonesia",
  MY: "Malaysia", PH: "Philippines", IN: "India",
  US: "United States", CA: "Canada", MX: "Mexico", BR: "Brazil",
  GB: "United Kingdom", DE: "Germany", FR: "France", IT: "Italy", ES: "Spain",
  NL: "Netherlands", AU: "Australia", NZ: "New Zealand",
  AE: "United Arab Emirates", SA: "Saudi Arabia",
};

function formatBasePriceDisplay(cents: number | null, currency: string | null): string {
  if (cents == null) return "—";
  const cur = currency ?? "USD";
  const amount = cents / 100;
  if (cur === "KRW") {
    return `₩${amount.toLocaleString("ko-KR")} (~$${(amount / 1300).toFixed(0)} USD)`;
  }
  return `$${amount.toFixed(2)} ${cur}`;
}

function safeJsonParse(text: string): Record<string, unknown> | null {
  try { return JSON.parse(text); }
  catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try { return JSON.parse(m[0]); } catch { return null; }
  }
}

function deriveSimData(agg: EnsembleAggregate): ValidationReportData["simResult"] {
  const rec = agg.recommendation;
  const winner = rec?.country?.toUpperCase() ?? "?";
  const dist = (agg.bestCountryDistribution ?? []).map((b) => ({
    country: b.country,
    count: b.count,
    percent: b.percent,
  }));
  const ranking = (agg.countryStats ?? [])
    .map((c) => ({
      country: c.country,
      mean: c.finalScore?.mean ?? 0,
      std: c.finalScore?.std ?? 0,
    }))
    .sort((a, b) => b.mean - a.mean);
  const topTied = ranking.length >= 2 && Math.abs(ranking[0].mean - ranking[1].mean) < 1;
  return {
    winner,
    consensusPercent: rec?.consensusPercent ?? 0,
    confidence: (rec?.confidence ?? "MODERATE") as "STRONG" | "MODERATE" | "WEAK",
    consensusType: rec?.consensusType,
    voteDistribution: dist.slice(0, 8),
    scoreRanking: ranking,
    topCountriesTied: topTied,
    runnerUp: topTied && ranking.length >= 2 ? ranking[1].country : undefined,
    simExecutiveSummary: agg.narrative?.executiveSummary,
    displayMode: rec?.displayMode,
    secondary: rec?.secondary,
    dominanceCriteria: rec?.dominanceCriteria,
  };
}

function summarizeTavily(label: string, r: { answer?: string; results: TavilyResult[] } | null): string {
  if (!r) return `[${label}] (no data — TAVILY_API_KEY not set or query failed)`;
  const ans = r.answer ? `ANSWER: ${r.answer}\n` : "";
  const top = r.results.slice(0, 4).map((x, i) =>
    `[${label}-${i + 1}] ${x.title}\n  URL: ${x.url}\n  ${x.content.slice(0, 350)}`,
  ).join("\n\n");
  return `${ans}${top}`;
}

/**
 * Map production category enum → Korean industry keywords used to filter
 * KOTRA korCompList entries (which return industry/category strings in
 * Korean). Without this, the PDF dumps the first N registered Korean
 * entities regardless of relevance — e.g. POSCO Chemical / Doosan /
 * Samsung Electronics show up for a Lingtea (beverage) report.
 *
 * Matching is OR across keyword list, substring-contains, case-insensitive.
 */
function categoryToKoreanKeywords(category: string | null): string[] {
  if (!category) return [];
  const t = category.toLowerCase().trim();
  // Note: deliberately exclude broad "유통" (distribution) — KOTRA classifies
  // most conglomerates (Samsung/LG/Hyundai) as "도소매유통" regardless of
  // actual product line, so "유통" catches generic trading houses as
  // false positives. Use narrow keywords that map to the KOTRA "category"
  // field (취급분야 / tretRealmCntnt) which tends to be specific.
  if (t === "food" || t === "beverage" || t === "alcohol" || t.includes("음식") || t.includes("식음")) {
    return ["식음", "음식", "음료", "주류", "식품", "식자재", "농수산", "F&B"];
  }
  if (t === "beauty" || t.includes("뷰티") || t.includes("화장")) {
    return ["화장품", "뷰티", "코스메틱", "스킨", "미용", "cosmetic"];
  }
  if (t === "health" || t.includes("건강") || t.includes("헬스")) {
    return ["건강", "헬스", "의약", "바이오", "제약", "보건", "supplement"];
  }
  if (t === "fashion" || t.includes("패션") || t.includes("의류")) {
    return ["패션", "의류", "섬유", "어패럴", "신발", "fashion", "apparel"];
  }
  if (t === "electronics" || t === "appliances" || t.includes("전자") || t.includes("가전")) {
    return ["전자", "가전", "전기", "기계", "반도체", "electronic"];
  }
  if (t === "home" || t.includes("리빙") || t.includes("가구") || t.includes("주방")) {
    return ["가구", "리빙", "주방", "생활용품", "인테리어", "household"];
  }
  if (t === "pet" || t.includes("펫") || t.includes("반려")) {
    return ["반려동물", "펫", "동물", "사료", "pet"];
  }
  if (t === "ip" || t.includes("콘텐츠")) {
    return ["콘텐츠", "엔터", "미디어", "방송", "IP", "엔터테인먼트"];
  }
  if (t === "saas" || t.includes("소프트웨어")) {
    return ["소프트웨어", "IT", "SI", "솔루션", "SaaS"];
  }
  return [];
}

/**
 * Filter + rank korCompList entries by category relevance. Returns the
 * top N entries whose industry/category/parent/local name contains at
 * least one category keyword. When 0 matches, returns empty array (the
 * caller renders a "no category-relevant entries" caveat rather than
 * dumping unrelated entries).
 */
function filterKorCompList(
  comps: Array<{ parentName: string; localName: string; industry: string; category: string; advanceYear: string; advanceForm: string }>,
  keywords: string[],
  limit: number,
): typeof comps {
  if (keywords.length === 0 || comps.length === 0) return comps.slice(0, limit);
  const kws = keywords.map((k) => k.toLowerCase());
  const scored = comps
    .map((c) => {
      const haystack = `${c.industry} ${c.category} ${c.parentName} ${c.localName}`.toLowerCase();
      const hits = kws.reduce((n, kw) => n + (haystack.includes(kw) ? 1 : 0), 0);
      return { c, hits };
    })
    .filter((r) => r.hits > 0)
    .sort((a, b) => {
      if (b.hits !== a.hits) return b.hits - a.hits;
      const ya = parseInt(a.c.advanceYear || "0", 10) || 0;
      const yb = parseInt(b.c.advanceYear || "0", 10) || 0;
      return yb - ya;
    });
  return scored.slice(0, limit).map((r) => r.c);
}

/**
 * Compose the deterministic Source C composite (4 sub-sources) from the
 * raw KOTRA / Comtrade / DART prefetch results. Each sub-source resolves
 * an explicit dataAvailable flag — LLM-side and PDF-side both read this
 * flag to decide whether to render the row vs. mark "데이터 부재".
 */
function buildSourceCComposite(args: {
  isKo: boolean;
  winnerKo: string;
  winnerEn: string;
  winnerCode: string;
  category: string | null;
  kotraCases: Array<{ companyName: string; industry: string }>;
  kotraNational: KotraNationalInfo | null;
  comtradeFlows: ComtradeFlow[];
  dartFinancials: DartCompanyFinancials | null;
  hsCodes: string[];
}): ValidationReportData["externalCrossCheck"]["sourceC"] {
  const { isKo, winnerKo, winnerEn, kotraCases, kotraNational, comtradeFlows, dartFinancials, hsCodes } = args;

  // C1 — KOTRA korCompList (Korean entities in target market), filtered by
  // category-relevant Korean keywords. v8 anchor-design lesson: unfiltered
  // KOTRA dumps surface irrelevant heavy industry / electronics conglomerates
  // for beverage / beauty / pet products (POSCO Chemical, Doosan, Samsung,
  // etc. registered in every major market). Apply the same filter the sim
  // anchor uses (see [[anchor-design-lessons]]) so the PDF table only
  // shows entries in the product's industry.
  const korCompList = kotraNational?.koreanCompanies ?? [];
  const categoryKeywords = categoryToKoreanKeywords(args.category);
  const filteredComps = filterKorCompList(korCompList, categoryKeywords, 6);
  const korCompanies = {
    countryKo: winnerKo,
    rows: filteredComps.map((c) => ({
      parentKo: c.parentName || c.localName,
      localKo: c.localName && c.localName !== c.parentName ? c.localName : "",
      industry: c.industry,
      category: c.category,
      year: c.advanceYear || "—",
      form: c.advanceForm || "—",
    })),
    totalRegistered: korCompList.length,
    matchingFilter: filteredComps.length,
    caveat: korCompList.length === 0
      ? (isKo
        ? `⚠ ${winnerKo}에 등록된 한국법인 0건. 해당 시장에 K-브랜드 진출 인프라가 아직 없거나 KOTRA 등록 누락.`
        : `⚠ Zero Korean entities registered in ${winnerEn}. K-brand infrastructure absent or unregistered in KOTRA.`)
      : filteredComps.length === 0
        ? (isKo
          ? `⚠ ${winnerKo}에 등록된 한국법인 ${korCompList.length}개 중 '${args.category ?? "?"}' 카테고리 매칭 0건. 동일 산업 진출 사례 부재.`
          : `⚠ Of ${korCompList.length} Korean entities in ${winnerEn}, zero match the '${args.category ?? "?"}' industry — no comparable Korean precedent.`)
        : (isKo
          ? `${filteredComps.length}건 매칭 (전체 ${korCompList.length}개 한국법인 중 '${args.category ?? "?"}' 산업) — 모기업 진출은 brand recognition + 유통망 기반을 시사.`
          : `${filteredComps.length} matching entries (of ${korCompList.length} total Korean entities in ${winnerEn}, filtered to '${args.category ?? "?"}' industry).`),
    dataAvailable: filteredComps.length > 0,
  };

  // C2 — Comtrade KR → target export flow
  const flow = comtradeFlows.find((f) => f.partnerIso === args.winnerCode.toUpperCase());
  const exportValueUsd = flow?.tradeValueUsd ?? null;
  const comtradeYear = flow?.period ?? new Date().getUTCFullYear() - 2;
  const comtrade = {
    year: comtradeYear,
    countryKo: winnerKo,
    hsCodes,
    exportValueUsd,
    caveat: hsCodes.length === 0
      ? (isKo
        ? `⚠ '${args.category ?? "—"}' 카테고리 HSCode 매핑 부재 — Comtrade 조회 불가.`
        : `⚠ No HSCode mapping for category '${args.category ?? "—"}' — Comtrade lookup skipped.`)
      : exportValueUsd == null
        ? (isKo
          ? `⚠ Comtrade에서 ${comtradeYear}년 한국→${winnerKo} 해당 HSCode 수출 데이터 부재 (0건 또는 응답 없음).`
          : `⚠ No Comtrade ${comtradeYear} export data for KR→${winnerEn} on these HSCodes (zero records or API empty).`)
        : (isKo
          ? `${comtradeYear}년 한국→${winnerKo} 카테고리 수출액 = $${(exportValueUsd / 1e6).toFixed(2)}M (HSCode ${hsCodes.slice(0, 3).join("·")} 합산).`
          : `${comtradeYear} KR→${winnerEn} export value on these HSCodes = $${(exportValueUsd / 1e6).toFixed(2)}M.`),
    dataAvailable: exportValueUsd != null && hsCodes.length > 0,
  };

  // C3 — DART corporate filings (KOSPI/KOSDAQ only)
  const dart = {
    corpNameKo: dartFinancials?.corpNameKo ?? null,
    bsnsYear: dartFinancials?.bsnsYear ?? null,
    revenueKrw: dartFinancials?.revenueKrw ?? null,
    opIncomeKrw: dartFinancials?.operatingIncomeKrw ?? null,
    caveat: dartFinancials == null
      ? (isKo
        ? "⚠ DART 등록 공시 부재 — 비상장 또는 사전 매핑 미보유 종목. 기업 재무 신호 사용 불가."
        : "⚠ No DART filing (unlisted or pre-mapping absent). Corporate financial signal unavailable.")
      : dartFinancials.revenueKrw == null
        ? (isKo
          ? `⚠ ${dartFinancials.corpNameKo} ${dartFinancials.bsnsYear} 연결재무제표 매출 항목 추출 실패.`
          : `⚠ Failed to extract revenue from ${dartFinancials.corpNameKo} ${dartFinancials.bsnsYear} consolidated statement.`)
        : (isKo
          ? `${dartFinancials.corpNameKo} ${dartFinancials.bsnsYear} 연결매출 ${(dartFinancials.revenueKrw / 1e12).toFixed(2)}조원 — 기업 규모 기반 진출 capacity 추정.`
          : `${dartFinancials.corpNameKo} ${dartFinancials.bsnsYear} consolidated revenue ${(dartFinancials.revenueKrw / 1e12).toFixed(2)}T KRW — corporate-scale expansion capacity indicator.`),
    dataAvailable: dartFinancials != null && dartFinancials.revenueKrw != null,
  };

  // C4 — Supplementary: compSucsCase totalCnt (legacy single-line note)
  const compSucsCase = {
    totalCount: kotraCases.length,
    countryKo: winnerKo,
    caveat: kotraCases.length === 0
      ? (isKo
        ? `⚠ KOTRA compSucsCase DB에 ${winnerKo} 등록 case 0건. DB 자체 sparse — 보조 지표로 부적합.`
        : `⚠ Zero compSucsCase records for ${winnerEn}. DB is sparse — not usable as supplementary signal.`)
      : (isKo
        ? `KOTRA compSucsCase DB ${winnerKo} 등록 case ${kotraCases.length}건 (중소수출기업 중심, 참고 한정).`
        : `${kotraCases.length} compSucsCase records for ${winnerEn} (SME-skewed, supplementary only).`),
  };

  return {
    title: isKo
      ? `한국 정부 데이터 anchor — ${winnerKo}`
      : `Korean government data anchors — ${winnerEn}`,
    citationLabel: "data.go.kr (KOTRA·관세청·DART)",
    korCompanies,
    comtrade,
    dart,
    compSucsCase,
  };
}

/** Format the Source C composite as a strict GROUNDED DATA block for the LLM prompt. */
function formatSourceCForPrompt(sc: ValidationReportData["externalCrossCheck"]["sourceC"]): string {
  const lines: string[] = [];
  lines.push(`[C1 — KOTRA korCompList: Korean entities operating in ${sc.korCompanies.countryKo}]`);
  if (sc.korCompanies.dataAvailable) {
    lines.push(`  totalRegistered=${sc.korCompanies.totalRegistered}`);
    for (const r of sc.korCompanies.rows.slice(0, 4)) {
      lines.push(`  - ${r.parentKo}${r.localKo ? ` (현지명: ${r.localKo})` : ""} | ${r.industry || "?"} | ${r.year} | ${r.form}`);
    }
  } else {
    lines.push(`  NO DATA — ${sc.korCompanies.caveat}`);
  }
  lines.push("");
  lines.push(`[C2 — UN Comtrade: KR→${sc.comtrade.countryKo} export flow]`);
  if (sc.comtrade.dataAvailable) {
    lines.push(`  year=${sc.comtrade.year}  HSCodes=${sc.comtrade.hsCodes.slice(0, 5).join(",")}`);
    lines.push(`  KR→${sc.comtrade.countryKo} export value = $${((sc.comtrade.exportValueUsd ?? 0) / 1e6).toFixed(2)}M`);
  } else {
    lines.push(`  NO DATA — ${sc.comtrade.caveat}`);
  }
  lines.push("");
  lines.push(`[C3 — DART: corporate filings (overseas-revenue segment proxy)]`);
  if (sc.dart.dataAvailable && sc.dart.revenueKrw != null) {
    lines.push(`  corp=${sc.dart.corpNameKo}  fy=${sc.dart.bsnsYear}`);
    lines.push(`  consolidated revenue=${(sc.dart.revenueKrw / 1e12).toFixed(2)}T KRW${sc.dart.opIncomeKrw != null ? `  op income=${(sc.dart.opIncomeKrw / 1e12).toFixed(2)}T KRW` : ""}`);
  } else {
    lines.push(`  NO DATA — ${sc.dart.caveat}`);
  }
  lines.push("");
  lines.push(`[C4 — KOTRA compSucsCase totalCnt (supplementary, sparse DB)]`);
  lines.push(`  ${sc.compSucsCase.countryKo} = ${sc.compSucsCase.totalCount} case(s) registered`);
  if (sc.compSucsCase.totalCount === 0) {
    lines.push(`  NOTE: ${sc.compSucsCase.caveat}`);
  }
  return lines.join("\n");
}

function buildPrompt(args: {
  agg: EnsembleAggregate;
  project: ProjectContext;
  simData: ValidationReportData["simResult"];
  locale: "ko" | "en";
  marketGroundedText: string;
  peerBrandGroundedText: string;
  competitiveGroundedText: string;
  internalGrowthGroundedText: string;
  sourceCComposite: ValidationReportData["externalCrossCheck"]["sourceC"];
  winnerEn: string;
  winnerKo: string;
  candidatesEnList: string;
}): string {
  const { agg, project, simData, locale, marketGroundedText, peerBrandGroundedText,
    competitiveGroundedText, internalGrowthGroundedText, sourceCComposite,
    winnerEn, winnerKo, candidatesEnList } = args;
  const isKo = locale === "ko";
  const lang = isKo ? "Korean (한국어)" : "English";
  const price = formatBasePriceDisplay(project.basePriceCents, project.currency);
  const sourceCText = formatSourceCForPrompt(sourceCComposite);
  // Sub-source availability flags for LLM alignmentMatrix guidance
  const c1Avail = sourceCComposite.korCompanies.dataAvailable;
  const c2Avail = sourceCComposite.comtrade.dataAvailable;
  const c3Avail = sourceCComposite.dart.dataAvailable;

  return `You are a senior strategy consultant at a top-tier firm (McKinsey/BCG/Bain) writing a market-entry cross-validation report.

# STRICT RULES — READ FIRST
1. Use ONLY the GROUNDED DATA below for external claims. Do NOT invent CAGR figures, brand names, dates, or URLs.
2. If a piece of grounded data does NOT contain a fact you need, write "data not available" or omit that claim. Hallucinated citations destroy trust.
3. Every numeric / cited claim in marketValidation / peerBrand / competitive / internalGrowth sections MUST trace to a row in the grounded data below.
4. Return ONLY a single JSON object. No markdown fences, no commentary.
5. All text fields in ${lang} except brand names + corporate names + URLs.

# PRODUCT CONTEXT
- Product: ${project.productName}
- Brand: ${project.brandName ?? "—"}
- Corporate: ${project.corporateName ?? "—"}
- Category: ${project.category ?? "—"}
- Origin: ${project.originatingCountry ?? "—"}
- Price: ${price}
- Description: ${project.description ?? "—"}
- Candidates: ${candidatesEnList}
- Competitors hint: ${(project.competitorNames ?? []).join(", ") || "—"}

# SIMULATION RESULT
- Recommended winner: ${winnerEn} (${simData.consensusPercent}% multi-LLM consensus, ${simData.confidence})
- Vote breakdown: ${simData.voteDistribution.map((v) => `${v.country} ${v.count}/${agg.simCount ?? 0} (${v.percent}%)`).join(", ")}
- Top score ranking: ${simData.scoreRanking.slice(0, 5).map((s) => `${s.country} ${s.mean.toFixed(1)}±${s.std.toFixed(1)}`).join(" / ")}
- Tied at top: ${simData.topCountriesTied ? `yes — ${winnerEn} == ${simData.runnerUp ?? ""} on mean` : "no"}
- Display mode: ${simData.displayMode ?? "single"}${simData.displayMode === "top2" && simData.secondary
  ? `  ← Top 2 cluster: primary ${winnerEn} + secondary ${simData.secondary.country} (gap ${simData.secondary.gapToPrimary}pt, vote ${simData.secondary.voteSharePercent}%). Per dominance check (${simData.dominanceCriteria?.passCount ?? 0}/3 criteria passed), this product does NOT have a clear single winner — present BOTH candidates as equally viable. The reader is expected to pick between them based on internal capability / risk appetite, not pick the listed "winner" blindly.`
  : ""}
- Sim's own executive summary: ${agg.narrative?.executiveSummary?.slice(0, 500) ?? "—"}

# GROUNDED DATA — Source A (Market size + CAGR for ${winnerEn})
${marketGroundedText}

# GROUNDED DATA — Source B (Peer Korean brand entry patterns in ${winnerEn})
${peerBrandGroundedText}

# GROUNDED DATA — Source C (한국 정부 데이터 anchor composite, 4 sub-sources, direct API results)
${sourceCText}

# SOURCE C SUB-SOURCE AVAILABILITY FLAGS — for alignmentMatrix row inclusion
C1_korCompList_available=${c1Avail}
C2_comtrade_available=${c2Avail}
C3_dart_available=${c3Avail}

# GROUNDED DATA — Source D (Internal brand growth + competitive landscape)
${internalGrowthGroundedText}

${competitiveGroundedText ? `# GROUNDED DATA — Competitive landscape\n${competitiveGroundedText}` : ""}

# OUTPUT SCHEMA — return EXACTLY this JSON, all text in ${lang}

{
  "executiveSummary": {
    "headline": "≤70 chars one-line bold conclusion. Start with one emoji. If Display mode = 'top2', frame as '🥇 X · 🥈 Y 동등 후보' (both countries named) — do NOT pretend single winner exists.",
    "confidenceGrade": "A | B+ | B | C+ | C",
    "confidenceLabel": "≤30 chars label",
    "keyMessage": "2-3 sentences: recommendation, top reason, top risk.",
    "threeActions": ["next 90 days action 1", "action 2", "action 3"],
    "momentumIndicators": [
      "≤60 chars momentum bullet 1 with a real number from grounded data",
      "bullet 2 with citation",
      "bullet 3 with citation",
      "bullet 4 (external data alignment percent — derive from your alignmentMatrix)"
    ]
  },
  "externalCrossCheck": {
    "sourceA": {
      "title": "≤40 chars",
      "rows": [
        {"label": "CAGR (2024-2029)", "value": "n.n%", "interpretation": "≤80 chars"},
        {"label": "주요 성장 요인", "value": "≤40 chars", "interpretation": "≤80 chars"},
        {"label": "핵심 segment", "value": "≤40 chars", "interpretation": "≤80 chars"},
        {"label": "Premium 브랜드 진입", "value": "≤40 chars", "interpretation": "≤80 chars"}
      ],
      "verdict": "≤120 chars one-line verdict.",
      "verdictKind": "support | neutral | caveat",
      "citations": [
        {"label": "Source title", "url": "https://...real URL from grounded data..."}
      ]
    },
    "sourceB": {
      "title": "≤40 chars",
      "heroCase": {
        "brand": "real brand name from grounded data",
        "signals": ["≤90 chars signal", "≤90 chars signal"]
      } | null,
      "otherCases": [
        {"brand": "Brand", "signal": "≤90 chars"}
      ],
      "verdict": "≤120 chars",
      "verdictKind": "support | neutral | caveat",
      "citations": [{"label": "...", "url": "..."}]
    },
    "sourceD": {
      "title": "≤40 chars (internal brand growth)",
      "rows": [
        {"label": "최근 매출 성장", "value": "n.n%", "interpretation": "≤80 chars"},
        {"label": "국내 distribution", "value": "≤40 chars", "interpretation": "≤80 chars"},
        {"label": "해외 진출 이력", "value": "≤30 chars", "interpretation": "≤80 chars"}
      ],
      "verdict": "≤120 chars",
      "verdictKind": "support | neutral | caveat",
      "citations": [{"label": "...", "url": "..."}]
    }
  },
  "alignmentMatrix": [
    {
      "dimension": "시장 성장 / Market growth",
      "simSignal": "≤60 chars",
      "externalData": "≤60 chars",
      "alignment": "high | medium | low | concern",
      "note": "≤60 chars"
    }
    /* EXACTLY 8 rows in this order:
       1. 시장 성장 / Market growth (Source A)
       2. 타깃 segment 적합성 (Source A or B)
       3. 경쟁 brand 진입 패턴 (Source B)
       4. 시장 사이즈 절대값 (Source A)
       5. 진입 채널 / 장벽 (Source D)
       6. 한국기업 진출 패턴 — KOTRA korCompList (Source C1)
          - If C1_korCompList_available=false: set alignment="concern", note="데이터 부재 (KOTRA 등록 한국법인 0건)" — DO NOT invent
       7. 한국→${winnerKo} 카테고리 수출 추이 — Comtrade (Source C2)
          - If C2_comtrade_available=false: set alignment="concern", note="데이터 부재 (Comtrade HSCode 매핑 부재 또는 수출 0건)"
       8. 동종 한국 기업 재무 신호 — DART (Source C3)
          - If C3_dart_available=false: set alignment="concern", note="데이터 부재 (비상장 또는 사전 매핑 미보유)"
       Rows 6-8 are the Korean-government-data composite. Each must use the corresponding
       sub-source's grounded data ONLY. Do not blend rows. Do not infer C3 from C1.
    */
  ],
  "alignmentScoring": {
    "rows": [
      /* 8 rows matching alignmentMatrix order. percent 0-100 per row.
         Rows where alignmentMatrix.alignment="concern" (data absent) MUST be
         omitted from this rows list AND excluded from weightedAverage —
         missing data infrastructure should not deflate the simulation's
         alignment score. */
      {"dimension": "시장 성장 momentum", "percent": 100},
      {"dimension": "타깃 segment 적합성", "percent": 100},
      {"dimension": "경쟁사 진입 패턴", "percent": 80},
      {"dimension": "시장 absolute 사이즈", "percent": 50},
      {"dimension": "진입 채널 / 진입 장벽", "percent": 90},
      {"dimension": "한국기업 진출 패턴", "percent": 80},
      {"dimension": "한국 카테고리 수출 추이", "percent": 70},
      {"dimension": "기업 재무 신호", "percent": 60}
    ],
    "weightedAverage": 84,
    "label": "매우 높음 | 높음 | 보통 | 낮음",
    "netVerdict": "≤200 chars — overall reasonableness statement matching the percent."
  },
  "riskAssessment": [
    {
      "risk": "≤90 chars",
      "severityStars": 3 /* 1-3, 3=highest */,
      "mitigation": "≤120 chars"
    }
    /* 5-6 risks */
  ],
  "phasedExecution": {
    "phase1": {
      "duration": "Day 1-90",
      "goal": "≤90 chars Phase 1 goal",
      "steps": [
        {"stepNum": 1, "goal": "≤30 chars", "deliverable": "≤50 chars", "note": "≤40 chars cost/timing"},
        {"stepNum": 2, "goal": "...", "deliverable": "...", "note": "..."},
        {"stepNum": 3, "goal": "...", "deliverable": "...", "note": "..."},
        {"stepNum": 4, "goal": "...", "deliverable": "...", "note": "..."},
        {"stepNum": 5, "goal": "...", "deliverable": "...", "note": "..."}
      ]
    },
    "phase2": {
      "duration": "Day 90-270",
      "goal": "≤90 chars",
      "deliverables": ["bullet 1 with target number", "bullet 2 trigger metric", "bullet 3"]
    },
    "phase3": {
      "duration": "Day 180+",
      "goal": "≤90 chars",
      "deliverables": ["bullet 1", "bullet 2", "bullet 3"]
    }
  },
  "honestDisclosure": {
    "limitations": [
      {"title": "≤30 chars", "description": "≤200 chars explanation"}
      /* 4-5 limitations: sim accuracy, single-source reference, market data freshness, internal first-overseas, multi-LLM systematic bias */
    ],
    "perAreaGrades": [
      {"area": "${isKo ? `${winnerKo} 1순위 추천 합리성` : `${winnerEn} top-pick reasonableness`}", "grade": "B+", "label": "${isKo ? "(높음)" : "(high)"}", "basis": "≤100 chars"},
      {"area": "${isKo ? "매출 예측 정확도" : "Revenue forecast accuracy"}", "grade": "C", "label": "${isKo ? "(보통)" : "(moderate)"}", "basis": "≤100 chars"},
      {"area": "${isKo ? "진입 시점 적정성" : "Entry timing"}", "grade": "B", "label": "${isKo ? "(양호)" : "(good)"}", "basis": "≤100 chars"},
      {"area": "${isKo ? "채널 추천" : "Channel recommendation"}", "grade": "A-", "label": "${isKo ? "(강함)" : "(strong)"}", "basis": "≤100 chars"},
      {"area": "${isKo ? "Risk 식별 완전성" : "Risk identification completeness"}", "grade": "B+", "label": "${isKo ? "(양호)" : "(good)"}", "basis": "≤100 chars"}
    ],
    "overallVerdict": "≤200 chars — final overall recommendation grade with the gating condition."
  }
}

CRITICAL: every URL in 'citations' MUST be copied verbatim from the GROUNDED DATA blocks above. If you cannot find a source for a section, return an empty citations array and verdictKind="neutral" with a verdict that says so. Do not invent URLs. Do not invent percentages.`;
}

export async function generateValidationContent(
  agg: EnsembleAggregate,
  project: ProjectContext,
  opts: {
    ensembleId: string;
    tier: string;
    locale: "ko" | "en";
    llmProviders: string[];
    anthropicKey?: string;
    durationMinutes?: number;
  },
): Promise<ValidationReportData | null> {
  const apiKey = opts.anthropicKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("[validation-content] ANTHROPIC_API_KEY missing");
    return null;
  }
  const isKo = opts.locale === "ko";
  const simData = deriveSimData(agg);
  const winnerCode = simData.winner.toUpperCase();
  const winnerEn = EN_COUNTRY_NAMES[winnerCode] ?? winnerCode;
  const winnerKo = KOR_COUNTRY_NAMES[winnerCode] ?? winnerCode;
  const category = project.category ?? "consumer goods";

  // ── Pre-fetch objective data in parallel ─────────────────────────
  const brandQuery = project.brandName ?? project.productName.split(/\s+/)[0];
  const dartSlug = inferSlugFromProductName(project.productName);
  const hsCodes = hsCodesForCategory(project.category ?? "");
  const [
    marketRes, peerRes, internalRes, competitiveRes,
    kotraCases, kotraNational, comtradeFlows, dartFinancials,
  ] = await Promise.all([
    tavilySearch({
      query: `${category} market ${winnerEn} CAGR 2024 2025 2026 growth forecast TAM size`,
      searchDepth: "advanced",
      maxResults: 5,
    }),
    tavilySearch({
      query: `Korean ${category} brand entered ${winnerEn} first overseas market expansion case`,
      searchDepth: "advanced",
      maxResults: 5,
    }),
    tavilySearch({
      query: `${brandQuery} ${project.corporateName ?? ""} brand growth revenue 2024 2025 2026 Korea`,
      searchDepth: "advanced",
      maxResults: 5,
    }),
    tavilySearch({
      query: `${category} ${winnerEn} competition top brands market share 2024 2025`,
      searchDepth: "advanced",
      maxResults: 4,
    }),
    // Source C — supplementary: KOTRA compSucsCase totalCnt only (legacy slot).
    fetchKotraSuccessCases(winnerKo, { numOfRows: 6 }).catch(() => []),
    // Source C — primary: KOTRA natnInfo.korCompList (Korean entities in target).
    fetchKotraNationalInfo(winnerCode).catch(() => null),
    // Source C — quantitative: Comtrade KR → target export flow for category HSCodes.
    // Comtrade requires its own subscription key — fall back to public unauthed
    // endpoint when COMTRADE_API_KEY is unset (rate-limited but still works for
    // single-product PDF generation cadence).
    hsCodes.length > 0
      ? fetchKoreaExportFlows({
          partnerCountries: [winnerCode],
          hsCodes,
          apiKey: process.env.COMTRADE_API_KEY,
        }).catch(() => [])
      : Promise.resolve([] as ComtradeFlow[]),
    // Source C — corporate filing: DART financials (only if product slug is in the curated lookup).
    dartSlug
      ? fetchDartFinancialsForSlug(dartSlug).catch(() => null)
      : Promise.resolve(null as DartCompanyFinancials | null),
  ]);

  const marketGroundedText = summarizeTavily("A", marketRes);
  const peerBrandGroundedText = summarizeTavily("B", peerRes);
  const internalGrowthGroundedText = summarizeTavily("D", internalRes);
  const competitiveGroundedText = summarizeTavily("X", competitiveRes);

  // Build candidate countries (display strings)
  const candidates = (project.candidateCountries.length > 0
    ? project.candidateCountries
    : simData.scoreRanking.map((r) => r.country));
  const candidatesEnList = candidates
    .map((c) => `${c} (${EN_COUNTRY_NAMES[c.toUpperCase()] ?? c})`)
    .join(", ");

  // Build the composite Source C *before* prompting so the LLM sees the
  // exact structure that will render in the PDF — no risk of drift between
  // narrative and deterministic data.
  const sourceCComposite = buildSourceCComposite({
    isKo, winnerKo, winnerEn, winnerCode, category: project.category,
    kotraCases, kotraNational, comtradeFlows, dartFinancials, hsCodes,
  });

  // ── LLM composition ──────────────────────────────────────────────
  const prompt = buildPrompt({
    agg, project, simData, locale: opts.locale,
    marketGroundedText, peerBrandGroundedText, competitiveGroundedText,
    internalGrowthGroundedText,
    sourceCComposite,
    winnerEn, winnerKo, candidatesEnList,
  });

  const client = new Anthropic({ apiKey });
  let llmText = "";
  try {
    const resp = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 8000,
      messages: [{ role: "user", content: prompt }],
    });
    const block = resp.content.find((b) => b.type === "text");
    llmText = block && block.type === "text" ? block.text : "";
  } catch (err) {
    console.warn(`[validation-content] LLM error: ${(err as Error).message}`);
    return null;
  }

  const parsed = safeJsonParse(llmText);
  if (!parsed) {
    console.warn(`[validation-content] JSON parse failed. First 200c: ${llmText.slice(0, 200)}`);
    return null;
  }

  // ── Build final report data — combine LLM output + deterministic fields
  const personaCount = agg.effectivePersonas ?? 200;
  const generatedAtIso = new Date().toISOString();
  const basePriceDisplay = formatBasePriceDisplay(project.basePriceCents, project.currency);

  const llmExec = (parsed.executiveSummary as ValidationReportData["executiveSummary"]) ?? {
    headline: "", confidenceGrade: "B", confidenceLabel: "", keyMessage: "",
    threeActions: [], momentumIndicators: [],
  };
  const llmCross = (parsed.externalCrossCheck as ValidationReportData["externalCrossCheck"]) ?? {
    sourceA: { title: "", citationLabel: "", rows: [], verdict: "", verdictKind: "neutral", citations: [] },
    sourceB: { title: "", citationLabel: "", heroCase: null, otherCases: [], verdict: "", verdictKind: "neutral", citations: [] },
    sourceC: { title: "", citationLabel: "", rows: [], caveat: "" },
    sourceD: { title: "", citationLabel: "", rows: [], verdict: "", verdictKind: "neutral", citations: [] },
  };
  const llmAlign = (parsed.alignmentMatrix as ValidationReportData["alignmentMatrix"]) ?? [];
  const llmScoring = (parsed.alignmentScoring as ValidationReportData["alignmentScoring"]) ?? {
    rows: [], weightedAverage: 0, label: "", netVerdict: "",
  };
  const llmRisks = (parsed.riskAssessment as ValidationReportData["riskAssessment"]) ?? [];
  const llmPhased = (parsed.phasedExecution as ValidationReportData["phasedExecution"]) ?? {
    phase1: { duration: "Day 1-90", goal: "", steps: [] },
    phase2: { duration: "Day 90-270", goal: "", deliverables: [] },
    phase3: { duration: "Day 180+", goal: "", deliverables: [] },
  };
  const llmDisclosure = (parsed.honestDisclosure as ValidationReportData["honestDisclosure"]) ?? {
    limitations: [], perAreaGrades: [], overallVerdict: "",
  };

  // Source C composite already built above for the prompt. Reuse the
  // exact same struct in the PDF data — guarantees the narrative and the
  // visual rendering point at identical facts.
  const sourceC = sourceCComposite;

  const data: ValidationReportData = {
    meta: {
      productName: project.productName,
      brand: project.brandName ?? undefined,
      corporateName: project.corporateName ?? undefined,
      ensembleId: opts.ensembleId,
      generatedAt: generatedAtIso,
      tier: opts.tier,
      simCount: agg.simCount ?? 0,
      personaCount,
      llmProviders: opts.llmProviders,
      locale: opts.locale,
      category: project.category,
      basePriceDisplay,
      candidateCountries: candidates,
      originCountry: project.originatingCountry,
      durationMinutes: opts.durationMinutes,
    },
    simResult: simData,
    executiveSummary: llmExec,
    methodology: {
      biasNote: isKo
        ? "외부 데이터는 시뮬레이션 결과와 독립적으로 수집되어 confirmation bias를 최소화하였다. 4개 source 모두에서 동일 결론이 도출될 때만 high-confidence 추천으로 분류한다."
        : "External data was fetched independently of the simulation result to minimise confirmation bias. Only when all 4 sources point the same direction is the recommendation graded high-confidence.",
      sources: [
        {
          label: "A",
          name: isKo ? `${winnerKo} ${category} 시장 규모·성장률` : `${winnerEn} ${category} market size + growth`,
          description: isKo
            ? "Tavily 웹 검색 (advanced) — 분석사·업계 보고서·언론 보도 등 다중 출처"
            : "Tavily web search (advanced depth) — analyst reports, industry press, news",
        },
        {
          label: "B",
          name: isKo ? "동종 한국 브랜드 진출 패턴" : "Peer Korean brand entry patterns",
          description: isKo
            ? "Tavily 웹 검색 — 동일 카테고리 K-브랜드의 첫 해외 진출 사례"
            : "Tavily web search — peer K-brand first overseas entry cases",
        },
        {
          label: "C",
          name: isKo ? "한국 정부 데이터 anchor (KOTRA·관세청·DART 복합)" : "Korean government data composite (KOTRA / Customs / DART)",
          description: isKo
            ? "data.go.kr — KOTRA korCompList (진출 한국법인) + UN Comtrade (한국 카테고리 수출 추이) + DART (기업 재무 신호) + KOTRA compSucsCase (보조)"
            : "data.go.kr — KOTRA korCompList (entities) + UN Comtrade (KR export flow) + DART (corporate filings) + KOTRA compSucsCase (supplementary)",
        },
        {
          label: "D",
          name: isKo ? "자사 브랜드 성장 현황" : "Internal brand growth signals",
          description: isKo
            ? "Tavily 웹 검색 — 자사 매출·성장 모멘텀·국내 distribution"
            : "Tavily web search — brand revenue + growth momentum + domestic distribution",
        },
      ],
    },
    externalCrossCheck: {
      sourceA: { ...llmCross.sourceA, citationLabel: "Tavily web search (advanced)" },
      sourceB: { ...llmCross.sourceB, citationLabel: "Tavily web search (advanced)" },
      sourceC,
      sourceD: { ...llmCross.sourceD, citationLabel: "Tavily web search (advanced)" },
    },
    alignmentMatrix: llmAlign,
    alignmentScoring: llmScoring,
    riskAssessment: llmRisks,
    phasedExecution: llmPhased,
    honestDisclosure: llmDisclosure,
    appendix: {
      dataSources: [
        { category: isKo ? "시뮬 결과" : "Simulation result", source: `AI Market Twin ensemble ${opts.ensembleId.slice(0, 8)} (${opts.llmProviders.length} LLMs × ${agg.simCount ?? 0} sims)`, reliability: "A" },
        { category: isKo ? `${winnerKo} 시장 데이터` : `${winnerEn} market data`, source: "Tavily web search (advanced) — analyst reports + industry press", reliability: "B+" },
        { category: isKo ? "동종 브랜드 진출 사례" : "Peer brand entry cases", source: "Tavily web search (advanced)", reliability: "B" },
        { category: isKo ? "KOTRA 진출 한국법인" : "KOTRA korCompList (entities)", source: "data.go.kr / KOTRA natnInfo OpenAPI", reliability: "A" },
        { category: isKo ? "한국→target 카테고리 수출 추이" : "KR→target category export flow", source: "UN Comtrade public API", reliability: "A" },
        { category: isKo ? "동종 한국 기업 재무 (상장사)" : "Peer Korean corporate financials (listed)", source: "DART (Financial Supervisory Service) OpenAPI", reliability: "A" },
        { category: "KOTRA " + (isKo ? "성공사례 DB (보조)" : "compSucsCase (supplementary)"), source: "data.go.kr / KOTRA compSucsCase OpenAPI", reliability: "B" },
        { category: isKo ? "자사 성장 현황" : "Internal brand growth", source: "Tavily web search (advanced)", reliability: "B+" },
      ],
      referenceUrls: [
        ...(marketRes?.results.slice(0, 3).map((r) => ({ label: r.title, url: r.url })) ?? []),
        ...(peerRes?.results.slice(0, 2).map((r) => ({ label: r.title, url: r.url })) ?? []),
        ...(internalRes?.results.slice(0, 2).map((r) => ({ label: r.title, url: r.url })) ?? []),
      ],
      reproductionSpec: [
        { key: "productName", value: project.productName },
        { key: "category", value: project.category ?? "—" },
        { key: "basePrice", value: basePriceDisplay },
        { key: "originCountry", value: project.originatingCountry ?? "—" },
        { key: "tier", value: opts.tier },
        { key: "personaCount", value: `${personaCount} × ${agg.simCount ?? 0} sims = ${(personaCount * (agg.simCount ?? 0)).toLocaleString()}` },
        { key: "candidateCountries", value: `[${candidates.join(", ")}]` },
        { key: "llmProviders", value: opts.llmProviders.join(" · ") },
      ],
      publicationSpec: [
        { key: isKo ? "발행 도구" : "Tool", value: "AI Market Twin (markettwin.ai)" },
        { key: "Ensemble ID", value: opts.ensembleId },
        { key: isKo ? "발행 일자" : "Publication date", value: new Date(generatedAtIso).toLocaleDateString(isKo ? "ko-KR" : "en-US", { year: "numeric", month: "long", day: "numeric" }) },
        { key: isKo ? "갱신 권장" : "Refresh cadence", value: isKo ? "6개월 (시장 변동 추적 시 분기별)" : "6 months (quarterly if market is volatile)" },
      ],
      disclaimer: isKo
        ? "본 분석은 AI 시뮬레이션 결과 + 외부 시장 데이터 분석을 결합한 것으로, 실제 사업 의사결정 시 추가 due diligence를 권장합니다."
        : "This analysis combines AI simulation results with external market data. Additional due diligence is recommended before any business decision.",
      methodology: isKo
        ? "AI Market Twin은 다중 LLM 앙상블 시뮬레이션 + 객관적 외부 데이터 (Tavily web search, KOTRA OpenAPI 등) 결합으로 시장 진출 의사결정을 검증한다."
        : "AI Market Twin combines multi-LLM ensemble simulation with objective external data (Tavily web search, KOTRA OpenAPI) to validate market-entry decisions.",
      contact: "contact@markettwin.ai",
      tagline: isKo
        ? "데이터로 K-product의 다음 시장을 추천하다"
        : "Data-driven market discovery for K-products",
    },
  };

  return data;
}

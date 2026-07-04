/**
 * World Bank Open Data — macro market-size grounding.
 *
 * Phase F.0-2 (2026-05-17). Replaces the LLM's free-styled marketSize
 * sub-score with externally-anchored GDP-PPP × population × consumption
 * indicators. The World Bank API is free (no key) and covers 200+
 * countries with annual updates.
 *
 * Why this complements Comtrade:
 *   - Comtrade tells you "Korea exported $X of category C to country Y"
 *     — a brand-side proxy for K-product entry.
 *   - World Bank tells you "country Y has population P, GDP-PPP-per-cap G,
 *     and total private consumption C" — the demand-side ceiling
 *     regardless of K-product presence.
 *   - Both signals enter the country-scoring prompt. The LLM cross-checks
 *     them: high Comtrade + high WB consumption = strong demand AND
 *     existing distribution. Low Comtrade + high WB consumption = open
 *     opportunity. Strong Comtrade + low WB consumption = saturated.
 *
 * Indicators used (4 per country, ~1 KB each):
 *   - NY.GDP.PCAP.PP.CD — GDP per capita, PPP, current USD
 *   - SP.POP.TOTL       — Population total
 *   - NE.CON.PRVT.PP.CD — Household final consumption, PPP, current USD
 *   - NY.GDP.MKTP.CD    — GDP market value USD
 *
 * Best-effort: API failure is non-fatal. Sim runs without the WB block.
 */

// ISO 3166-1 alpha-2 → alpha-3 mapping for World Bank country codes.
// World Bank uses alpha-3 (or 3-letter codes like "USA", "KOR").
export const ISO2_TO_ISO3: Record<string, string> = {
  US: "USA",
  JP: "JPN",
  CN: "CHN",
  GB: "GBR",
  DE: "DEU",
  FR: "FRA",
  IT: "ITA",
  ES: "ESP",
  NL: "NLD",
  SE: "SWE",
  CA: "CAN",
  AU: "AUS",
  NZ: "NZL",
  IN: "IND",
  ID: "IDN",
  VN: "VNM",
  TH: "THA",
  MY: "MYS",
  SG: "SGP",
  PH: "PHL",
  TW: "TWN",
  HK: "HKG",
  MX: "MEX",
  BR: "BRA",
  AR: "ARG",
  KR: "KOR",
  AE: "ARE",
  SA: "SAU",
  TR: "TUR",
};

export interface WorldBankIndicators {
  /** ISO alpha-2. */
  country: string;
  /** GDP per capita PPP, current USD. NaN when missing. */
  gdpPerCapitaPpp: number;
  /** Total population. */
  population: number;
  /** Private consumption USD (PPP). */
  householdConsumptionPpp: number;
  /** GDP at market value, USD. */
  gdpUsd: number;
  /** Individuals using the Internet, % of population — e-commerce / D2C readiness. */
  internetPct: number;
  /** Urban population, % of total — retail / distribution density. */
  urbanPct: number;
  /** Inflation, consumer prices, annual % — price sensitivity / macro stability. */
  inflationPct: number;
  /** Logistics Performance Index overall, 1–5 — import & distribution feasibility. */
  lpiScore: number;
  /** Year of the data point (most recent available). */
  year: number;
}

const WB_TIMEOUT_MS = 6000;
const WB_BASE = "https://api.worldbank.org/v2";

interface WBSeriesRow {
  date: string;
  value: number | null;
  country?: { id?: string };
}

async function fetchOne(
  countryIso3: string,
  indicator: string,
  asOfYear?: number,
): Promise<{ year: number; value: number } | null> {
  // Historical mode: fetch a 5-year window ending at asOfYear, pick the
  // most recent non-null within that window. Required by K-Beauty D2C
  // methodology benchmark to avoid hindsight bias when re-running brand
  // entry decisions made in 2020-2022.
  // Default mode: MRV=5 (latest 5 published values).
  const dateParam = asOfYear ? `date=${asOfYear - 4}:${asOfYear}` : `MRV=5`;
  const url = `${WB_BASE}/country/${countryIso3}/indicator/${indicator}?format=json&per_page=5&${dateParam}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), WB_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const json = (await res.json()) as [unknown, WBSeriesRow[]];
    const rows = Array.isArray(json) && Array.isArray(json[1]) ? json[1] : [];
    // Pick the most recent year with non-null value.
    for (const row of rows) {
      if (row?.value != null && row.date) {
        const year = Number.parseInt(row.date, 10);
        if (Number.isFinite(year)) return { year, value: row.value };
      }
    }
    return null;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

const INDICATORS = {
  gdpPerCapitaPpp: "NY.GDP.PCAP.PP.CD",
  population: "SP.POP.TOTL",
  householdConsumptionPpp: "NE.CON.PRVT.PP.CD",
  gdpUsd: "NY.GDP.MKTP.CD",
  internetPct: "IT.NET.USER.ZS",
  urbanPct: "SP.URB.TOTL.IN.ZS",
  inflationPct: "FP.CPI.TOTL.ZG",
  lpiScore: "LP.LPI.OVRL.XQ",
} as const;

/**
 * Fetch one indicator for MANY countries in a single WB call
 * (`/country/USA;JPN;.../indicator/IND`). Returns iso3 → most-recent
 * non-null {year, value}. Batching by indicator keeps the request count at
 * (indicators) instead of (countries × indicators) — the earlier per-country
 * fan-out tripped WB rate limits once the indicator set doubled to 8.
 */
async function fetchIndicatorMulti(
  iso3List: string[],
  indicator: string,
  asOfYear?: number,
): Promise<Map<string, { year: number; value: number }>> {
  const out = new Map<string, { year: number; value: number }>();
  if (iso3List.length === 0) return out;
  const dateParam = asOfYear ? `date=${asOfYear - 4}:${asOfYear}` : `mrv=5`;
  const url = `${WB_BASE}/country/${iso3List.join(";")}/indicator/${indicator}?format=json&per_page=${iso3List.length * 8}&${dateParam}`;
  // WB returns intermittent 502/503 under concurrent load — retry a few times
  // with a short backoff before giving up (best-effort, still non-fatal).
  let json: [unknown, Array<{ countryiso3code?: string; date?: string; value: number | null }>] | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), WB_TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(timer);
      if (res.ok) {
        json = (await res.json()) as [
          unknown,
          Array<{ countryiso3code?: string; date?: string; value: number | null }>,
        ];
        break;
      }
      // Non-retryable client error (4xx other than 429) — give up immediately.
      if (res.status < 500 && res.status !== 429) return out;
    } catch {
      clearTimeout(timer);
    }
    await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
  }
  if (!json) return out;
  const rows = Array.isArray(json) && Array.isArray(json[1]) ? json[1] : [];
  for (const row of rows) {
    const iso3 = row.countryiso3code;
    const year = row.date ? Number.parseInt(row.date, 10) : NaN;
    if (!iso3 || row.value == null || !Number.isFinite(year)) continue;
    const cur = out.get(iso3);
    if (!cur || year > cur.year) out.set(iso3, { year, value: row.value });
  }
  return out;
}

export async function fetchWorldBankIndicators(
  countryCodes: string[],
  asOfYear?: number,
): Promise<WorldBankIndicators[]> {
  const pairs = countryCodes
    .map((c) => ({ iso2: c.toUpperCase(), iso3: ISO2_TO_ISO3[c.toUpperCase()] }))
    .filter((p): p is { iso2: string; iso3: string } => Boolean(p.iso3));
  const iso3List = pairs.map((p) => p.iso3);

  // One call per indicator across all countries (8 calls total).
  const [gdpPpp, pop, cons, gdp, net, urb, infl, lpi] = await Promise.all([
    fetchIndicatorMulti(iso3List, INDICATORS.gdpPerCapitaPpp, asOfYear),
    fetchIndicatorMulti(iso3List, INDICATORS.population, asOfYear),
    fetchIndicatorMulti(iso3List, INDICATORS.householdConsumptionPpp, asOfYear),
    fetchIndicatorMulti(iso3List, INDICATORS.gdpUsd, asOfYear),
    fetchIndicatorMulti(iso3List, INDICATORS.internetPct, asOfYear),
    fetchIndicatorMulti(iso3List, INDICATORS.urbanPct, asOfYear),
    fetchIndicatorMulti(iso3List, INDICATORS.inflationPct, asOfYear),
    fetchIndicatorMulti(iso3List, INDICATORS.lpiScore, asOfYear),
  ]);

  const results: WorldBankIndicators[] = [];
  for (const { iso2, iso3 } of pairs) {
    const g = gdpPpp.get(iso3),
      p = pop.get(iso3),
      c = cons.get(iso3),
      gd = gdp.get(iso3);
    const year = Math.max(g?.year ?? 0, p?.year ?? 0, c?.year ?? 0, gd?.year ?? 0);
    if (year === 0) continue; // no core data at all
    results.push({
      country: iso2,
      gdpPerCapitaPpp: g?.value ?? NaN,
      population: p?.value ?? NaN,
      householdConsumptionPpp: c?.value ?? NaN,
      gdpUsd: gd?.value ?? NaN,
      internetPct: net.get(iso3)?.value ?? NaN,
      urbanPct: urb.get(iso3)?.value ?? NaN,
      inflationPct: infl.get(iso3)?.value ?? NaN,
      lpiScore: lpi.get(iso3)?.value ?? NaN,
      year,
    });
  }
  return results.sort((a, b) => (b.householdConsumptionPpp || 0) - (a.householdConsumptionPpp || 0));
}

/**
 * Format World Bank indicators as a compact prompt block.
 *
 * Goal: give the LLM enough to ground marketSize without bloating tokens.
 * One line per country: pop · GDP/cap PPP · total private consumption.
 * No interpretation hints — the indicators are self-explanatory at the
 * order-of-magnitude scale the LLM cares about.
 */
export function renderWorldBankBlock(
  rows: WorldBankIndicators[],
  locale: "ko" | "en" = "ko",
): string {
  if (rows.length === 0) return "";
  const fmt = (n: number, unit: "M" | "B" | "T") => {
    if (!Number.isFinite(n)) return "n/a";
    const div = unit === "M" ? 1e6 : unit === "B" ? 1e9 : 1e12;
    return (n / div).toFixed(1);
  };
  const header =
    locale === "ko"
      ? "═══ World Bank macro 지표 (marketSize sub-score 외부 grounding) ═══"
      : "═══ World Bank macro indicators (marketSize sub-score grounding) ═══";
  const legend =
    locale === "ko"
      ? "pop=인구(백만), gdp/cap=1인당 GDP PPP(USD), HH cons=총 가계소비 PPP(USD bn), net=인터넷보급(%), urb=도시화(%), infl=인플레(%), lpi=물류지수(1-5). year는 데이터 시점."
      : "pop=population (M), gdp/cap=GDP per capita PPP (USD), HH cons=total household consumption PPP (USD bn), net=internet users %, urb=urban %, infl=inflation %, lpi=Logistics Perf. Index (1-5).";
  const pct = (n: number) => (Number.isFinite(n) ? `${n.toFixed(0)}%` : "n/a");
  const lines = rows.map((r) => {
    const popM = fmt(r.population, "M");
    const gdpCap = Number.isFinite(r.gdpPerCapitaPpp) ? Math.round(r.gdpPerCapitaPpp).toLocaleString() : "n/a";
    const consB = fmt(r.householdConsumptionPpp, "B");
    const l1 = `  ${r.country.padEnd(3)} pop=${popM.padStart(6)}M  gdp/cap=$${gdpCap.padStart(7)}  HH cons=$${consB.padStart(6)}B  (${r.year})`;
    const l2 = `        net=${pct(r.internetPct)}  urb=${pct(r.urbanPct)}  infl=${Number.isFinite(r.inflationPct) ? r.inflationPct.toFixed(1) + "%" : "n/a"}  lpi=${Number.isFinite(r.lpiScore) ? r.lpiScore.toFixed(1) : "n/a"}`;
    return `${l1}\n${l2}`;
  });
  const note =
    locale === "ko"
      ? "marketSize 산정 시 가계소비 PPP가 가장 직접적인 reachable-market 지표 (인구 × 구매력 결합). GDP/cap만 보지 말고 인구와 곱해 절대 시장 규모를 인식하세요. 2번째 줄: net(인터넷보급)은 D2C/이커머스 침투 가능성, urb(도시화)는 리테일 밀도, infl(인플레)는 가격민감도, lpi(물류지수)는 수입·유통 실행 난이도를 grounding — channelMatch·priceCompat 서브스코어에 반영."
      : "For marketSize, household consumption PPP is the most direct reachable-market metric (population × purchasing power). Line 2: net (internet %) grounds D2C/e-commerce reach, urb (urban %) retail density, infl (inflation %) price sensitivity, lpi (logistics index) import/distribution feasibility — weigh these into channelMatch & priceCompat sub-scores.";
  return `${header}\n${legend}\n${lines.join("\n")}\n\n${note}`;
}

/** Top-level helper — fetch + render in one call. */
export async function buildWorldBankAnchor(
  candidateCountries: string[],
  locale: "ko" | "en" = "ko",
  asOfYear?: number,
): Promise<{ block: string; rows: WorldBankIndicators[] }> {
  const rows = await fetchWorldBankIndicators(candidateCountries, asOfYear);
  return { block: renderWorldBankBlock(rows, locale), rows };
}

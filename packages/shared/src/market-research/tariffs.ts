/**
 * Import-tariff anchor — WITS / UNCTAD-TRAINS (World Bank), free, no key.
 *
 * Grounds the price-competitiveness and regulatory/entry-cost dimensions in a
 * HARD number the macro anchors miss: the import duty a product category faces
 * entering each candidate market. A 20% MFN tariff into Japan vs 0% into the US
 * is a decisive, real cost the LLM otherwise only guesses at.
 *
 * Signal: MFN simple-average applied tariff (partner = world / 000) for a
 * representative HS-6 line per category, at the latest available year. MFN is
 * the conservative, always-available baseline — the rate a new entrant faces
 * absent FTA rules-of-origin paperwork. Best-effort: any miss returns an empty
 * block; never throws, never fails the sim.
 *
 * WITS SDMX-JSON endpoint:
 *   /API/V1/SDMX/V21/datasource/TRN/reporter/{m49}/partner/000/product/{hs6}/
 *   year/{yyyy}/datatype/reported?format=JSON
 * Observation value[0] = simple-average applied rate (%). Verified live:
 * pasta/noodles (190230) into Japan = 22.1%, cosmetics (330499) into US = 0%.
 */

import tariffSnapshot from "./tariff-snapshot.json";

/** Baked 24-market × category tariff grid (annual refresh via
 *  scripts/build-tariff-snapshot.ts). WITS is ~33s/query, so the runtime reads
 *  this instantly and only hits live WITS on a snapshot miss. */
const SNAPSHOT = tariffSnapshot as Record<
  string,
  Record<string, { ratePct: number; year: number }>
>;

const WITS_BASE = "https://wits.worldbank.org/API/V1/SDMX/V21/datasource/TRN";
/** M49 codes WITS/TRAINS has no reporter schedule for (would 400/404 the whole
 *  batch). Those markets get no tariff grounding — an honest gap. */
const WITS_EXCLUDE = new Set<number>([490, 682, 484]); // TW, SA, MX
// WITS SDMX is slow (~33s for a few reporters, more for 24) — generous timeout.
// Live path is a rare snapshot-miss fallback; the snapshot builder also uses it.
const WITS_TIMEOUT_MS = 60_000;
/** Years tried newest→oldest until TRAINS has data (publication lags ~2-3y). */
const WITS_YEARS = [2021, 2020, 2022, 2019];

/**
 * Representative HS-6 tariff line per category. One line per category keeps
 * the signal legible; it stands in for the category's headline duty rather
 * than averaging the whole chapter. Mirrors comtrade.ts's category intent at
 * 6-digit precision (WITS requires HS-6, not 2-digit chapters).
 */
const CATEGORY_HS6: Record<string, string> = {
  food: "190230", // pasta / instant noodles
  beauty: "330499", // beauty & make-up preparations, nes
  health: "210690", // food preparations nes (supplements)
  alcohol: "220890", // spirits (soju/liqueurs)
  beverage: "220210", // waters w/ added sugar (soft drinks)
  fashion: "610910", // t-shirts, cotton, knit
  electronics: "851712", // smartphones / phones for cellular networks
  appliances: "851640", // electric smoothing irons / small appliances
  home: "392490", // household articles of plastics, nes
  ip: "950300", // toys
};

/** ISO alpha-2 → UN M49 numeric (WITS reporter codes). Note: WITS uses 840
 *  for the US (not Comtrade's 842) and 490 "Other Asia nes" for Taiwan. */
const ISO2_TO_M49: Record<string, number> = {
  KR: 410, US: 840, JP: 392, CN: 156, TW: 490, HK: 344, SG: 702, TH: 764,
  VN: 704, ID: 360, MY: 458, PH: 608, IN: 356, CA: 124, GB: 826, DE: 276,
  FR: 250, IT: 380, ES: 724, NL: 528, AU: 36, NZ: 554, AE: 784, SA: 682,
  BR: 76, MX: 484,
};

export interface CountryTariff {
  /** ISO alpha-2 importer. */
  country: string;
  /** MFN simple-average applied tariff, %. */
  ratePct: number;
  /** Year of the tariff data. */
  year: number;
}

function hs6ForCategory(category: string): string | null {
  return CATEGORY_HS6[category.toLowerCase()] ?? null;
}

const M49_TO_ISO2: Record<number, string> = Object.fromEntries(
  Object.entries(ISO2_TO_M49).map(([iso, m49]) => [m49, iso]),
);

/**
 * Fetch MFN tariffs for ALL importers in one multi-reporter WITS call per
 * year (32 per-country calls → 1). Parses the SDMX-JSON by resolving the
 * REPORTER dimension position in each series key, so the reporter→rate
 * mapping is robust to dimension ordering.
 */
type WitsTariffResponse = {
  structure?: {
    dimensions?: {
      series?: Array<{ id?: string; values?: Array<{ id?: string }> }>;
    };
  };
  dataSets?: Array<{
    series?: Record<string, { observations?: Record<string, number[]> }>;
  }>;
};

async function fetchTariffsForYear(
  m49List: number[],
  hs6: string,
  year: number,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  // WITS/TRAINS doesn't recognize these as reporters (490 = "Other Asia nes"
  // for Taiwan; 682 Saudi has no TRAINS schedule) — a single unrecognized code
  // 400s the WHOLE multi-reporter batch, so they're dropped (those markets get
  // no tariff grounding, an honest gap).
  const usable = m49List.filter((m) => !WITS_EXCLUDE.has(m));
  if (usable.length === 0) return out;
  // M49 codes must be zero-padded to 3 digits — WITS 400s on "36" but accepts
  // "036" (Australia, Brazil). Then retry transient 5xx/429 (WITS is flaky).
  const reporters = usable.map((m) => String(m).padStart(3, "0")).join(";");
  const url = `${WITS_BASE}/reporter/${reporters}/partner/000/product/${hs6}/year/${year}/datatype/reported?format=JSON`;
  let json: WitsTariffResponse | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), WITS_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        json = (await res.json()) as WitsTariffResponse;
        break;
      }
      if (res.status < 500 && res.status !== 429) return out; // permanent
    } catch {
      clearTimeout(timer);
    }
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
  if (!json) return out;
  {
    const dims = json.structure?.dimensions?.series ?? [];
    const reporterDim = dims.find((d) => d.id === "REPORTER");
    const reporterValues = (reporterDim?.values ?? []).map((v) => v.id);
    const series = json.dataSets?.[0]?.series ?? {};
    // WITS orders the series key inconsistently with the declared dimension
    // array, but REPORTER is the only multi-valued series dimension here
    // (partner/product/datatype/freq are each fixed to one value → their key
    // component is always "0"). So the reporter's index into reporterValues is
    // simply the single non-zero key component = the max component.
    for (const [key, s] of Object.entries(series)) {
      const idx = Math.max(
        ...key.split(":").map((x) => Number.parseInt(x, 10) || 0),
      );
      const m49 = Number.parseInt(reporterValues[idx] ?? "", 10);
      const iso2 = M49_TO_ISO2[m49];
      const first = Object.values(s.observations ?? {})[0];
      const val = Array.isArray(first) ? first[0] : undefined;
      if (iso2 && typeof val === "number" && Number.isFinite(val)) {
        out.set(iso2, val);
      }
    }
    return out;
  }
}

/**
 * Fetch per-country import tariffs for a category. Reads the baked snapshot
 * first (instant) and only hits live WITS (~33s) for markets missing from it.
 * Empty result when the category has no HS-6 mapping (e.g. SaaS/services).
 * Best-effort — never throws.
 */
export async function fetchTariffs(
  candidateCountries: string[],
  category: string,
): Promise<CountryTariff[]> {
  const hs6 = hs6ForCategory(category);
  if (!hs6) return [];
  const catSnap = SNAPSHOT[category.toLowerCase()] ?? {};
  const fromSnap: CountryTariff[] = [];
  const missing: string[] = [];
  for (const raw of candidateCountries) {
    const c = raw.toUpperCase();
    if (!ISO2_TO_M49[c]) continue;
    const s = catSnap[c];
    if (s) fromSnap.push({ country: c, ratePct: s.ratePct, year: s.year });
    else missing.push(c);
  }
  // Common case — every candidate is in the snapshot → no WITS call at all.
  if (missing.length === 0) return fromSnap;
  const live = await fetchTariffsLive(missing, hs6);
  return [...fromSnap, ...live];
}

/** Live WITS path — one multi-reporter call per year, merged newest-first for
 *  coverage. Only invoked for snapshot misses (or by the snapshot builder). */
async function fetchTariffsLive(
  candidateCountries: string[],
  hs6: string,
): Promise<CountryTariff[]> {
  const pairs = candidateCountries
    .map((c) => ({ iso2: c.toUpperCase(), m49: ISO2_TO_M49[c.toUpperCase()] }))
    .filter((p): p is { iso2: string; m49: number } => Boolean(p.m49));
  if (pairs.length === 0) return [];
  const m49List = pairs.map((p) => p.m49);

  // Query years SEQUENTIALLY (not parallel) with early-exit — WITS chokes on
  // several concurrent multi-reporter requests (26 reporters × 4 years timed
  // out entirely). 2021 alone usually covers all reporters; older years only
  // fill gaps. First-hit per country wins (WITS_YEARS is in priority order).
  const best = new Map<string, { ratePct: number; year: number }>();
  for (const year of WITS_YEARS) {
    if (best.size >= pairs.length) break; // all covered — stop
    const map = await fetchTariffsForYear(m49List, hs6, year);
    for (const [iso, rate] of map) {
      if (!best.has(iso)) best.set(iso, { ratePct: rate, year });
    }
  }
  return pairs
    .filter((p) => best.has(p.iso2))
    .map((p) => ({ country: p.iso2, ...best.get(p.iso2)! }));
}

/**
 * Render the tariff anchor as a compact prompt block. Sorted low→high so the
 * cheapest-to-enter markets read first. Returns "" when there is no data.
 */
export function renderTariffBlock(
  rows: CountryTariff[],
  category: string,
  locale: "ko" | "en" = "ko",
): string {
  if (rows.length === 0) return "";
  const sorted = [...rows].sort((a, b) => a.ratePct - b.ratePct);
  const hs6 = hs6ForCategory(category) ?? "";
  const header =
    locale === "ko"
      ? `═══ 수입 관세 (WITS/TRAINS · MFN 단순평균 적용세율, HS ${hs6}) ═══`
      : `═══ IMPORT TARIFFS (WITS/TRAINS · MFN simple-avg applied rate, HS ${hs6}) ═══`;
  const note =
    locale === "ko"
      ? "후보 시장이 이 카테고리 수입에 부과하는 실제 관세율(%). priceCompat·regulatory 서브스코어의 하드 grounding — 높을수록 가격경쟁력↓·진입비용↑. (FTA 특혜세율 미적용 보수적 MFN 기준)"
      : "The actual duty (%) each candidate market levies on this category's imports. Hard grounding for priceCompat & regulatory sub-scores — higher = weaker price competitiveness / higher entry cost. (Conservative MFN; FTA preferential rates not applied.)";
  const lines = sorted.map(
    (r) => `  ${r.country.padEnd(3)} ${r.ratePct.toFixed(1).padStart(5)}%  (${r.year})`,
  );
  return `${header}\n${note}\n${lines.join("\n")}`;
}

/** Top-level helper — fetch + render in one call. */
export async function buildTariffAnchor(
  candidateCountries: string[],
  category: string,
  locale: "ko" | "en" = "ko",
): Promise<{ block: string; rows: CountryTariff[] }> {
  const rows = await fetchTariffs(candidateCountries, category);
  return { block: renderTariffBlock(rows, category, locale), rows };
}

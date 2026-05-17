/**
 * 관세청 (Korea Customs Service) trade statistics — data.go.kr OpenAPI.
 *
 * Phase F.1-1 ship (2026-05-17). Replaces the empty UNI-PASS stub.
 * data.go.kr exposes the same underlying Korea-Customs trade data via
 * 5 different OpenAPI endpoints; this client uses the most relevant
 * one for Market Twin's needs:
 *
 *   관세청_품목별 국가별 수출입실적(GW)
 *   endpoint: /1220000/nitemtrade/getNitemtradeList
 *   filter:  HSCode (2-10 digit) × country × month range
 *   format:  XML
 *
 * Compared to UN Comtrade:
 *   - Same underlying trade data (Korea is the reporter both ways) but
 *     more granular HSCode filtering (Comtrade aggregates over chapter).
 *   - Monthly granularity (Comtrade is annual).
 *   - Native Korean-Customs source — no UN aggregation lag.
 *   - Free, no rate limit beyond 10K/day per API key.
 *
 * Why this matters even with Comtrade already shipped:
 *   - Comtrade's HSCode 33 (all cosmetics) is too coarse — can't tell
 *     skincare from color cosmetics. 관세청 supports 6-10 digit HSCode
 *     queries when the calling code knows the product's specific code.
 *   - Recent months (last 2 quarters) update faster on 관세청 — useful
 *     when sim is being run against current-year market estimates.
 *
 * Limitations:
 *   - Still HSCode-aggregate. Doesn't expose declarant (company) names.
 *     For company-level brand anchor we'll need DART (separate module)
 *     reading IR sales-segment data.
 *   - XML format requires parsing. Inlined here to avoid adding xml2js
 *     dep — the response shape is shallow and known.
 */

const ENDPOINT = "https://apis.data.go.kr/1220000/nitemtrade/getNitemtradeList";
const TIMEOUT_MS = 8000;

export interface KoreaCustomsRow {
  /** ISO alpha-2 of the partner. */
  partnerIso: string;
  /** Partner country name as returned by 관세청 (Korean). */
  partnerName: string;
  /** HSCode 2-10 digit as requested. */
  hsCode: string;
  /** Period as YYYYMM string. */
  yyyymm: string;
  /** Export value USD (한국→파트너). */
  exportUsd: number;
  /** Import value USD (파트너→한국). Less useful for K-export, included for completeness. */
  importUsd: number;
}

export interface KoreaCustomsFetchOpts {
  /** Korean-Customs-internal country code (ISO alpha-2 in most cases — confirmed in API docs). */
  partnerCountries: string[];
  /** HSCode prefixes (2-10 digit strings). */
  hsCodes: string[];
  /** YYYYMM month range. Default = last 12 months ending Y-1-12. */
  strtYymm?: string;
  endYymm?: string;
  apiKey?: string;
}

/** ISO alpha-2 → Korean-Customs country code. Most match. Some differ. */
const COUNTRY_CODE_MAP: Record<string, string> = {
  US: "US",
  JP: "JP",
  CN: "CN",
  GB: "GB",
  DE: "DE",
  FR: "FR",
  IT: "IT",
  ES: "ES",
  NL: "NL",
  CA: "CA",
  AU: "AU",
  NZ: "NZ",
  IN: "IN",
  ID: "ID",
  VN: "VN",
  TH: "TH",
  MY: "MY",
  SG: "SG",
  PH: "PH",
  TW: "TW",
  HK: "HK",
  MX: "MX",
  BR: "BR",
};

/**
 * Inlined XML parser for 관세청 response. Verified field names against
 * a live sample call on 2026-05-17:
 *   <item>
 *     <hsCd>3304</hsCd>           ← HSCode (may be "-" for subtotal row)
 *     <statCd>US</statCd>         ← partner ISO alpha-2
 *     <statCdCntnKor1>미국</...>  ← partner name (Korean)
 *     <expDlr>127371415</expDlr>  ← export USD (한국→파트너)
 *     <impDlr>14504411</impDlr>   ← import USD
 *     <expWgt>3794638</expWgt>    ← export weight kg
 *     <impWgt>311548</impWgt>     ← import weight kg
 *     <balPayments>...</balPayments>
 *     <statKor>...</statKor>      ← Korean description of HS code
 *     <year>2024.12</year>        ← period YYYY.MM, OR "이계" (subtotal)
 *   </item>
 *
 * The first <item> in a response is always a subtotal aggregate (year=이계,
 * hsCd="-"). Skip those rows — the caller wants per-month per-country
 * breakdown, not the pre-aggregated total.
 */
function parseCustomsXml(xml: string): KoreaCustomsRow[] {
  const codeMatch = xml.match(/<resultCode>([^<]+)<\/resultCode>/);
  const code = codeMatch?.[1];
  if (code && code !== "00") {
    const msgMatch = xml.match(/<resultMsg>([^<]+)<\/resultMsg>/);
    console.warn(`[korea-customs] API error code=${code} msg=${msgMatch?.[1] ?? "unknown"}`);
    return [];
  }
  const items: KoreaCustomsRow[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRegex.exec(xml)) !== null) {
    const block = m[1];
    const f = (tag: string) => {
      const r = new RegExp(`<${tag}>([^<]*)<\\/${tag}>`).exec(block);
      return r?.[1]?.trim() ?? "";
    };
    const hsCd = f("hsCd");
    const year = f("year");
    // Skip subtotal aggregates (first row per response).
    if (hsCd === "-" || year === "이계" || !hsCd) continue;
    const expValue = parseFloat(f("expDlr") || "0");
    const impValue = parseFloat(f("impDlr") || "0");
    items.push({
      partnerIso: f("statCd").toUpperCase(),
      partnerName: f("statCdCntnKor1") || f("statCd"),
      hsCode: hsCd,
      yyyymm: year, // "2024.01" format — caller normalizes
      exportUsd: Number.isFinite(expValue) ? expValue : 0,
      importUsd: Number.isFinite(impValue) ? impValue : 0,
    });
  }
  return items;
}

/** Fetch one (HSCode × period) combination, returning per-country rows. */
async function fetchOne(
  apiKey: string,
  hsCode: string,
  partnerCode: string,
  strtYymm: string,
  endYymm: string,
): Promise<KoreaCustomsRow[]> {
  const params = new URLSearchParams({
    serviceKey: apiKey,
    strtYymm,
    endYymm,
    hsSgn: hsCode,
    cntyCd: partnerCode,
    numOfRows: "12",
    pageNo: "1",
  });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${ENDPOINT}?${params}`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) {
      console.warn(`[korea-customs] HTTP ${res.status} for hs=${hsCode} country=${partnerCode}`);
      return [];
    }
    const xml = await res.text();
    return parseCustomsXml(xml);
  } catch (err) {
    clearTimeout(timer);
    console.warn(`[korea-customs] fetch error: ${(err as Error).message}`);
    return [];
  }
}

export async function fetchKoreaCustomsExports(
  opts: KoreaCustomsFetchOpts,
): Promise<KoreaCustomsRow[]> {
  const apiKey = opts.apiKey ?? process.env.DATAGOKR_API_KEY;
  if (!apiKey) return [];
  const now = new Date();
  // Default: last full year (12 months ending Y-1-12). Korean Customs
  // publishes with ~1 month lag, so Y-1-12 is the most recent stable month.
  const lastYear = now.getUTCFullYear() - 1;
  const strtYymm = opts.strtYymm ?? `${lastYear}01`;
  const endYymm = opts.endYymm ?? `${lastYear}12`;
  const partnerCodes = opts.partnerCountries
    .map((c) => COUNTRY_CODE_MAP[c.toUpperCase()] ?? c.toUpperCase())
    .filter((c): c is string => Boolean(c));
  if (partnerCodes.length === 0 || opts.hsCodes.length === 0) return [];

  // Parallel fetch — each (HS × country) pair is one API call. With default
  // 5 HSCodes × 10 countries = 50 calls, well under the 10,000/day cap.
  const tasks: Promise<KoreaCustomsRow[]>[] = [];
  for (const hs of opts.hsCodes) {
    for (const country of partnerCodes) {
      tasks.push(fetchOne(apiKey, hs, country, strtYymm, endYymm));
    }
  }
  const batches = await Promise.all(tasks);
  // Flatten + aggregate per (partner × HSCode) summing months.
  const aggregated = new Map<string, KoreaCustomsRow>();
  for (const rows of batches) {
    for (const row of rows) {
      const key = `${row.partnerIso}::${row.hsCode}`;
      const cur = aggregated.get(key);
      if (cur) {
        cur.exportUsd += row.exportUsd;
        cur.importUsd += row.importUsd;
      } else {
        aggregated.set(key, { ...row, yyyymm: `${strtYymm}-${endYymm}` });
      }
    }
  }
  return [...aggregated.values()].sort((a, b) => b.exportUsd - a.exportUsd);
}

/**
 * Render fetched rows as a prompt block. Aggregates per-country (summing
 * across HSCodes) so the LLM sees the brand-relevant total per market.
 */
export function renderKoreaCustomsBlock(
  rows: KoreaCustomsRow[],
  opts: { categoryLabel: string; locale?: "ko" | "en" },
): string {
  if (rows.length === 0) return "";
  const isKo = opts.locale !== "en";
  // Sum across HSCodes per country.
  const perCountry = new Map<string, { name: string; sum: number }>();
  for (const r of rows) {
    const cur = perCountry.get(r.partnerIso) ?? { name: r.partnerName, sum: 0 };
    cur.sum += r.exportUsd;
    perCountry.set(r.partnerIso, cur);
  }
  const sorted = [...perCountry.entries()]
    .map(([iso, agg]) => ({ iso, name: agg.name, sum: agg.sum }))
    .sort((a, b) => b.sum - a.sum);
  const header = isKo
    ? `═══ 관세청 무역통계 한국→파트너 수출 (${opts.categoryLabel}, ${rows[0]?.yyyymm ?? "최근 12개월"}) ═══`
    : `═══ Korea Customs trade statistics — Korea→partner exports (${opts.categoryLabel}) ═══`;
  const lines = sorted.map((r) => {
    const millions = (r.sum / 1e6).toFixed(1);
    return `  ${r.iso.padEnd(3)} ${r.name.padEnd(16)} $${millions}M`;
  });
  const note = isKo
    ? "주의: 한국 관세청 무역통계 = 한국 수출 declaration aggregate (HSCode 합산). UN Comtrade와 같은 underlying data지만 더 fine-grained HSCode filtering 가능. 회사 단위 X — brand-level은 별도 DART module 필요."
    : "Note: Korea Customs trade statistics = Korea export declarations (HSCode aggregate). Same underlying data as UN Comtrade but supports finer HSCode filtering. Not company-level — brand-specific anchor requires the separate DART module.";
  return `${header}\n${lines.join("\n")}\n\n${note}`;
}

/** Top-level convenience — fetch + render in one call. */
export async function buildKoreaCustomsAnchor(
  categoryLabel: string,
  candidateCountries: string[],
  hsCodes: string[],
  opts: { apiKey?: string; locale?: "ko" | "en"; strtYymm?: string; endYymm?: string } = {},
): Promise<{ block: string; rows: KoreaCustomsRow[] }> {
  const rows = await fetchKoreaCustomsExports({
    partnerCountries: candidateCountries,
    hsCodes,
    apiKey: opts.apiKey,
    strtYymm: opts.strtYymm,
    endYymm: opts.endYymm,
  });
  const block = renderKoreaCustomsBlock(rows, { categoryLabel, locale: opts.locale });
  return { block, rows };
}

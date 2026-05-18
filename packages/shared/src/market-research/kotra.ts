/**
 * KOTRA (대한무역투자진흥공사) public APIs via data.go.kr.
 *
 * Phase F.1-C ship (2026-05-17). Provides KOTRA-curated market-environment
 * data, most importantly the list of Korean companies already operating in
 * each target market. This is the closest public source we have to a
 * brand-level signal — for the US the response names 'LG 전자' as a long-
 * established manufacturer, giving the sim a direct anchor for LG OLED
 * inference. For Vietnam, Binggrae's local entity is listed, which is
 * exactly the Phase F.0 gap (Melona VN-first market mis-call).
 *
 * 3 endpoints exposed (all data.go.kr B410001 service group):
 *   1. natnInfo     - per-country deep info: Korean companies, market context
 *      base: /B410001/kotra_nationalInformation/natnInfo/natnInfo
 *      param: isoWd2CntCd (ISO alpha-2)
 *   2. natnList     - supported country ISO codes (86 countries, 2026-05)
 *      base: /B410001/natnList/natnList
 *   3. compSucsCase - Korean export success case study DB (text-heavy)
 *      base: /B410001/compSucsCase/compSucsCase
 *      param: search1 (country name, Korean), search2 (title), search3 (company)
 *      Not yet wired into prompts — reference-only for now.
 *
 * URL pattern note: data.go.kr's portal shows the End Point as
 *   https://apis.data.go.kr/B410001/natnList
 * but the working URL appends the operationId again:
 *   https://apis.data.go.kr/B410001/natnList/natnList
 * Confirmed via portal's own '미리보기' sandbox (2026-05-17).
 *
 * Limitations:
 *   - korCompList is a snapshot — may lag actual company status by months.
 *   - Some entries have noise (e.g. local-name/parent mismatch). Trust the
 *     parent name and industry; treat local-name as suggestive.
 *   - Free tier 10K/day per API key, shared with other data.go.kr services.
 */

const ENDPOINT_NATN_INFO =
  "https://apis.data.go.kr/B410001/kotra_nationalInformation/natnInfo/natnInfo";
const ENDPOINT_NATN_LIST =
  "https://apis.data.go.kr/B410001/natnList/natnList";
const ENDPOINT_COMP_SUCS =
  "https://apis.data.go.kr/B410001/compSucsCase/compSucsCase";
const TIMEOUT_MS = 12000;

export interface KotraKoreanCompany {
  /** Local entity name as registered in the target market. */
  localName: string;
  /** Parent Korean company. */
  parentName: string;
  /** Industry classification (Korean). */
  industry: string;
  /** Specific product/service line (처리분야). */
  category: string;
  /** Year of advance/entry (string — sometimes blank). */
  advanceYear: string;
  /** Form of presence (법인 / 생산법인 / 지점 / etc). */
  advanceForm: string;
}

export interface KotraNationalInfo {
  iso2: string;
  koreanCompanies: KotraKoreanCompany[];
}

interface NatnInfoRawComp {
  korCompNm?: string;
  pcompNm?: string;
  indlnCntnt?: string;
  tretRealmCntnt?: string;
  acplcAdvncYear?: string;
  acplcAdvncFormCntnt?: string;
}

function trimField(v: unknown): string {
  if (typeof v !== "string") return "";
  return v.replace(/\r?\n/g, " ").trim();
}

function asArray<T>(v: unknown): T[] {
  if (v === undefined || v === null) return [];
  return (Array.isArray(v) ? v : [v]) as T[];
}

async function fetchJson(url: string): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) {
      console.warn(`[kotra] HTTP ${res.status} ${res.statusText} on ${url.split("?")[0]}`);
      return null;
    }
    const text = await res.text();
    if (text.startsWith("Unexpected errors") || text.startsWith("API not found")) {
      console.warn(`[kotra] portal error: ${text.slice(0, 80)}`);
      return null;
    }
    try {
      return JSON.parse(text);
    } catch {
      console.warn(`[kotra] non-JSON response (first 80c): ${text.slice(0, 80)}`);
      return null;
    }
  } catch (err) {
    clearTimeout(timer);
    console.warn(`[kotra] fetch error: ${(err as Error).message}`);
    return null;
  }
}

/**
 * Fetch per-country KOTRA national-info bundle. Currently extracts only
 * korCompList (Korean companies present in the target market) — the most
 * sim-relevant slice. Other fields (gdp, payment, religion, regulations)
 * are in the raw response and can be added later if shown to lift scores.
 */
export async function fetchKotraNationalInfo(
  iso2: string,
  apiKey?: string,
): Promise<KotraNationalInfo | null> {
  const key = apiKey ?? process.env.DATAGOKR_API_KEY;
  if (!key) return null;
  const params = new URLSearchParams({
    serviceKey: key,
    type: "json",
    isoWd2CntCd: iso2.toUpperCase(),
  });
  const json = (await fetchJson(`${ENDPOINT_NATN_INFO}?${params}`)) as
    | { response?: { header?: { resultCode?: string }; body?: { itemList?: { item?: unknown } } } }
    | null;
  if (!json?.response) return null;
  const code = json.response.header?.resultCode;
  if (code && code !== "00") return null;
  const item = json.response.body?.itemList?.item as
    | { korCompList?: { korComp?: NatnInfoRawComp | NatnInfoRawComp[] } }
    | undefined;
  if (!item) return null;
  const rawComps = asArray<NatnInfoRawComp>(item.korCompList?.korComp);
  const koreanCompanies: KotraKoreanCompany[] = rawComps.map((c) => ({
    localName: trimField(c.korCompNm),
    parentName: trimField(c.pcompNm),
    industry: trimField(c.indlnCntnt),
    category: trimField(c.tretRealmCntnt),
    advanceYear: trimField(c.acplcAdvncYear),
    advanceForm: trimField(c.acplcAdvncFormCntnt),
  }));
  return { iso2: iso2.toUpperCase(), koreanCompanies };
}

export interface KotraCountryEntry {
  iso2: string;
  nameKo: string;
  nameEn: string;
}

/** Fetch the 86-country support list. Used as a guard before calling natnInfo. */
export async function fetchKotraCountryList(apiKey?: string): Promise<KotraCountryEntry[]> {
  const key = apiKey ?? process.env.DATAGOKR_API_KEY;
  if (!key) return [];
  const params = new URLSearchParams({ serviceKey: key, type: "json" });
  const json = (await fetchJson(`${ENDPOINT_NATN_LIST}?${params}`)) as
    | { response?: { body?: { itemList?: { item?: unknown } } } }
    | null;
  const items = asArray<{
    isoWd2NatCd?: string;
    nationNmKor?: string;
    nationNmEng?: string;
  }>(json?.response?.body?.itemList?.item);
  return items
    .map((r) => ({
      iso2: trimField(r.isoWd2NatCd).toUpperCase(),
      nameKo: trimField(r.nationNmKor),
      nameEn: trimField(r.nationNmEng),
    }))
    .filter((r) => r.iso2.length === 2);
}

/**
 * Render KOTRA Korean-companies block. Selects top-N by category-relevance
 * keyword match against the product category, falling back to most-recent-
 * entry rows. Keeps the block <1.5KB to fit alongside other anchors.
 */
export function renderKotraNationalBlock(
  bundles: KotraNationalInfo[],
  opts: { categoryKeywords?: string[]; maxPerCountry?: number; locale?: "ko" | "en" } = {},
): string {
  const filtered = bundles.filter((b) => b.koreanCompanies.length > 0);
  if (filtered.length === 0) return "";
  const isKo = opts.locale !== "en";
  // Per-country cap (v2, 2026-05-18). Original v1 used maxPerCountry=5 which
  // injected US-heavy weight because the US has 430 registered Korean companies
  // vs ~10-30 in non-US markets. v8a diagnostic showed jinro JP fixture
  // regressed -22pt under v1 KOTRA (sim's US-prior amplified). Cap at 3 to
  // keep per-country weight comparable across markets.
  const max = opts.maxPerCountry ?? 3;
  const kws = (opts.categoryKeywords ?? []).map((k) => k.toLowerCase());

  const sections: string[] = [];
  for (const bundle of filtered) {
    let comps = bundle.koreanCompanies.slice();
    const totalRaw = comps.length;
    if (kws.length > 0) {
      // Stricter: keep ONLY entries whose category/industry/parent matches a
      // keyword. hits=0 rows are noise that pushed sim toward irrelevant
      // mass-market priors (same failure mode as Phase F.1-A scale anchor).
      const scored = comps
        .map((c) => {
          const haystack = `${c.industry} ${c.category} ${c.parentName} ${c.localName}`.toLowerCase();
          const hits = kws.reduce((n, kw) => n + (haystack.includes(kw) ? 1 : 0), 0);
          return { c, hits };
        })
        .filter((r) => r.hits > 0)
        .sort((a, b) => {
          if (b.hits !== a.hits) return b.hits - a.hits;
          // tie-break by recency (later year first)
          const ya = parseInt(a.c.advanceYear || "0", 10) || 0;
          const yb = parseInt(b.c.advanceYear || "0", 10) || 0;
          return yb - ya;
        });
      comps = scored.map((r) => r.c);
    } else {
      comps.sort((a, b) => {
        const ya = parseInt(a.advanceYear || "0", 10) || 0;
        const yb = parseInt(b.advanceYear || "0", 10) || 0;
        return yb - ya;
      });
    }
    // Skip country block entirely when no relevant company is present —
    // empty signal is better than noise.
    if (comps.length === 0) continue;
    const lines = comps.slice(0, max).map((c) => {
      const yr = c.advanceYear ? c.advanceYear : "—";
      const form = c.advanceForm || "—";
      const parent = c.parentName || c.localName;
      const local = c.localName && c.localName !== c.parentName ? ` (현지: ${c.localName})` : "";
      const cat = c.category ? ` — ${c.category}` : c.industry ? ` — ${c.industry}` : "";
      return `    ${yr.padEnd(4)} ${form.padEnd(5)} ${parent}${local}${cat}`;
    });
    // v2 (2026-05-18): hide raw counts. v1 exposed "(+N more matching, total
    // M on KOTRA registry)" where M was ~430 for US vs ~10-30 for other markets;
    // sims read that as "US is the dominant market" and amplified US-prior on
    // non-US-top fixtures. Now we just list cap-3 entries per country with no
    // total counts. The presence signal itself is preserved.
    sections.push(
      `  ${bundle.iso2} — Korean companies in matching industry:\n${lines.join("\n")}`,
    );
  }
  if (sections.length === 0) return "";

  const header = isKo
    ? "═══ KOTRA 진출 한국기업 anchor (해당국 등록 한국법인) ═══"
    : "═══ KOTRA Korean companies present in target market ═══";
  const note = isKo
    ? "주의: KOTRA 등록 한국법인 리스트. 모기업이 해당국에 이미 진출했다면 brand recognition + 유통망 강함을 시사. 카테고리/산업 keyword match로 상위 정렬."
    : "Note: KOTRA-registered Korean entities. Parent presence implies established brand recognition + distribution. Sorted by category-keyword match, then recency.";
  return `${header}\n${sections.join("\n\n")}\n\n${note}`;
}

/**
 * Returns true when KOTRA anchor should be skipped for this category.
 *
 * v8b diagnostic (2026-05-18): non-US-top fixtures (jinro JP, buldak CN) had
 * KOTRA's US-heavy registry amplifying the sim's US-prior. K-Food and
 * K-Alcohol categories tend to have non-US-top truths (Asia-first export
 * patterns), so KOTRA is a net-noise source for them. K-Beauty/K-Tech are
 * mostly US-top and benefit from KOTRA (e.g. cosrx US-prior, LG OLED US/CA).
 *
 * Categories matched here are conservatively excluded; uncategorized or
 * uncertain categories default to KOTRA-on (the anchor's internal strict
 * filter further reduces noise when keyword-match is empty).
 *
 * Override with KOTRA_CATEGORY_OPT_IN_DISABLED=true (returns false always)
 * for diagnostic A/B work.
 */
export function shouldSkipKotraForCategory(category: string | null | undefined): boolean {
  if (process.env.KOTRA_CATEGORY_OPT_IN_DISABLED === "true") return false;
  if (!category) return false;
  const t = category.toLowerCase();
  // K-Food and K-Alcohol: known non-US-top patterns, KOTRA = net noise
  if (t === "food" || t.includes("k-food") || t.includes("식품") || t.includes("음식")) return true;
  if (t === "alcohol" || t.includes("k-alcohol") || t.includes("주류") || t.includes("liquor")) return true;
  return false;
}

/** Top-level convenience — fetch per-country bundles + render in one call. */
export async function buildKotraNationalAnchor(
  candidateCountries: string[],
  opts: { apiKey?: string; categoryKeywords?: string[]; locale?: "ko" | "en"; maxPerCountry?: number; category?: string | null } = {},
): Promise<{ block: string; bundles: KotraNationalInfo[]; skipped?: "category" }> {
  // v8b category opt-in: skip KOTRA entirely for K-Food / K-Alcohol fixtures.
  if (shouldSkipKotraForCategory(opts.category)) {
    return { block: "", bundles: [], skipped: "category" };
  }
  const apiKey = opts.apiKey ?? process.env.DATAGOKR_API_KEY;
  if (!apiKey) return { block: "", bundles: [] };
  const results = await Promise.all(
    candidateCountries.map((c) => fetchKotraNationalInfo(c, apiKey)),
  );
  const bundles = results.filter((b): b is KotraNationalInfo => b !== null);
  const block = renderKotraNationalBlock(bundles, {
    categoryKeywords: opts.categoryKeywords,
    maxPerCountry: opts.maxPerCountry,
    locale: opts.locale,
  });
  return { block, bundles };
}

/**
 * Korean export success-case lookup. Returns up to numOfRows cases matching
 * country-name search (Korean). Reference-only — bodies are HTML-heavy and
 * not currently piped into prompts; expose for ad-hoc /api inspection or
 * future evidence-citation features.
 */
export interface KotraSuccessCase {
  companyName: string;
  industry: string;
  /** Raw HTML body (heavy). Caller decides whether to strip/store. */
  bodyHtml: string;
}

export async function fetchKotraSuccessCases(
  countryKo: string,
  opts: { numOfRows?: number; pageNo?: number; apiKey?: string } = {},
): Promise<KotraSuccessCase[]> {
  const key = opts.apiKey ?? process.env.DATAGOKR_API_KEY;
  if (!key) return [];
  const params = new URLSearchParams({
    serviceKey: key,
    type: "json",
    numOfRows: String(opts.numOfRows ?? 5),
    pageNo: String(opts.pageNo ?? 1),
    search1: countryKo,
  });
  const json = (await fetchJson(`${ENDPOINT_COMP_SUCS}?${params}`)) as
    | { response?: { body?: { itemList?: { item?: unknown } } } }
    | null;
  const items = asArray<{ compNm?: string; indstCl?: string; bdtCntnt?: string }>(
    json?.response?.body?.itemList?.item,
  );
  return items.map((r) => ({
    companyName: trimField(r.compNm),
    industry: trimField(r.indstCl),
    bodyHtml: typeof r.bdtCntnt === "string" ? r.bdtCntnt : "",
  }));
}

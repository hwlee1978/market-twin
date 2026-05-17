/**
 * DART (전자공시) brand-level financial anchor.
 *
 * Phase F.1-A (2026-05-17). Fetches Korean listed companies' consolidated
 * annual financial statements via DART Open API. Provides the FIRST
 * company-level signal that complements UN Comtrade / Korea Customs
 * HSCode aggregates.
 *
 * Why this matters (from v5 measurement):
 *   - Comtrade + 관세청 HSCode aggregate showed brand-level mismatch:
 *     · Binggrae Vietnam 자회사 (현지 생산) → trade aggregate에 안 잡힘
 *     · KGC China 면세점 (서비스 매출) → trade aggregate에 안 잡힘
 *   - DART 사업보고서는 회사 단위 매출/영업이익이 정형 데이터로 노출 →
 *     anchor block에 "[CJ제일제당 2024] 매출 X조원, 영업이익 Y조원"
 *     주입하면 sim이 회사 규모를 절대 척도로 인식 가능.
 *
 * Limitation (Phase F.1-A scope):
 *   - DART API는 권역별 매출 정형 X (해외/국내 분리 외 권역별 분해는
 *     "사업의 내용" 본문 narrative만). Phase F.1-A는 회사 전체 규모
 *     anchor만 ship. 권역별 매출은 Phase F.1-B에서 manual reference
 *     table로 별도 정리 예정.
 *
 * Best-effort: API key 없거나 fetch 실패 시 빈 블록, sim 그대로 진행.
 */

const ENDPOINT = "https://opendart.fss.or.kr/api/fnlttSinglAcntAll.json";
const TIMEOUT_MS = 8000;

/**
 * Fixture slug → DART corp_code. Hardcoded from CORPCODE.xml 2026-05-17
 * extraction (see v5_korea_customs_results.md for the full mapping).
 *
 * Two fixtures are unlisted and DART doesn't cover them:
 *   - boj-relief-sun (Beauty of Joseon — non-listed indie brand)
 *   - anua-heartleaf-toner (Anua — non-listed indie brand)
 * These fall back to no anchor (renderer returns empty for them).
 *
 * Sub-brand mappings (e.g., COSRX is wholly owned by LG생활건강 since 2021)
 * resolve to the parent company. Sim sees LG생활건강 group consolidated
 * revenue, which includes COSRX line — good enough for category-scale prior.
 */
const SLUG_TO_CORP_CODE: Record<string, { corpCode: string; corpNameKo: string; corpNameEn: string }> = {
  "bibigo-mandu":              { corpCode: "00635134", corpNameKo: "CJ제일제당",   corpNameEn: "CJ CheilJedang" },
  "shin-ramyun":               { corpCode: "00108241", corpNameKo: "농심",         corpNameEn: "Nongshim" },
  "buldak":                    { corpCode: "00126955", corpNameKo: "삼양식품",     corpNameEn: "Samyang Foods" },
  "cosrx-snail-mucin":         { corpCode: "00356370", corpNameKo: "LG생활건강",   corpNameEn: "LG H&H (COSRX parent)" },
  "jinro-chamisul":            { corpCode: "00150244", corpNameKo: "하이트진로",   corpNameEn: "HiteJinro" },
  "kgc-everytime-redginseng":  { corpCode: "00244455", corpNameKo: "KT&G",         corpNameEn: "KT&G (KGC parent)" },
  "binggrae-melona":           { corpCode: "00124726", corpNameKo: "빙그레",       corpNameEn: "Binggrae" },
  "lg-oled-tv-c-series":       { corpCode: "00401731", corpNameKo: "LG전자",       corpNameEn: "LG Electronics" },
};

export function corpCodeForSlug(slug: string): { corpCode: string; corpNameKo: string; corpNameEn: string } | null {
  return SLUG_TO_CORP_CODE[slug] ?? null;
}

/**
 * Heuristic: product_name → fixture slug. Used by sim drivers that only
 * have the project's display name (not the ground-truth slug). Matches
 * are intentionally fuzzy — case-insensitive substring on Korean or
 * English keywords. Returns null when nothing matches (DART block
 * silently omitted).
 */
export function inferSlugFromProductName(name: string): string | null {
  if (!name) return null;
  const s = name.toLowerCase();
  if (s.includes("bibigo") || s.includes("비비고") || s.includes("왕교자")) return "bibigo-mandu";
  if (s.includes("shin ramyun") || s.includes("shin-ramyun") || s.includes("신라면")) return "shin-ramyun";
  if (s.includes("buldak") || s.includes("불닭")) return "buldak";
  if (s.includes("cosrx")) return "cosrx-snail-mucin";
  if (s.includes("jinro") || s.includes("진로") || s.includes("참이슬")) return "jinro-chamisul";
  if (s.includes("kgc") || s.includes("정관장") || s.includes("홍삼정")) return "kgc-everytime-redginseng";
  if (s.includes("binggrae") || s.includes("빙그레") || s.includes("melona") || s.includes("메로나")) return "binggrae-melona";
  if (s.includes("lg oled") || s.includes("oled tv")) return "lg-oled-tv-c-series";
  if (s.includes("beauty of joseon") || s.includes("relief sun")) return "boj-relief-sun";
  if (s.includes("anua") || s.includes("heartleaf")) return "anua-heartleaf-toner";
  return null;
}

/** DART report codes — 11011=annual, 11012=Q1, 11013=H1, 11014=Q3. */
const REPORT_ANNUAL = "11011";

/**
 * Account codes we care about. DART returns localized account names in
 * `account_nm`, which differs across companies, so we filter by a curated
 * list of canonical labels. The mapping is intentionally generous —
 * different companies report the same concept under different account_nm
 * (e.g., "매출액" vs "영업수익" vs "영업이익").
 */
const REVENUE_LABELS = new Set(["매출액", "영업수익", "수익", "수익(매출액)", "매출"]);
const OP_INCOME_LABELS = new Set(["영업이익", "영업이익(손실)", "영업손익"]);

interface DartFinancialRow {
  account_nm: string;
  thstrm_amount: string;     // current period
  frmtrm_amount?: string;    // previous period
  sj_div: string;             // BS / IS / CIS / CF
  fs_div?: string;            // CFS / OFS
}

export interface DartCompanyFinancials {
  slug: string;
  corpCode: string;
  corpNameKo: string;
  corpNameEn: string;
  bsnsYear: number;
  /** Consolidated revenue in KRW. null when fetch failed or account_nm not matched. */
  revenueKrw: number | null;
  /** Consolidated operating income in KRW. null when fetch failed. */
  operatingIncomeKrw: number | null;
}

async function fetchFinancials(
  apiKey: string,
  slug: string,
  meta: { corpCode: string; corpNameKo: string; corpNameEn: string },
  bsnsYear: number,
): Promise<DartCompanyFinancials> {
  const params = new URLSearchParams({
    crtfc_key: apiKey,
    corp_code: meta.corpCode,
    bsns_year: String(bsnsYear),
    reprt_code: REPORT_ANNUAL,
    fs_div: "CFS", // consolidated
  });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let revenueKrw: number | null = null;
  let operatingIncomeKrw: number | null = null;
  try {
    const res = await fetch(`${ENDPOINT}?${params}`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) {
      console.warn(`[dart] HTTP ${res.status} for corp=${meta.corpCode} (${slug})`);
      return { slug, ...meta, bsnsYear, revenueKrw: null, operatingIncomeKrw: null };
    }
    const json = (await res.json()) as { status?: string; message?: string; list?: DartFinancialRow[] };
    if (json.status && json.status !== "000") {
      console.warn(`[dart] API status=${json.status} msg=${json.message} for corp=${meta.corpCode}`);
      return { slug, ...meta, bsnsYear, revenueKrw: null, operatingIncomeKrw: null };
    }
    for (const row of json.list ?? []) {
      if (row.sj_div !== "IS" && row.sj_div !== "CIS") continue; // 손익계산서만
      const accountTrimmed = row.account_nm.trim();
      const amount = parseAmount(row.thstrm_amount);
      if (amount == null) continue;
      if (revenueKrw == null && REVENUE_LABELS.has(accountTrimmed)) revenueKrw = amount;
      if (operatingIncomeKrw == null && OP_INCOME_LABELS.has(accountTrimmed)) operatingIncomeKrw = amount;
      if (revenueKrw != null && operatingIncomeKrw != null) break;
    }
    return { slug, ...meta, bsnsYear, revenueKrw, operatingIncomeKrw };
  } catch (err) {
    clearTimeout(timer);
    console.warn(`[dart] fetch error for ${slug}: ${(err as Error).message}`);
    return { slug, ...meta, bsnsYear, revenueKrw: null, operatingIncomeKrw: null };
  }
}

/** DART amounts come as Korean-formatted strings ("1,234,567,890"). Strip commas. */
function parseAmount(s: string | undefined): number | null {
  if (!s) return null;
  const cleaned = s.replace(/,/g, "").trim();
  if (!cleaned || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Fetch annual financials for a single product fixture. Returns null when
 * the slug is unlisted (BOJ, Anua) — caller renders no block.
 *
 * Defaults to Y-2 since DART annual reports for Y-1 may not be filed until
 * March of Y (some companies delay). Y-2 is always available.
 */
export async function fetchDartFinancialsForSlug(
  slug: string,
  opts: { apiKey?: string; bsnsYear?: number } = {},
): Promise<DartCompanyFinancials | null> {
  const meta = corpCodeForSlug(slug);
  if (!meta) return null;
  const apiKey = opts.apiKey ?? process.env.DART_API_KEY;
  if (!apiKey) return null;
  const bsnsYear = opts.bsnsYear ?? new Date().getUTCFullYear() - 2;
  return fetchFinancials(apiKey, slug, meta, bsnsYear);
}

/**
 * Render a single company's DART financials as a prompt block. Designed
 * to slot into the country-scoring prompt as a brand-level supplement
 * next to the trade-flow anchors. KRW is converted to USD at a single
 * informational rate (~1300 KRW/USD assumed for 2024 — sim doesn't need
 * sub-percentage precision for a regime-strength prior).
 */
export function renderDartBlock(
  fin: DartCompanyFinancials | null,
  opts: { locale?: "ko" | "en" } = {},
): string {
  if (!fin || (fin.revenueKrw == null && fin.operatingIncomeKrw == null)) return "";
  const isKo = opts.locale !== "en";
  const krwToUsd = 1 / 1300;
  const revUsdB = fin.revenueKrw != null ? ((fin.revenueKrw * krwToUsd) / 1e9).toFixed(2) : "n/a";
  const opUsdB = fin.operatingIncomeKrw != null ? ((fin.operatingIncomeKrw * krwToUsd) / 1e9).toFixed(2) : "n/a";
  const revKrwT = fin.revenueKrw != null ? (fin.revenueKrw / 1e12).toFixed(2) : "n/a";
  const opKrwB = fin.operatingIncomeKrw != null ? (fin.operatingIncomeKrw / 1e9).toFixed(0) : "n/a";
  const header = isKo
    ? `═══ DART 사업보고서 ${fin.bsnsYear}년 (${fin.corpNameKo}) — 회사 규모 prior ═══`
    : `═══ DART ${fin.bsnsYear} annual filing (${fin.corpNameEn}) — company-scale prior ═══`;
  const lines = isKo
    ? [
        `  회사: ${fin.corpNameKo} (DART corp_code ${fin.corpCode})`,
        `  연결 매출액: ${revKrwT}조원 (≈ $${revUsdB}B USD)`,
        `  연결 영업이익: ${opKrwB}억원 (≈ $${opUsdB}B USD)`,
      ]
    : [
        `  Company: ${fin.corpNameEn} (DART corp_code ${fin.corpCode})`,
        `  Consolidated revenue: ${revKrwT}T KRW (≈ $${revUsdB}B USD)`,
        `  Operating income: ${opKrwB} bil KRW (≈ $${opUsdB}B USD)`,
      ];
  const note = isKo
    ? "주의: DART 회사 규모는 연결재무 = 모회사 + 자회사 그룹 전체. 해외 진출 검토 시 회사가 글로벌 사업 부담 능력을 가지고 있는지 (재무 체력) 절대 지표로 활용하세요. 권역별 매출 분포는 본 단계에서 미포함 (Phase F.1-B reference table 별도)."
    : "Note: DART consolidated revenue = parent + subsidiaries. Use as absolute prior for whether the company has the financial muscle to sustain overseas expansion. Per-region revenue breakdown not included in this block (deferred to Phase F.1-B reference table).";
  return `${header}\n${lines.join("\n")}\n\n${note}`;
}

/** Top-level convenience — fetch + render in one call. */
export async function buildDartAnchor(
  slug: string,
  opts: { apiKey?: string; bsnsYear?: number; locale?: "ko" | "en" } = {},
): Promise<{ block: string; financials: DartCompanyFinancials | null }> {
  const financials = await fetchDartFinancialsForSlug(slug, opts);
  const block = renderDartBlock(financials, { locale: opts.locale });
  return { block, financials };
}

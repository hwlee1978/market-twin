/**
 * UK Companies House — origin=GB national-data provider (registry level).
 *
 * The UK analog of Korea's KOTRA registry / DART existence check: confirms the
 * brand's UK company exists and is active, with incorporation year. It is NOT
 * full financials (UK statutory accounts are filed as iXBRL, not exposed as
 * clean line items), so this grounds the brand's real-world footprint /
 * longevity for GB-origin brands rather than revenue.
 *
 * Free API but requires a key — register at
 * developer.company-information.service.gov.uk (instant). Basic auth uses the
 * key as the username with an empty password. Gated on COMPANIES_HOUSE_API_KEY;
 * returns { block: "" } when unset or on any miss — best-effort, never throws.
 */

const CH_SEARCH =
  "https://api.company-information.service.gov.uk/search/companies";
const CH_TIMEOUT_MS = 8000;

export async function buildCompaniesHouseAnchor(
  productName: string,
  opts: { locale?: "ko" | "en" } = {},
): Promise<{ block: string }> {
  const key = process.env.COMPANIES_HOUSE_API_KEY;
  if (!key || !productName.trim()) return { block: "" };
  const isKo = opts.locale === "ko";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CH_TIMEOUT_MS);
  try {
    // Key as username, empty password.
    const auth = Buffer.from(`${key}:`).toString("base64");
    const url = `${CH_SEARCH}?q=${encodeURIComponent(productName)}&items_per_page=3`;
    const res = await fetch(url, {
      headers: { Authorization: `Basic ${auth}` },
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return { block: "" };
    const json = (await res.json()) as {
      items?: Array<{
        title?: string;
        company_number?: string;
        company_status?: string;
        date_of_creation?: string;
      }>;
    };
    const items = (json.items ?? []).slice(0, 3);
    if (items.length === 0) return { block: "" };
    const header = isKo
      ? "═══ 영국 Companies House (본사 GB — 법인 등기 확인) ═══"
      : "═══ UK Companies House (origin=GB — company registry) ═══";
    const lines = items.map((it) => {
      const status = it.company_status ?? "?";
      const inc = it.date_of_creation ?? "?";
      return `  ${it.title ?? "?"} (${it.company_number ?? "?"}) — status ${status}, incorporated ${inc}`;
    });
    const note = isKo
      ? "브랜드명 검색 상위 UK 법인. active 상태·설립연도로 브랜드 실체·업력 grounding (DART/KOTRA 등가; 재무 수치는 아님)."
      : "Top UK companies matching the brand name. Active status + incorporation year ground the brand's real-world footprint and longevity (DART/KOTRA analog; not revenue).";
    return { block: `${header}\n${lines.join("\n")}\n${note}` };
  } catch {
    clearTimeout(timer);
    return { block: "" };
  }
}

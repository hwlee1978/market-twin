/**
 * openFDA (US food / drug regulatory context) anchor — the US counterpart to
 * the Korean MFDS anchor. Phase 2 (2026-07-01).
 *
 * MFDS grounds a product's regulatory profile against Korea's ingredient
 * rules. The clean US analog available via a free API is openFDA's
 * enforcement (recall) dataset: how much FDA regulatory activity a category
 * sees is a real market-entry risk prior. We surface a conservative count +
 * a couple of recent examples for the endpoint that matches the category.
 *
 * Coverage: FDA regulates FOOD / SUPPLEMENTS and DRUGS with rich openFDA
 * enforcement data. Cosmetics are only lightly regulated by the FDA and have
 * no comparable openFDA endpoint — those categories return an empty block
 * (honest: no anchor rather than a misleading one).
 *
 * Best-effort: any fetch/parse failure returns an empty block.
 */

const OPENFDA_BASE = "https://api.fda.gov";
const TIMEOUT_MS = 8000;

type FdaEndpoint = "food/enforcement" | "drug/enforcement";

/** Map a free-text category to the openFDA enforcement endpoint, or null. */
function endpointForCategory(category: string): FdaEndpoint | null {
  const c = category.toLowerCase();
  if (/(drug|pharma|medicine|medication|otc|prescription)/.test(c)) {
    return "drug/enforcement";
  }
  if (
    /(food|beverage|drink|snack|grocery|nutrition|supplement|wellness|health|dietary|vitamin|f&b)/.test(
      c,
    )
  ) {
    return "food/enforcement";
  }
  // Beauty / cosmetics / electronics / apparel: no meaningful openFDA endpoint.
  return null;
}

interface EnforcementRow {
  classification?: string;
  reason_for_recall?: string;
  recalling_firm?: string;
  report_date?: string;
  product_description?: string;
}

export interface OpenFdaResult {
  endpoint: FdaEndpoint;
  total: number;
  fromYear: number;
  toYear: number;
  examples: Array<{ classification: string; reason: string }>;
}

export async function fetchOpenFdaEnforcement(
  category: string,
  opts: { asOfYear?: number } = {},
): Promise<OpenFdaResult | null> {
  const endpoint = endpointForCategory(category);
  if (!endpoint) return null;
  const toYear = opts.asOfYear ?? new Date().getUTCFullYear();
  const fromYear = toYear - 3;
  const kw = category.toLowerCase().replace(/[^a-z0-9 ]/g, " ").trim().split(/\s+/)[0];
  if (!kw) return null;

  const url = new URL(`${OPENFDA_BASE}/${endpoint}.json`);
  // product_description keyword AND a 3-year report_date window.
  url.searchParams.set(
    "search",
    `product_description:"${kw}" AND report_date:[${fromYear}0101 TO ${toYear}1231]`,
  );
  url.searchParams.set("limit", "3");

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), { signal: ctrl.signal });
    clearTimeout(timer);
    // openFDA returns 404 with { error: { code: "NOT_FOUND" } } when zero
    // matches — that's a valid "no recalls" answer, not a failure.
    if (res.status === 404) {
      return { endpoint, total: 0, fromYear, toYear, examples: [] };
    }
    if (!res.ok) return null;
    const json = (await res.json()) as {
      meta?: { results?: { total?: number } };
      results?: EnforcementRow[];
    };
    const total = json.meta?.results?.total ?? 0;
    const examples = (json.results ?? []).slice(0, 2).map((r) => ({
      classification: r.classification ?? "n/a",
      reason: (r.reason_for_recall ?? "").slice(0, 120),
    }));
    return { endpoint, total, fromYear, toYear, examples };
  } catch {
    clearTimeout(timer);
    return null;
  }
}

export function renderOpenFdaBlock(
  result: OpenFdaResult | null,
  category: string,
  locale?: "ko" | "en",
): string {
  if (!result) return "";
  const isKo = locale !== "en";
  const label = result.endpoint === "drug/enforcement" ? "의약품/Drug" : "식품/Food";
  const header = isKo
    ? `═══ openFDA ${result.fromYear}–${result.toYear} 미국 FDA 리콜/집행 (${category}, ${label}) — 규제 리스크 prior ═══`
    : `═══ openFDA ${result.fromYear}–${result.toYear} US FDA recalls/enforcement (${category}, ${label}) — regulatory-risk prior ═══`;
  const countLine = isKo
    ? `  최근 3년 리콜/집행 건수: ${result.total}건`
    : `  Recalls/enforcement actions (last 3 yrs): ${result.total}`;
  const exLines = result.examples.map(
    (e) => `  · [${e.classification}] ${e.reason}${e.reason.length >= 120 ? "…" : ""}`,
  );
  const note = isKo
    ? "주의: 카테고리 단위 FDA 집행 활동량으로, 본 제품 개별 이슈가 아닙니다. 미국 시장 규제 엄격도/컴플라이언스 부담의 prior로만 활용하세요."
    : "Note: Category-level FDA enforcement volume, not a product-specific issue. Use only as a prior on US regulatory scrutiny / compliance burden.";
  return [header, countLine, ...exLines, "", note].join("\n");
}

export async function buildOpenFdaAnchor(
  category: string,
  opts: { locale?: "ko" | "en"; asOfYear?: number } = {},
): Promise<{ block: string; result: OpenFdaResult | null }> {
  const result = await fetchOpenFdaEnforcement(category, { asOfYear: opts.asOfYear });
  return { block: renderOpenFdaBlock(result, category, opts.locale), result };
}

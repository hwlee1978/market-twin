/**
 * openFDA (US food / drug / cosmetics regulatory context) anchor — the US
 * counterpart to the Korean MFDS anchor. Phase 2 (2026-07-01).
 *
 * MFDS grounds a product's regulatory profile against Korea's ingredient
 * rules. The US analogs available via free openFDA APIs:
 *   - FOOD / SUPPLEMENTS, DRUGS → enforcement (recall) volume, a real
 *     market-entry regulatory-risk prior.
 *   - COSMETICS → no recall endpoint, but the CAERS adverse-event dataset
 *     (/food/event.json, industry_name="Cosmetics") is queryable. US cosmetics
 *     are regulated by FDA/CFSAN, expanded under MoCRA (2022): facility
 *     registration, product listing, adverse-event reporting, GMP, recalls.
 *     We surface the recent adverse-event report VOLUME only — CAERS is
 *     voluntary / complaint-driven and litigation-skewed (e.g. talc → ovarian
 *     cancer dominates the all-time counts), so we show a count as a coarse
 *     scrutiny prior and deliberately do NOT list raw reactions.
 *
 * Best-effort: any fetch/parse failure returns an empty block.
 */

const OPENFDA_BASE = "https://api.fda.gov";
const TIMEOUT_MS = 8000;

type FdaMode =
  | { kind: "enforcement"; endpoint: "food/enforcement" | "drug/enforcement"; label: string }
  | { kind: "cosmetics"; label: string };

/** Map a free-text category to the openFDA data path, or null. */
function modeForCategory(category: string): FdaMode | null {
  const c = category.toLowerCase();
  if (/(drug|pharma|medicine|medication|\botc\b|prescription)/.test(c)) {
    return { kind: "enforcement", endpoint: "drug/enforcement", label: "의약품/Drug" };
  }
  if (
    /(beaut|cosmetic|skin\s?care|skincare|make[\s-]?up|fragrance|perfume|sunscreen|mascara|lipstick|toner|essence|serum)/.test(
      c,
    )
  ) {
    return { kind: "cosmetics", label: "화장품/Cosmetics" };
  }
  if (
    /(food|beverage|drink|snack|grocery|nutrition|supplement|wellness|health|dietary|vitamin|f&b)/.test(
      c,
    )
  ) {
    return { kind: "enforcement", endpoint: "food/enforcement", label: "식품/Food" };
  }
  return null;
}

interface EnforcementRow {
  classification?: string;
  reason_for_recall?: string;
}

export interface OpenFdaResult {
  kind: "enforcement" | "cosmetics";
  label: string;
  dataset: string;
  total: number;
  fromYear: number;
  toYear: number;
  /** Recall examples — enforcement only; empty for cosmetics (skew). */
  examples: Array<{ classification: string; reason: string }>;
}

async function fetchJson(url: string): Promise<any | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    // openFDA returns 404 { error: NOT_FOUND } for zero matches — a valid
    // "none" answer, signalled to the caller as an empty object.
    if (res.status === 404) return { __zero: true };
    if (!res.ok) return null;
    return await res.json();
  } catch {
    clearTimeout(timer);
    return null;
  }
}

export async function fetchOpenFda(
  category: string,
  opts: { asOfYear?: number } = {},
): Promise<OpenFdaResult | null> {
  const mode = modeForCategory(category);
  if (!mode) return null;
  const toYear = opts.asOfYear ?? new Date().getUTCFullYear();
  const fromYear = toYear - 3;

  if (mode.kind === "cosmetics") {
    // CAERS adverse events for the Cosmetics industry, recent 3-yr window.
    const url = new URL(`${OPENFDA_BASE}/food/event.json`);
    url.searchParams.set(
      "search",
      `products.industry_name:"Cosmetics" AND date_created:[${fromYear}0101 TO ${toYear}1231]`,
    );
    url.searchParams.set("limit", "1");
    const json = await fetchJson(url.toString());
    if (!json) return null;
    const total = json.__zero ? 0 : json.meta?.results?.total ?? 0;
    return {
      kind: "cosmetics",
      label: mode.label,
      dataset: "CAERS adverse events",
      total,
      fromYear,
      toYear,
      examples: [],
    };
  }

  // Food / drug enforcement (recalls), keyword-narrowed + 3-yr window.
  const kw = category.toLowerCase().replace(/[^a-z0-9 ]/g, " ").trim().split(/\s+/)[0];
  if (!kw) return null;
  const url = new URL(`${OPENFDA_BASE}/${mode.endpoint}.json`);
  url.searchParams.set(
    "search",
    `product_description:"${kw}" AND report_date:[${fromYear}0101 TO ${toYear}1231]`,
  );
  url.searchParams.set("limit", "3");
  const json = await fetchJson(url.toString());
  if (!json) return null;
  const total = json.__zero ? 0 : json.meta?.results?.total ?? 0;
  const examples = json.__zero
    ? []
    : ((json.results ?? []) as EnforcementRow[]).slice(0, 2).map((r) => ({
        classification: r.classification ?? "n/a",
        reason: (r.reason_for_recall ?? "").slice(0, 120),
      }));
  return {
    kind: "enforcement",
    label: mode.label,
    dataset: mode.endpoint,
    total,
    fromYear,
    toYear,
    examples,
  };
}

export function renderOpenFdaBlock(
  result: OpenFdaResult | null,
  category: string,
  locale?: "ko" | "en",
): string {
  if (!result) return "";
  const isKo = locale !== "en";

  if (result.kind === "cosmetics") {
    const header = isKo
      ? `═══ openFDA CAERS ${result.fromYear}–${result.toYear} 미국 FDA 화장품 이상반응 보고 (${category}) — 규제 관심도 prior ═══`
      : `═══ openFDA CAERS ${result.fromYear}–${result.toYear} US FDA cosmetics adverse-event reports (${category}) — regulatory-scrutiny prior ═══`;
    const countLine = isKo
      ? `  최근 3년 화장품 이상반응 보고 건수: ${result.total}건 (FDA/CFSAN, MoCRA 관할)`
      : `  Cosmetic adverse-event reports (last 3 yrs): ${result.total} (FDA/CFSAN, under MoCRA)`;
    const note = isKo
      ? "주의: CAERS는 자발적·소비자 신고 기반이라 특정 소송(예: 탈크→난소암)에 편향될 수 있습니다. 개별 반응이 아닌 미국 화장품 규제 관심도/컴플라이언스 부담의 거친 prior로만 활용하세요."
      : "Note: CAERS is voluntary / complaint-driven and can be skewed by litigation (e.g. talc → ovarian cancer). Use only as a coarse prior on US cosmetics regulatory scrutiny / compliance burden, not a product-specific signal.";
    return `${header}\n${countLine}\n\n${note}`;
  }

  const header = isKo
    ? `═══ openFDA ${result.fromYear}–${result.toYear} 미국 FDA 리콜/집행 (${category}, ${result.label}) — 규제 리스크 prior ═══`
    : `═══ openFDA ${result.fromYear}–${result.toYear} US FDA recalls/enforcement (${category}, ${result.label}) — regulatory-risk prior ═══`;
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
  const result = await fetchOpenFda(category, { asOfYear: opts.asOfYear });
  return { block: renderOpenFdaBlock(result, category, opts.locale), result };
}

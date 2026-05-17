/**
 * UN Comtrade trade-flow grounding.
 *
 * Phase E Week 4-5 (2026-05-16). Targets defects #1 (EU/CN under-rating),
 * #7 (CN mass-average), #9 (LLM CN bias) — all of which trace to the
 * same root: Tavily/Sonar can't see Korean IR or trade-data signals, so
 * the LLM defaults to widely-published English-web priors that
 * systematically misrepresent K-export reality.
 *
 * Comtrade fills the gap. The UN's free public API (comtradeapi.un.org)
 * publishes monthly merchandise trade flows by reporter × partner ×
 * HSCode. We pull Korea-as-reporter exports for the project's category
 * HSCode group, formatted into a deterministic "Korea exported $X to Y
 * in 2024" block that's injected into the country-scoring prompt before
 * the LLM emits any scores.
 *
 * Design notes:
 *   - Best-effort: API failure is non-fatal. The sim runs the same way
 *     as before, just without the anchor block.
 *   - HSCode mapping is category-grained. The product's actual HSCode
 *     could be more precise (e.g., snail mucin essence vs all cosmetics)
 *     but Comtrade's HSCode 2-4 digit aggregates trade off precision
 *     against coverage — at 6-8 digits a lot of niche products report
 *     zero flow even when they actually sell, because the trade is
 *     classified under a parent code.
 *   - We DON'T pass Comtrade numbers as ground truth — the prompt frames
 *     them as "official trade-flow evidence" so the LLM can still
 *     reason about whether the trade represents real K-product entry
 *     vs (for example) industrial intermediate exports.
 */

// No fetchWithTimeout helper exists in this repo — inline AbortController
// timeout, matching the pattern in tavily.ts / sonar.ts.
const COMTRADE_TIMEOUT_MS = 8000;

/* ────────────────────────────────── HSCode mapping ─── */

// Maps our 8 product categories to HSCode 2-digit chapters (and selected
// 4-digit subheadings where the chapter is too broad). Each entry lists
// codes Comtrade will aggregate over. Bias toward inclusive grouping —
// missing trade is worse than including some adjacent code.
const CATEGORY_HSCODE: Record<string, string[]> = {
  // Food preparations + edible products. Includes ramen (1902), kimchi
  // (2005), dumplings/mandu (1902), snacks (2106).
  food: ["19", "20", "21"],
  // Beauty / cosmetic preparations. 3304 is the cosmetics chapter.
  beauty: ["33"],
  // Health: vegetable saps (1302 — covers ginseng extract), other
  // food prep (2106 — supplements often classify here).
  health: ["13", "21"],
  // Beverages, spirits, vinegar. 22 covers soju, makgeolli, juice.
  alcohol: ["22"],
  beverage: ["22"],
  // Fashion: apparel chapters (61 knit, 62 not knit), footwear (64).
  fashion: ["61", "62", "64"],
  // Consumer electronics / appliances. 85 = electrical machinery
  // (includes TV, audio, kitchen appliances).
  appliances: ["85"],
  electronics: ["85"],
  // Home goods, IP merchandise — fall back to broad 95 (toys/games)
  // and 39 (plastics-household).
  home: ["39", "94"],
  ip: ["95", "49"],
  saas: [], // services trade not in HSCode regime
  other: [],
};

export function hsCodesForCategory(category: string): string[] {
  const key = category.toLowerCase();
  return CATEGORY_HSCODE[key] ?? CATEGORY_HSCODE.other;
}

/* ────────────────────────────────── API client ─── */

const COMTRADE_BASE = "https://comtradeapi.un.org/data/v1/get";
const KOREA_REPORTER_CODE = 410; // ISO numeric for Republic of Korea

export interface ComtradeFlow {
  partnerIso: string;
  partnerName: string;
  /** Total USD value of Korea→partner exports for the requested HSCode group. */
  tradeValueUsd: number;
  period: number;
}

export interface ComtradeFetchOpts {
  /** ISO alpha-2 codes (US, JP, ...). Filtered to non-Korea. */
  partnerCountries: string[];
  /** HSCode 2-4 digit strings to aggregate. */
  hsCodes: string[];
  /** Period as YYYY (annual). */
  period?: number;
  /** Optional API key for higher rate limits (free tier works without). */
  apiKey?: string;
}

/** Map ISO alpha-2 → Comtrade numeric reporter codes (subset used by sim). */
const ISO2_TO_NUMERIC: Record<string, number> = {
  US: 842,
  JP: 392,
  CN: 156,
  GB: 826,
  DE: 276,
  FR: 251,
  IT: 380,
  ES: 724,
  CA: 124,
  AU: 36,
  NZ: 554,
  IN: 699,
  ID: 360,
  VN: 704,
  TH: 764,
  MY: 458,
  SG: 702,
  PH: 608,
  TW: 490,
  HK: 344,
  MX: 484,
  BR: 76,
  AE: 784,
  SA: 682,
};

/**
 * Fetch Korea-as-reporter export flows to the requested partner countries
 * aggregated over the requested HSCode group, for `period`.
 *
 * Returns one row per partner with the summed trade value. Partners with
 * zero or missing data are omitted (caller renders "no data" rather than
 * "$0"). On any API error the function returns [] and logs — sim runs
 * without the anchor.
 */
export async function fetchKoreaExportFlows(
  opts: ComtradeFetchOpts,
): Promise<ComtradeFlow[]> {
  // UN Comtrade publishes annual aggregates with a 1-2 month lag, so the
  // immediate previous year (Y-1) sometimes returns empty during H1 of the
  // current year. Y-2 is always fully populated. Caller can override
  // explicitly when they know Y-1 is available.
  const period = opts.period ?? new Date().getUTCFullYear() - 2;
  const partnerCodes = opts.partnerCountries
    .map((iso) => ISO2_TO_NUMERIC[iso.toUpperCase()])
    .filter((n): n is number => typeof n === "number");
  if (partnerCodes.length === 0 || opts.hsCodes.length === 0) return [];

  // Comtrade API: GET /data/v1/get/C/A/HS?reporterCode=410&partnerCode=...&period=YYYY&cmdCode=...
  // Path segments: typeCode=C (commodities), freqCode=A (annual), classifierCode=HS.
  const url = new URL(`${COMTRADE_BASE}/C/A/HS`);
  url.searchParams.set("reporterCode", String(KOREA_REPORTER_CODE));
  url.searchParams.set("flowCode", "X"); // X = exports
  url.searchParams.set("period", String(period));
  url.searchParams.set("partnerCode", partnerCodes.join(","));
  url.searchParams.set("cmdCode", opts.hsCodes.join(","));
  url.searchParams.set("includeDesc", "true");
  if (opts.apiKey) url.searchParams.set("subscription-key", opts.apiKey);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), COMTRADE_TIMEOUT_MS);
  try {
    const res = await fetch(url.toString(), { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) {
      console.warn(`[comtrade] HTTP ${res.status} — fetching ${url}`);
      return [];
    }
    const json = (await res.json()) as {
      data?: Array<{
        partnerISO?: string;
        partnerDesc?: string;
        primaryValue?: number;
      }>;
    };
    const data = json.data ?? [];
    // Aggregate per partner ISO (rows arrive split per cmdCode).
    const byPartner = new Map<string, { name: string; sum: number }>();
    for (const row of data) {
      const iso = row.partnerISO?.toUpperCase();
      if (!iso) continue;
      const cur = byPartner.get(iso) ?? { name: row.partnerDesc ?? iso, sum: 0 };
      cur.sum += row.primaryValue ?? 0;
      byPartner.set(iso, cur);
    }
    const flows: ComtradeFlow[] = [];
    for (const [iso, agg] of byPartner) {
      if (agg.sum > 0) {
        flows.push({ partnerIso: iso, partnerName: agg.name, tradeValueUsd: agg.sum, period });
      }
    }
    return flows.sort((a, b) => b.tradeValueUsd - a.tradeValueUsd);
  } catch (err) {
    clearTimeout(timer);
    console.warn(`[comtrade] fetch error: ${(err as Error).message}`);
    return [];
  }
}

/* ────────────────────────────────── Prompt block renderer ─── */

/**
 * Format Comtrade flows as a deterministic prompt block to inject into
 * countryPrompt before the LLM emits country scores. The framing is
 * deliberately conservative — calls them "evidence" not "ground truth"
 * because aggregate HSCode flow != product-specific market presence.
 */
export function renderComtradeAnchorBlock(
  flows: ComtradeFlow[],
  opts: { categoryLabel: string; period: number; locale?: "ko" | "en" },
): string {
  if (flows.length === 0) return "";
  const isKo = opts.locale !== "en";
  const header = isKo
    ? `═══ UN Comtrade ${opts.period}년 한국→파트너 수출 실적 (${opts.categoryLabel}, HSCode 합산) ═══`
    : `═══ UN Comtrade ${opts.period} Korea→partner export evidence (${opts.categoryLabel}, HSCode aggregate) ═══`;
  const lines = flows.map((f) => {
    const millions = (f.tradeValueUsd / 1e6).toFixed(1);
    return `  ${f.partnerIso.padEnd(3)} ${f.partnerName.padEnd(20)} $${millions}M`;
  });
  const note = isKo
    ? "주의: 위 수치는 HSCode 단위 무역 통계 (제품군 합산)로, 본 제품 단일 매출이 아닙니다. 다만 \"한국 수출이 큰 시장 = K-product 유통 인프라가 이미 존재하는 시장\"이라는 강한 prior로 활용하세요. 위 데이터를 무시하고 다른 후보국을 1위로 선정할 경우 rationale에 명확한 근거를 적으세요."
    : "Note: Values are HSCode-aggregate trade (category-wide), not single-product revenue. But strong Korea→country flow is a high-confidence prior that K-product distribution infrastructure already exists. If you rank a country higher than what Comtrade suggests, explain why in rationale.";
  return `${header}\n${lines.join("\n")}\n\n${note}`;
}

/* ────────────────────────────────── Top-level convenience ─── */

export async function buildComtradeAnchor(
  category: string,
  candidateCountries: string[],
  opts: { period?: number; apiKey?: string; locale?: "ko" | "en" } = {},
): Promise<{ block: string; flows: ComtradeFlow[] }> {
  const hsCodes = hsCodesForCategory(category);
  if (hsCodes.length === 0) return { block: "", flows: [] };
  // UN Comtrade publishes annual aggregates with a 1-2 month lag, so the
  // immediate previous year (Y-1) sometimes returns empty during H1 of the
  // current year. Y-2 is always fully populated. Caller can override
  // explicitly when they know Y-1 is available.
  const period = opts.period ?? new Date().getUTCFullYear() - 2;
  const flows = await fetchKoreaExportFlows({
    partnerCountries: candidateCountries,
    hsCodes,
    period,
    apiKey: opts.apiKey,
  });
  const block = renderComtradeAnchorBlock(flows, {
    categoryLabel: category,
    period,
    locale: opts.locale,
  });
  return { block, flows };
}

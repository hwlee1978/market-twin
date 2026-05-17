/**
 * 관세청 UNI-PASS (Korea Customs Service) brand-level export data.
 *
 * Phase F.1-1 stub (2026-05-17). Brand-level anchor that complements
 * UN Comtrade's HSCode-aggregate flow. UNI-PASS exposes Korean export
 * declarations at finer granularity — by reporter company, sometimes
 * down to specific HSCode 10-digit lines — that lets us distinguish
 * which K-brand actually drives which country's K-export flow.
 *
 * Why we need this in addition to Comtrade:
 *   - Comtrade says "Korea → US, $1.83B beauty (HSCode 33)" — anonymized
 *     aggregate, doesn't tell us which K-brand is driving the flow.
 *   - UNI-PASS can (in principle) report "LG생활건강 → US, $X cosmetics"
 *     for top-N declarants, distinguishing COSRX (LG group) from Anua
 *     (independent) from 아모레퍼시픽.
 *   - Phase F.0 result: Hofstede + World Bank lifted composite +13.7pt but
 *     boj-relief-sun dropped -9.4 because the LLM still couldn't tell
 *     "Beauty of Joseon's specific viral pattern" apart from generic
 *     K-Beauty US flow. Brand-level anchor fixes this.
 *
 * Status: STUB. The actual integration depends on which UNI-PASS endpoint
 * variant is registered (data.go.kr OpenAPI vs unipass.customs.go.kr ETS
 * vs bigdata-tradeinfo.kr 빅데이터 포털). The user must register an API
 * key and confirm endpoint shape before this can fetch real data.
 *
 * Best-effort: returns empty when key is missing, sim runs without anchor.
 */

export interface UnipassBrandFlow {
  /** Korean company name (reporter). */
  companyName: string;
  /** ISO 3166-1 alpha-2 partner country. */
  partnerIso: string;
  /** Total declared export value USD for the period. */
  exportValueUsd: number;
  /** HSCode (4-10 digit string). */
  hsCode: string;
  period: number;
}

export interface UnipassFetchOpts {
  /** ISO alpha-2 partner countries to filter. */
  partnerCountries: string[];
  /** HSCode prefixes to include (2-6 digit usually). */
  hsCodes: string[];
  /** Period as YYYY (annual aggregation). */
  period: number;
  /** API key. When missing, returns empty array. */
  apiKey?: string;
  /** Optional brand-name filter — when supplied, narrows to declarants
   *  matching one of these substrings (case-insensitive). Useful when
   *  scoring a known product whose company is one of a small set. */
  brandFilters?: string[];
  /** Cap on top-N declarants per partner. */
  topN?: number;
}

/**
 * STUB: fetches brand-level Korean export flows.
 *
 * Two endpoint variants exist; the live integration must pick one once
 * the user registers and tells us which key shape they got:
 *
 *   1. **data.go.kr 관세청 OpenAPI** — XML/JSON over query params.
 *      Subscription key (encoded). Variant: GET request, returns
 *      `<items>` with `<companyNm>`, `<expoNatnCd>`, `<expoAmt>`.
 *      Filter narrow — usually aggregate per HSCode + country, not
 *      per company.
 *
 *   2. **빅데이터 무역포털 (bigdata-tradeinfo.kr)** — POST JSON.
 *      API key in header. Variant: returns top-N declarants per
 *      HSCode-country pair. Closer to what we want, but stricter
 *      rate limits (paid tier needed for production volume).
 *
 *   3. **UNI-PASS ETS direct** — requires customs broker registration,
 *      not suitable for general SaaS use. Skip.
 *
 * Current behavior: no API call. Returns empty array. When the user
 * confirms which variant their key works against, replace the body of
 * this function with the actual fetch + parse.
 */
export async function fetchUnipassBrandFlows(
  opts: UnipassFetchOpts,
): Promise<UnipassBrandFlow[]> {
  const apiKey = opts.apiKey ?? process.env.UNIPASS_API_KEY;
  if (!apiKey) {
    // No key registered. Sim proceeds without brand-level anchor.
    return [];
  }
  // STUB — fill in once user confirms endpoint variant. The function
  // signature, opts, and return shape are stable; only the fetch body
  // needs to be implemented.
  console.warn(
    "[unipass] API key detected but endpoint integration is STUB. Update fetchUnipassBrandFlows() body with the user's endpoint variant.",
  );
  return [];
}

/**
 * Render brand-level flows as a prompt block. Designed to slot into
 * countryPrompt alongside the existing Comtrade aggregate block — the
 * LLM cross-references the two: Comtrade gives category total, UNI-PASS
 * brand-level breakdown gives "which brand owns the category."
 *
 * Format: per country, top-N declarants with names + USD values.
 */
export function renderUnipassBlock(
  flows: UnipassBrandFlow[],
  opts: { categoryLabel: string; period: number; locale?: "ko" | "en" } = {
    categoryLabel: "",
    period: new Date().getUTCFullYear() - 2,
  },
): string {
  if (flows.length === 0) return "";
  const isKo = opts.locale !== "en";
  // Group by partner.
  const byPartner = new Map<string, UnipassBrandFlow[]>();
  for (const f of flows) {
    const arr = byPartner.get(f.partnerIso) ?? [];
    arr.push(f);
    byPartner.set(f.partnerIso, arr);
  }
  for (const arr of byPartner.values()) {
    arr.sort((a, b) => b.exportValueUsd - a.exportValueUsd);
  }
  const header = isKo
    ? `═══ 관세청 UNI-PASS ${opts.period}년 한국 → 파트너 브랜드별 수출 (${opts.categoryLabel}) ═══`
    : `═══ Korea Customs UNI-PASS ${opts.period} brand-level K-export by partner (${opts.categoryLabel}) ═══`;
  const sections = [...byPartner.entries()].map(([partner, list]) => {
    const lines = list
      .slice(0, 5)
      .map((f) => `    · ${f.companyName.padEnd(24)} $${(f.exportValueUsd / 1e6).toFixed(1)}M`);
    return `  [${partner}]\n${lines.join("\n")}`;
  });
  const note = isKo
    ? "주의: 위는 declarant (수출 신고 기업) 기준 — 카테고리 합산 (Comtrade)과 cross-reference 하세요. 본 제품의 모회사·브랜드가 위 명단에 있으면 그 시장은 K-product 유통 인프라 + 동종 브랜드 학습 효과를 이미 보유합니다."
    : "Note: declarant-based (Korean exporter company). Cross-reference with Comtrade category aggregate. If the product's parent company appears in a partner's top-N, that market has both K-product distribution infra and prior-brand learning effect.";
  return `${header}\n${sections.join("\n\n")}\n\n${note}`;
}

/** Top-level convenience. */
export async function buildUnipassAnchor(
  category: string,
  candidateCountries: string[],
  hsCodes: string[],
  opts: { period?: number; apiKey?: string; locale?: "ko" | "en"; brandFilters?: string[] } = {},
): Promise<{ block: string; flows: UnipassBrandFlow[] }> {
  const period = opts.period ?? new Date().getUTCFullYear() - 2;
  const flows = await fetchUnipassBrandFlows({
    partnerCountries: candidateCountries,
    hsCodes,
    period,
    apiKey: opts.apiKey,
    brandFilters: opts.brandFilters,
  });
  const block = renderUnipassBlock(flows, { categoryLabel: category, period, locale: opts.locale });
  return { block, flows };
}

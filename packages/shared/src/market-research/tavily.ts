/**
 * Tavily search client — used to ground the Market Size section of the
 * country drilldown in real web sources instead of LLM hallucination.
 *
 * Pricing: pay-per-use, ~$0.005-0.025 per query (no fixed subscription).
 * 1-3 queries per ensemble at the marketSize stage works out to ~$0.05
 * all-in including the synthesis LLM pass that follows. Bound to actual
 * sim volume — no cost when nobody runs sims. See [memory/market_research_integration.md]
 * for the rationale on choosing Tavily over Perplexity Sonar Pro.
 *
 * Graceful fallback: when TAVILY_API_KEY is unset, search() returns null
 * and the caller falls back to the original LLM-only marketSize path.
 * Don't fail the whole sim over a missing key.
 */

export interface TavilyResult {
  url: string;
  title: string;
  /** Text snippet — typically 200-500 chars of relevant content. */
  content: string;
  /** Tavily relevance score 0-1; higher is more relevant. */
  score: number;
}

export interface TavilySearchResult {
  /** Tavily-synthesized direct answer (when include_answer=true). */
  answer?: string;
  results: TavilyResult[];
  /** Total cost incurred for billing audit. Tavily doesn't return this
   *  per-call yet, but we expose the field so downstream code stays
   *  forward-compatible if they add it. */
  costEstimateCents?: number;
}

const TAVILY_ENDPOINT = "https://api.tavily.com/search";
const TAVILY_TIMEOUT_MS = 12_000;

/**
 * In-process cache for Tavily search results. Two ensembles run in
 * close succession on the same product+country (e.g. user re-running
 * Le Mouton on TW after a tier change) re-issue the identical
 * marketSize query — caching saves 1 search call (~\$0.01-0.03) and
 * a couple of seconds per repeat.
 *
 * 24-hour TTL matches the market-data cadence — TAM and growth-rate
 * estimates don't change minute-to-minute, so day-stale is fine. Map
 * is a per-runtime cache, not shared across Vercel function instances:
 * cold starts skip it. For a longer-living cache we'd need Redis or
 * a Supabase row, but in-process covers the common "two clicks 30
 * seconds apart" hit pattern at zero extra infra.
 */
const TAVILY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
interface CachedResult {
  result: TavilySearchResult;
  cachedAt: number;
}
const cache = new Map<string, CachedResult>();

function cacheKey(opts: {
  query: string;
  searchDepth?: string;
  maxResults?: number;
  includeDomains?: string[];
  excludeDomains?: string[];
}): string {
  return JSON.stringify({
    q: opts.query,
    d: opts.searchDepth ?? "advanced",
    m: opts.maxResults ?? 5,
    i: opts.includeDomains ?? [],
    e: opts.excludeDomains ?? [],
  });
}

/**
 * Run a single Tavily search. Returns null when the API key is missing
 * (so the caller can fall back to LLM-only) or when the network call
 * fails (best-effort — this is a grounding layer, not load-bearing).
 *
 * Defaults aimed at market-size queries:
 *   - search_depth "advanced" — pulls more authoritative sources
 *     (industry reports, stat aggregators) at slightly higher cost vs
 *     "basic" which is more news-skewed.
 *   - max_results 5 — enough for 2-3 citations + redundancy
 *   - include_answer true — Tavily produces a synthesis we can use as
 *     a sanity check against our own LLM merge
 */
export async function tavilySearch(opts: {
  query: string;
  searchDepth?: "basic" | "advanced";
  maxResults?: number;
  includeAnswer?: boolean;
  /** Domain whitelist — restricts results to these hosts. Useful for
   *  market-size queries where we want statista/euromonitor-class
   *  sources rather than blog posts. */
  includeDomains?: string[];
  /** Domain blacklist — drops noisy hosts. */
  excludeDomains?: string[];
}): Promise<TavilySearchResult | null> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return null;

  // Cache hit — same query within the 24h TTL skips the network call
  // and the search-credit charge entirely.
  const key = cacheKey(opts);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.cachedAt < TAVILY_CACHE_TTL_MS) {
    console.log(
      `[tavily] cache hit for "${opts.query.slice(0, 60)}" (${Math.round((Date.now() - hit.cachedAt) / 1000)}s old)`,
    );
    return hit.result;
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TAVILY_TIMEOUT_MS);
  try {
    const res = await fetch(TAVILY_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query: opts.query,
        search_depth: opts.searchDepth ?? "advanced",
        max_results: opts.maxResults ?? 5,
        include_answer: opts.includeAnswer ?? true,
        include_raw_content: false,
        include_domains: opts.includeDomains,
        exclude_domains: opts.excludeDomains,
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      console.warn(
        `[tavily] ${res.status} ${res.statusText} for query "${opts.query.slice(0, 60)}"`,
      );
      return null;
    }
    const json = (await res.json()) as {
      answer?: string;
      results?: Array<{
        url: string;
        title: string;
        content: string;
        score: number;
      }>;
    };
    const result: TavilySearchResult = {
      answer: json.answer,
      results: (json.results ?? []).map((r) => ({
        url: r.url,
        title: r.title,
        content: r.content,
        score: r.score,
      })),
    };
    cache.set(key, { result, cachedAt: Date.now() });
    return result;
  } catch (err) {
    clearTimeout(timer);
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[tavily] search failed:`, msg);
    return null;
  }
}

/**
 * Build a market-size query optimized for the country drilldown. The
 * phrasing matters — "market size in TW" returns more analyst-report
 * snippets than "Taiwan market size" alone. Year tag (2024) biases
 * results toward recent data instead of decade-old trade journals.
 *
 * Trend keywords ("recent expansion", "momentum") were added after
 * three accuracy-validation runs (Buldak / Shin Ramyun / COSRX) all
 * missed EU's +200% YoY K-product growth signal — Tavily returned
 * static category-size figures and missed Korea Herald / Korea Times
 * articles announcing 2024-2025 EU subsidiary launches and Tesco /
 * Rewe / Sephora retail entries. Including "recent expansion 2024
 * 2025 momentum" pulls those Korea-IR style articles to the top of
 * the results list so the persona prompt sees the growth signal
 * alongside the static TAM number.
 */
export function buildMarketSizeQuery(opts: {
  country: string;
  category: string;
  productName: string;
}): string {
  // Country code → readable name mapping for query phrasing. Tavily
  // returns better hits with "Taiwan" than "TW".
  const countryNames: Record<string, string> = {
    KR: "South Korea",
    JP: "Japan",
    CN: "China",
    TW: "Taiwan",
    HK: "Hong Kong",
    SG: "Singapore",
    TH: "Thailand",
    VN: "Vietnam",
    ID: "Indonesia",
    MY: "Malaysia",
    PH: "Philippines",
    IN: "India",
    US: "United States",
    CA: "Canada",
    GB: "United Kingdom",
    DE: "Germany",
    FR: "France",
    IT: "Italy",
    ES: "Spain",
    NL: "Netherlands",
    AU: "Australia",
    NZ: "New Zealand",
    AE: "United Arab Emirates",
    SA: "Saudi Arabia",
    BR: "Brazil",
    MX: "Mexico",
  };
  const country =
    countryNames[opts.country.toUpperCase()] ?? opts.country;
  const year = new Date().getFullYear();
  const prevYear = year - 1;
  // "recent expansion ${prevYear} ${year} momentum" surfaces growth-
  // trajectory articles (subsidiary launches, retail entries, YoY %
  // milestones) that pure "TAM growth rate" missed in the Buldak /
  // Shin Ramyun / COSRX validation runs.
  return `${opts.category} market ${country} ${year} TAM growth rate recent expansion ${prevYear} momentum`;
}

/**
 * Build a category-level consumer trend query for Tavily. Returns
 * something Tavily can actually find recent articles on:
 *   "consumer trends sneaker fashion footwear 2026 sustainability premium"
 *
 * Used to ground persona reactions in current real-world signals
 * rather than the LLM's training prior alone. The LLM knows broad
 * macro trends but its sense of "what's hot RIGHT NOW in this
 * specific category" weakens past ~6 months from training cutoff.
 * Tavily fills that gap with fresh articles whose snippets feed
 * into the persona prompt as a "current category context" block.
 *
 * Single global query (no country) — covers what the LLM needs to
 * weight across all candidate countries with one search. Cost: same
 * as a market-size query (~\$0.01-0.03), cached 24h alongside other
 * Tavily results.
 */
export function buildCategoryTrendQuery(opts: {
  category: string;
  productName: string;
}): string {
  const year = new Date().getFullYear();
  const prevYear = year - 1;
  // "regional growth shifts" prompts results that report which
  // geographies are gaining share — the signal that lets the persona
  // prompt distinguish a saturating market from one that's currently
  // exploding (e.g., EU K-product +200% YoY 2024-2025).
  return `${opts.category} consumer trends ${prevYear} ${year} buyer preferences shifts regional growth ${opts.productName}`;
}

/**
 * Build a margin-benchmark query for Tavily. Goal: ground the
 * `marginEstimate` field of the pricing stage in real industry data
 * rather than the LLM's training-prior + prompt-calibration anchors.
 *
 * Margin data on the open web is harder to find than trend articles
 * (most authoritative sources sit behind Statista / IBISWorld /
 * McKinsey paywalls), but Tavily's index does pick up:
 *   - Industry blog posts citing specific margin %
 *   - Brand IPO filings / annual reports (S-1 / 10-K) with COGS data
 *   - Trade press analysis
 * Quality is variable; the LLM uses the snippets as one input among
 * the prompt-calibration anchors, not the only signal.
 *
 * Country in the query — local market structure (DTC vs wholesale
 * dominance, distributor margin layers) shifts category margins by
 * 5-15pp, so country-specific snippets beat global averages.
 */
export function buildMarginBenchmarkQuery(opts: {
  category: string;
  country: string;
  productName: string;
}): string {
  const countryNames: Record<string, string> = {
    KR: "South Korea",
    JP: "Japan",
    CN: "China",
    TW: "Taiwan",
    HK: "Hong Kong",
    SG: "Singapore",
    TH: "Thailand",
    VN: "Vietnam",
    ID: "Indonesia",
    MY: "Malaysia",
    PH: "Philippines",
    IN: "India",
    US: "United States",
    CA: "Canada",
    GB: "United Kingdom",
    DE: "Germany",
    FR: "France",
    IT: "Italy",
    ES: "Spain",
    NL: "Netherlands",
    AU: "Australia",
    NZ: "New Zealand",
    AE: "United Arab Emirates",
    SA: "Saudi Arabia",
    BR: "Brazil",
    MX: "Mexico",
  };
  const country = countryNames[opts.country.toUpperCase()] ?? opts.country;
  const year = new Date().getFullYear();
  return `${opts.category} gross margin percentage benchmark ${country} ${year} industry average COGS`;
}

/**
 * Country → native query language. Drives the localized-search pass
 * added after the Buldak/Shin/COSRX validation runs identified
 * Tavily's English-source bias as the root cause of EU + CN + JP
 * weakness (defect #1). Tavily's index is global, but its ranking
 * strongly favors English-language pages — running a parallel native-
 * language query surfaces sources the English search misses entirely
 * (라쿠텐, @cosme, 샤오홍슈, 네이버, Sina Finance, 36Kr).
 *
 * Returns null for English-default countries (US/GB/AU/etc.) — for
 * those, the English query already covers the relevant news/IR
 * sources, so a second localized pass would just duplicate results
 * and double cost without information gain.
 */
function nativeQueryLanguage(country: string): {
  code: string;
  countryName: string;
} | null {
  const upper = country.toUpperCase();
  switch (upper) {
    case "JP":
      return { code: "ja", countryName: "日本" };
    case "CN":
      return { code: "zh-CN", countryName: "中国" };
    case "KR":
      return { code: "ko", countryName: "한국" };
    case "TW":
      return { code: "zh-TW", countryName: "台灣" };
    case "HK":
      return { code: "zh-TW", countryName: "香港" };
    default:
      return null;
  }
}

/**
 * Build a market-size query in the country's native language (when
 * the country has a non-English-dominant media landscape — JP/CN/KR/
 * TW/HK). Mirrors buildMarketSizeQuery's English version but uses
 * native-language phrasing so Tavily ranks domestic IR articles and
 * trade-press analyses to the top of results.
 *
 * Returns null for English-default countries (caller skips the
 * second Tavily call — saves the search-credit charge).
 */
export function buildMarketSizeQueryNative(opts: {
  country: string;
  category: string;
  productName: string;
}): string | null {
  const lang = nativeQueryLanguage(opts.country);
  if (!lang) return null;
  const year = new Date().getFullYear();
  const prevYear = year - 1;
  // Native-language phrasing varies — keep keyword-style queries that
  // Tavily can match against article titles/snippets in the target
  // language. Year tag biases toward recent IR articles.
  switch (lang.code) {
    case "ja":
      return `${opts.category} ${lang.countryName} 市場規模 ${year} 成長 拡大 ${prevYear} ${year}`;
    case "zh-CN":
      return `${opts.category} ${lang.countryName} 市场规模 ${year} 增长 扩张 ${prevYear} ${year}`;
    case "zh-TW":
      return `${opts.category} ${lang.countryName} 市場規模 ${year} 成長 擴張 ${prevYear} ${year}`;
    case "ko":
      return `${opts.category} ${lang.countryName} 시장 규모 ${year} 성장 확대 ${prevYear} ${year}`;
    default:
      return null;
  }
}

/**
 * Native-language version of buildCategoryTrendQuery — runs when the
 * originating country (the K-product's home market) is non-English.
 * Korean-origin products especially benefit: K-Food / K-Beauty export
 * IR is published first in Korean (조선비즈, 매경, 한경) and only
 * later in English Korea Herald / Korea Times. The native query
 * pulls the upstream Korean-language IR articles directly.
 */
export function buildCategoryTrendQueryNative(opts: {
  category: string;
  productName: string;
  originatingCountry: string;
}): string | null {
  const lang = nativeQueryLanguage(opts.originatingCountry);
  if (!lang) return null;
  const year = new Date().getFullYear();
  const prevYear = year - 1;
  switch (lang.code) {
    case "ja":
      return `${opts.category} 消費者トレンド ${year} 海外展開 輸出 ${opts.productName}`;
    case "zh-CN":
      return `${opts.category} 消费趋势 ${year} 海外扩张 出口 ${opts.productName}`;
    case "zh-TW":
      return `${opts.category} 消費趨勢 ${year} 海外擴張 出口 ${opts.productName}`;
    case "ko":
      return `${opts.category} 소비자 트렌드 ${year} 해외 진출 수출 매출 ${prevYear} ${opts.productName}`;
    default:
      return null;
  }
}

/**
 * Compress Tavily results into a tight, token-efficient context block
 * suitable for injection into per-batch persona prompts. Goal: <600
 * chars total so the addition doesn't bloat 12-batch sims with
 * redundant tokens.
 *
 * Format:
 *   ═══ CURRENT CATEGORY CONTEXT (real-world snippets) ═══
 *   1. <one-sentence summary from snippet 1>
 *   2. <one-sentence summary from snippet 2>
 *   ...
 *
 * Each line caps at ~120 chars. Caller decides how many snippets to
 * include (typically 3-4); we sort by Tavily relevance score before
 * truncating so the kept snippets are the strongest signal.
 */
export function formatTrendContextBlock(
  results: TavilyResult[],
  isKo: boolean,
  maxLines: number = 4,
): string {
  if (results.length === 0) return "";
  const top = [...results]
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, maxLines);
  const lines = top.map((r, i) => {
    // First sentence-ish chunk of the snippet content; cap at ~140 chars.
    const sentence = r.content
      .replace(/\s+/g, " ")
      .trim()
      .split(/(?<=[.!?])\s/)[0] ?? "";
    const trimmed =
      sentence.length > 140 ? sentence.slice(0, 137) + "..." : sentence;
    return `${i + 1}. ${trimmed}`;
  });
  const header = isKo
    ? "═══ 현재 카테고리 트렌드 컨텍스트 (실제 웹 스니펫) ═══\n학습 cutoff 이후의 최근 동향 grounding. 위 INCOME REFERENCE 와 달리 verbatim 인용 ❌ — 페르소나의 trustFactors / objections / voice / purchaseIntent 가 어떤 카테고리 신호 (지속가능성·프리미엄화·세대 전환·신규 채널 등) 와 일치 / 충돌하는지를 정성적으로 weighing 하는 데에만 사용:"
    : "═══ CURRENT CATEGORY CONTEXT (real-world snippets) ═══\nPost-training-cutoff grounding — UNLIKE the INCOME REFERENCE above, do NOT verbatim-copy these into trustFactors / objections. Use them to qualitatively weight whether a persona's reaction aligns with the category's current trend direction (sustainability shift, premiumization, generational turnover, new channels):";
  return `${header}\n${lines.join("\n")}`;
}

/**
 * Format margin-benchmark Tavily results as a grounding block for the
 * pricing prompt. Differs from the trend block in two ways:
 *   - Includes source URLs so the LLM can cite them in marginEstimate
 *   - Header explicitly invites citation: "use these as anchors and
 *     name the source you weighted most"
 *
 * Returns "" when the result list is empty so callers can append-or-
 * skip without conditionals.
 */
export function formatMarginBenchmarkBlock(
  results: TavilyResult[],
  isKo: boolean,
  maxLines: number = 4,
): string {
  if (results.length === 0) return "";
  const top = [...results]
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, maxLines);
  const lines = top.map((r, i) => {
    const sentence = r.content
      .replace(/\s+/g, " ")
      .trim()
      .split(/(?<=[.!?])\s/)[0] ?? "";
    const trimmed =
      sentence.length > 200 ? sentence.slice(0, 197) + "..." : sentence;
    return `[${i + 1}] ${trimmed}\n    ↳ ${r.url}`;
  });
  const header = isKo
    ? "═══ 마진 벤치마크 (실제 웹 grounding) ═══\n카테고리 평균 gross margin 자료. 이 데이터를 anchor 로 marginEstimatePct + marginEstimate 추정. marginEstimate 본문에 어느 소스를 가중치 두었는지 1줄 인용 ([1] / [2] 등) — 사용자가 출처를 따라갈 수 있게."
    : "═══ MARGIN BENCHMARK (real-world grounding) ═══\nCategory gross-margin reference data. Use as anchor for marginEstimatePct + marginEstimate. In the marginEstimate text, cite which source you weighted most by [1] / [2] / etc. so the user can trace the figure.";
  return `${header}\n${lines.join("\n")}`;
}

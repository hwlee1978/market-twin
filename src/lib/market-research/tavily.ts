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
    return {
      answer: json.answer,
      results: (json.results ?? []).map((r) => ({
        url: r.url,
        title: r.title,
        content: r.content,
        score: r.score,
      })),
    };
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
  return `${opts.category} market size ${country} ${year} TAM growth rate`;
}

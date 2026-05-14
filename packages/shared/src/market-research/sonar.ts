/**
 * Perplexity Sonar Pro client — second-pass grounding alongside Tavily.
 *
 * Why both? Tavily is retrieval-only: it returns raw snippets ranked by
 * relevance. Sonar Pro is generative search: Perplexity runs an LLM on
 * top of its own retrieval index and produces a synthesized answer with
 * embedded citations. The two tools fail in different ways:
 *   - Tavily misses non-English-dominant signals (EU K-product +200%
 *     YoY 2024-2025 didn't surface in 3/3 validation runs because the
 *     Korea-Herald-class articles ranked below English category-size
 *     analyst reports)
 *   - Sonar Pro misses static structured data (TAM figures, regulatory
 *     filings) that Tavily picks up reliably from analyst sources
 *
 * Running both in parallel and merging gives the persona prompt both
 * sides: structured market-size anchors from Tavily AND growth-trajectory
 * synthesis from Sonar Pro. Cost is additive (~+$0.03/ensemble for Sonar)
 * but the EU / non-English-market accuracy improvement is what (b)
 * resolves on the validation defect list.
 *
 * Graceful fallback: when PERPLEXITY_API_KEY is unset, sonarSearch
 * returns null and the caller proceeds with Tavily-only grounding (same
 * behavior as before this module existed). Don't fail the whole sim.
 */

import type { TavilyResult, TavilySearchResult } from "./tavily";

const SONAR_ENDPOINT = "https://api.perplexity.ai/chat/completions";
const SONAR_TIMEOUT_MS = 15_000;

// 24h TTL matches the Tavily cache — market-trend grounding doesn't
// shift minute-to-minute and the user's "rerun same product on TW after
// tier change" pattern benefits from skipping the per-run cost.
const SONAR_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
interface SonarCacheEntry {
  result: TavilySearchResult;
  cachedAt: number;
}
const cache = new Map<string, SonarCacheEntry>();

function cacheKey(opts: { query: string; model: string }): string {
  return JSON.stringify({ q: opts.query, m: opts.model });
}

/**
 * Run a Sonar Pro query and return the synthesized answer + citations
 * mapped to the TavilySearchResult shape so downstream merge/format
 * code works without branching on source.
 *
 * Each Perplexity citation becomes one pseudo-TavilyResult:
 *   - url  = citation URL
 *   - title = derived from URL host (Perplexity doesn't return titles)
 *   - content = the synthesized paragraph that referenced this citation,
 *               or a slice of the overall answer when paragraph-attribution
 *               isn't available
 *   - score = decreasing 0.95 → 0.40 based on citation order (Perplexity
 *             ranks citations by usefulness in the answer)
 *
 * The `answer` field carries Sonar's full synthesis verbatim — when the
 * caller wants the synthesized paragraph (not just snippets), that's
 * where to read it.
 */
export async function sonarSearch(opts: {
  query: string;
  /** Default "sonar-pro". Use "sonar" for cheaper queries when the
   *  synthesis quality of pro isn't required (~10× cheaper). */
  model?: "sonar-pro" | "sonar";
  /** System message — defaults to a short market-research framing. */
  system?: string;
}): Promise<TavilySearchResult | null> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) return null;

  const model = opts.model ?? "sonar-pro";
  const key = cacheKey({ query: opts.query, model });
  const hit = cache.get(key);
  if (hit && Date.now() - hit.cachedAt < SONAR_CACHE_TTL_MS) {
    console.log(
      `[sonar] cache hit for "${opts.query.slice(0, 60)}" (${Math.round((Date.now() - hit.cachedAt) / 1000)}s old)`,
    );
    return hit.result;
  }

  const system =
    opts.system ??
    "You are a market-research analyst. Return concise, citation-backed answers focused on growth trends, YoY changes, channel shifts, and regional momentum. Prefer recent (last 12-18 months) sources.";

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), SONAR_TIMEOUT_MS);
  try {
    const res = await fetch(SONAR_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: opts.query },
        ],
        // Bias toward newer sources; same window we ask of Tavily.
        search_recency_filter: "year",
        // Keep the answer tight; we extract snippets, not essays.
        max_tokens: 700,
        temperature: 0.2,
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      console.warn(
        `[sonar] ${res.status} ${res.statusText} for query "${opts.query.slice(0, 60)}"`,
      );
      return null;
    }
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      citations?: string[];
      search_results?: Array<{ url?: string; title?: string }>;
    };
    const answer = json.choices?.[0]?.message?.content?.trim() ?? "";
    // Perplexity exposes citations as a flat string[] of URLs at top
    // level; some response variants also include search_results[]
    // with titles. Prefer search_results when present.
    const enrichedResults = json.search_results ?? [];
    const citationUrls = json.citations ?? [];
    const urls =
      enrichedResults.length > 0
        ? enrichedResults.map((r) => r.url).filter((u): u is string => !!u)
        : citationUrls;

    const results: TavilyResult[] = urls.map((url, i) => {
      const enriched = enrichedResults[i];
      // Score decays 0.95 → 0.40 across the first 12 citations; further
      // citations cap at 0.40 so Tavily's higher-scored hits still
      // outrank them in the merged formatTrendContextBlock view.
      const score = Math.max(0.4, 0.95 - i * 0.05);
      return {
        url,
        title: enriched?.title || hostFromUrl(url),
        // Use a slice of the synthesized answer as the snippet — gives
        // formatTrendContextBlock something substantive to render.
        // Citation-paragraph attribution isn't reliable from the API,
        // so we attach the same answer slice to each; the formatter
        // dedups via score-ordering + line cap anyway.
        content: answer.slice(0, 360) || "(see Sonar synthesis)",
        score,
      };
    });

    const result: TavilySearchResult = { answer, results };
    cache.set(key, { result, cachedAt: Date.now() });
    return result;
  } catch (err) {
    clearTimeout(timer);
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[sonar] search failed:`, msg);
    return null;
  }
}

function hostFromUrl(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url.slice(0, 40);
  }
}

/**
 * Build a Sonar Pro market-size question. Sonar's strength is
 * synthesis — phrase as a question that benefits from multi-source
 * reasoning rather than a keyword query. Asking for YoY% and channel
 * shifts surfaces the Korea-IR-style growth narrative that Tavily's
 * keyword search underweights for non-English markets.
 */
export function buildMarketSizeQuerySonar(opts: {
  country: string;
  category: string;
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
  const prevYear = year - 1;
  return `What is the current state and recent trajectory of the ${opts.category} market in ${country} as of ${prevYear}-${year}? Include: estimated TAM in USD, YoY growth rate, the main channel shifts (online vs offline, retailer entries), and any notable Korean / Asian brand expansion announcements. Prioritize recent IR releases, retailer press releases, and trade-press analysis. Cite sources.`;
}

/**
 * Build a Sonar Pro category-trend question. Globally scoped (no
 * country) — used in the per-ensemble pre-sim phase to ground persona
 * reactions in current trend direction across all candidate markets.
 */
export function buildCategoryTrendQuerySonar(opts: {
  category: string;
  productName: string;
}): string {
  const year = new Date().getFullYear();
  const prevYear = year - 1;
  return `What are the most important consumer-trend shifts in the global ${opts.category} category over ${prevYear}-${year}? Focus on: which regions are gaining share (EU, North America, ASEAN, etc.), generational / channel turnover, premiumization vs price compression, and the role of Korean exports if relevant to ${opts.productName}. Surface YoY percentages where available. Cite sources.`;
}

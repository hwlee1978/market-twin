import Anthropic from "@anthropic-ai/sdk";
import { tavilySearch, type TavilyResult } from "@/lib/market-research/tavily";

/**
 * Keyword research for Mr.AI content channels.
 *
 * Pipeline:
 *   1. Tavily web search — 2 queries: Naver landscape + Google/global
 *      landscape for the brand category in the target market.
 *   2. Claude Sonnet distills the search snippets into a structured
 *      keyword list with volume tier estimates, trend direction, search
 *      intent, and source (Naver / Google / both).
 *
 * Not authoritative — DataLab/Trends APIs would give real numbers but
 * have OAuth + pricing friction. This LLM+Tavily distillation is a
 * directional first pass that's good enough to seed topic ideas; the
 * operator can decide which keywords to actually target. Phase 2.2
 * can wire in real DataLab/SerpAPI when budget allows.
 *
 * Cost: ~$0.025 Tavily (2 queries) + ~$0.02 Sonnet = ~$0.045/run.
 * Cached in mrai_keyword_research; re-run when user clicks 새로고침.
 */

export type KeywordRow = {
  keyword: string;
  /** Estimated relative search volume tier (qualitative). */
  volume_tier: "high" | "medium" | "low" | "niche";
  /** Trend direction over the past 90 days. */
  trend: "rising" | "stable" | "declining" | "seasonal";
  /** Which search engine matters more for this keyword. */
  source: "naver" | "google" | "both";
  /** Typical search intent. */
  intent: "informational" | "commercial" | "navigational" | "transactional";
  /** One-line note (e.g. "MZ 여성 검색 패턴 / 가격 비교 의도") */
  notes: string;
};

export type KeywordResearchResult = {
  keywords: KeywordRow[];
  llm_input_tokens: number;
  llm_output_tokens: number;
  cost_usd: number;
  ms: number;
};

export type KeywordResearchInput = {
  /** Channel platform (naver_blog / naver_smartstore / youtube / etc.) */
  platform: string;
  /** Market — "KR" / "US" / "JP" / "TW" / "CN" / "ID" / "VN" / null. */
  marketCountry: string | null;
  /** What the brand sells. e.g. "메리노 울 컴포트 스니커즈" */
  brandCategory: string;
  /** Optional topic angle to refine search ("출퇴근용 신발", "발 편한 신발") */
  seedTopic?: string;
  /** Seed keywords to expand on (the brand's known anchors). */
  seedKeywords?: string[];
};

const TAVILY_COST_PER_QUERY = 0.015;
const SONNET_INPUT_PER_MTOK = 3.0;
const SONNET_OUTPUT_PER_MTOK = 15.0;

export async function runKeywordResearch(
  input: KeywordResearchInput,
): Promise<KeywordResearchResult> {
  const t0 = Date.now();
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY not set");
  }

  const market = input.marketCountry ?? "KR";
  const marketLabel = marketLabelOf(market);
  const seedKw = (input.seedKeywords ?? []).slice(0, 5).join(", ");

  // Two parallel Tavily queries — Naver-focused + Google-focused.
  // For non-KR markets, Naver-side becomes "local SE" (e.g. Yahoo JP)
  // but the structure stays the same.
  const naverQuery =
    market === "KR"
      ? `네이버 검색 트렌드 ${input.brandCategory} ${input.seedTopic ?? ""} ${seedKw} 2026`
      : `${marketLabel} local search trends ${input.brandCategory} ${input.seedTopic ?? ""} ${seedKw} 2026`;
  const googleQuery =
    `Google search trends ${input.brandCategory} ${input.seedTopic ?? ""} ${seedKw} ${marketLabel} 2026`;

  const [naverRes, googleRes] = await Promise.allSettled([
    tavilySearch({
      query: naverQuery,
      searchDepth: "advanced",
      maxResults: 5,
      includeAnswer: true,
    }),
    tavilySearch({
      query: googleQuery,
      searchDepth: "advanced",
      maxResults: 5,
      includeAnswer: true,
    }),
  ]);
  const naverSnippets =
    naverRes.status === "fulfilled" && naverRes.value
      ? naverRes.value.results
      : [];
  const googleSnippets =
    googleRes.status === "fulfilled" && googleRes.value
      ? googleRes.value.results
      : [];

  const naverContext = naverSnippets
    .slice(0, 5)
    .map((r: TavilyResult, i: number) => `[N${i + 1}] ${r.title}\n${r.content.slice(0, 400)}`)
    .join("\n\n");
  const googleContext = googleSnippets
    .slice(0, 5)
    .map((r: TavilyResult, i: number) => `[G${i + 1}] ${r.title}\n${r.content.slice(0, 400)}`)
    .join("\n\n");

  const platformHint = platformPrioritization(input.platform);

  const system =
    "You are Mr.AI's SEO keyword analyst. Given web-search snippets " +
    "from Naver-side and Google-side landscape queries, produce a " +
    "STRUCTURED keyword list a brand can actually target. Output JSON ONLY.\n\n" +
    "Schema: { keywords: [{ keyword, volume_tier, trend, source, intent, notes }, ...] }\n" +
    " - keyword: 1-4 words, in the market's primary language.\n" +
    " - volume_tier: 'high' | 'medium' | 'low' | 'niche' — qualitative, " +
    "based on how frequently the term appears in the snippets and how " +
    "broad the topic is.\n" +
    " - trend: 'rising' | 'stable' | 'declining' | 'seasonal'.\n" +
    " - source: 'naver' | 'google' | 'both' — which SE matters more.\n" +
    " - intent: 'informational' | 'commercial' | 'navigational' | 'transactional'.\n" +
    " - notes: ONE short sentence on why this keyword matters for the brand.\n\n" +
    "Rules:\n" +
    "- Return 12-18 keywords total.\n" +
    "- Mix of short-tail (1-2 words) and long-tail (3-4 words).\n" +
    "- Avoid generic brand-name only keywords (those are navigational and " +
    "the brand already ranks #1 for itself).\n" +
    "- For Naver-side keywords use Korean if market is KR (or local " +
    "language otherwise). For Google-side keywords use both Korean (if " +
    "relevant) AND English.\n" +
    "- Prefer keywords with commercial / informational intent that map " +
    "to actual blog/post topics the brand could write.";

  const user = `Brand category: ${input.brandCategory}
Market: ${marketLabel}
Channel platform: ${input.platform} (${platformHint})
Seed topic: ${input.seedTopic ?? "(none)"}
Seed keywords: ${seedKw || "(none)"}

# Naver-side landscape (or local SE)
${naverContext || "(no results)"}

# Google-side landscape
${googleContext || "(no results)"}

Output JSON now.`;

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const resp = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 3000,
    system,
    messages: [{ role: "user", content: user }],
  });

  const text = resp.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .filter(Boolean)
    .join("")
    .trim();
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("LLM returned no JSON");
  const parsed = JSON.parse(m[0]) as { keywords?: KeywordRow[] };
  const keywords = (parsed.keywords ?? []).filter(
    (k) => k && typeof k.keyword === "string" && k.keyword.trim().length > 0,
  );

  const llmInputTokens = resp.usage.input_tokens;
  const llmOutputTokens = resp.usage.output_tokens;
  const sonnetCost =
    (llmInputTokens / 1_000_000) * SONNET_INPUT_PER_MTOK +
    (llmOutputTokens / 1_000_000) * SONNET_OUTPUT_PER_MTOK;
  const tavilyCost =
    (naverRes.status === "fulfilled" ? 1 : 0) * TAVILY_COST_PER_QUERY +
    (googleRes.status === "fulfilled" ? 1 : 0) * TAVILY_COST_PER_QUERY;
  const costUsd = Math.round((sonnetCost + tavilyCost) * 10000) / 10000;

  return {
    keywords,
    llm_input_tokens: llmInputTokens,
    llm_output_tokens: llmOutputTokens,
    cost_usd: costUsd,
    ms: Date.now() - t0,
  };
}

function marketLabelOf(code: string): string {
  const m: Record<string, string> = {
    KR: "Korea",
    US: "United States",
    JP: "Japan",
    TW: "Taiwan",
    CN: "China",
    ID: "Indonesia",
    VN: "Vietnam",
    SG: "Singapore",
  };
  return m[code] ?? code;
}

function platformPrioritization(platform: string): string {
  switch (platform) {
    case "naver_blog":
    case "naver_smartstore":
      return "Naver-side keywords matter most for SERP visibility";
    case "youtube":
      return "Google + YouTube-side video search keywords";
    case "instagram":
    case "x_twitter":
    case "tiktok":
    case "threads":
      return "Social-discovery hashtags; both SE relevant but lower priority";
    default:
      return "Both SEs relevant";
  }
}

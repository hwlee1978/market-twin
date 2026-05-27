import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

/**
 * LLM Search Visibility Audit (Phase 2.2a).
 *
 * Probes major answer-engines (Claude / GPT / Gemini) with brand-
 * relevant questions in the target market and parses the responses
 * to measure how visible the brand is when users ask AI for
 * recommendations.
 *
 * Why this matters: traditional Naver/Google SERP rank is becoming
 * less important as consumers ask ChatGPT/Claude/Perplexity for
 * "best X" recommendations directly. If you're not mentioned by
 * those answer-engines, you're invisible to that growing share of
 * discovery traffic.
 *
 * Output:
 *   - visibility_score (0..100): aggregate across LLMs × queries
 *   - per_llm breakdown: brand-mention rate, average position, competitors
 *   - top_competitors: who's getting mentioned instead
 *   - top_sources: which domains the LLMs cite (your link-building target)
 *
 * Cost: ~5 queries × 3 LLMs × ~1500 tokens = ~$0.10 per audit.
 * Cached in mrai_llm_visibility_audits; re-run on demand.
 */

export type LLMName = "claude" | "gpt" | "gemini";

export type PerQueryProbe = {
  query: string;
  response_text: string;
  brand_mentioned: boolean;
  brand_position: number | null; // 0-1, earlier = better
  competitors_mentioned: string[];
  cited_domains: string[];
};

export type PerLLMResult = {
  llm: LLMName;
  queries: PerQueryProbe[];
  brand_mention_rate: number; // 0..1
  avg_brand_position: number | null;
};

export type LLMVisibilityResult = {
  visibility_score: number; // 0..100
  per_llm: PerLLMResult[];
  test_queries: string[];
  top_competitors: Array<{ name: string; mentions: number }>;
  top_sources: Array<{ domain: string; mentions: number }>;
  llm_input_tokens: number;
  llm_output_tokens: number;
  cost_usd: number;
  ms: number;
};

const CLAUDE_INPUT_PER_MTOK = 3.0;
const CLAUDE_OUTPUT_PER_MTOK = 15.0;
const GPT_INPUT_PER_MTOK = 2.5; // gpt-4o approx
const GPT_OUTPUT_PER_MTOK = 10.0;
const GEMINI_INPUT_PER_MTOK = 0.5; // gemini-flash approx
const GEMINI_OUTPUT_PER_MTOK = 1.5;

const COMPETITOR_HINT_WORDS = [
  // Generic competitor noun classes — extend as needed
  "brand",
  "company",
  "label",
  "maker",
  "retailer",
  "store",
];

export async function runLLMVisibilityAudit(input: {
  brandName: string;
  brandCategory: string;
  marketCountry: string | null;
  /** Optional override of test queries. If empty, queries are LLM-generated. */
  customQueries?: string[];
  /** Locale for the queries themselves (defaults to market language). */
  queryLocale?: "ko" | "en";
}): Promise<LLMVisibilityResult> {
  const t0 = Date.now();
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY not set");
  }

  // 1. Generate (or use) test queries — 5-7 natural questions a user
  //    might ask an AI when shopping in this category + market.
  const testQueries = input.customQueries?.length
    ? input.customQueries
    : await generateTestQueries({
        brandCategory: input.brandCategory,
        marketCountry: input.marketCountry,
        locale: input.queryLocale ?? (input.marketCountry === "KR" ? "ko" : "en"),
      });

  // 2. Probe each LLM in parallel
  const [claudeRes, gptRes, geminiRes] = await Promise.allSettled([
    probeClaude(testQueries, input.brandName),
    probeGPT(testQueries, input.brandName),
    probeGemini(testQueries, input.brandName),
  ]);
  type ProbeOutcome = {
    queries: PerQueryProbe[];
    inputTokens: number;
    outputTokens: number;
  };
  const settled = (
    res: PromiseSettledResult<ProbeOutcome>,
  ): ProbeOutcome => {
    if (res.status === "fulfilled") return res.value;
    console.warn("[llm-visibility] probe failed:", res.reason);
    return { queries: [], inputTokens: 0, outputTokens: 0 };
  };
  const claudeOut = settled(claudeRes);
  const gptOut = settled(gptRes);
  const geminiOut = settled(geminiRes);

  const perLLM: PerLLMResult[] = [
    summarizeLLM("claude", claudeOut.queries),
    summarizeLLM("gpt", gptOut.queries),
    summarizeLLM("gemini", geminiOut.queries),
  ];

  // 3. Aggregate competitors + sources across all probes
  const competitorCounts = new Map<string, number>();
  const sourceCounts = new Map<string, number>();
  for (const r of perLLM) {
    for (const q of r.queries) {
      for (const c of q.competitors_mentioned) {
        const k = c.trim();
        if (!k) continue;
        competitorCounts.set(k, (competitorCounts.get(k) ?? 0) + 1);
      }
      for (const d of q.cited_domains) {
        const k = d.trim().toLowerCase();
        if (!k) continue;
        sourceCounts.set(k, (sourceCounts.get(k) ?? 0) + 1);
      }
    }
  }
  const topCompetitors = Array.from(competitorCounts.entries())
    .map(([name, mentions]) => ({ name, mentions }))
    .sort((a, b) => b.mentions - a.mentions)
    .slice(0, 10);
  const topSources = Array.from(sourceCounts.entries())
    .map(([domain, mentions]) => ({ domain, mentions }))
    .sort((a, b) => b.mentions - a.mentions)
    .slice(0, 10);

  // 4. Aggregate visibility score
  //    50% mention-rate component (avg across LLMs)
  //    50% position component (1 - avg position; closer to start = better)
  const validLLMs = perLLM.filter((r) => r.queries.length > 0);
  const avgMentionRate =
    validLLMs.length > 0
      ? validLLMs.reduce((acc, r) => acc + r.brand_mention_rate, 0) /
        validLLMs.length
      : 0;
  const positionScores = validLLMs
    .map((r) => r.avg_brand_position)
    .filter((p): p is number => p !== null);
  const avgPositionScore =
    positionScores.length > 0
      ? 1 -
        positionScores.reduce((a, b) => a + b, 0) / positionScores.length
      : 0;
  const visibilityScore = Math.round(
    (0.7 * avgMentionRate + 0.3 * avgPositionScore) * 100,
  );

  // 5. Cost calc
  const cost =
    (claudeOut.inputTokens / 1_000_000) * CLAUDE_INPUT_PER_MTOK +
    (claudeOut.outputTokens / 1_000_000) * CLAUDE_OUTPUT_PER_MTOK +
    (gptOut.inputTokens / 1_000_000) * GPT_INPUT_PER_MTOK +
    (gptOut.outputTokens / 1_000_000) * GPT_OUTPUT_PER_MTOK +
    (geminiOut.inputTokens / 1_000_000) * GEMINI_INPUT_PER_MTOK +
    (geminiOut.outputTokens / 1_000_000) * GEMINI_OUTPUT_PER_MTOK;

  return {
    visibility_score: visibilityScore,
    per_llm: perLLM,
    test_queries: testQueries,
    top_competitors: topCompetitors,
    top_sources: topSources,
    llm_input_tokens:
      claudeOut.inputTokens + gptOut.inputTokens + geminiOut.inputTokens,
    llm_output_tokens:
      claudeOut.outputTokens + gptOut.outputTokens + geminiOut.outputTokens,
    cost_usd: Math.round(cost * 10000) / 10000,
    ms: Date.now() - t0,
  };
}

// ────────────────────────────────────────────────────────────────
// Test query generation
// ────────────────────────────────────────────────────────────────

async function generateTestQueries(input: {
  brandCategory: string;
  marketCountry: string | null;
  locale: "ko" | "en";
}): Promise<string[]> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const market = input.marketCountry ?? "global";
  const system =
    "Generate 6 natural questions a consumer might ask an AI assistant " +
    "when looking for products in a category — questions that should " +
    "surface brand recommendations.\n\n" +
    "Rules:\n" +
    "- Output JSON ONLY: { \"queries\": [\"...\", \"...\", ...] }\n" +
    "- Mix: 2 broad (\"best X\"), 2 specific (\"X for Y use-case\"), " +
    "2 comparative (\"X vs Y\" or \"what's the difference between X and Y\").\n" +
    "- Use the user's language (Korean if KR market, else English).\n" +
    "- Don't mention any specific brand in the queries — we're testing " +
    "which brand the LLMs recommend on their own.";
  const user = `Category: ${input.brandCategory}\nMarket: ${market}\nLanguage: ${input.locale === "ko" ? "Korean" : "English"}`;
  const resp = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 800,
    system,
    messages: [{ role: "user", content: user }],
  });
  const text = resp.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .filter(Boolean)
    .join("")
    .trim();
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return defaultQueries(input.brandCategory, input.locale);
  try {
    const parsed = JSON.parse(m[0]) as { queries?: string[] };
    const qs = (parsed.queries ?? []).filter(
      (q) => typeof q === "string" && q.trim().length > 5,
    );
    return qs.length >= 3 ? qs : defaultQueries(input.brandCategory, input.locale);
  } catch {
    return defaultQueries(input.brandCategory, input.locale);
  }
}

function defaultQueries(category: string, locale: "ko" | "en"): string[] {
  if (locale === "ko") {
    return [
      `${category} 추천 브랜드`,
      `가성비 좋은 ${category}`,
      `${category} 어디서 사야 좋아?`,
    ];
  }
  return [
    `best ${category} brands`,
    `affordable ${category} recommendations`,
    `where to buy quality ${category}`,
  ];
}

// ────────────────────────────────────────────────────────────────
// Per-LLM probing
// ────────────────────────────────────────────────────────────────

const PROBE_SYSTEM =
  "You are an AI shopping assistant. Recommend specific real brands in " +
  "the user's market. List 4-6 brand names with one-line descriptions. " +
  "If you cite sources (URLs), include them inline. Be concrete — no " +
  "vague 'many options exist' answers.";

async function probeClaude(
  queries: string[],
  brandName: string,
): Promise<{ queries: PerQueryProbe[]; inputTokens: number; outputTokens: number }> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  let inputTokens = 0;
  let outputTokens = 0;
  const results: PerQueryProbe[] = [];
  for (const q of queries) {
    try {
      const resp = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 800,
        system: PROBE_SYSTEM,
        messages: [{ role: "user", content: q }],
      });
      inputTokens += resp.usage.input_tokens;
      outputTokens += resp.usage.output_tokens;
      const text = resp.content
        .map((b) => (b.type === "text" ? b.text : ""))
        .join("");
      results.push(parseProbeResponse(q, text, brandName));
    } catch (e) {
      console.warn("[llm-visibility/claude] query failed:", e);
    }
  }
  return { queries: results, inputTokens, outputTokens };
}

async function probeGPT(
  queries: string[],
  brandName: string,
): Promise<{ queries: PerQueryProbe[]; inputTokens: number; outputTokens: number }> {
  if (!process.env.OPENAI_API_KEY) {
    return { queries: [], inputTokens: 0, outputTokens: 0 };
  }
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  let inputTokens = 0;
  let outputTokens = 0;
  const results: PerQueryProbe[] = [];
  for (const q of queries) {
    try {
      const resp = await client.chat.completions.create({
        model: "gpt-4o",
        max_tokens: 800,
        messages: [
          { role: "system", content: PROBE_SYSTEM },
          { role: "user", content: q },
        ],
      });
      inputTokens += resp.usage?.prompt_tokens ?? 0;
      outputTokens += resp.usage?.completion_tokens ?? 0;
      const text = resp.choices[0]?.message?.content ?? "";
      results.push(parseProbeResponse(q, text, brandName));
    } catch (e) {
      console.warn("[llm-visibility/gpt] query failed:", e);
    }
  }
  return { queries: results, inputTokens, outputTokens };
}

async function probeGemini(
  queries: string[],
  brandName: string,
): Promise<{ queries: PerQueryProbe[]; inputTokens: number; outputTokens: number }> {
  const apiKey = process.env.GOOGLE_API_KEY ?? process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { queries: [], inputTokens: 0, outputTokens: 0 };
  }
  let inputTokens = 0;
  let outputTokens = 0;
  const results: PerQueryProbe[] = [];
  for (const q of queries) {
    try {
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: PROBE_SYSTEM }] },
            contents: [{ role: "user", parts: [{ text: q }] }],
          }),
        },
      );
      if (!resp.ok) {
        console.warn("[llm-visibility/gemini] HTTP", resp.status);
        continue;
      }
      const j = (await resp.json()) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
        }>;
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
      };
      inputTokens += j.usageMetadata?.promptTokenCount ?? 0;
      outputTokens += j.usageMetadata?.candidatesTokenCount ?? 0;
      const text = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      results.push(parseProbeResponse(q, text, brandName));
    } catch (e) {
      console.warn("[llm-visibility/gemini] query failed:", e);
    }
  }
  return { queries: results, inputTokens, outputTokens };
}

// ────────────────────────────────────────────────────────────────
// Response parsing
// ────────────────────────────────────────────────────────────────

function parseProbeResponse(
  query: string,
  text: string,
  brandName: string,
): PerQueryProbe {
  const lowerText = text.toLowerCase();
  const lowerBrand = brandName.toLowerCase();
  const brandIdx = lowerText.indexOf(lowerBrand);
  const brandMentioned = brandIdx >= 0;
  const brandPosition =
    brandIdx >= 0 && text.length > 0 ? brandIdx / text.length : null;

  // Heuristic competitor extraction — pull capitalized multi-word terms
  // and TitleCase tokens that look like brand names. Filter generic
  // English words.
  const competitorMentions = extractBrandCandidates(text, brandName);

  // URLs / domains
  const urlRe = /https?:\/\/([^\s)>"']+)/gi;
  const domains = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = urlRe.exec(text)) !== null) {
    const u = m[1].split("/")[0].toLowerCase().replace(/^www\./, "");
    if (u) domains.add(u);
  }

  return {
    query,
    response_text: text.slice(0, 2000),
    brand_mentioned: brandMentioned,
    brand_position: brandPosition,
    competitors_mentioned: competitorMentions,
    cited_domains: Array.from(domains),
  };
}

function extractBrandCandidates(text: string, ownBrand: string): string[] {
  // Match "Title Cased Words" patterns of 1-3 words, also Korean
  // 한글 + 영문 mixed words. Drop the own brand and obvious non-brand
  // common nouns.
  const candidates = new Set<string>();
  const re = /([A-Z][a-zA-Z0-9&'-]+(?:\s[A-Z][a-zA-Z0-9&'-]+){0,2})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const c = m[1].trim();
    if (c.length < 2 || c.length > 40) continue;
    if (c.toLowerCase() === ownBrand.toLowerCase()) continue;
    // Filter generic words / sentence starters
    if (
      [
        "The",
        "This",
        "That",
        "These",
        "Those",
        "If",
        "When",
        "While",
        "It",
        "I",
        "And",
        "Or",
        "But",
        "For",
        "From",
        "With",
        "Without",
        "AI",
        "Brand",
        "Brands",
        "Best",
        "Top",
      ].includes(c)
    ) {
      continue;
    }
    if (COMPETITOR_HINT_WORDS.some((w) => c.toLowerCase() === w)) continue;
    candidates.add(c);
  }
  return Array.from(candidates).slice(0, 15);
}

function summarizeLLM(llm: LLMName, queries: PerQueryProbe[]): PerLLMResult {
  const total = queries.length;
  if (total === 0) {
    return {
      llm,
      queries: [],
      brand_mention_rate: 0,
      avg_brand_position: null,
    };
  }
  const mentions = queries.filter((q) => q.brand_mentioned).length;
  const positions = queries
    .map((q) => q.brand_position)
    .filter((p): p is number => p !== null);
  return {
    llm,
    queries,
    brand_mention_rate: mentions / total,
    avg_brand_position:
      positions.length > 0
        ? positions.reduce((a, b) => a + b, 0) / positions.length
        : null,
  };
}

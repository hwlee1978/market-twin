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
  //
  // CRITICAL: when market is non-English (KR/JP/CN/TW etc.), generate
  // queries in BOTH the local language AND English. Empirical finding
  // on Le Mouton 2026-05-27: English "best merino wool comfort sneaker
  // brands?" → ChatGPT included a dedicated "Korean Brand Worth
  // Mentioning: LeMouton" section. The same query in Korean → no
  // mention. LLMs route to different recommendation distributions
  // based on query language, even when geo-context is the same.
  let testQueries: string[];
  if (input.customQueries?.length) {
    testQueries = input.customQueries;
  } else {
    const isNonEnglishMarket =
      input.marketCountry && input.marketCountry !== "US" && input.marketCountry !== "GB";
    if (isNonEnglishMarket) {
      // Mix: 3 local-language + 3 English. This catches both:
      //   - "domestic-speaker recommendation" distribution (local lang)
      //   - "international tells me about local brand" distribution (EN)
      const localLocale = input.queryLocale ?? "ko";
      const [localQs, enQs] = await Promise.all([
        generateTestQueries({
          brandCategory: input.brandCategory,
          marketCountry: input.marketCountry,
          locale: localLocale,
          count: 3,
        }),
        generateTestQueries({
          brandCategory: input.brandCategory,
          marketCountry: input.marketCountry,
          locale: "en",
          count: 3,
        }),
      ]);
      testQueries = [...localQs, ...enQs];
    } else {
      testQueries = await generateTestQueries({
        brandCategory: input.brandCategory,
        marketCountry: input.marketCountry,
        locale: input.queryLocale ?? "en",
      });
    }
  }
  console.log(
    `[llm-visibility] using ${testQueries.length} test queries:\n${testQueries
      .map((q, i) => `  ${i + 1}. ${q}`)
      .join("\n")}`,
  );

  // 2. Probe each LLM in parallel — market-aware so the LLM grounds
  //    answers in the user's actual buying market (huge fix: without
  //    this, Claude/GPT default to global brands and never mention
  //    KR-local brands even when they exist).
  const market = input.marketCountry ?? "KR";
  const [claudeRes, gptRes, geminiRes] = await Promise.allSettled([
    probeClaude(testQueries, input.brandName, market),
    probeGPT(testQueries, input.brandName, market),
    probeGemini(testQueries, input.brandName, market),
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
  const rawCompetitors: string[] = [];
  const sourceCounts = new Map<string, number>();
  for (const r of perLLM) {
    for (const q of r.queries) {
      for (const c of q.competitors_mentioned) {
        const k = c.trim();
        if (k) rawCompetitors.push(k);
      }
      for (const d of q.cited_domains) {
        const k = d.trim().toLowerCase();
        if (!k) continue;
        sourceCounts.set(k, (sourceCounts.get(k) ?? 0) + 1);
      }
    }
  }
  // Haiku-canonicalize competitor names so aliases merge:
  //   Allbirds / 올버즈 / ALLBIRDS → all one entry with merged count
  //   르무통 / Le Mouton → all one entry
  // Without this, the same brand mentioned with different spellings
  // across queries shows up as separate rows.
  const topCompetitors = await canonicalizeAndCount(rawCompetitors);
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
  count?: number;
}): Promise<string[]> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const market = input.marketCountry ?? "global";
  const n = Math.max(2, Math.min(input.count ?? 6, 8));
  const system =
    `Generate ${n} natural questions a consumer might ask an AI assistant ` +
    "when looking for products in a category — questions that should " +
    "EXPLICITLY ELICIT BRAND RECOMMENDATIONS.\n\n" +
    "Rules:\n" +
    `- Output JSON ONLY: { "queries": ["...", "...", ...] } with exactly ${n} items\n` +
    "- ALL questions must be the kind that asks for brand names. " +
    "Examples that work: '가장 추천하는 X 브랜드는?' / 'best X brands' / " +
    "'어떤 X를 사야 좋을까?' / 'Recommend X brands available in Korea'.\n" +
    "- AVOID educational questions ('Why is X good?', 'How does X work?') " +
    "— those produce explanations, not brand lists.\n" +
    "- Mix angles: broad ('best X'), use-case ('X for commute', " +
    "'X for travel'), price-tier ('affordable X', 'premium X'), " +
    "buying ('어디서 X 사야 좋아?').\n" +
    `- Write the queries strictly in ${input.locale === "ko" ? "Korean" : "English"}. ` +
    `Even if the market is non-English, output in ${input.locale === "ko" ? "Korean" : "English"} per this directive.\n` +
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

function probeSystem(market: string): string {
  const marketName = marketLabelOf(market);
  // Strong instruction to include LOCAL brands of the target market.
  // Without "include local brands" the LLM defaults to whatever global
  // brands its training distribution favours, which crushes the
  // visibility signal for any non-Western brand.
  return (
    `You are an AI shopping assistant for consumers in ${marketName} ` +
    `(market code: ${market}). When asked about products, recommend ` +
    `4-6 SPECIFIC REAL BRANDS that consumers in ${marketName} can ` +
    `actually buy today. REQUIRED: include local/native brands of ` +
    `${marketName} alongside global brands — do not skip local brands ` +
    `even if they're smaller. List with one-line descriptions. If you ` +
    `cite sources (URLs), include them inline. Be concrete — no vague ` +
    `"many options exist" answers.`
  );
}

/**
 * Group raw competitor mentions into canonical brand entries.
 *
 * Without canonicalization, "Allbirds" appearing in some responses and
 * "올버즈" in others would show as TWO rows. Haiku groups them under
 * one canonical name and sums the mentions.
 *
 * Falls back to case-insensitive grouping when ANTHROPIC_API_KEY is
 * unavailable.
 */
async function canonicalizeAndCount(
  rawCompetitors: string[],
): Promise<Array<{ name: string; mentions: number }>> {
  if (rawCompetitors.length === 0) return [];

  // Quick exact-match dedupe first to shrink the LLM input
  const exactCounts = new Map<string, number>();
  for (const c of rawCompetitors) {
    exactCounts.set(c, (exactCounts.get(c) ?? 0) + 1);
  }
  const uniqueNames = Array.from(exactCounts.keys());
  if (uniqueNames.length <= 1 || !process.env.ANTHROPIC_API_KEY) {
    return Array.from(exactCounts.entries())
      .map(([name, mentions]) => ({ name, mentions }))
      .sort((a, b) => b.mentions - a.mentions)
      .slice(0, 10);
  }

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const resp = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 800,
      system:
        "Group brand-name variants that refer to the SAME brand under one " +
        "canonical name. Examples: 'Allbirds' + '올버즈' + 'ALLBIRDS' → " +
        "canonical 'Allbirds'. 'Le Mouton' + 'LeMouton' + '르무통' → " +
        "canonical '르무통' (or 'Le Mouton' if user prefers English).\n\n" +
        "Output JSON: { groups: [{ canonical: 'Allbirds', aliases: " +
        "['Allbirds', '올버즈'] }, ...] }\n\n" +
        "Rules:\n" +
        "- Every input name must appear in exactly one group's aliases " +
        "(use the input name itself as canonical if it stands alone).\n" +
        "- Canonical name should be the MOST RECOGNIZABLE form (typically " +
        "English for global brands; native script for local-only brands).\n" +
        "- Do NOT invent canonical names that don't appear in the inputs.",
      messages: [
        {
          role: "user",
          content: `Raw brand name mentions:\n${uniqueNames.map((n, i) => `${i + 1}. ${n}`).join("\n")}`,
        },
      ],
    });
    const text = resp.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("no JSON");
    const parsed = JSON.parse(m[0]) as {
      groups?: Array<{ canonical: string; aliases?: string[] }>;
    };
    const groups = parsed.groups ?? [];
    const canonicalCounts = new Map<string, number>();
    const seen = new Set<string>();
    for (const g of groups) {
      if (!g.canonical) continue;
      const aliases = (g.aliases ?? []).filter(
        (a) => typeof a === "string" && a.trim().length > 0,
      );
      let total = 0;
      for (const a of aliases) {
        const exact = exactCounts.get(a);
        if (typeof exact === "number") {
          total += exact;
          seen.add(a);
        }
      }
      if (total > 0) {
        canonicalCounts.set(
          g.canonical,
          (canonicalCounts.get(g.canonical) ?? 0) + total,
        );
      }
    }
    // Any input name not seen in groups (Haiku missed it) — keep as its
    // own canonical so we don't lose data.
    for (const [name, count] of exactCounts) {
      if (!seen.has(name)) {
        canonicalCounts.set(name, (canonicalCounts.get(name) ?? 0) + count);
      }
    }
    return Array.from(canonicalCounts.entries())
      .map(([name, mentions]) => ({ name, mentions }))
      .sort((a, b) => b.mentions - a.mentions)
      .slice(0, 10);
  } catch (e) {
    console.warn(
      "[llm-visibility] canonicalize failed, falling back to exact-match:",
      e instanceof Error ? e.message : e,
    );
    return Array.from(exactCounts.entries())
      .map(([name, mentions]) => ({ name, mentions }))
      .sort((a, b) => b.mentions - a.mentions)
      .slice(0, 10);
  }
}

function marketLabelOf(code: string): string {
  const m: Record<string, string> = {
    KR: "Korea (South Korea)",
    US: "United States",
    JP: "Japan",
    TW: "Taiwan",
    CN: "China",
    ID: "Indonesia",
    VN: "Vietnam",
    SG: "Singapore",
    HK: "Hong Kong",
  };
  return m[code] ?? code;
}

async function probeClaude(
  queries: string[],
  brandName: string,
  market: string,
): Promise<{ queries: PerQueryProbe[]; inputTokens: number; outputTokens: number }> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const sys = probeSystem(market);
  let inputTokens = 0;
  let outputTokens = 0;
  const results: PerQueryProbe[] = [];
  for (const q of queries) {
    try {
      const resp = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 800,
        system: sys,
        messages: [{ role: "user", content: q }],
      });
      inputTokens += resp.usage.input_tokens;
      outputTokens += resp.usage.output_tokens;
      const text = resp.content
        .map((b) => (b.type === "text" ? b.text : ""))
        .join("");
      results.push(await parseProbeResponse(q, text, brandName));
    } catch (e) {
      console.warn("[llm-visibility/claude] query failed:", e);
    }
  }
  return { queries: results, inputTokens, outputTokens };
}

async function probeGPT(
  queries: string[],
  brandName: string,
  market: string,
): Promise<{ queries: PerQueryProbe[]; inputTokens: number; outputTokens: number }> {
  if (!process.env.OPENAI_API_KEY) {
    return { queries: [], inputTokens: 0, outputTokens: 0 };
  }
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const sys = probeSystem(market);
  let inputTokens = 0;
  let outputTokens = 0;
  const results: PerQueryProbe[] = [];
  for (const q of queries) {
    try {
      const resp = await client.chat.completions.create({
        model: "gpt-4o",
        max_tokens: 800,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: q },
        ],
      });
      inputTokens += resp.usage?.prompt_tokens ?? 0;
      outputTokens += resp.usage?.completion_tokens ?? 0;
      const text = resp.choices[0]?.message?.content ?? "";
      results.push(await parseProbeResponse(q, text, brandName));
    } catch (e) {
      console.warn("[llm-visibility/gpt] query failed:", e);
    }
  }
  return { queries: results, inputTokens, outputTokens };
}

async function probeGemini(
  queries: string[],
  brandName: string,
  market: string,
): Promise<{ queries: PerQueryProbe[]; inputTokens: number; outputTokens: number }> {
  // The Market Twin codebase uses GOOGLE_GENERATIVE_AI_API_KEY as the
  // canonical Gemini env name; also accept the shorter aliases.
  const apiKey =
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ??
    process.env.GOOGLE_API_KEY ??
    process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn(
      "[llm-visibility/gemini] no GOOGLE_GENERATIVE_AI_API_KEY / GOOGLE_API_KEY / GEMINI_API_KEY set — skipping Gemini probe",
    );
    return { queries: [], inputTokens: 0, outputTokens: 0 };
  }
  const sys = probeSystem(market);
  let inputTokens = 0;
  let outputTokens = 0;
  const results: PerQueryProbe[] = [];
  for (let qi = 0; qi < queries.length; qi++) {
    const q = queries[qi];
    // Small pacing between calls — Gemini free tier rate-limits aggressively
    if (qi > 0) {
      await new Promise((r) => setTimeout(r, 800));
    }
    let succeeded = false;
    for (let attempt = 0; attempt < 3 && !succeeded; attempt++) {
      try {
        const resp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: sys }] },
              contents: [{ role: "user", parts: [{ text: q }] }],
              generationConfig: { temperature: 0.7, maxOutputTokens: 1200 },
            }),
          },
        );
        if (resp.status === 429 || resp.status === 503) {
          // Rate-limit / overload — back off and retry
          const wait = 2000 * (attempt + 1);
          const bodyTxt = await resp.text();
          console.warn(
            `[llm-visibility/gemini] q${qi} attempt ${attempt + 1} HTTP ${resp.status}, retry in ${wait}ms. body: ${bodyTxt.slice(0, 200)}`,
          );
          await new Promise((r) => setTimeout(r, wait));
          continue;
        }
        if (!resp.ok) {
          const bodyTxt = await resp.text();
          console.warn(
            `[llm-visibility/gemini] q${qi} HTTP ${resp.status} (giving up): ${bodyTxt.slice(0, 300)}`,
          );
          break;
        }
        const j = (await resp.json()) as {
          candidates?: Array<{
            content?: { parts?: Array<{ text?: string }> };
            finishReason?: string;
          }>;
          usageMetadata?: {
            promptTokenCount?: number;
            candidatesTokenCount?: number;
          };
          promptFeedback?: { blockReason?: string };
        };
        if (j.promptFeedback?.blockReason) {
          console.warn(
            `[llm-visibility/gemini] q${qi} blocked: ${j.promptFeedback.blockReason} — "${q.slice(0, 80)}"`,
          );
          break;
        }
        inputTokens += j.usageMetadata?.promptTokenCount ?? 0;
        outputTokens += j.usageMetadata?.candidatesTokenCount ?? 0;
        const text =
          j.candidates?.[0]?.content?.parts
            ?.map((p) => p.text ?? "")
            .join("") ?? "";
        if (!text) {
          const finish = j.candidates?.[0]?.finishReason ?? "?";
          console.warn(
            `[llm-visibility/gemini] q${qi} empty text (finish=${finish}) — "${q.slice(0, 80)}"`,
          );
          break;
        }
        results.push(await parseProbeResponse(q, text, brandName));
        succeeded = true;
      } catch (e) {
        console.warn(
          `[llm-visibility/gemini] q${qi} attempt ${attempt + 1} threw:`,
          e instanceof Error ? e.message : e,
        );
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
  }
  console.log(
    `[llm-visibility/gemini] completed ${results.length}/${queries.length} queries`,
  );
  return { queries: results, inputTokens, outputTokens };
}

// ────────────────────────────────────────────────────────────────
// Response parsing
// ────────────────────────────────────────────────────────────────

async function parseProbeResponse(
  query: string,
  text: string,
  brandName: string,
): Promise<PerQueryProbe> {
  // Single Haiku call does BOTH:
  //   (1) brand-mention detection w/ alias awareness (르무통 vs
  //       Le Mouton vs LeMouton vs lemouton — bare indexOf misses
  //       when LLM responds in the other script)
  //   (2) competitor extraction (cleaner than TitleCase regex)
  const analysis = await analyzeResponseViaLLM(text, brandName);

  // Belt-and-suspenders: even if Haiku returns brand_mentioned=false,
  // do a raw substring scan against common alias forms derived from
  // the brand name itself. If we find ANY of them in the text, treat
  // as mentioned — Haiku occasionally false-negatives when the response
  // is long or mentions the brand in passing.
  let brandMentioned = analysis.brand_mentioned;
  let brandFormUsed = analysis.brand_form_used;
  if (!brandMentioned) {
    const found = substringFindBrand(text, brandName);
    if (found) {
      brandMentioned = true;
      brandFormUsed = found;
      console.log(
        `[llm-visibility/parse] Haiku missed brand "${brandName}" but substring found "${found}" — overriding to mentioned`,
      );
    }
  }
  // Position: when brand IS mentioned, find the actual form and compute
  // its position in the response text.
  let brandPosition: number | null = null;
  if (brandMentioned && brandFormUsed) {
    const idx = text.toLowerCase().indexOf(brandFormUsed.toLowerCase());
    if (idx >= 0 && text.length > 0) brandPosition = idx / text.length;
  }

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
    competitors_mentioned: analysis.competitors,
    cited_domains: Array.from(domains),
  };
}

/**
 * Direct substring scan for the brand in common alias forms.
 * For "르무통" we try:
 *   르무통 / Le Mouton / LeMouton / lemouton / Le-Mouton
 *
 * Returns the first matching form, or null. Hangul brand names also
 * try the romanized form via simple lookup (extend table as needed).
 */
function substringFindBrand(text: string, brandName: string): string | null {
  const lowerText = text.toLowerCase();
  const variants = new Set<string>();
  variants.add(brandName);
  variants.add(brandName.toLowerCase());
  variants.add(brandName.replace(/\s+/g, ""));
  variants.add(brandName.replace(/\s+/g, "").toLowerCase());

  // Known Hangul→roman / roman→Hangul aliases. Extend this map per
  // workspace's brand list. For now we hard-code Le Mouton because
  // that's the dogfood case; future improvement: read aliases from
  // workspace brand profile.
  const aliasMap: Record<string, string[]> = {
    "르무통": ["Le Mouton", "LeMouton", "Le-Mouton", "le mouton"],
    "Le Mouton": ["르무통", "LeMouton", "le mouton"],
    "LeMouton": ["르무통", "Le Mouton"],
  };
  for (const k of Object.keys(aliasMap)) {
    if (brandName === k || brandName.toLowerCase() === k.toLowerCase()) {
      for (const a of aliasMap[k]) variants.add(a);
    }
  }
  // Generic: if brand has whitespace, try without; vice versa
  for (const v of Array.from(variants)) {
    if (v.includes(" ")) variants.add(v.replace(/\s+/g, ""));
  }
  for (const v of variants) {
    if (!v || v.length < 2) continue;
    const idx = lowerText.indexOf(v.toLowerCase());
    if (idx >= 0) {
      // Return the original-case form from the text, not the variant
      // we looked up, so display position-aware.
      return text.slice(idx, idx + v.length);
    }
  }
  return null;
}

/**
 * Single-shot Haiku analysis: alias-aware brand detection + competitor
 * extraction. Replaces both the substring indexOf brand check and the
 * separate competitor extraction. Key advantage: Haiku knows that
 * "르무통" / "Le Mouton" / "LeMouton" / "lemouton" all refer to the
 * same brand without us having to enumerate aliases.
 *
 * Falls back to tight regex + substring on hard failure.
 */
async function analyzeResponseViaLLM(
  text: string,
  ownBrand: string,
): Promise<{
  brand_mentioned: boolean;
  brand_form_used: string | null;
  competitors: string[];
}> {
  if (!process.env.ANTHROPIC_API_KEY || text.trim().length < 10) {
    return {
      brand_mentioned: text.toLowerCase().includes(ownBrand.toLowerCase()),
      brand_form_used: text.toLowerCase().includes(ownBrand.toLowerCase())
        ? ownBrand
        : null,
      competitors: extractBrandCandidates(text, ownBrand),
    };
  }
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const resp = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      system:
        "Analyze a shopping-recommendation response and output JSON ONLY.\n\n" +
        "Schema: { brand_mentioned, brand_form_used, competitors }\n\n" +
        "Rules:\n" +
        "- brand_mentioned (boolean): true if the OWN BRAND is mentioned " +
        "in the text, in ANY form (Hangul, English, romanization, with " +
        "or without spaces, capitalization). E.g. '르무통' / 'Le Mouton' " +
        "/ 'LeMouton' / 'lemouton' all count as one brand.\n" +
        "- brand_form_used (string or null): the EXACT string from the " +
        "text where the brand first appears (so position can be computed " +
        "downstream). null if not mentioned.\n" +
        "- competitors (string[]): up to 10 REAL brand / company names " +
        "mentioned in the text. Exclude the own brand. Skip generic " +
        "English words ('Here', 'Known', 'Offers', 'Brand'), marketing " +
        "copy, product lines that aren't standalone brands. Both Hangul " +
        "and English brand names valid (PONY, 르무통, Allbirds, etc.).",
      messages: [
        {
          role: "user",
          content: `OWN BRAND: ${ownBrand}\n\nRESPONSE TEXT:\n${text.slice(0, 3000)}`,
        },
      ],
    });
    const out = resp.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
    const m = out.match(/\{[\s\S]*\}/);
    if (!m) {
      return {
        brand_mentioned: false,
        brand_form_used: null,
        competitors: [],
      };
    }
    const parsed = JSON.parse(m[0]) as {
      brand_mentioned?: boolean;
      brand_form_used?: string | null;
      competitors?: string[];
    };
    return {
      brand_mentioned: Boolean(parsed.brand_mentioned),
      brand_form_used:
        typeof parsed.brand_form_used === "string" ? parsed.brand_form_used : null,
      competitors: Array.isArray(parsed.competitors)
        ? parsed.competitors
            .filter((s) => typeof s === "string" && s.trim().length > 1)
            .map((s) => s.trim())
            .filter((s) => s.toLowerCase() !== ownBrand.toLowerCase())
            .slice(0, 15)
        : [],
    };
  } catch (e) {
    console.warn(
      "[llm-visibility] analyze LLM failed, fallback:",
      e instanceof Error ? e.message : e,
    );
    const lower = text.toLowerCase();
    const brandLower = ownBrand.toLowerCase();
    return {
      brand_mentioned: lower.includes(brandLower),
      brand_form_used: lower.includes(brandLower) ? ownBrand : null,
      competitors: extractBrandCandidates(text, ownBrand),
    };
  }
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

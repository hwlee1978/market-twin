/**
 * Market profile generation — single LLM call producing structured
 * market intelligence (competitors, channels, regulatory, pricing
 * benchmarks, GTM strategy) for the recommended country.
 *
 * Lives in its own module because:
 *   - Runs ONCE per ensemble (not per-sim) after recommendation lands
 *   - Uses synthesis-tier model (same as ensemble-narrative)
 *   - Best-effort: failure is non-fatal — the rest of the report still
 *     ships, the market-profile page just gets skipped
 */

import { getLLMProvider } from "@/lib/llm";
import {
  buildMarketSizeQuery,
  tavilySearch,
  type TavilyResult,
} from "@/lib/market-research/tavily";
import { MarketProfileSchema, type MarketProfile, type ProjectInput } from "./schemas";
import { marketProfilePrompt, MARKET_PROFILE_SYSTEM } from "./prompts";
import { getDisplayPriceCents } from "./pricing-sensitivity";
import type { EnsembleAggregate } from "./ensemble";

export interface BuildMarketProfileOpts {
  input: ProjectInput;
  aggregate: EnsembleAggregate;
  locale: "ko" | "en";
}

export interface BuildMarketProfileResult {
  profile?: MarketProfile;
  /**
   * Failure reason — populated when profile is undefined. Lets callers
   * surface the actual error to the user instead of opaque "generation
   * failed". Original best-effort behaviour preserved (caller can
   * still ignore the reason and treat as non-fatal).
   */
  error?: string;
}

export async function buildMarketProfile(
  opts: BuildMarketProfileOpts,
): Promise<BuildMarketProfileResult> {
  const recommendedCountry = opts.aggregate.recommendation?.country;
  if (!recommendedCountry) {
    return { error: "no recommendation country on aggregate" };
  }

  // Pull the recommended country's stats out of the aggregate so we
  // can pass top objections / trust factors / channels as grounding
  // context to the prompt. The LLM uses these to anchor its output
  // to the actual persona signal instead of free-associating.
  const countryStats = opts.aggregate.countryStats.find(
    (c) => c.country.toUpperCase() === recommendedCountry.toUpperCase(),
  );
  const topObjections = (countryStats?.detail?.topObjections ?? []).map((o) => o.text);
  const topTrustFactors = (countryStats?.detail?.topTrustFactors ?? []).map((t) => t.text);
  // Channel mentions are aggregated globally (not per-country) so we
  // pass the overall top — still a useful grounding signal because
  // the recommended country dominates the persona pool by definition.
  const topChannels = (opts.aggregate.personas?.channelMentions ?? [])
    .slice(0, 8)
    .map((c) => c.channel);

  // Anchor `yourPosition` on the SAME price the dashboard headline
  // shows — curve-revenue-max-corrected when LLM rec was anchored on
  // base price, otherwise the LLM rec. Without this the country-detail
  // narrative would talk about the user's input price ($32) while the
  // Pricing tab recommends $49.95, which reads as a contradiction.
  const pricing = opts.aggregate.pricing;
  const recommendedPriceCents = pricing
    ? getDisplayPriceCents(
        pricing.recommendedPriceCents,
        pricing.curve,
        pricing.curveRevenueMaxCents,
        pricing.recommendedPriceP75,
      ).displayCents
    : null;

  // Tavily web search to ground the marketSize estimate in real
  // sources. Best-effort: when TAVILY_API_KEY is unset OR the call
  // fails, marketSnippets ends up empty and the prompt falls back to
  // LLM-only generation (same behaviour as before this stage existed).
  // Cost: ~$0.01-0.03 per search; 1 search per ensemble.
  const tavilyResult = await tavilySearch({
    query: buildMarketSizeQuery({
      country: recommendedCountry,
      category: opts.input.category,
      productName: opts.input.productName,
    }),
    searchDepth: "advanced",
    maxResults: 5,
    includeAnswer: true,
  });
  const marketSnippets: TavilyResult[] = tavilyResult?.results ?? [];
  if (tavilyResult) {
    console.log(
      `[market profile] tavily: ${marketSnippets.length} snippets for ${recommendedCountry}/${opts.input.category}`,
    );
  } else if (process.env.TAVILY_API_KEY) {
    // Key was set but call failed — log so the operator knows the
    // fallback path triggered for a non-key reason (rate limit, network).
    console.warn(`[market profile] tavily call returned null; falling back to LLM-only marketSize`);
  }

  const prompt = marketProfilePrompt(opts.input, recommendedCountry, {
    consensusPercent: opts.aggregate.recommendation.consensusPercent,
    countryFinalScore: countryStats?.finalScore.mean ?? 0,
    topObjections,
    topTrustFactors,
    topChannels,
    recommendedPriceCents,
    locale: opts.locale,
    marketSnippets,
  });

  // Synthesis-tier model — needs strong reasoning to surface real
  // competitor names + regulatory specifics rather than fabricating.
  const llm = getLLMProvider({ stage: "synthesis" });
  try {
    const t0 = Date.now();
    const res = await llm.generate({
      system: MARKET_PROFILE_SYSTEM,
      prompt,
      // Loose JSON schema — the Zod parse downstream is the real
      // contract. Provider-side validation just needs to ensure
      // we get a country object back.
      jsonSchema: { type: "object", properties: { country: { type: "string" } } },
      temperature: 0.4,
      // 8192 because the full profile (3-6 competitors × 6 fields each
      // + regulatory barriers + channels in 3 tiers + cultural notes
      // + GTM strategy) easily fills 5K tokens in Korean. 4K was
      // truncating the JSON mid-string in some cases.
      maxTokens: 8192,
    });
    if (!res.json) {
      console.warn(
        `[market profile] LLM returned no JSON. Raw text head:`,
        (res.text ?? "").slice(0, 300),
      );
      return { error: "LLM returned no parseable JSON (possibly truncated)" };
    }
    const parsed = MarketProfileSchema.safeParse(res.json);
    if (!parsed.success) {
      const flat = parsed.error.flatten();
      console.warn("[market profile] schema validation failed:", flat);
      const fieldErrors = Object.keys(flat.fieldErrors).join(", ");
      return {
        error: `schema validation failed${fieldErrors ? ` (fields: ${fieldErrors})` : ""}`,
      };
    }
    // Attach the top Tavily citations to marketSize so the UI can
    // render "출처" links. We do this on our side (not from the LLM
    // JSON) because the LLM is unreliable at echoing URL strings
    // verbatim; passing them through programmatically guarantees the
    // cited URLs match what the LLM actually saw.
    const profile = parsed.data;
    if (marketSnippets.length > 0 && profile.marketSize) {
      profile.marketSize.citations = marketSnippets
        .slice(0, 3)
        .map((s) => ({ url: s.url, title: s.title }));
    }
    console.log(
      `[market profile] generated for ${recommendedCountry} · ` +
        `${profile.competitors?.length ?? 0} competitors · ` +
        `${(profile.regulatory?.barriers ?? []).length} regulatory barriers · ` +
        `${profile.marketSize?.citations?.length ?? 0} marketSize citations · ` +
        `${Date.now() - t0}ms`,
    );
    return { profile };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[market profile] LLM call failed:`, msg);
    return { error: `LLM call failed: ${msg}` };
  }
}

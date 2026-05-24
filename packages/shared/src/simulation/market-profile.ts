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
  buildMarketSizeQueryNative,
  tavilySearch,
  type TavilyResult,
} from "@/lib/market-research/tavily";
import {
  buildMarketSizeQuerySonar,
  sonarSearch,
} from "@/lib/market-research/sonar";
import { MarketProfileSchema, type MarketProfile, type ProjectInput } from "./schemas";
import { checkMarketSizeGrounding } from "./market-size-sanitizer";
import { marketProfilePrompt, MARKET_PROFILE_SYSTEM } from "./prompts";
import { getDisplayPriceCents } from "./pricing-sensitivity";
import { formatPrice } from "@/lib/format/price";
import {
  convertCurrencyCents,
  currencyForCountry,
} from "./competitor-prices";
import type { EnsembleAggregate } from "./ensemble";

export interface BuildMarketProfileOpts {
  input: ProjectInput;
  aggregate: EnsembleAggregate;
  locale: "ko" | "en";
  /**
   * Override the target country. Defaults to aggregate.recommendation.country
   * (winner). Useful when the orchestrator flagged Top 2 / displayMode "top2"
   * and we want a parallel market profile for the secondary candidate so the
   * exec can compare both before committing.
   */
  countryOverride?: string;
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
  const recommendedCountry =
    opts.countryOverride ?? opts.aggregate.recommendation?.country;
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
  // Cost: ~$0.01-0.03 per search; 1-2 searches per market-profile call.
  //
  // English query always runs (covers Reuters / Bloomberg / FT-class
  // sources that publish globally regardless of target market). For
  // non-English-dominant markets (JP/CN/KR/TW/HK), a parallel native-
  // language query also runs and the results are merged — this fills
  // the gap identified in the Buldak/Shin/COSRX validation runs where
  // Tavily's English bias missed 라쿠텐 / @cosme / 샤오홍슈 / 네이버 IR
  // articles that drove K-product expansion stories.
  const englishQuery = buildMarketSizeQuery({
    country: recommendedCountry,
    category: opts.input.category,
    productName: opts.input.productName,
  });
  const nativeQuery = buildMarketSizeQueryNative({
    country: recommendedCountry,
    category: opts.input.category,
    productName: opts.input.productName,
  });
  // Sonar Pro runs in parallel with Tavily on the SAME stage. Sonar's
  // generative-search index surfaces the growth-trajectory synthesis
  // (Korea-IR-style "K-Beauty Germany +200% YoY 2024-2025" stories)
  // that Tavily's keyword retrieval underweights. Skipped when the
  // PERPLEXITY_API_KEY env var is unset — graceful fallback to the
  // Tavily-only path preserves all prior behavior.
  const sonarQuery = buildMarketSizeQuerySonar({
    country: recommendedCountry,
    category: opts.input.category,
    productName: opts.input.productName,
  });
  const [tavilyResult, tavilyNativeResult, sonarResult] = await Promise.all([
    tavilySearch({
      query: englishQuery,
      searchDepth: "advanced",
      maxResults: 5,
      includeAnswer: true,
    }),
    nativeQuery
      ? tavilySearch({
          query: nativeQuery,
          searchDepth: "advanced",
          maxResults: 5,
          includeAnswer: false,
        })
      : Promise.resolve(null),
    sonarSearch({ query: sonarQuery, model: "sonar-pro" }),
  ]);
  const englishSnippets = tavilyResult?.results ?? [];
  const nativeSnippets = tavilyNativeResult?.results ?? [];
  const sonarSnippets = sonarResult?.results ?? [];
  // Dedup on URL — same article occasionally surfaces in multiple
  // queries (Korea Herald publishes KO + EN versions, etc.). English
  // Tavily keeps its slot; native Tavily fills only URLs the English
  // pass missed; Sonar Pro fills only URLs neither Tavily call had.
  // Order matters — formatTrendContextBlock sorts by score afterwards
  // so dedup priority is about which copy of duplicated metadata to
  // keep, not visual order.
  const seenUrls = new Set(englishSnippets.map((r) => r.url));
  const nativeUnique = nativeSnippets.filter((r) => !seenUrls.has(r.url));
  nativeUnique.forEach((r) => seenUrls.add(r.url));
  const sonarUnique = sonarSnippets.filter((r) => !seenUrls.has(r.url));
  const marketSnippets: TavilyResult[] = [
    ...englishSnippets,
    ...nativeUnique,
    ...sonarUnique,
  ];
  if (tavilyResult || tavilyNativeResult || sonarResult) {
    console.log(
      `[market profile] grounding: ${englishSnippets.length}EN + ${nativeUnique.length}native + ${sonarUnique.length}sonar = ${marketSnippets.length} snippets for ${recommendedCountry}/${opts.input.category}`,
    );
  } else if (process.env.TAVILY_API_KEY || process.env.PERPLEXITY_API_KEY) {
    // Key was set on at least one provider but every call failed —
    // log so the operator knows fallback triggered for non-key reasons
    // (rate limit, network, provider outage).
    console.warn(`[market profile] all grounding calls returned null; falling back to LLM-only marketSize`);
  }

  // Pre-compute the launch price expressed in the recommended target
  // market's local currency. Without this, the LLM tries to do its own
  // KRW→SGD conversion inside the `yourPosition` text and produces
  // inconsistent values within the same sentence ("≈ SGD 193 환산
  // 기준 약 SGD 145–150" — user-reported 2026-05-09). Server-side
  // computation uses the static FX snapshot in competitor-prices.ts,
  // which is good enough for ±10% accuracy on a recommendation that's
  // already ±20%. Null when the input currency or target currency
  // isn't in the snapshot table — the prompt falls back to old
  // behaviour without the pre-computed string.
  const targetCurrency = currencyForCountry(recommendedCountry);
  const launchPriceLocal =
    recommendedPriceCents != null && targetCurrency
      ? convertCurrencyCents(
          recommendedPriceCents,
          opts.input.currency,
          targetCurrency,
        )
      : null;
  const launchPriceLocalText =
    launchPriceLocal != null && targetCurrency
      ? `${formatPrice(recommendedPriceCents!, opts.input.currency)} (≈ ${formatPrice(launchPriceLocal, targetCurrency)})`
      : null;

  const prompt = marketProfilePrompt(opts.input, recommendedCountry, {
    consensusPercent: opts.aggregate.recommendation.consensusPercent,
    countryFinalScore: countryStats?.finalScore.mean ?? 0,
    topObjections,
    topTrustFactors,
    topChannels,
    recommendedPriceCents,
    launchPriceLocalText,
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
    // Output-side grounding check. Even with the "anchor on these
    // snippets" hard rule (prompts.ts:894), the LLM sometimes emits a
    // marketSize.estimateUsd that lands far outside the snippet
    // evidence — KOTRA-style readers then see both the inflated figure
    // and the cited sources without knowing they don't actually agree.
    // Attach the verdict so the UI can render a "출처와 차이 큼"
    // warning when status === "mismatch".
    if (profile.marketSize) {
      const grounding = checkMarketSizeGrounding(
        profile.marketSize.estimateUsd,
        marketSnippets,
      );
      profile.marketSize.groundingFlag = grounding;
      if (grounding.status === "mismatch") {
        console.warn(
          `[market profile] marketSize grounding mismatch for ${recommendedCountry}: ` +
            `claimed $${grounding.claimedValueUsdB}B vs snippet range ` +
            `$${grounding.snippetRangeUsdB.low}-${grounding.snippetRangeUsdB.high}B ` +
            `(direction: ${grounding.direction})`,
        );
      }
    }
    console.log(
      `[market profile] generated for ${recommendedCountry} · ` +
        `${profile.competitors?.length ?? 0} competitors · ` +
        `${(profile.regulatory?.barriers ?? []).length} regulatory barriers · ` +
        `${profile.marketSize?.citations?.length ?? 0} marketSize citations · ` +
        `marketSize grounding: ${profile.marketSize?.groundingFlag?.status ?? "n/a"} · ` +
        `${Date.now() - t0}ms`,
    );
    return { profile };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[market profile] LLM call failed:`, msg);
    return { error: `LLM call failed: ${msg}` };
  }
}

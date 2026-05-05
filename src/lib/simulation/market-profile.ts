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
import { MarketProfileSchema, type MarketProfile, type ProjectInput } from "./schemas";
import { marketProfilePrompt, MARKET_PROFILE_SYSTEM } from "./prompts";
import type { EnsembleAggregate } from "./ensemble";

export interface BuildMarketProfileOpts {
  input: ProjectInput;
  aggregate: EnsembleAggregate;
  locale: "ko" | "en";
}

export async function buildMarketProfile(
  opts: BuildMarketProfileOpts,
): Promise<MarketProfile | undefined> {
  const recommendedCountry = opts.aggregate.recommendation?.country;
  if (!recommendedCountry) return undefined;

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

  const prompt = marketProfilePrompt(opts.input, recommendedCountry, {
    consensusPercent: opts.aggregate.recommendation.consensusPercent,
    countryFinalScore: countryStats?.finalScore.mean ?? 0,
    topObjections,
    topTrustFactors,
    topChannels,
    locale: opts.locale,
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
      maxTokens: 4096,
    });
    const parsed = MarketProfileSchema.safeParse(res.json);
    if (!parsed.success) {
      console.warn(
        "[market profile] schema validation failed:",
        parsed.error.flatten(),
      );
      return undefined;
    }
    console.log(
      `[market profile] generated for ${recommendedCountry} · ` +
        `${parsed.data.competitors?.length ?? 0} competitors · ` +
        `${(parsed.data.regulatory?.barriers ?? []).length} regulatory barriers · ` +
        `${Date.now() - t0}ms`,
    );
    return parsed.data;
  } catch (err) {
    // Non-fatal — the report is still useful without this section.
    console.warn(`[market profile] LLM call failed (non-fatal):`, err);
    return undefined;
  }
}

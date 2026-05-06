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
    console.log(
      `[market profile] generated for ${recommendedCountry} · ` +
        `${parsed.data.competitors?.length ?? 0} competitors · ` +
        `${(parsed.data.regulatory?.barriers ?? []).length} regulatory barriers · ` +
        `${Date.now() - t0}ms`,
    );
    return { profile: parsed.data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[market profile] LLM call failed:`, msg);
    return { error: `LLM call failed: ${msg}` };
  }
}

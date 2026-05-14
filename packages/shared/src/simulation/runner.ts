import { getLLMProvider } from "@/lib/llm";
import type { LLMProvider, LLMProviderName } from "@/lib/llm";
import { llmCallCostCents } from "@/lib/llm/cost";
import { withProviderFallback } from "@/lib/llm/failover";
import { auditQuality, persistAudit } from "@/lib/quality/audit";
import {
  collectSourceAttributions,
  loadReferenceBundles,
  renderReferenceBlock,
} from "@/lib/reference";
import {
  formatTrendContextBlock,
  formatMarginBenchmarkBlock,
} from "@/lib/market-research/tavily";
import { createServiceClient } from "@/lib/supabase/admin";
import {
  countryPrompt,
  COUNTRY_SYSTEM,
  personaPrompt,
  PERSONA_SYSTEM,
  personaReactionPrompt,
  PERSONA_REACTION_SYSTEM,
  pricingPrompt,
  PRICING_SYSTEM,
  type PromptLocale,
  synthesisPrompt,
  SYNTHESIS_SYSTEM,
  synthesisCritiquePrompt,
  SYNTHESIS_CRITIQUE_SYSTEM,
} from "./prompts";
import { evaluateRegulatory } from "./regulatory";
import { filterLocaleNative, sanitizeVoice } from "./locale-filter";
import {
  sanitizeChannelMismatch,
  sanitizeChannelMismatchArray,
} from "./country-channel";
import { extractCompetitorPrices } from "./competitor-prices";
import { computeCurveRevenueMaxCents } from "./pricing-sensitivity";
import { computePricingRange } from "./pricing-range";
import { aggregatePersonas } from "./aggregate";
import {
  clusterStrings,
  isBareAdjectiveSignal,
  isGenericLaunchConcern,
  isGenericPriceObjection,
  isGenericTrustFactor,
} from "./surfaced-recount";
import { planSlots, type PersonaSlot } from "./profession-pool";
import {
  notifySimulationComplete,
  notifySimulationFailed,
} from "@/lib/email/notify";
import {
  CountryScoreSchema,
  OverviewSchema,
  PersonaReactionSchema,
  PersonaSchema,
  PricingResultSchema,
  type ProjectInput,
  RecommendationSchema,
  RiskSchema,
  type SimulationResult,
  SynthesisCritiqueSchema,
} from "./schemas";
import { z } from "zod";

interface RunOptions {
  simulationId: string;
  projectInput: ProjectInput;
  personaCount: number;
  provider?: LLMProviderName;
  model?: string;
  locale?: PromptLocale;
  /**
   * Override the seed used for slot planning + pool sampling. Ensembles
   * pass `${ensembleId}-${index}` here so each sim within an ensemble draws
   * a DIFFERENT subset of personas — that variety is what makes ensemble
   * aggregation surface confidence intervals. Standalone sims leave this
   * unset and get the default project_id seed (deterministic per project).
   */
  seedOverride?: string;
  /**
   * Pre-fetched image assets, keyed by URL position in `projectInput.assetUrls`.
   * Caller fetches once at ensemble level and passes the bytes here so each
   * sim's Anthropic synthesis call ships base64 inline instead of asking
   * Anthropic to fetch the URL (which times out at ~5s → non-retryable 400).
   * When unset, falls back to URL form.
   */
  inlineAssets?: Array<{ mediaType: string; base64: string }>;
  /**
   * Tavily trend snippets — current category-level consumer trend
   * articles fetched once at ensemble level. Injected into persona /
   * reaction prompts as a "current category context" block so the LLM
   * grounds purchaseIntent in fresh real-world signals (post-training-
   * cutoff trends) rather than its training prior alone. Empty array
   * when Tavily key is unset or the query returned nothing — prompts
   * fall back to LLM-only grounding.
   */
  trendSnippets?: Array<{
    url: string;
    title: string;
    content: string;
    score: number;
  }>;
  /**
   * Tavily margin-benchmark snippets — fetched once at ensemble level
   * to ground the pricing stage's marginEstimate in real industry
   * data. Same shape as trendSnippets; injected into the pricing
   * prompt as a "MARGIN BENCHMARK" grounding block, and the LLM is
   * required to cite at least one source so the user can trace the
   * margin figure. Empty when Tavily key is unset or query missed.
   */
  marginSnippets?: Array<{
    url: string;
    title: string;
    content: string;
    score: number;
  }>;
  /**
   * Pre-extracted competitor prices — ensemble-level fetch of the
   * user's competitor URLs done once and shared across all sims.
   * When supplied, runner skips its own per-sim extraction (avoids
   * 25× redundant fetches) and injects the prices into persona
   * prompts so the LLM has factual price anchors instead of
   * hallucinating directional comparisons (e.g. "Allbirds 대비 비쌈"
   * when the input price was actually cheaper than Allbirds).
   */
  competitorPrices?: Array<{
    url: string;
    priceCents: number | null;
    sourceCurrency?: string;
    productName?: string;
    status: "extracted" | "fetch_failed" | "no_price_found" | "low_confidence";
    reason?: string;
  }>;
}

// Smaller batches are more reliably completed by the LLM.
// gpt-4o-mini and similar tend to truncate or under-deliver when asked for 25
// detailed personas in one shot; 12 yields ≥ 90% of requested entries empirically.
const PERSONA_BATCH = 12;

/**
 * Concurrency for parallel persona batches (fresh + reaction-only paths).
 *
 * Auto-scales with persona count to keep wall-clock time bounded — but is
 * also capped per-provider because OpenAI Tier 1 (gpt-4o TPM 30K) and
 * Gemini's bursty 503 behavior both choke at the Anthropic-tuned 6-8
 * concurrency. Each reaction batch consumes ~5K tokens, so 6 concurrent
 * OpenAI calls = 30K TPM = exactly the Tier 1 cap → guaranteed 429s on
 * the next batch wave.
 *
 * Per-provider caps (until they get their own env override):
 *   anthropic: persona-count-scaled (4 → 6 → 8) — Tier 2 limits absorb it
 *   openai:    2 (5K × 2 = 10K TPM, leaves 20K headroom on Tier 1)
 *   gemini:    4 (Tier 1 RPM 150 is fine, but 503 bursts kick in higher)
 *
 * Env override (`LLM_PERSONA_BATCH_CONCURRENCY`) always wins — flip it up
 * when the OpenAI org reaches Tier 2 / Gemini paid quota stabilizes.
 */
function personaBatchConcurrency(personaCount: number, provider?: string): number {
  const envOverride = Number(process.env.LLM_PERSONA_BATCH_CONCURRENCY);
  if (Number.isFinite(envOverride) && envOverride > 0) return Math.floor(envOverride);
  if (provider === "openai") return 2;
  if (provider === "gemini") return 4;
  // anthropic (default fallback): scale with sim size.
  if (personaCount >= 500) return 8;
  if (personaCount >= 200) return 6;
  return 4;
}

/**
 * Wraps an LLMProvider so every generate() call accumulates input/output
 * token counts and computed cost into the shared usage object. Lets the
 * runner stay agnostic about which provider is in use — every call site
 * just calls .generate() and the wrapper invisibly tallies billing data.
 */
function withUsageTracking(
  llm: LLMProvider,
  usage: { inputTokens: number; outputTokens: number; costCents: number },
): LLMProvider {
  return {
    name: llm.name,
    model: llm.model,
    generate: async (req) => {
      const res = await llm.generate(req);
      const inT = res.usage?.inputTokens ?? 0;
      const outT = res.usage?.outputTokens ?? 0;
      usage.inputTokens += inT;
      usage.outputTokens += outT;
      usage.costCents += llmCallCostCents(llm.name, llm.model, inT, outT);
      return res;
    },
  };
}

/**
 * Wrap a provider so every call carries an AbortSignal. When the signal
 * fires (user cancellation, watchdog timeout), the in-flight HTTP call
 * aborts at the SDK boundary instead of waiting for the next stage
 * boundary's `isCancelled()` poll. Caller-supplied req.signal wins if
 * present, so a future per-call abort can override the simulation-wide
 * one.
 */
function withCancelSignal(
  llm: LLMProvider,
  signal: AbortSignal,
): LLMProvider {
  return {
    name: llm.name,
    model: llm.model,
    generate: (req) => llm.generate({ ...req, signal: req.signal ?? signal }),
  };
}

/**
 * Worker-pool runner: executes `tasks` with at most `limit` concurrent ones,
 * preserving result order. Uses allSettled semantics so a single failed batch
 * doesn't crash the whole stage — caller decides how to handle each result.
 */
async function runWithConcurrency<T>(
  limit: number,
  tasks: Array<() => Promise<T>>,
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = new Array(tasks.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(limit, tasks.length) },
    async () => {
      while (true) {
        const idx = cursor++;
        if (idx >= tasks.length) return;
        try {
          results[idx] = { status: "fulfilled", value: await tasks[idx]() };
        } catch (reason) {
          results[idx] = { status: "rejected", reason };
        }
      }
    },
  );
  await Promise.all(workers);
  return results;
}

// Country quota + per-batch allocation now live in profession-pool.ts as
// part of planSlots(), which produces a flat list of (country, profession)
// slots covering the whole simulation. Batches are sliced from that list
// in order — the slice itself doubles as the per-batch quota.

/**
 * 32-bit FNV-1a hash. Used to deterministically order pool personas per
 * project so re-running the same project always picks the same sample —
 * matches how real market research works (commit to a sample, don't
 * re-survey different people for the same study). Tiny + dependency-free;
 * not crypto.
 */
function fnv1a(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h >>> 0;
}

/**
 * Aggregate N independent country-scoring samples into a single ranked list
 * by taking the per-country median across all numeric fields. Same idea as
 * the pricing 3-sample median: outlier samples (where the LLM happened to
 * over- or under-weight one country) get washed out, leaving a stable
 * recommendation.
 *
 * For each country code, computes:
 *   - median(finalScore), median(demandScore), median(cacEstimateUsd),
 *     median(competitionScore)
 *   - rationale picked from the sample whose finalScore is closest to the
 *     median (so the explanation always corresponds to a real LLM output,
 *     not a synthetic average that could read as inconsistent)
 * Then re-ranks by median finalScore.
 *
 * Countries that don't appear in every sample still aggregate over whatever
 * samples include them — the median of [70, 65] is 67.5, not penalised for
 * the missing third sample.
 */
/**
 * Detects samples where the LLM scored on the wrong scale (0-10 instead of
 * 0-100). Heuristic: if every country in the sample has finalScore < 25,
 * the LLM almost certainly slipped scales — a real-world ranking always has
 * at least one country in the 50-90 range. Auto-multiply by 10 to recover
 * (cacEstimateUsd is a dollar amount, not a score, so leave it alone).
 *
 * Caught a real issue in the Beauty of Joseon ensemble where 3 of 15 country
 * LLM samples returned the entire ranking on a 0-10 scale (US 8.2, GB 7.1,
 * JP 6.4). Median across samples then collapsed to single-digit scores for
 * one of the 5 sims, distorting aggregate stats while still picking the
 * correct bestCountry by luck.
 */
function normalizeCountrySampleScale(
  sample: z.infer<typeof CountryScoreSchema>[],
): z.infer<typeof CountryScoreSchema>[] {
  if (sample.length === 0) return sample;
  const maxFinal = Math.max(...sample.map((c) => c.finalScore));
  if (maxFinal < 25) {
    // Whole-sample 0-10 slip — rescale all scores by 10x.
    return sample.map((c) => ({
      ...c,
      finalScore: Math.min(100, c.finalScore * 10),
      demandScore: c.demandScore < 25 ? Math.min(100, c.demandScore * 10) : c.demandScore,
      competitionScore: c.competitionScore < 25 ? Math.min(100, c.competitionScore * 10) : c.competitionScore,
    }));
  }
  return sample;
}

/**
 * Phase A fix for "동남아 편향" (Buldak validation runs 1 + 5, 2026-05-14/15).
 *
 * Symptom: even after grounding fixes (Tavily native queries + Sonar Pro)
 * the simulator kept ranking VN / ID / MY above US / CN / DE for products
 * whose actual export revenue concentrates in the latter (Buldak China is
 * the #1 export market by revenue). Root cause: LLM emits both finalScore
 * and components.marketSize, but its self-weighted finalScore systematically
 * under-weights marketSize against CAC-driven priceCompat and channelMatch.
 * A US marketSize=82 still produced finalScore=61 in the 5th run because
 * the LLM mentally averaged against the persona pool's low-income skew.
 *
 * Fix: recompute finalScore mechanically from components with explicit
 * weights, giving marketSize a 30% floor. Keeps the LLM's qualitative
 * judgement (the components are still LLM-emitted) but removes its freedom
 * to under-weight absolute market value during the final aggregation.
 *
 * Weights chosen so the six components sum to 1.0:
 *   marketSize 0.30  — Phase A target; what we're fixing
 *   culturalFit 0.15
 *   channelMatch 0.15
 *   priceCompat 0.10  — already captured implicitly in CAC; small explicit weight
 *   competition 0.15
 *   regulatory 0.15
 *
 * Regulatory hard floor: when regulatory < 30 (launch blocker), cap the
 * computed finalScore at 35 regardless of the other components — preserves
 * the prompt's "great marketSize but reg<25 should drag finalScore down
 * sharply" guidance.
 *
 * Skipped when components are absent (legacy data, malformed LLM output);
 * the LLM-emitted finalScore stands in that case.
 */
const FINAL_SCORE_WEIGHTS = {
  marketSize: 0.3,
  culturalFit: 0.15,
  channelMatch: 0.15,
  priceCompat: 0.1,
  competition: 0.15,
  regulatory: 0.15,
} as const;

function recomputeFinalScoreFromComponents(
  sample: z.infer<typeof CountryScoreSchema>[],
): z.infer<typeof CountryScoreSchema>[] {
  return sample.map((row) => {
    const c = row.components;
    if (!c) return row;
    let computed =
      c.marketSize * FINAL_SCORE_WEIGHTS.marketSize +
      c.culturalFit * FINAL_SCORE_WEIGHTS.culturalFit +
      c.channelMatch * FINAL_SCORE_WEIGHTS.channelMatch +
      c.priceCompat * FINAL_SCORE_WEIGHTS.priceCompat +
      c.competition * FINAL_SCORE_WEIGHTS.competition +
      c.regulatory * FINAL_SCORE_WEIGHTS.regulatory;
    // Regulatory launch-blocker floor — matches the existing prompt
    // guidance that a regulatory < 25-30 should pull finalScore sharply
    // down, not be averaged away.
    if (c.regulatory < 30) computed = Math.min(computed, 35);
    return { ...row, finalScore: Math.round(computed * 10) / 10 };
  });
}

function aggregateCountryScores(
  samples: Array<z.infer<typeof CountryScoreSchema>[]>,
): z.infer<typeof CountryScoreSchema>[] {
  if (samples.length === 0) return [];
  // Normalize each sample's scale before aggregating — drops occasional
  // 0-10 slips that would otherwise contaminate the median.
  samples = samples.map(normalizeCountrySampleScale);
  // Phase A: recompute finalScore from components with explicit weights so
  // marketSize gets the 30% floor it never received from LLM self-weighting.
  // See FINAL_SCORE_WEIGHTS doc for rationale. Applied AFTER scale normalize
  // so a 0-10 slip (which now lives in components too) isn't blown up by
  // the weighted sum.
  samples = samples.map(recomputeFinalScoreFromComponents);
  if (samples.length === 1) return samples[0];
  const median = (xs: number[]): number => {
    const sorted = [...xs].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  };
  const byCountry = new Map<string, z.infer<typeof CountryScoreSchema>[]>();
  for (const sample of samples) {
    for (const row of sample) {
      const key = row.country.toUpperCase();
      const arr = byCountry.get(key) ?? [];
      arr.push(row);
      byCountry.set(key, arr);
    }
  }
  const stdDev = (xs: number[]): number => {
    if (xs.length < 2) return 0;
    const m = xs.reduce((a, b) => a + b, 0) / xs.length;
    return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
  };
  const aggregated: z.infer<typeof CountryScoreSchema>[] = [];
  for (const [country, rows] of byCountry.entries()) {
    const finals = rows.map((r) => r.finalScore);
    const medFinal = median(finals);
    const stdFinal = stdDev(finals);
    const medDemand = median(rows.map((r) => r.demandScore));
    const medCAC = median(rows.map((r) => r.cacEstimateUsd));
    const medCompetition = median(rows.map((r) => r.competitionScore));
    // Pick the rationale from the sample whose finalScore is closest to the
    // median — keeps narrative consistent with the numbers we're showing.
    const closest = [...rows].sort(
      (a, b) => Math.abs(a.finalScore - medFinal) - Math.abs(b.finalScore - medFinal),
    )[0];
    // Components: median per dimension across rows that emitted them.
    // Earlier this function silently dropped components — single-sim
    // ensembles then had no decomposition because aggregator-side
    // averaging downstream had nothing to fold over. Now we reconstruct
    // the median per axis so even Hypothesis tier carries the breakdown.
    const rowsWithComponents = rows.filter((r) => r.components);
    const components =
      rowsWithComponents.length > 0
        ? {
            marketSize: Math.round(
              median(rowsWithComponents.map((r) => r.components!.marketSize)),
            ),
            culturalFit: Math.round(
              median(rowsWithComponents.map((r) => r.components!.culturalFit)),
            ),
            channelMatch: Math.round(
              median(rowsWithComponents.map((r) => r.components!.channelMatch)),
            ),
            priceCompat: Math.round(
              median(rowsWithComponents.map((r) => r.components!.priceCompat)),
            ),
            competition: Math.round(
              median(rowsWithComponents.map((r) => r.components!.competition)),
            ),
            regulatory: Math.round(
              median(rowsWithComponents.map((r) => r.components!.regulatory)),
            ),
          }
        : undefined;
    aggregated.push({
      country,
      demandScore: Math.round(medDemand),
      cacEstimateUsd: Math.round(medCAC * 100) / 100,
      competitionScore: Math.round(medCompetition),
      finalScore: Math.round(medFinal * 10) / 10,
      finalScoreStd: Math.round(stdFinal * 100) / 100,
      finalScoreSampleN: rows.length,
      rank: 0, // re-assigned below
      rationale: closest.rationale,
      components,
    });
  }
  aggregated.sort((a, b) => b.finalScore - a.finalScore);
  aggregated.forEach((row, i) => (row.rank = i + 1));
  return aggregated;
}

/**
 * Runs the full simulation pipeline and persists the result.
 * Designed to run inside a Vercel function or background worker — total budget ~5 min.
 *
 * Stages: personas → countries → pricing → synthesis
 * Each stage updates simulations.current_stage so the UI can render progress.
 */
export async function runSimulation(opts: RunOptions): Promise<SimulationResult> {
  const supabase = createServiceClient();
  const locale: PromptLocale = opts.locale ?? "en";

  // Pick a model per stage. Each stage independently honours
  // LLM_<STAGE>_PROVIDER / LLM_<STAGE>_MODEL env vars; if those aren't set
  // it falls back to LLM_DEFAULT_*. This is what lets us run cheap+fast
  // models for high-volume persona batches while keeping a stronger model
  // for the executive synthesis stage.
  const personaLLMRaw = getLLMProvider({ stage: "personas", provider: opts.provider, model: opts.model });
  const countryLLMRaw = getLLMProvider({ stage: "countries", provider: opts.provider, model: opts.model });
  const pricingLLMRaw = getLLMProvider({ stage: "pricing", provider: opts.provider, model: opts.model });
  const synthesisLLMRaw = getLLMProvider({ stage: "synthesis", provider: opts.provider, model: opts.model });

  // Token + cost accumulator. Every LLM call routes through these wrapped
  // providers, so the numbers cover regulatory + personas + reactions +
  // countries (5x) + pricing (5x) + synthesis + critique. Persisted to
  // simulations.total_input_tokens / total_output_tokens / total_cost_cents
  // at the end of the success path so /admin/billing has data to render.
  const usage = { inputTokens: 0, outputTokens: 0, costCents: 0 };

  // Provider-failover scope: ALL high-volume stages get the wrapper.
  // History: only synthesis used to fall over. Persona stage in Deep
  // tier carried the largest single-stage outage risk — Gemini 503
  // storms and Anthropic url-fetch timeouts (2026-05-08) wiped out
  // entire sims because the persona stage couldn't recover, even
  // though the rest of the pipeline would have been fine. Country
  // and pricing get the same treatment because their respective
  // 5-sample / 3-sample medians silently absorb a single failure but
  // cascade if all samples come from a 5xx-throwing provider.
  //
  // Tradeoff: when the primary's retry budget is exhausted and we
  // fall back to Anthropic/OpenAI, that sim's stage no longer
  // contributes a "primary provider" vote to multi-LLM diversity.
  // We accept this — a fall-back sim is strictly better than a lost
  // sim, and outages that trigger failover are exactly the moments
  // when multi-LLM diversity falls apart anyway. Per-stage
  // actualProvider is logged for observability.
  const makeStageFallback = (
    stage: "personas" | "countries" | "pricing",
  ) => () => {
    // Same fallback hierarchy as synthesis: never fall back to Gemini
    // (most likely cause of the failover firing) or DeepSeek (newer,
    // less battle-tested). Anthropic is preferred default; if primary
    // IS Anthropic, switch to OpenAI.
    const primaryName = personaLLMRaw.name; // all stages share opts.provider
    const fallbackName = primaryName === "anthropic" ? "openai" : "anthropic";
    return getLLMProvider({ stage, provider: fallbackName });
  };
  const personaActualProvider = { name: personaLLMRaw.name as string };
  const countryActualProvider = { name: countryLLMRaw.name as string };
  const pricingActualProvider = { name: pricingLLMRaw.name as string };
  const personaLLMFalloverable = withProviderFallback(personaLLMRaw, {
    stage: "personas",
    simId: opts.simulationId,
    makeFallback: makeStageFallback("personas"),
    onFallback: ({ fallback }) => {
      personaActualProvider.name = fallback;
    },
  });
  const countryLLMFalloverable = withProviderFallback(countryLLMRaw, {
    stage: "countries",
    simId: opts.simulationId,
    makeFallback: makeStageFallback("countries"),
    onFallback: ({ fallback }) => {
      countryActualProvider.name = fallback;
    },
  });
  const pricingLLMFalloverable = withProviderFallback(pricingLLMRaw, {
    stage: "pricing",
    simId: opts.simulationId,
    makeFallback: makeStageFallback("pricing"),
    onFallback: ({ fallback }) => {
      pricingActualProvider.name = fallback;
    },
  });
  // Cancel watchdog — when the user clicks cancel on the UI, the
  // ensemble cancel route flips simulations.status to 'cancelled'. A
  // poll watcher running every 5s notices and trips the AbortController,
  // which propagates through every active LLM call (signal threaded by
  // withCancelSignal). Without this, a cancel during persona stage
  // would only take effect at the next stage boundary — up to 3 minutes
  // and 25 batches of in-flight LLM cost later. The watchdog also
  // covers the Vercel function timeout edge: if the user closes the
  // browser, the cancel poll never fires (status stays 'running')
  // until the zombie cleanup cron, but in-flight calls will at least
  // notice the function-level signal that the platform sends.
  const cancelController = new AbortController();
  // Two flavours of cancel: stage-boundary (existing isCancelled poll)
  // and in-flight (the AbortController below). The stage-boundary one
  // remains because it surfaces a distinct CANCELLED_ERR sentinel that
  // the catch handler uses to skip failure side-effects.
  const cancelWatchInterval = setInterval(async () => {
    try {
      const { data } = await supabase
        .from("simulations")
        .select("status")
        .eq("id", opts.simulationId)
        .single();
      if (data?.status === "cancelled" && !cancelController.signal.aborted) {
        console.warn(`[sim ${opts.simulationId}] cancel watchdog tripped — aborting in-flight LLM calls`);
        cancelController.abort();
      }
    } catch {
      // Watchdog read failures are non-fatal — the sim's own checks
      // will catch the cancel at the next stage boundary even if the
      // watchdog briefly couldn't reach the DB.
    }
  }, 5000);
  const personaLLM = withCancelSignal(
    withUsageTracking(personaLLMFalloverable, usage),
    cancelController.signal,
  );
  const countryLLM = withCancelSignal(
    withUsageTracking(countryLLMFalloverable, usage),
    cancelController.signal,
  );
  const pricingLLM = withCancelSignal(
    withUsageTracking(pricingLLMFalloverable, usage),
    cancelController.signal,
  );

  // Synthesis: wrap with provider-failover so a Gemini 503 spike (or
  // any other 5xx/429 the retry policy can't outlast) flips the
  // remaining synthesis call to Anthropic instead of failing the
  // whole sim. Failover triggers only when the primary's full retry
  // budget is exhausted; the default path always goes to the assigned
  // provider so deep-tier multi-LLM round-robin is preserved.
  //
  // Honest attribution: synthesisActualProvider records what really
  // produced the output, which the aggregator surfaces in its
  // providerBreakdown so cross-model agreement stays accurate.
  let synthesisActualProvider: string = synthesisLLMRaw.name;
  const synthesisLLMFalloverable = withProviderFallback(synthesisLLMRaw, {
    stage: "synthesis",
    simId: opts.simulationId,
    makeFallback: () => {
      // Fallback hierarchy: anthropic > openai > gemini. Pick the
      // first one that's NOT the primary. Anthropic is the strongest
      // default (Sonnet has good synthesis quality + tier-2 burst),
      // OpenAI second. We never fall back to Gemini because it's
      // the most likely cause of the failover firing.
      const fallbackName = synthesisLLMRaw.name === "anthropic" ? "openai" : "anthropic";
      return getLLMProvider({
        stage: "synthesis",
        provider: fallbackName,
        // Don't pass opts.model — that's keyed to the primary's model
        // family and would break against a different provider.
      });
    },
    onFallback: ({ fallback }) => {
      synthesisActualProvider = fallback;
    },
  });
  const synthesisLLM = withCancelSignal(
    withUsageTracking(synthesisLLMFalloverable, usage),
    cancelController.signal,
  );
  // Regulatory check uses the synthesis-tier model: this needs to be reliable
  // about real laws (e.g. e-cigarette bans). Cheap models occasionally miss.
  // Same failover wrapper applies — regulatory failure cascades the whole sim.
  const regulatoryLLM = synthesisLLM;

  // Surface the per-stage model selection in the run log — operators
  // verifying a Haiku/Sonnet split or debugging a quality regression can
  // immediately see which model produced which stage's output.
  console.log(
    `[sim ${opts.simulationId}] models: ` +
      `personas=${personaLLM.name}/${personaLLM.model} · ` +
      `countries=${countryLLM.name}/${countryLLM.model} · ` +
      `pricing=${pricingLLM.name}/${pricingLLM.model} · ` +
      `synthesis=${synthesisLLM.name}/${synthesisLLM.model}`,
  );

  /**
   * Sentinel error used when the user cancelled the sim via the cancel
   * endpoint. We throw this to short-circuit the pipeline; the outer catch
   * recognises it and skips the failure-state side effects (status='failed',
   * notify, etc.) since the row is already 'cancelled'.
   */
  const CANCELLED_ERR = "__simulation_cancelled__";

  /**
   * Returns true when the user has cancelled this sim. Called before each
   * stage so we can abort early without firing the next LLM batch. We accept
   * one extra DB read per stage for the cancellation guarantee.
   */
  const isCancelled = async (): Promise<boolean> => {
    const { data } = await supabase
      .from("simulations")
      .select("status")
      .eq("id", opts.simulationId)
      .single();
    return data?.status === "cancelled";
  };

  const updateStage = async (stage: string) => {
    if (await isCancelled()) {
      throw new Error(CANCELLED_ERR);
    }
    await supabase
      .from("simulations")
      .update({ current_stage: stage, status: "running" })
      .eq("id", opts.simulationId)
      // Don't bump cancelled rows back into 'running' — race-safe even if
      // cancel landed between the isCancelled() check and the update below.
      .neq("status", "cancelled");
  };

  // Record the synthesis-stage model on the simulation row — that's the
  // headline model users see in attribution. Other stage models are still
  // visible in logs.
  await supabase
    .from("simulations")
    .update({
      started_at: new Date().toISOString(),
      model_provider: synthesisLLM.name,
      model_version: synthesisLLM.model,
    })
    .eq("id", opts.simulationId);

  // Top-level wall-clock for the whole sim — prints at end alongside per-stage
  // timings so it's obvious where the budget went on slow runs.
  const tSimStart = Date.now();

  try {
    // ── Stage 0: regulatory pre-check ──────────────────────────
    // Filter out countries where the product is legally banned BEFORE any
    // downstream stage sees them — otherwise persona/country scoring will
    // happily recommend an illegal market (e.g. e-cigarettes for Singapore).
    await updateStage("regulatory");
    const tReg = Date.now();
    const regulatory = await evaluateRegulatory(regulatoryLLM, opts.projectInput, locale);
    console.log(
      `[sim ${opts.simulationId}] regulatory: ${regulatory.allowedCountries.length} allowed, ` +
        `${regulatory.excludedCountries.length} excluded${regulatory.result.regulatedCategory ? ` (category: ${regulatory.result.regulatedCategory})` : ""} — ` +
        `${((Date.now() - tReg) / 1000).toFixed(1)}s`,
    );
    // Defensive: drop the origin from candidate markets even if it slipped in
    // (older rows pre-dating the originating_country split, or admin retries
    // of legacy projects). The origin is a separate piece of context — keep it
    // out of the export-target ranking so the simulator can never recommend
    // domestic launch as the "best market" inside an overseas-validation run.
    const originCode = (opts.projectInput.originatingCountry ?? "KR").toUpperCase();
    const candidatesAfterOrigin = regulatory.allowedCountries.filter(
      (c) => c.toUpperCase() !== originCode,
    );
    const droppedOrigin = candidatesAfterOrigin.length !== regulatory.allowedCountries.length;
    if (droppedOrigin) {
      console.log(
        `[sim ${opts.simulationId}] dropped origin ${originCode} from candidates (kept as context)`,
      );
    }
    // From here on, treat the filtered list as the candidate set for the simulation.
    const projectInput = {
      ...opts.projectInput,
      candidateCountries: candidatesAfterOrigin,
    };

    // If everything got excluded the simulation can't proceed meaningfully.
    if (projectInput.candidateCountries.length === 0) {
      throw new Error(
        `All candidate countries were excluded by regulatory check. ` +
          `Excluded: ${regulatory.excludedCountries.join(", ")}.`,
      );
    }

    // Load gov-stats reference data for the (now filtered) candidate countries.
    // Missing countries simply contribute nothing — LLM falls back to its training prior.
    // Kept inside try block so any DB hiccup gets recorded as a `failed` simulation
    // instead of leaving the row stuck in `validating` forever.
    const referenceBundles = await loadReferenceBundles(
      projectInput.candidateCountries,
      projectInput.category,
    );
    const referenceBaseBlock = renderReferenceBlock(referenceBundles, locale);
    const referenceSources = collectSourceAttributions(referenceBundles);
    // Append the Tavily trend block to the reference block when present.
    // Both feed the persona / reaction prompts via the same referenceBlock
    // parameter — they're concatenated grounding context. The trend block
    // adds ~500 chars of post-cutoff real-world signal (e.g. GLP-1 reshaping
    // food category, K-beauty global expansion, sustainability premium
    // shifts) that the LLM's training prior alone might miss.
    const trendBlock =
      (opts.trendSnippets?.length ?? 0) > 0
        ? formatTrendContextBlock(opts.trendSnippets!, locale === "ko", 4)
        : "";
    // Competitor price anchor block — gives persona prompts FACTUAL
    // competitor prices instead of letting the LLM guess "is this
    // product cheaper or more expensive than Allbirds?". Only the
    // ensemble-prefetched competitorPrices feed this block — the
    // per-sim Stage 3a extraction happens AFTER persona generation,
    // too late for the persona prompt. Standalone sims (no ensemble
    // pre-fetch) just lack this block; the pricing stage still gets
    // the anchor via Stage 3a.
    const competitorPriceBlock = (() => {
      const okPrices = (opts.competitorPrices ?? []).filter(
        (r) => r.status === "extracted" && r.priceCents != null,
      );
      if (okPrices.length === 0) return "";
      const productPrice = opts.projectInput.basePriceCents;
      const currency = opts.projectInput.currency;
      const fmt = (cents: number) =>
        `${(cents / 100).toLocaleString()} ${currency}`;
      const entries = okPrices
        .map((r) => {
          const name = r.productName ?? r.url;
          const cmp =
            productPrice > 0 && r.priceCents != null
              ? r.priceCents > productPrice * 1.1
                ? locale === "ko"
                  ? " (이 제품보다 비쌈)"
                  : " (more expensive than this product)"
                : r.priceCents < productPrice * 0.9
                  ? locale === "ko"
                    ? " (이 제품보다 저렴)"
                    : " (cheaper than this product)"
                  : locale === "ko"
                    ? " (이 제품과 비슷한 가격)"
                    : " (similar to this product)"
              : "";
          return `  - ${name}: ${fmt(r.priceCents!)}${cmp}`;
        })
        .join("\n");
      const header =
        locale === "ko"
          ? `═══ 경쟁사 실제 가격 (FACT — 추측 금지) ═══
이 제품 (${fmt(productPrice)}) 와 사용자가 입력한 경쟁사 URL 의 실제 추출 가격:
${entries}

⚠ HARD RULE: trustFactors / objections / voice 에서 경쟁사와의 가격 비교를 언급할 때, 위 표의 실제 가격을 정확히 따르세요. 추측하지 말 것 — "Allbirds 대비 비쌈" 이라고 쓰려면 위 표에서 Allbirds 가격이 이 제품보다 *낮음* 이 확인되어야 합니다. 방향을 거꾸로 말하는 건 fact 오류이며 신뢰성 실패입니다. 위 표에 없는 경쟁사라면 가격 비교 자체를 자제하세요.`
          : `═══ COMPETITOR ACTUAL PRICES (FACT — do not guess) ═══
This product (${fmt(productPrice)}) vs prices extracted from the user-supplied competitor URLs:
${entries}

⚠ HARD RULE: when trustFactors / objections / voice cite competitor price comparisons, follow the actual numbers above. Do NOT guess directionality — claiming "more expensive than Allbirds" requires Allbirds' price above to be LOWER than this product. Getting the direction wrong is a credibility failure. If a competitor isn't listed above, avoid making a price comparison claim about it.`;
      return header;
    })();
    const referenceBlock = [referenceBaseBlock, trendBlock, competitorPriceBlock]
      .filter(Boolean)
      .join("\n\n");

    // ── Stage 1: personas ──────────────────────────────────────
    // Two-phase generation:
    //   1. Pool sampling — try to reuse existing base personas from this
    //      workspace's library, avoiding the cost of regenerating known
    //      profiles. Pool hits only need a small "reactions" LLM call.
    //   2. Fresh generation — for slots the pool can't satisfy, generate
    //      full personas (existing behaviour). Their base profiles are
    //      saved back into the pool so subsequent sims benefit.
    await updateStage("personas");
    const personas: z.infer<typeof PersonaSchema>[] = [];
    let parseSkips = 0;
    // Tracks how many voices the runtime sanitizer dropped this stage. Each
    // drop is also logged inline (with the offending text), but the summary
    // line at the end of personas-stage tells you at-a-glance whether the
    // prompt-side defenses are holding for this run's locale × persona mix.
    let voiceSlipCount = 0;
    // Channel-mismatch slip tracker — incremented every time the
    // country-channel sanitizer rewrites a Korea-only / Japan-only /
    // China-only marketplace name out of a persona who isn't from
    // that country. Surfaces in the quality audit so we can spot
    // prompt regressions where the LLM forgets to localise channels.
    let channelMismatchCount = 0;
    // Concurrency scales with persona count + provider — Anthropic gets
    // the persona-count-based ladder, OpenAI/Gemini get tighter caps to
    // stay inside their TPM/burst limits. See personaBatchConcurrency().
    const personaConcurrency = personaBatchConcurrency(opts.personaCount, opts.provider);
    if (personaConcurrency !== 4) {
      console.log(
        `[sim ${opts.simulationId}] persona batch concurrency: ${personaConcurrency} ` +
          `(provider=${opts.provider ?? "default"}, ${opts.personaCount} personas)`,
      );
    }

    // Resolve workspace_id + project_id BEFORE slot planning. project_id
    // seeds both planSlots (which professions get assigned to which slots)
    // AND the pool sampling sort below — using the same seed for both
    // means same project always plans the same slots AND draws the same
    // personas, so the persona aggregate stays stable across re-runs.
    // simulationId would change per sim and break that stability.
    const { data: simRowForWs } = await supabase
      .from("simulations")
      .select("workspace_id, project_id")
      .eq("id", opts.simulationId)
      .single();
    const workspaceId = simRowForWs?.workspace_id as string | undefined;
    const projectId = simRowForWs?.project_id as string | undefined;
    // Seed precedence: explicit override (ensemble) > project_id (standalone
    // determinism) > simulationId (legacy fallback). Ensembles pass distinct
    // overrides per sim so each draws a different sample, then aggregate the
    // N runs into a confidence-graded recommendation.
    const slotSeed = opts.seedOverride ?? projectId ?? opts.simulationId;
    // Pool sampling uses the same seed concept — same override means same
    // personas drawn, varying override gives varying draws.
    const poolSeed = opts.seedOverride ?? projectId ?? opts.simulationId;

    const allSlots: PersonaSlot[] = planSlots(
      opts.personaCount,
      projectInput.candidateCountries,
      projectInput.category,
      locale,
      slotSeed,
    );
    const generatedByCountry: Record<string, number> = {};
    for (const c of projectInput.candidateCountries) generatedByCountry[c] = 0;

    // ── 1a. Pool sampling ────────────────────────────────────────
    type PoolBase = {
      id: string;
      age_range: string;
      gender: string;
      country: string;
      income_band: string;
      profession: string;
      base_profession: string;
      interests: string[] | null;
      purchase_style: string;
      price_sensitivity: string;
    };
    type PoolHit = { slot: PersonaSlot; base: PoolBase };

    const hits: PoolHit[] = [];
    const missSlots: PersonaSlot[] = [];

    if (workspaceId) {
      // Group slots by (country, base_profession) so we can fetch each cell once.
      // Slots without an assigned profession (free-choice categories) skip the
      // pool entirely — there's nothing to match on.
      const cellCounts = new Map<string, number>();
      for (const s of allSlots) {
        if (!s.profession) continue;
        const key = `${s.country}|${s.profession}`;
        cellCounts.set(key, (cellCounts.get(key) ?? 0) + 1);
      }
      const poolByCell = new Map<string, PoolBase[]>();
      await Promise.all(
        Array.from(cellCounts.entries()).map(async ([key, n]) => {
          const [country, baseProfession] = key.split("|");
          // Fetch the entire cell (capped) so we can sort deterministically
          // in JS — Supabase JS doesn't expose custom ORDER BY expressions
          // like md5(id || $1) that we'd need server-side. Cells are small
          // (typically 10-30 personas) so over-fetching is cheap.
          const { data } = await supabase
            .from("personas")
            .select(
              "id, age_range, gender, country, income_band, profession, base_profession, interests, purchase_style, price_sensitivity",
            )
            .eq("workspace_id", workspaceId)
            .eq("country", country)
            .eq("base_profession", baseProfession)
            .limit(200);
          const all = (data ?? []) as PoolBase[];
          // Deterministic sort: hash(project_id || persona_id). Same project
          // always sees the same first-N personas, even as the pool grows
          // — only "tail" insertions affect the order of unselected personas.
          // Falls back to id-only hash when project_id isn't resolvable
          // (legacy paths) so we still get deterministic-per-pool behavior.
          const seed = poolSeed;
          const sorted = all
            .map((p) => ({ p, h: fnv1a(`${seed}:${p.id}`) }))
            .sort((a, b) => a.h - b.h)
            .slice(0, n)
            .map(({ p }) => p);
          poolByCell.set(key, sorted);
        }),
      );

      // Allocate slots to pool entries in declaration order. Slots without a
      // matching pool entry (or without slot.profession) drop into misses.
      for (const slot of allSlots) {
        if (!slot.profession) {
          missSlots.push(slot);
          continue;
        }
        const key = `${slot.country}|${slot.profession}`;
        const candidates = poolByCell.get(key) ?? [];
        const next = candidates.shift();
        if (next) {
          hits.push({ slot, base: next });
        } else {
          missSlots.push(slot);
        }
      }
    } else {
      // No workspace context (legacy/test path) — skip pool, generate everything fresh.
      missSlots.push(...allSlots);
    }
    console.log(
      `[sim ${opts.simulationId}] pool: ${hits.length} hits / ${missSlots.length} misses` +
        (workspaceId ? ` (workspace ${workspaceId.slice(0, 8)})` : " (no workspace)"),
    );

    // ── 1b. Fresh generation for misses ──────────────────────────
    type FreshPair = { persona: z.infer<typeof PersonaSchema>; slot: PersonaSlot };
    const freshPairs: FreshPair[] = [];

    /**
     * Run one round of persona batches against the supplied slot list and
     * return the fulfilled (persona, slot) pairs along with the leftover
     * slots whose batch either failed, got truncated, or returned an
     * unparseable entry. The leftovers feed the truncation-retry pass —
     * Gemini and OpenAI both occasionally ship 8 of 12 personas per batch
     * and without retry we silently lose those slot positions.
     */
    const runPersonaBatchRound = async (
      slotsToFill: PersonaSlot[],
      attemptTag: string,
    ): Promise<{ pairs: FreshPair[]; unfilledSlots: PersonaSlot[] }> => {
      if (slotsToFill.length === 0) return { pairs: [], unfilledSlots: [] };
      const batchPlans: Array<{ slots: PersonaSlot[] }> = [];
      for (let i = 0; i < slotsToFill.length; i += PERSONA_BATCH) {
        batchPlans.push({ slots: slotsToFill.slice(i, i + PERSONA_BATCH) });
      }
      const t0 = Date.now();
      const results = await runWithConcurrency(
        personaConcurrency,
        batchPlans.map(({ slots }) => () =>
          personaLLM.generate({
            system: PERSONA_SYSTEM,
            prompt: personaPrompt(projectInput, slots, locale, referenceBlock),
            jsonSchema: { type: "object", properties: { personas: { type: "array" } } },
            // Hint the recovery layer that the response wraps an array
            // under the "personas" key. When max_tokens or stream-stop
            // truncates the response mid-array, the recovery extracts
            // complete entries that survived and reconstructs the
            // wrapper object — preserving 8-11 personas instead of
            // dropping the entire 12-batch.
            expectedArrayKey: "personas",
            // 0.85 (up from 0.6) breaks the safe-default attractor that
            // caused trustFactors/objections to converge to one phrase
            // across the batch ("편안한 착용감" 99%, "가격이 높음" 98%).
            // The prompt now also enforces an anchor requirement and a
            // 30%-per-concept diversity quota; higher temp gives the LLM
            // headroom to actually explore the long tail those rules ask
            // for.
            temperature: 0.85,
            // Bumped 8192 → 16384 on 2026-05-10 after the 2026-05-10
            // Le Mouton ensemble shipped only 3,392/5,000 personas
            // (67%) — all dropout localized to Anthropic sims (avg
            // 22/200 each). 12 personas in Korean with the now-rich
            // prompt (Tavily trends + taxonomy + new-brand multiplier
            // + cross-country distribution + voice + adReaction)
            // emit ~600-800 tokens each = 7.2-9.6k for a batch,
            // bumping right against the old 8192 ceiling for
            // Anthropic. OpenAI / DeepSeek shipped 200/200 because
            // their providers either auto-extend or have higher
            // defaults. Doubling the budget gives all providers
            // headroom while marginally increasing API spend (only
            // pays for tokens actually generated).
            maxTokens: 16384,
          }),
        ),
      );
      console.log(
        `[sim ${opts.simulationId}] persona batches (${attemptTag}): ${batchPlans.length}, ` +
          `${((Date.now() - t0) / 1000).toFixed(1)}s`,
      );
      const roundPairs: FreshPair[] = [];
      const unfilledSlots: PersonaSlot[] = [];
      for (let bi = 0; bi < results.length; bi++) {
        const settled = results[bi];
        const batchSlots = batchPlans[bi].slots;
        if (settled.status === "rejected") {
          console.warn(
            `[sim ${opts.simulationId}] persona batch ${bi} (${attemptTag}) failed:`,
            settled.reason instanceof Error ? settled.reason.message : settled.reason,
          );
          // Whole batch failed → every slot in it is unfilled.
          unfilledSlots.push(...batchSlots);
          continue;
        }
        const r = settled.value;
        const wrapped = (r.json as { personas?: unknown[] } | null)?.personas;
        const arr = Array.isArray(wrapped) ? wrapped : [];
        if (arr.length === 0) {
          console.warn(
            `[sim ${opts.simulationId}] persona batch ${bi} (${attemptTag}) returned no array — raw:`,
            r.text.slice(0, 200),
          );
        }
        // Track which slot indices got fulfilled so we can mark
        // truncated tail + unparseable entries as unfilled. arr[i]
        // pairs with batchSlots[i] by position; if arr.length <
        // batchSlots.length the tail slots are unfulfilled.
        const fulfilledIndices = new Set<number>();
        for (let pi = 0; pi < arr.length && pi < batchSlots.length; pi++) {
          const parsed = PersonaSchema.safeParse(arr[pi]);
          if (!parsed.success) {
            parseSkips++;
            continue;
          }
          fulfilledIndices.add(pi);
          const sanitizedVoice = sanitizeVoice(parsed.data.voice, locale);
          if (parsed.data.voice && sanitizedVoice === null) {
            voiceSlipCount++;
            console.warn(
              `[sim ${opts.simulationId}] voice slip dropped (${attemptTag}, ${parsed.data.country}): ` +
                `"${parsed.data.voice.slice(0, 80)}"`,
            );
          }
          // Channel sanitization runs AFTER voice sanitization so we
          // only rewrite quotes that survived the language gate.
          // sanitizedVoice can be null (rejected) or a string; only
          // sanitize the string case.
          const voiceForChannelCheck = sanitizedVoice ?? "";
          const channelVoice = sanitizeChannelMismatch(
            voiceForChannelCheck,
            parsed.data.country,
            locale,
          );
          if (channelVoice.replacements > 0) {
            channelMismatchCount += channelVoice.replacements;
            console.warn(
              `[sim ${opts.simulationId}] channel slip rewritten (${attemptTag}, ${parsed.data.country}): ` +
                `${channelVoice.replacements}× in "${voiceForChannelCheck.slice(0, 80)}"`,
            );
          }
          // Also scrub channel slips out of objections + trustFactors;
          // those propagate into the country-tab top-N list and would
          // misrepresent local market structure if a Korean channel
          // shows up under VN.
          const cleanedObjections = sanitizeChannelMismatchArray(
            filterLocaleNative(parsed.data.objections, locale),
            parsed.data.country,
            locale,
          );
          const cleanedTrust = sanitizeChannelMismatchArray(
            filterLocaleNative(parsed.data.trustFactors, locale),
            parsed.data.country,
            locale,
          );
          channelMismatchCount += cleanedObjections.replacements + cleanedTrust.replacements;
          const cleaned = {
            ...parsed.data,
            id: parsed.data.id ?? crypto.randomUUID(),
            objections: cleanedObjections.items,
            trustFactors: cleanedTrust.items,
            interests: filterLocaleNative(parsed.data.interests, locale),
            voice: channelVoice.sanitized || sanitizedVoice || "",
            // Attach the slot's pre-assigned base archetype so cross-sim
            // grouping can use it directly instead of regex-stripping the
            // LLM-emitted profession string. Some pool archetypes contain
            // parens themselves ("IT 직장인 (스니커즈·캐주얼 마니아)"),
            // which makes a strip-by-regex approach over-strip them; the
            // canonical base from the slot avoids that ambiguity.
            baseProfession: batchSlots[pi].profession || undefined,
          };
          roundPairs.push({ persona: cleaned, slot: batchSlots[pi] });
        }
        // Walk the slot list and collect anything we didn't fulfill —
        // truncation tail, unparseable entries, and any beyond arr.length.
        for (let si = 0; si < batchSlots.length; si++) {
          if (!fulfilledIndices.has(si)) unfilledSlots.push(batchSlots[si]);
        }
      }
      return { pairs: roundPairs, unfilledSlots };
    };

    if (missSlots.length > 0) {
      const main = await runPersonaBatchRound(missSlots, "main");
      freshPairs.push(...main.pairs);
      // Truncation retry — Gemini partial-array + OpenAI mid-array
      // truncation routinely lose 4-5 slots per batch silently. One
      // targeted retry of just the unfilled slots typically recovers
      // ≥80% of them. Bounded to a single retry pass so a chronically
      // failing provider can't burn budget retrying the same slots.
      if (main.unfilledSlots.length > 0) {
        console.warn(
          `[sim ${opts.simulationId}] truncation retry: ${main.unfilledSlots.length} unfilled persona slots`,
        );
        const retry = await runPersonaBatchRound(main.unfilledSlots, "retry");
        freshPairs.push(...retry.pairs);
        if (retry.unfilledSlots.length > 0) {
          console.warn(
            `[sim ${opts.simulationId}] persona slots still unfilled after retry: ${retry.unfilledSlots.length}/${main.unfilledSlots.length}`,
          );
        }
      }
    }

    // Save fresh base profiles to the pool so future sims can reuse them.
    // Only slot-assigned personas qualify (free-choice ones have no
    // base_profession to match on later).
    if (workspaceId) {
      const slotted = freshPairs.filter(({ slot }) => !!slot.profession);
      if (slotted.length > 0) {
        const poolRows = slotted.map(({ persona, slot }) => ({
          workspace_id: workspaceId,
          age_range: persona.ageRange,
          gender: persona.gender,
          country: persona.country,
          income_band: persona.incomeBand,
          profession: persona.profession,
          base_profession: slot.profession,
          interests: persona.interests,
          purchase_style: persona.purchaseStyle,
          price_sensitivity: persona.priceSensitivity,
          source_simulation_id: opts.simulationId,
          locale,
        }));
        const { data: inserted, error: insertErr } = await supabase
          .from("personas")
          .insert(poolRows)
          .select("id");
        if (insertErr) {
          console.warn(`[sim ${opts.simulationId}] pool insert failed: ${insertErr.message}`);
        } else if (inserted) {
          // Re-bind each persona's id to the pool-generated id so downstream
          // results carry the canonical pool reference.
          for (let i = 0; i < slotted.length && i < inserted.length; i++) {
            slotted[i].persona.id = inserted[i].id;
          }
        }
      }
    }

    // Track miss-stage counts for the distribution log.
    for (const fp of freshPairs) {
      personas.push(fp.persona);
      const code = (fp.persona.country ?? "").toUpperCase();
      generatedByCountry[code] = (generatedByCountry[code] ?? 0) + 1;
    }

    // ── 1c. Reaction generation for pool hits ────────────────────
    if (hits.length > 0) {
      const reactionRows: Array<{
        simulation_id: string;
        persona_id: string;
        trust_factors: string[];
        objections: string[];
        purchase_intent: number;
        voice: string;
      }> = [];

      /**
       * Run one reaction-generation round and return hits that didn't
       * receive a usable reaction (whole-batch failure, missing id in
       * response, or schema-parse failure). The retry pass picks those
       * back up — same Gemini/OpenAI partial-array failure mode that
       * affects fresh-persona batches.
       */
      const runReactionBatchRound = async (
        hitsToProcess: PoolHit[],
        attemptTag: string,
      ): Promise<{ unfilledHits: PoolHit[] }> => {
        if (hitsToProcess.length === 0) return { unfilledHits: [] };
        const batches: PoolHit[][] = [];
        for (let i = 0; i < hitsToProcess.length; i += PERSONA_BATCH) {
          batches.push(hitsToProcess.slice(i, i + PERSONA_BATCH));
        }
        const t0 = Date.now();
        const results = await runWithConcurrency(
          personaConcurrency,
          batches.map((batch) => () =>
            personaLLM.generate({
              system: PERSONA_REACTION_SYSTEM,
              prompt: personaReactionPrompt(
                projectInput,
                batch.map((h) => ({
                  id: h.base.id,
                  ageRange: h.base.age_range,
                  gender: h.base.gender,
                  country: h.base.country,
                  incomeBand: h.base.income_band,
                  profession: h.base.profession,
                  interests: h.base.interests ?? [],
                  purchaseStyle: h.base.purchase_style,
                  priceSensitivity: h.base.price_sensitivity as "low" | "medium" | "high",
                })),
                locale,
                referenceBlock,
              ),
              jsonSchema: { type: "object", properties: { reactions: { type: "array" } } },
              expectedArrayKey: "reactions",
              // 0.85 (up from 0.6) breaks the safe-default attractor: at
              // 0.6 every batch converged on "편안한 착용감" / "가격이
              // 높음" as the universal trust factor / objection, drowning
              // out the distinctive long-tail signals. Combined with the
              // anchor requirement and 30%-per-concept diversity quota in
              // the prompt, higher temp gives the LLM headroom to pick
              // from the long-tail anchors instead of the safe default.
              temperature: 0.85,
              // 12-persona batches in Korean reach ~7k output tokens
              // (rich trustFactors + objections + JSON wrapper). 4k
              // truncates the array mid-output → entire batch unparseable.
              // Bumped to 16384 on 2026-05-10 to match the fresh-
              // persona budget (Anthropic was hitting 8192 ceiling
              // mid-batch on the now-richer prompt).
              maxTokens: 16384,
            }),
          ),
        );
        console.log(
          `[sim ${opts.simulationId}] reaction batches (${attemptTag}): ${batches.length}, ` +
            `${((Date.now() - t0) / 1000).toFixed(1)}s`,
        );
        const unfilledHits: PoolHit[] = [];
        for (let bi = 0; bi < results.length; bi++) {
          const settled = results[bi];
          const batch = batches[bi];
          if (settled.status === "rejected") {
            console.warn(
              `[sim ${opts.simulationId}] reaction batch ${bi} (${attemptTag}) failed:`,
              settled.reason instanceof Error ? settled.reason.message : settled.reason,
            );
            unfilledHits.push(...batch);
            continue;
          }
          const r = settled.value;
          const wrapped = (r.json as { reactions?: unknown[] } | null)?.reactions;
          const arr = Array.isArray(wrapped) ? wrapped : [];
          if (arr.length === 0) {
            console.warn(
              `[sim ${opts.simulationId}] reaction batch ${bi} (${attemptTag}) returned no array — raw:`,
              r.text.slice(0, 400),
            );
          }
          // Build id → reaction map so we match by id (LLM may reorder).
          // Normalize ids for lookup. The LLM occasionally emits ids
          // with whitespace padding ("uuid-here ") or case differences
          // ("UUID-..." vs the persona's lowercase). Without this
          // normalization, those reactions silently fail to match
          // their persona, the hit goes to retry, and one retry pass
          // later we still don't match → permanent loss. Keying both
          // sides by trimmed-lowercase eliminates the silent drop.
          const normalizeId = (id: string) => id.trim().toLowerCase();
          const reactionMap = new Map<string, z.infer<typeof PersonaReactionSchema>>();
          let perBatchSchemaFails = 0;
          for (const raw of arr) {
            const parsed = PersonaReactionSchema.safeParse(raw);
            if (parsed.success) reactionMap.set(normalizeId(parsed.data.id), parsed.data);
            else perBatchSchemaFails++;
          }
          if (perBatchSchemaFails > 0) {
            console.warn(
              `[sim ${opts.simulationId}] reaction batch ${bi} (${attemptTag}): ${perBatchSchemaFails}/${arr.length} entries failed schema. Sample:`,
              JSON.stringify(arr[0]).slice(0, 300),
            );
          }
          for (const hit of batch) {
            const reaction = reactionMap.get(normalizeId(hit.base.id));
            if (!reaction) {
              // Hit didn't get a paired reaction — feed into retry
              // unless this IS the retry round (then accept loss).
              unfilledHits.push(hit);
              continue;
            }
            const trustFactorsLocale = filterLocaleNative(reaction.trustFactors, locale);
            const objectionsLocale = filterLocaleNative(reaction.objections, locale);
            const sanitizedReactionVoice = sanitizeVoice(reaction.voice, locale);
            if (reaction.voice && sanitizedReactionVoice === null) {
              voiceSlipCount++;
              console.warn(
                `[sim ${opts.simulationId}] voice slip dropped (reaction ${attemptTag}, ${hit.base.country}): ` +
                  `"${reaction.voice.slice(0, 80)}"`,
              );
            }
            const voiceLocaleClean = sanitizedReactionVoice ?? "";
            const channelVoiceR = sanitizeChannelMismatch(
              voiceLocaleClean,
              hit.base.country,
              locale,
            );
            if (channelVoiceR.replacements > 0) {
              channelMismatchCount += channelVoiceR.replacements;
              console.warn(
                `[sim ${opts.simulationId}] channel slip rewritten (reaction ${attemptTag}, ${hit.base.country}): ` +
                  `${channelVoiceR.replacements}× in "${voiceLocaleClean.slice(0, 80)}"`,
              );
            }
            const cleanedObjectionsR = sanitizeChannelMismatchArray(
              objectionsLocale,
              hit.base.country,
              locale,
            );
            const cleanedTrustR = sanitizeChannelMismatchArray(
              trustFactorsLocale,
              hit.base.country,
              locale,
            );
            channelMismatchCount += cleanedObjectionsR.replacements + cleanedTrustR.replacements;
            const trustFactors = cleanedTrustR.items;
            const objections = cleanedObjectionsR.items;
            const voice = channelVoiceR.sanitized || voiceLocaleClean;
            const merged = {
              id: hit.base.id,
              ageRange: hit.base.age_range,
              gender: hit.base.gender,
              country: hit.base.country,
              incomeBand: hit.base.income_band,
              profession: hit.base.profession,
              // Pool DB row carries base_profession from when the persona
              // was originally generated. Forward it so cross-sim grouping
              // can use the canonical base instead of regex-stripping the
              // LLM-emitted profession string.
              baseProfession: hit.base.base_profession || undefined,
              interests: hit.base.interests ?? [],
              purchaseStyle: hit.base.purchase_style,
              priceSensitivity: hit.base.price_sensitivity as "low" | "medium" | "high",
              trustFactors,
              objections,
              purchaseIntent: reaction.purchaseIntent,
              voice,
              adReaction: reaction.adReaction,
            };
            personas.push(merged);
            const code = (merged.country ?? "").toUpperCase();
            generatedByCountry[code] = (generatedByCountry[code] ?? 0) + 1;
            reactionRows.push({
              simulation_id: opts.simulationId,
              persona_id: hit.base.id,
              trust_factors: trustFactors,
              objections,
              purchase_intent: reaction.purchaseIntent,
              voice,
            });
          }
        }
        return { unfilledHits };
      };

      const mainReaction = await runReactionBatchRound(hits, "main");
      // Truncation retry — same pattern as fresh-persona path. Reaction
      // batches with id-keyed responses are particularly vulnerable: a
      // truncated array means specific persona ids never appeared in the
      // response and the pool persona is dropped from the sim entirely.
      // One retry pass with just the unfilled hits typically recovers
      // most of them.
      if (mainReaction.unfilledHits.length > 0) {
        console.warn(
          `[sim ${opts.simulationId}] reaction truncation retry: ${mainReaction.unfilledHits.length} unfilled hits`,
        );
        // Tally retry leftovers as parseSkips so the existing per-sim
        // log already accounts for them in the final count.
        const retryReaction = await runReactionBatchRound(mainReaction.unfilledHits, "retry");
        if (retryReaction.unfilledHits.length > 0) {
          parseSkips += retryReaction.unfilledHits.length;
          console.warn(
            `[sim ${opts.simulationId}] reaction hits still unfilled after retry: ${retryReaction.unfilledHits.length}/${mainReaction.unfilledHits.length}`,
          );
        }
      }

      // Persist reactions for traceability + bump pool usage stats. Both are
      // fire-and-forget for the simulation result itself — failures are
      // logged but don't poison the run.
      if (reactionRows.length > 0) {
        const { error: rxErr } = await supabase
          .from("simulation_persona_reactions")
          .insert(reactionRows);
        if (rxErr) {
          console.warn(
            `[sim ${opts.simulationId}] reaction insert failed: ${rxErr.message}`,
          );
        }
      }

      // Bump use_count + last_used_at on every hit persona so the pool's
      // sampling priority (least-used first) stays meaningful. Read-then-
      // write is racy but acceptable at our scale; future RPC can do it
      // atomically if it ever matters.
      const hitIds = hits.map((h) => h.base.id);
      const { data: currentCounts } = await supabase
        .from("personas")
        .select("id, use_count")
        .in("id", hitIds);
      const rows = (currentCounts ?? []) as Array<{ id: string; use_count: number | null }>;
      const now = new Date().toISOString();
      await Promise.all(
        rows.map((row) =>
          supabase
            .from("personas")
            .update({
              use_count: (row.use_count ?? 1) + 1,
              last_used_at: now,
            })
            .eq("id", row.id),
        ),
      );
    }
    if (parseSkips > 0) {
      console.warn(`[sim ${opts.simulationId}] skipped ${parseSkips} malformed personas`);
    }
    const targetByCountry = allSlots.reduce<Record<string, number>>((acc, s) => {
      acc[s.country] = (acc[s.country] ?? 0) + 1;
      return acc;
    }, {});
    const distributionLog = Object.entries(generatedByCountry)
      .map(([c, n]) => `${c}=${n}/${targetByCountry[c] ?? "?"}`)
      .join(" ");
    console.log(
      `[sim ${opts.simulationId}] generated ${personas.length} personas — distribution: ${distributionLog}`,
    );
    console.log(
      `[sim ${opts.simulationId}] voice slips: ${voiceSlipCount}/${personas.length} (locale=${locale}) · ` +
        `channel slips rewritten: ${channelMismatchCount}` +
        (voiceSlipCount === 0 && channelMismatchCount === 0 ? " ✓" : ""),
    );
    // Failover observability — log when any stage's actual provider
    // diverged from the assigned primary, so an outage shows up in
    // logs without needing to grep for "[failover]". Silent when no
    // stage failed over.
    if (
      personaActualProvider.name !== personaLLMRaw.name ||
      countryActualProvider.name !== countryLLMRaw.name ||
      pricingActualProvider.name !== pricingLLMRaw.name
    ) {
      console.warn(
        `[sim ${opts.simulationId}] stage providers (failover): ` +
          `personas=${personaActualProvider.name}` +
          (personaActualProvider.name !== personaLLMRaw.name ? ` (←${personaLLMRaw.name})` : "") +
          ` · countries=${countryActualProvider.name}` +
          (countryActualProvider.name !== countryLLMRaw.name ? ` (←${countryLLMRaw.name})` : "") +
          ` · pricing=${pricingActualProvider.name}` +
          (pricingActualProvider.name !== pricingLLMRaw.name ? ` (←${pricingLLMRaw.name})` : ""),
      );
    }

    // Diversity guardrail — observability signal for cluster dominance.
    // After all reaction filters (mismatch / generic-price / generic-launch /
    // bare-adjective) drop the LLM's safe-default phrases, cluster what
    // remains by token-overlap and check whether any single cluster still
    // absorbs >50% of personas. That's the user-visible "169% 가격이 높음"
    // failure mode — if it survives our filters, we want it in the logs so
    // we can extend the predicates instead of waiting for the user to
    // screenshot it. The numbers also feed the /admin/sim-quality dashboard.
    if (personas.length >= 10) {
      const trustItems: string[] = [];
      const trustPids: number[] = [];
      const objItems: string[] = [];
      const objPids: number[] = [];
      for (let pi = 0; pi < personas.length; pi++) {
        const p = personas[pi];
        for (const t of p.trustFactors ?? []) {
          const tt = t.trim();
          if (
            tt &&
            !isGenericTrustFactor(tt) &&
            !isBareAdjectiveSignal(tt)
          ) {
            trustItems.push(tt);
            trustPids.push(pi);
          }
        }
        for (const o of p.objections ?? []) {
          const oo = o.trim();
          if (
            oo &&
            !isGenericPriceObjection(oo) &&
            !isGenericLaunchConcern(oo) &&
            !isBareAdjectiveSignal(oo)
          ) {
            objItems.push(oo);
            objPids.push(pi);
          }
        }
      }
      const trustClusters = clusterStrings(trustItems, 0.5, {
        personaIds: trustPids,
      }).sort((a, b) => b.count - a.count);
      const objClusters = clusterStrings(objItems, 0.5, {
        personaIds: objPids,
      }).sort((a, b) => b.count - a.count);
      const topTrustShare = trustClusters[0]
        ? trustClusters[0].count / personas.length
        : 0;
      const topObjShare = objClusters[0]
        ? objClusters[0].count / personas.length
        : 0;
      const dominanceWarn =
        topTrustShare >= 0.5 || topObjShare >= 0.5 ? " ⚠ DOMINANCE" : " ✓";
      console.log(
        `[sim ${opts.simulationId}] post-filter cluster shares — ` +
          `top trust: "${trustClusters[0]?.text ?? "—"}" ${(topTrustShare * 100).toFixed(0)}% · ` +
          `top objection: "${objClusters[0]?.text ?? "—"}" ${(topObjShare * 100).toFixed(0)}%` +
          dominanceWarn,
      );
    }

    // Compress the persona pool into bounded statistical summaries before any
    // downstream LLM stage sees it. Country / pricing / synthesis prompts now
    // get histograms, top objections / trust factors, profession + age + income
    // distributions, plus a small set of stratified exemplars per country —
    // grounding scales with persona-pool quality, not with prompt size.
    const aggregate = aggregatePersonas(personas);

    // ── Stage 2: countries ─────────────────────────────────────
    // Multi-sample averaging: country scoring at single-call amplifies the
    // persona-aggregate's stochastic variance dramatically — empirically a
    // ±5pt swing in JP avg intent (50.6 vs 41.0 across 3 sims of same fixture)
    // produced a ±33pt swing in JP finalScore, which flipped bestCountry from
    // JP to TH. Three parallel calls + per-country median collapses the
    // amplification: outlier-low or outlier-high country LLM calls get washed
    // out by the other two. Cost is negligible (Haiku) and parallel so wall
    // time only grows by network jitter.
    await updateStage("scoring");
    const tCountries = Date.now();
    // Median over N parallel country-scoring calls. 5 is a sweet spot:
    // medians stabilise visibly between 3 and 5 (the bias from one outlier
    // sample drops from 33% weight to 20%) but adding a 6th or 7th call
    // gives diminishing returns relative to the extra LLM spend. Country
    // model is the cheap haiku/gpt-4o-mini tier so 5x is fine cost-wise;
    // they all fire concurrently so wall-clock is unchanged from 3.
    const COUNTRY_SAMPLES = (() => {
      const env = Number(process.env.LLM_COUNTRY_SAMPLES);
      if (Number.isFinite(env) && env > 0 && env <= 9) return Math.floor(env);
      return 5;
    })();
    const countryPromptText = countryPrompt(projectInput, aggregate, locale);
    const runCountryRound = async (sampleCount: number, attemptTag: string) =>
      Promise.all(
        Array.from({ length: sampleCount }, () =>
          countryLLM.generate({
            system: COUNTRY_SYSTEM,
            prompt: countryPromptText,
            jsonSchema: { type: "object", properties: { countries: { type: "array" } } },
            expectedArrayKey: "countries",
            // Keep variance among samples — too low and the median collapses
            // to a single answer, defeating the point. Same temp as pricing.
            temperature: 0.4,
            // Generous output budget so Korean rationale + ≤24 candidate
            // countries never gets truncated mid-JSON. Provider default of
            // 4096 cuts it close.
            maxTokens: 8192,
          }).catch((err) => {
            // Round-level catch so one rejected sample doesn't sink the
            // whole stage. Each failed sample is surfaced via the parse
            // step below and counted toward the retry trigger.
            console.warn(
              `[sim ${opts.simulationId}] country sample (${attemptTag}) failed:`,
              err instanceof Error ? err.message : err,
            );
            return null;
          }),
        ),
      );
    const countriesResps = await runCountryRound(COUNTRY_SAMPLES, "main");
    const countrySamples: Array<z.infer<typeof CountryScoreSchema>[]> = [];
    for (const resp of countriesResps) {
      if (!resp) continue;
      const parsed = z
        .object({ countries: z.array(CountryScoreSchema) })
        .safeParse(resp.json);
      if (parsed.success) countrySamples.push(parsed.data.countries);
    }
    // Truncation / coverage retry — under-coverage triggers when:
    //   (a) fewer than 3 samples parsed (single-call fluke or provider
    //       outage took out most of the round), or
    //   (b) any candidate country was scored by fewer than 3 samples
    //       (LLM truncated mid-array on multiple samples → that country
    //       has no median to compute against).
    // The retry runs 3 more samples; the aggregator just re-medians over
    // the larger pool. Bounded to one retry so a chronically-failing
    // provider doesn't burn budget.
    const expectedCountries = projectInput.candidateCountries.length;
    if (expectedCountries > 0 && countrySamples.length > 0) {
      const samplesPerCountry = new Map<string, number>();
      for (const sample of countrySamples) {
        for (const c of sample) {
          const code = c.country.toUpperCase();
          samplesPerCountry.set(code, (samplesPerCountry.get(code) ?? 0) + 1);
        }
      }
      const underCovered = projectInput.candidateCountries.filter(
        (c) => (samplesPerCountry.get(c.toUpperCase()) ?? 0) < 3,
      );
      const sampleShortfall = countrySamples.length < 3;
      if (sampleShortfall || underCovered.length > 0) {
        console.warn(
          `[sim ${opts.simulationId}] country coverage retry: ` +
            `${countrySamples.length}/${COUNTRY_SAMPLES} samples parsed, ` +
            `under-covered countries: [${underCovered.join(", ") || "—"}]`,
        );
        const retryResps = await runCountryRound(3, "retry");
        for (const resp of retryResps) {
          if (!resp) continue;
          const parsed = z
            .object({ countries: z.array(CountryScoreSchema) })
            .safeParse(resp.json);
          if (parsed.success) countrySamples.push(parsed.data.countries);
        }
      }
    }
    // Track + log scale slips (LLM scoring on 0-10 instead of 0-100) so we
    // can monitor frequency in production. The aggregator auto-rescales,
    // but we want visibility into how often the prompt fails.
    let scaleSlipsCount = 0;
    for (const sample of countrySamples) {
      if (sample.length > 0 && Math.max(...sample.map((c) => c.finalScore)) < 25) {
        scaleSlipsCount++;
        console.warn(
          `[sim ${opts.simulationId}] country sample on 0-10 scale (LLM mistake) — ` +
            `auto-rescaled. Top: ${sample.map((c) => `${c.country}=${c.finalScore}`).join(", ")}`,
        );
      }
    }
    const countryScores =
      countrySamples.length > 0 ? aggregateCountryScores(countrySamples) : [];
    // Diagnostic: how many of the LLM's country samples actually emitted
    // the components decomposition? If this is consistently 0 in prod
    // logs, the prompt isn't getting through and we need to push the
    // instruction harder (or wrap a critique pass that re-emits).
    if (countrySamples.length > 0) {
      const totalCountries = countrySamples.reduce((n, s) => n + s.length, 0);
      const withComponents = countrySamples.reduce(
        (n, s) => n + s.filter((c) => !!c.components).length,
        0,
      );
      console.log(
        `[sim ${opts.simulationId}] country components emitted: ${withComponents}/${totalCountries} ` +
          `(${totalCountries > 0 ? Math.round((withComponents / totalCountries) * 100) : 0}%)`,
      );
    }
    if (countrySamples.length > 0) {
      // Show per-sample bestCountry across the 3 calls so it's obvious in the
      // log when the LLM was internally inconsistent vs converged.
      const bestPerSample = countrySamples
        .map((sample) => {
          const top = [...sample].sort((a, b) => b.finalScore - a.finalScore)[0];
          return top ? `${top.country}=${top.finalScore.toFixed(0)}` : "?";
        })
        .join(" / ");
      const medianBest = [...countryScores].sort((a, b) => b.finalScore - a.finalScore)[0];
      console.log(
        `[sim ${opts.simulationId}] countries: ${countrySamples.length}/${COUNTRY_SAMPLES} samples ` +
          `→ best per sample: ${bestPerSample} → median best: ` +
          `${medianBest?.country ?? "?"}=${medianBest?.finalScore.toFixed(0) ?? "?"} — ` +
          `${((Date.now() - tCountries) / 1000).toFixed(1)}s`,
      );
    } else {
      console.warn(
        `[sim ${opts.simulationId}] countries: all ${COUNTRY_SAMPLES} samples failed to parse — ` +
          `${((Date.now() - tCountries) / 1000).toFixed(1)}s`,
      );
    }

    // ── Stage 3: pricing ───────────────────────────────────────
    // Multi-sample averaging: pricing is the noisiest stage in the pipeline
    // (same persona aggregate can yield $22 vs $28 across runs). Three parallel
    // calls + median-by-recommendedPrice gives a stable signal at +5-7% total
    // sim cost (pricing is a small slice of the pipeline). Other stages stay
    // single-call — synthesis variance is mitigated separately via lower temp.
    await updateStage("pricing");
    const tPricing = Date.now();

    // Stage 3a: competitor price anchors. Prefer the ensemble-level
    // pre-extraction (passed via opts.competitorPrices) — that path
    // runs once per ensemble and feeds personas BEFORE this stage
    // executes, so the LLM gets factual prices when generating
    // reactions. Fall back to per-sim extraction when ensemble didn't
    // pre-fetch (standalone sim runs).
    let competitorPriceResults: Awaited<ReturnType<typeof extractCompetitorPrices>> = [];
    if (opts.competitorPrices && opts.competitorPrices.length > 0) {
      // Type assertion is safe — opts.competitorPrices already conforms
      // to CompetitorPriceResult shape (verified by route.ts when it
      // calls extractCompetitorPrices itself).
      competitorPriceResults =
        opts.competitorPrices as typeof competitorPriceResults;
      const ok = competitorPriceResults.filter((r) => r.status === "extracted");
      console.log(
        `[sim ${opts.simulationId}] competitor prices (ensemble-cached): ${ok.length}/${competitorPriceResults.length}`,
      );
    } else if (opts.projectInput.competitorUrls.length > 0) {
      const tComp = Date.now();
      try {
        competitorPriceResults = await extractCompetitorPrices({
          urls: opts.projectInput.competitorUrls,
          productCategory: opts.projectInput.category,
          targetCurrency: opts.projectInput.currency,
          locale: locale === "ko" ? "ko" : "en",
        });
        const ok = competitorPriceResults.filter((r) => r.status === "extracted");
        console.log(
          `[sim ${opts.simulationId}] competitor prices: ${ok.length}/${competitorPriceResults.length} extracted in ${((Date.now() - tComp) / 1000).toFixed(1)}s` +
            (ok.length > 0
              ? ` — ${ok.map((r) => `${r.productName ?? "?"}=${r.priceCents}`).join(" / ")}`
              : ""),
        );
      } catch (err) {
        // Non-fatal — pricing stage continues without competitor anchor.
        console.warn(`[sim ${opts.simulationId}] competitor extraction failed:`, err);
      }
    }
    const competitorAnchorPrices = competitorPriceResults
      .filter((r) => r.status === "extracted" && r.priceCents != null)
      .map((r) => r.priceCents!);

    // Stage 3b: dynamic pricing range based on persona sensitivity +
    // competitor anchors. Replaces the hardcoded 0.5x-2.0x default.
    const pricingRange = computePricingRange({
      basePriceCents: opts.projectInput.basePriceCents,
      priceSensitivity: aggregate.overall.priceSensitivity,
      competitorPriceCents: competitorAnchorPrices,
    });
    if (pricingRange.rationale.length > 0) {
      console.log(
        `[sim ${opts.simulationId}] pricing range: ${pricingRange.minCents}-${pricingRange.maxCents} ` +
          `(${pricingRange.rationale.join("; ")})`,
      );
    }

    // Same 3 → 5 bump as country scoring; pricing variance has the same
    // outlier sensitivity (one sample suggesting $9 when median is $25
    // shouldn't move the recommendation much). Env override mirrors
    // LLM_COUNTRY_SAMPLES for parity.
    const PRICING_SAMPLES = (() => {
      const env = Number(process.env.LLM_PRICING_SAMPLES);
      if (Number.isFinite(env) && env > 0 && env <= 9) return Math.floor(env);
      return 5;
    })();
    // Build margin grounding block from ensemble-level Tavily snippets.
    // Empty string when no key / no results; pricingPrompt then skips
    // the citation ask altogether and falls back to prompt-anchor logic.
    const marginGroundingBlock =
      (opts.marginSnippets?.length ?? 0) > 0
        ? formatMarginBenchmarkBlock(opts.marginSnippets!, locale === "ko", 4)
        : undefined;
    const pricingPromptText = pricingPrompt(
      projectInput,
      aggregate,
      locale,
      pricingRange,
      competitorPriceResults
        .filter((r) => r.status === "extracted")
        .map((r) => ({
          url: r.url,
          priceCents: r.priceCents!,
          productName: r.productName,
        })),
      marginGroundingBlock,
    );
    const pricingResps = await Promise.all(
      Array.from({ length: PRICING_SAMPLES }, () =>
        pricingLLM.generate({
          system: PRICING_SYSTEM,
          prompt: pricingPromptText,
          jsonSchema: PricingResultSchema as unknown as object,
          // Keep variance among the 3 samples — too low and the median
          // collapses to a single answer, defeating the whole point.
          temperature: 0.4,
          maxTokens: 4096,
        }),
      ),
    );
    const pricingCandidates: Array<z.infer<typeof PricingResultSchema>> = [];
    for (const resp of pricingResps) {
      const parsed = PricingResultSchema.safeParse(resp.json);
      if (parsed.success) pricingCandidates.push(parsed.data);
    }
    // Currency-scale sanity correction. LLMs occasionally emit prices in
    // a different currency scale than the project's input currency — most
    // commonly when the recommended country uses a different currency
    // (e.g. KRW-input project recommending TW returned prices in TWD,
    // showing as ₩3,300 instead of ₩116,900). Bound: every emitted price
    // (recommendedPriceCents AND each curve.priceCents) must land in
    // [base × 0.3, base × 5].
    //
    // Curve filtering matters as much as the headline check. The display
    // pipeline auto-corrects to the curve's revenue max when LLM rec
    // diverges from it by >10% — so a sane rec + a single off-scale
    // curve point produces an off-scale headline (real Le Mouton run
    // showed ₩186k rec but ₩2.8M headline because one curve point had
    // priceCents in 100× scale).
    //
    // Strategy per candidate:
    //   1. Filter curve points to in-bounds only
    //   2. If <2 points remain, the whole emission was off-scale — drop
    //   3. If rec is in bounds, keep with filtered curve
    //   4. Else try filtered-curve revenue max as the rec; drop if still bad
    const basePriceCents = projectInput.basePriceCents;
    if (basePriceCents > 0 && pricingCandidates.length > 0) {
      const lowBound = basePriceCents * 0.3;
      const highBound = basePriceCents * 5;
      const inBounds = (n: number) => n >= lowBound && n <= highBound;
      const correctedCandidates: Array<z.infer<typeof PricingResultSchema>> = [];
      for (const cand of pricingCandidates) {
        const filteredCurve = cand.curve.filter((p) => inBounds(p.priceCents));
        const droppedCurvePoints = cand.curve.length - filteredCurve.length;
        if (filteredCurve.length < 2) {
          console.warn(
            `[sim ${opts.simulationId}] pricing candidate dropped — only ${filteredCurve.length}/${cand.curve.length} curve points in [${lowBound}, ${highBound}]; likely currency-scale error`,
          );
          continue;
        }
        if (droppedCurvePoints > 0) {
          console.warn(
            `[sim ${opts.simulationId}] pricing candidate kept after dropping ${droppedCurvePoints} off-scale curve point(s)`,
          );
        }
        if (inBounds(cand.recommendedPriceCents)) {
          correctedCandidates.push({ ...cand, curve: filteredCurve });
          continue;
        }
        // Map LLM curve (conversionProbability) to the shared helper's
        // shape (meanConversionProbability) — the helper is also used
        // post-aggregation where points carry mean across sims.
        const curveMax = computeCurveRevenueMaxCents(
          filteredCurve.map((p) => ({
            priceCents: p.priceCents,
            meanConversionProbability: p.conversionProbability,
          })),
        );
        if (curveMax != null && inBounds(curveMax)) {
          console.warn(
            `[sim ${opts.simulationId}] pricing rec out of bounds (${cand.recommendedPriceCents} cents vs base ${basePriceCents}); replacing rec with filtered-curve revenue max (${curveMax} cents)`,
          );
          correctedCandidates.push({
            ...cand,
            curve: filteredCurve,
            recommendedPriceCents: curveMax,
          });
        } else {
          console.warn(
            `[sim ${opts.simulationId}] pricing candidate dropped — rec (${cand.recommendedPriceCents}) out of bounds and filtered-curve max (${curveMax}) didn't recover it`,
          );
        }
      }
      pricingCandidates.length = 0;
      pricingCandidates.push(...correctedCandidates);
    }
    let pricing: ReturnType<typeof PricingResultSchema.safeParse>;
    if (pricingCandidates.length === 0) {
      // All 3 samples malformed — let downstream fall back as before.
      pricing = PricingResultSchema.safeParse(null);
    } else {
      // Sort by recommended price, take the candidate at median position.
      // Returning the FULL median candidate (curve + margin + price) keeps
      // every field internally consistent — vs averaging price across the 3
      // and taking curves from one, which would mismatch.
      pricingCandidates.sort(
        (a, b) => a.recommendedPriceCents - b.recommendedPriceCents,
      );
      const medianIdx = Math.floor(pricingCandidates.length / 2);
      // Within-sim std of recommended price across the resampling rolls.
      // When sims later collapse to identical medians (LLMs love
      // psychological-anchor prices like $49.95) this is the only
      // surface where true LLM noise is visible.
      const candidatePrices = pricingCandidates.map((c) => c.recommendedPriceCents);
      const candidateMean =
        candidatePrices.reduce((a, b) => a + b, 0) / candidatePrices.length;
      const candidateStd =
        candidatePrices.length < 2
          ? 0
          : Math.sqrt(
              candidatePrices.reduce(
                (a, b) => a + (b - candidateMean) ** 2,
                0,
              ) / candidatePrices.length,
            );
      // Attach range + competitor metadata to the chosen median candidate
      // so the persisted pricing carries the context (used by UI / PDF
      // to display the basis for the recommendation).
      const enriched = {
        ...pricingCandidates[medianIdx],
        recommendedPriceStd: Math.round(candidateStd),
        recommendedPriceSampleN: pricingCandidates.length,
        range: {
          minCents: pricingRange.minCents,
          maxCents: pricingRange.maxCents,
          rationale: pricingRange.rationale,
        },
        competitorPrices: competitorPriceResults
          .filter((r) => r.status === "extracted" && r.priceCents != null)
          .map((r) => ({
            url: r.url,
            priceCents: r.priceCents!,
            productName: r.productName,
            sourceCurrency: r.sourceCurrency,
          })),
      };
      pricing = PricingResultSchema.safeParse(enriched);
      console.log(
        `[sim ${opts.simulationId}] pricing samples: ${pricingCandidates
          .map((p) => `$${(p.recommendedPriceCents / 100).toFixed(2)}`)
          .join(" / ")} → median $${(
          pricingCandidates[medianIdx].recommendedPriceCents / 100
        ).toFixed(2)} — ${((Date.now() - tPricing) / 1000).toFixed(1)}s`,
      );
    }

    // ── Stage 4: synthesis ─────────────────────────────────────
    await updateStage("recommend");
    const tSynth = Date.now();
    // Vision is currently Anthropic-only — drop image URLs for other
    // providers so they don't go into a text prompt where they'd just look
    // like raw URLs the model can't see (and would tempt it to invent
    // visual analyses it can't actually perform).
    //
    // Prefer pre-fetched inline assets when the ensemble layer supplied
    // them (caller fetched URLs once, converted to base64). That keeps
    // Anthropic from making the URL fetch itself, which is the failure
    // mode that took out 5/9 Anthropic sims on 2026-05-08 (HTTP 400
    // "timed out while trying to download the file", `x-should-retry:
    // false`). Fall back to URL form only when the caller didn't
    // pre-fetch — same behaviour as before.
    const isAnthropic = synthesisLLM.name === "anthropic";
    const synthesisInlineAssets =
      isAnthropic && opts.inlineAssets && opts.inlineAssets.length > 0
        ? opts.inlineAssets
        : undefined;
    const synthesisImages =
      isAnthropic && !synthesisInlineAssets
        ? projectInput.assetUrls ?? []
        : [];
    const synthesisPromptText = synthesisPrompt(
      projectInput,
      aggregate,
      JSON.stringify(countryScores),
      JSON.stringify(pricing.success ? pricing.data : {}),
      locale,
    );
    // Rough token estimate (chars / 4) so we can spot when aggregator
    // compression isn't keeping up at higher persona counts. Synthesis is the
    // densest prompt in the pipeline; if this trends past ~60k chars on a
    // 500-persona sim we need to tighten aggregate.ts.
    console.log(
      `[sim ${opts.simulationId}] synthesis prompt: ${synthesisPromptText.length.toLocaleString()} chars ` +
        `(~${Math.round(synthesisPromptText.length / 4).toLocaleString()} tokens est.)`,
    );
    const synthesisResp = await synthesisLLM.generate({
      system: SYNTHESIS_SYSTEM,
      prompt: synthesisPromptText,
      images: synthesisImages,
      imagesInline: synthesisInlineAssets,
      jsonSchema: {
        type: "object",
        properties: {
          overview: { type: "object" },
          creative: { type: "array" },
          risks: { type: "array" },
          recommendations: { type: "object" },
        },
      },
      // Lowered from 0.5 to 0.3 to reduce run-to-run variance in synthesis
      // (best-country swap, action-plan reordering) without crushing the
      // model's ability to write nuanced executive prose. Still enough
      // entropy to vary phrasing batch-to-batch but tightens core decisions.
      temperature: 0.3,
      // Synthesis output is the densest in the pipeline — Korean executive
      // summary (3 paragraphs) + 6 risks with descriptions + 8-step action
      // plan + 10 channel rows easily reaches 3.5–4k output tokens, which
      // tips over the provider default of 4096 and silently truncates the
      // JSON. 16k gives plenty of headroom and is still well under tier
      // output caps.
      maxTokens: 16384,
    });
    console.log(
      `[sim ${opts.simulationId}] synthesis: ${((Date.now() - tSynth) / 1000).toFixed(1)}s ` +
        `(in=${synthesisResp.usage?.inputTokens ?? "?"}, out=${synthesisResp.usage?.outputTokens ?? "?"})`,
    );

    const synthesis = z
      .object({
        overview: OverviewSchema,
        creative: z.array(
          z.object({
            assetName: z.string(),
            score: z.number(),
            strengths: z.array(z.string()),
            weaknesses: z.array(z.string()),
          }),
        ),
        risks: z.array(RiskSchema),
        recommendations: RecommendationSchema,
      })
      .safeParse(synthesisResp.json);

    const result: SimulationResult = {
      overview: synthesis.success
        ? synthesis.data.overview
        : fallbackOverview(projectInput, countryScores, personas),
      countries: countryScores,
      personas,
      pricing: pricing.success ? pricing.data : fallbackPricing(projectInput),
      creative: synthesis.success ? synthesis.data.creative : [],
      risks: synthesis.success ? synthesis.data.risks : [],
      recommendations: synthesis.success
        ? synthesis.data.recommendations
        : { executiveSummary: "", actionPlan: [], channels: [] },
    };

    // ── Stage 4b: synthesis critique ───────────────────────────
    // Audit the synthesis result against the underlying data and apply
    // mechanical fixes for any inconsistency the auditor catches. This is
    // where flaky LLM outputs (bestCountry mismatch with country ranking,
    // riskLevel out of step with the risks array, etc.) get corrected
    // BEFORE persisting — saves the user from seeing nonsensical results.
    // Only runs when synthesis itself succeeded; fallback path skips it.
    if (synthesis.success) {
      try {
        const tCrit = Date.now();
        const critiqueResp = await synthesisLLM.generate({
          system: SYNTHESIS_CRITIQUE_SYSTEM,
          prompt: synthesisCritiquePrompt(
            projectInput,
            JSON.stringify(countryScores),
            JSON.stringify(pricing.success ? pricing.data : {}),
            JSON.stringify({
              overview: result.overview,
              risks: result.risks,
            }),
            locale,
          ),
          jsonSchema: {
            type: "object",
            properties: {
              issues: { type: "array" },
              fixes: { type: "object" },
            },
          },
          // Low temp: this is a structured consistency check, not creative
          // writing — we want stable, predictable corrections.
          temperature: 0.2,
          maxTokens: 4096,
        });
        const critique = SynthesisCritiqueSchema.safeParse(critiqueResp.json);
        if (critique.success) {
          const { issues, fixes } = critique.data;
          if (issues.length > 0 || Object.keys(fixes).length > 0) {
            console.log(
              `[sim ${opts.simulationId}] critique: ${issues.length} issue(s), ` +
                `${Object.keys(fixes).length} fix(es) — ${((Date.now() - tCrit) / 1000).toFixed(1)}s`,
            );
            for (const issue of issues) {
              console.log(`  • ${issue}`);
            }
            // Apply fixes mechanically. Each field in `fixes` overrides the
            // matching field on overview. We DO NOT regenerate downstream
            // text (executive summary, action plan) — those still reflect
            // synthesis's reasoning; only the headline KPI fields snap.
            if (fixes.bestCountry) result.overview.bestCountry = fixes.bestCountry;
            if (fixes.riskLevel) result.overview.riskLevel = fixes.riskLevel;
            if (typeof fixes.bestPriceCents === "number") {
              result.overview.bestPriceCents = fixes.bestPriceCents;
            }
            if (fixes.bestSegment) result.overview.bestSegment = fixes.bestSegment;
            if (fixes.headline) result.overview.headline = fixes.headline;
          } else {
            console.log(
              `[sim ${opts.simulationId}] critique: clean — ` +
                `${((Date.now() - tCrit) / 1000).toFixed(1)}s`,
            );
          }
        } else {
          console.warn(
            `[sim ${opts.simulationId}] critique parse failed — skipping fixes`,
          );
        }
      } catch (err) {
        // Critique failure is non-fatal: persist synthesis as-is. We don't
        // want a flaky audit pass to gate on returning the user's report.
        console.warn(
          `[sim ${opts.simulationId}] critique error — skipping`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    // ── Persist ────────────────────────────────────────────────
    // Stash reference-data attribution + regulatory check alongside the overview so
    // UI/PDF can render them. The OverviewSchema strips unknown fields when parsing
    // LLM output, so we add `_sources` and `_regulatory` here on the persistence path
    // — they survive because Postgres stores overview as JSONB.
    const overviewWithSources = {
      ...result.overview,
      _sources: referenceSources,
      _regulatory: {
        regulatedCategory: regulatory.result.regulatedCategory,
        excludedCountries: regulatory.excludedCountries,
        restrictedCountries: regulatory.restrictedCountries,
        // Surface only entries with status != "allowed" so the UI doesn't render noise.
        warnings: regulatory.result.checks.filter((c) => c.status !== "allowed"),
      },
    };
    await supabase.from("simulation_results").upsert({
      simulation_id: opts.simulationId,
      overview: overviewWithSources,
      countries: result.countries,
      personas: result.personas,
      pricing: result.pricing,
      creative: result.creative,
      risks: result.risks,
      recommendations: result.recommendations,
    });

    // Denormalize the headline metrics onto the row so list views
    // (/reports, /dashboard) don't need to join simulation_results.
    // The .neq("status", "cancelled") gate ensures a late-arriving runner
    // can't overwrite a user-cancelled sim back to "completed".
    await supabase
      .from("simulations")
      .update({
        status: "completed",
        current_stage: "completed",
        completed_at: new Date().toISOString(),
        success_score: result.overview?.successScore ?? null,
        best_country: result.overview?.bestCountry ?? null,
        recommended_price_cents: result.pricing?.recommendedPriceCents ?? null,
        // Token + cost totals captured by the LLM-wrapper accumulator.
        // Persisted now so admin/billing has data without re-reading
        // simulation_results.
        total_input_tokens: usage.inputTokens,
        total_output_tokens: usage.outputTokens,
        total_cost_cents: usage.costCents,
        // Honest synthesis attribution: null when no failover fired
        // (assigned provider was used end-to-end); the actual fallback
        // provider name when a 5xx forced us to switch.
        synthesis_provider:
          synthesisActualProvider !== synthesisLLMRaw.name ? synthesisActualProvider : null,
      })
      .eq("id", opts.simulationId)
      .neq("status", "cancelled");

    if (synthesisActualProvider !== synthesisLLMRaw.name) {
      console.warn(
        `[sim ${opts.simulationId}] synthesis fell over: ${synthesisLLMRaw.name} → ${synthesisActualProvider}`,
      );
    }

    // Top-level wall-clock — print after persistence so the line shows up
    // last in the log stream, makes it easy to scroll back and see the total.
    console.log(
      `[sim ${opts.simulationId}] DONE — ${((Date.now() - tSimStart) / 1000).toFixed(1)}s ` +
        `total · ${personas.length} personas · ${countryScores.length} markets · ` +
        `${(usage.inputTokens / 1000).toFixed(1)}k in + ${(usage.outputTokens / 1000).toFixed(1)}k out → ` +
        `$${(usage.costCents / 100).toFixed(2)}`,
    );

    // Look up workspace + project so the success email + project status
    // update both have what they need without two extra round-trips.
    // ensemble_id tells us whether this sim is one of N inside a deep/decision
    // run — if so, the per-sim notification is suppressed and the ensemble
    // route sends a single rollup email instead.
    const { data: simRow } = await supabase
      .from("simulations")
      .select("project_id, workspace_id, ensemble_id")
      .eq("id", opts.simulationId)
      .single();
    if (simRow?.project_id) {
      await supabase
        .from("projects")
        .update({ status: "completed" })
        .eq("id", simRow.project_id);
    }

    // Quality audit — runs after persistence so a critical bug in
    // the audit module can never roll back a successful sim. Best-
    // effort: try/catch swallows any failure and logs.
    if (simRow?.workspace_id) {
      try {
        const audit = auditQuality({
          simulationId: opts.simulationId,
          workspaceId: simRow.workspace_id,
          personas,
          countries: countryScores,
          pricing: result.pricing ?? null,
          basePriceCents: opts.projectInput.basePriceCents ?? null,
          voiceSlipRate: personas.length > 0 ? voiceSlipCount / personas.length : null,
          channelMismatchCount,
          synthesisFailover: synthesisActualProvider !== synthesisLLMRaw.name,
          personaCount: personas.length,
          personaCountTarget: opts.personaCount,
        });
        await persistAudit(
          { simulationId: opts.simulationId, workspaceId: simRow.workspace_id },
          audit,
        );
        if (audit.warnings.length > 0) {
          console.warn(
            `[sim ${opts.simulationId}] quality audit: confidence=${audit.confidenceScore}, ` +
              `quarantined=${audit.quarantined}, warnings=${audit.warnings.length}`,
          );
        }
      } catch (err) {
        console.warn(`[sim ${opts.simulationId}] quality audit failed (non-fatal):`, err);
      }
    }

    // Notify after persistence so the email link always resolves to a
    // completed sim. Best-effort: a missing RESEND_API_KEY or send error
    // logs and moves on without disturbing the simulation outcome.
    // Skip when the sim belongs to an ensemble — otherwise a 25-sim deep
    // run would spam the recipient 25 times before the rollup email lands.
    if (simRow?.workspace_id && simRow.project_id && !simRow.ensemble_id) {
      await notifySimulationComplete({
        simulationId: opts.simulationId,
        workspaceId: simRow.workspace_id,
        projectId: simRow.project_id,
        productName: opts.projectInput.productName,
        locale: locale === "ko" ? "ko" : "en",
        successScore: result.overview?.successScore ?? null,
        bestCountry: result.overview?.bestCountry ?? null,
        recommendedPriceCents: result.pricing?.recommendedPriceCents ?? null,
      });
    }

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // User-cancelled simulations exit through the same throw path but should
    // NOT trigger failure side effects: row is already 'cancelled', operators
    // don't need a notification, and we shouldn't downgrade status to 'failed'.
    if (message === CANCELLED_ERR) {
      console.log(
        `[sim ${opts.simulationId}] cancelled by user after $${(usage.costCents / 100).toFixed(2)} of LLM spend`,
      );
      // Persist the partial token / cost numbers so admin/billing can
      // count the spend that actually happened. Without this, cancelled
      // sims show null cost and the rollup undercounts the Anthropic
      // invoice by the LLM tokens we already burned through. We don't
      // override status (already 'cancelled') — only the usage columns.
      await supabase
        .from("simulations")
        .update({
          total_input_tokens: usage.inputTokens,
          total_output_tokens: usage.outputTokens,
          total_cost_cents: usage.costCents,
        })
        .eq("id", opts.simulationId);
      return undefined as unknown as SimulationResult;
    }
    // Don't overwrite current_stage here — leave it pointing at whatever
    // updateStage() set it to last. The admin health dashboard groups failures
    // by stage to show which step in the pipeline is breaking, and that
    // signal is lost if every failed row reports current_stage='failed'.
    // .neq("status", "cancelled") so a cancel that landed mid-flight isn't
    // silently rewritten to 'failed'.
    // Same usage-persistence rationale as the cancellation path: a sim
    // that failed at synthesis still consumed full persona-stage tokens,
    // and pretending it cost $0 in the billing rollup is just wrong.
    await supabase
      .from("simulations")
      .update({
        status: "failed",
        error_message: message,
        total_input_tokens: usage.inputTokens,
        total_output_tokens: usage.outputTokens,
        total_cost_cents: usage.costCents,
      })
      .eq("id", opts.simulationId)
      .neq("status", "cancelled");

    // Notify on failure too — operators want to know without polling.
    // Same suppression as the success path: ensemble sims roll up into a
    // single email rather than spamming once per failed sim.
    const { data: simRow } = await supabase
      .from("simulations")
      .select("project_id, workspace_id, ensemble_id")
      .eq("id", opts.simulationId)
      .single();
    if (simRow?.workspace_id && simRow.project_id && !simRow.ensemble_id) {
      await notifySimulationFailed({
        simulationId: opts.simulationId,
        workspaceId: simRow.workspace_id,
        projectId: simRow.project_id,
        productName: opts.projectInput.productName,
        locale: locale === "ko" ? "ko" : "en",
        errorMessage: message,
      });
    }

    throw err;
  } finally {
    // Always stop the cancel watchdog — leaking the interval would
    // keep a 5s DB read hammering after every sim ended.
    clearInterval(cancelWatchInterval);
  }
}

function fallbackOverview(
  input: ProjectInput,
  countries: z.infer<typeof CountryScoreSchema>[],
  personas: z.infer<typeof PersonaSchema>[],
): z.infer<typeof OverviewSchema> {
  const avgIntent = personas.reduce((s, p) => s + p.purchaseIntent, 0) / Math.max(personas.length, 1);
  const top = countries[0];
  return {
    successScore: Math.round(avgIntent),
    bestCountry: top?.country ?? input.candidateCountries[0] ?? "",
    bestSegment: "Synthesis unavailable",
    bestPriceCents: input.basePriceCents,
    bestCreative: null,
    riskLevel: avgIntent > 60 ? "low" : avgIntent > 35 ? "medium" : "high",
    headline: "Result generated with partial synthesis.",
  };
}

function fallbackPricing(input: ProjectInput): z.infer<typeof PricingResultSchema> {
  const base = input.basePriceCents;
  const curve = [0.6, 0.8, 1.0, 1.2, 1.5].map((m) => ({
    priceCents: Math.round(base * m),
    conversionProbability: Math.max(0.05, 0.5 - (m - 1) * 0.2),
    estimatedRevenueIndex: 1,
  }));
  return { recommendedPriceCents: base, marginEstimate: "n/a", curve };
}

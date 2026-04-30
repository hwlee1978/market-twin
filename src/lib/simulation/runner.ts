import { getLLMProvider } from "@/lib/llm";
import type { LLMProviderName } from "@/lib/llm";
import {
  collectSourceAttributions,
  loadReferenceBundles,
  renderReferenceBlock,
} from "@/lib/reference";
import { createServiceClient } from "@/lib/supabase/server";
import {
  countryPrompt,
  COUNTRY_SYSTEM,
  personaPrompt,
  PERSONA_SYSTEM,
  pricingPrompt,
  PRICING_SYSTEM,
  type PromptLocale,
  synthesisPrompt,
  SYNTHESIS_SYSTEM,
} from "./prompts";
import { evaluateRegulatory } from "./regulatory";
import { filterLocaleNative } from "./locale-filter";
import { aggregatePersonas } from "./aggregate";
import {
  notifySimulationComplete,
  notifySimulationFailed,
} from "@/lib/email/notify";
import {
  CountryScoreSchema,
  OverviewSchema,
  PersonaSchema,
  PricingResultSchema,
  type ProjectInput,
  RecommendationSchema,
  RiskSchema,
  type SimulationResult,
} from "./schemas";
import { z } from "zod";

interface RunOptions {
  simulationId: string;
  projectInput: ProjectInput;
  personaCount: number;
  provider?: LLMProviderName;
  model?: string;
  locale?: PromptLocale;
}

// Smaller batches are more reliably completed by the LLM.
// gpt-4o-mini and similar tend to truncate or under-deliver when asked for 25
// detailed personas in one shot; 12 yields ≥ 90% of requested entries empirically.
const PERSONA_BATCH = 12;

// Number of persona batches fired in parallel against the LLM.
// Default 4 keeps us well under Anthropic Tier 1 RPM/TPM limits (~50 RPM,
// ~40k input TPM) for typical persona counts of 50–300. Higher tiers can
// raise this via env to unlock more speed.
const PERSONA_BATCH_CONCURRENCY = Math.max(
  1,
  Number(process.env.LLM_PERSONA_BATCH_CONCURRENCY ?? 4),
);

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

/**
 * Even split of `total` across the candidate countries (remainder spread to the
 * first few in input order). Used as the across-batches target — see
 * `allocateBatchQuota` for the per-batch slice.
 */
function computeCountryQuota(total: number, countries: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  if (countries.length === 0) return out;
  const base = Math.floor(total / countries.length);
  const remainder = total - base * countries.length;
  countries.forEach((c, i) => {
    out[c] = base + (i < remainder ? 1 : 0);
  });
  return out;
}

/**
 * Round-robin allocation of `batchSize` slots across countries, drawing from the
 * `remaining` quota pool. Mutates `remaining` in place. Stops early when the pool
 * is exhausted (covers the edge case where the previous batch over-shot somewhere
 * — we just allocate what's left).
 */
function allocateBatchQuota(
  remaining: Record<string, number>,
  batchSize: number,
): Record<string, number> {
  const out: Record<string, number> = {};
  const codes = Object.keys(remaining);
  if (codes.length === 0) return out;
  let allocated = 0;
  let cursor = 0;
  let exhausted = 0;
  while (allocated < batchSize && exhausted < codes.length) {
    const c = codes[cursor % codes.length];
    if (remaining[c] > 0) {
      out[c] = (out[c] ?? 0) + 1;
      remaining[c]--;
      allocated++;
      exhausted = 0;
    } else {
      exhausted++;
    }
    cursor++;
  }
  return out;
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
  const personaLLM = getLLMProvider({ stage: "personas", provider: opts.provider, model: opts.model });
  const countryLLM = getLLMProvider({ stage: "countries", provider: opts.provider, model: opts.model });
  const pricingLLM = getLLMProvider({ stage: "pricing", provider: opts.provider, model: opts.model });
  const synthesisLLM = getLLMProvider({ stage: "synthesis", provider: opts.provider, model: opts.model });
  // Regulatory check uses the synthesis-tier model: this needs to be reliable
  // about real laws (e.g. e-cigarette bans). Cheap models occasionally miss.
  const regulatoryLLM = synthesisLLM;

  const updateStage = async (stage: string) => {
    await supabase
      .from("simulations")
      .update({ current_stage: stage, status: "running" })
      .eq("id", opts.simulationId);
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

  try {
    // ── Stage 0: regulatory pre-check ──────────────────────────
    // Filter out countries where the product is legally banned BEFORE any
    // downstream stage sees them — otherwise persona/country scoring will
    // happily recommend an illegal market (e.g. e-cigarettes for Singapore).
    await updateStage("regulatory");
    const regulatory = await evaluateRegulatory(regulatoryLLM, opts.projectInput, locale);
    console.log(
      `[sim ${opts.simulationId}] regulatory: ${regulatory.allowedCountries.length} allowed, ` +
        `${regulatory.excludedCountries.length} excluded${regulatory.result.regulatedCategory ? ` (category: ${regulatory.result.regulatedCategory})` : ""}`,
    );
    // From here on, treat the filtered list as the candidate set for the simulation.
    const projectInput = {
      ...opts.projectInput,
      candidateCountries: regulatory.allowedCountries,
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
    const referenceBlock = renderReferenceBlock(referenceBundles, locale);
    const referenceSources = collectSourceAttributions(referenceBundles);

    // ── Stage 1: personas ──────────────────────────────────────
    await updateStage("personas");
    const personas: z.infer<typeof PersonaSchema>[] = [];
    const batchCount = Math.max(1, Math.ceil(opts.personaCount / PERSONA_BATCH));
    let parseSkips = 0;

    // Even-distribution quota across candidate countries. Without this, ko-locale
    // runs skew Korean-heavy because the LLM's strongest training prior + the
    // Korean reference-data examples both pull persona generation toward KR.
    const totalQuota = computeCountryQuota(
      opts.personaCount,
      projectInput.candidateCountries,
    );
    const generatedByCountry: Record<string, number> = {};
    for (const c of projectInput.candidateCountries) generatedByCountry[c] = 0;

    // Pre-compute every batch's quota up front so all batches can fire in
    // parallel — `allocateBatchQuota` mutates `remainingQuota` and we drain it
    // serially HERE before any LLM call goes out.
    const remainingQuota: Record<string, number> = { ...totalQuota };
    const batchPlans: Array<{ size: number; quota: Record<string, number> }> = [];
    for (let i = 0; i < batchCount; i++) {
      const remaining = opts.personaCount - i * PERSONA_BATCH;
      const size = Math.min(PERSONA_BATCH, remaining);
      const quota = allocateBatchQuota(remainingQuota, size);
      batchPlans.push({ size, quota });
    }

    // Fire batches in parallel (capped by PERSONA_BATCH_CONCURRENCY) — typical
    // 50-persona run drops from ~5 sequential calls (~8 min) to 1–2 concurrent
    // waves (~2 min). allSettled semantics so a single failed batch doesn't
    // crash the run; we just collect what we have and the country distribution
    // log surfaces any shortfall.
    const t0 = Date.now();
    const batchResults = await runWithConcurrency(
      PERSONA_BATCH_CONCURRENCY,
      batchPlans.map(({ size, quota }) => () =>
        personaLLM.generate({
          system: PERSONA_SYSTEM,
          prompt: personaPrompt(projectInput, size, locale, referenceBlock, quota),
          jsonSchema: { type: "object", properties: { personas: { type: "array" } } },
          // Lower temperature trades a bit of persona variety for much stricter
          // adherence to the locale-language and reference-anchor rules above.
          // Variety is preserved by the prompt explicitly asking for skeptics +
          // neutrals + champions and a heterogeneous mix.
          temperature: 0.6,
          maxTokens: 8192,
        }),
      ),
    );
    console.log(
      `[sim ${opts.simulationId}] persona batches: ${batchCount} batches, ` +
        `concurrency ${PERSONA_BATCH_CONCURRENCY}, total ${((Date.now() - t0) / 1000).toFixed(1)}s`,
    );

    for (let i = 0; i < batchResults.length; i++) {
      const settled = batchResults[i];
      if (settled.status === "rejected") {
        console.warn(
          `[sim ${opts.simulationId}] persona batch ${i} failed:`,
          settled.reason instanceof Error ? settled.reason.message : settled.reason,
        );
        continue;
      }
      const r = settled.value;
      // Parse personas individually so a single malformed entry doesn't reject the batch.
      const wrapped = (r.json as { personas?: unknown[] } | null)?.personas;
      const arr = Array.isArray(wrapped) ? wrapped : [];
      if (arr.length === 0) {
        console.warn(
          `[sim ${opts.simulationId}] persona batch ${i} returned no array — raw text snippet:`,
          r.text.slice(0, 200),
        );
      }
      for (const raw of arr) {
        const parsed = PersonaSchema.safeParse(raw);
        if (parsed.success) {
          // Strip locale-leaked entries from free-text array fields. Even though the
          // prompt forbids cross-language output, models occasionally leak the
          // persona's "native" language and pollute downstream aggregations.
          const cleaned = {
            ...parsed.data,
            id: parsed.data.id ?? crypto.randomUUID(),
            objections: filterLocaleNative(parsed.data.objections, locale),
            trustFactors: filterLocaleNative(parsed.data.trustFactors, locale),
            interests: filterLocaleNative(parsed.data.interests, locale),
          };
          personas.push(cleaned);
          const code = (cleaned.country ?? "").toUpperCase();
          generatedByCountry[code] = (generatedByCountry[code] ?? 0) + 1;
        } else {
          parseSkips++;
        }
      }
    }
    if (parseSkips > 0) {
      console.warn(`[sim ${opts.simulationId}] skipped ${parseSkips} malformed personas`);
    }
    const distributionLog = Object.entries(generatedByCountry)
      .map(([c, n]) => `${c}=${n}/${totalQuota[c] ?? "?"}`)
      .join(" ");
    console.log(
      `[sim ${opts.simulationId}] generated ${personas.length} personas — distribution: ${distributionLog}`,
    );

    // Compress the persona pool into bounded statistical summaries before any
    // downstream LLM stage sees it. Country / pricing / synthesis prompts now
    // get histograms, top objections / trust factors, profession + age + income
    // distributions, plus a small set of stratified exemplars per country —
    // grounding scales with persona-pool quality, not with prompt size.
    const aggregate = aggregatePersonas(personas);

    // ── Stage 2: countries ─────────────────────────────────────
    await updateStage("scoring");
    const countriesResp = await countryLLM.generate({
      system: COUNTRY_SYSTEM,
      prompt: countryPrompt(projectInput, aggregate, locale),
      jsonSchema: { type: "object", properties: { countries: { type: "array" } } },
      temperature: 0.4,
      // Generous output budget so Korean rationale + ≤24 candidate countries
      // never gets truncated mid-JSON. Provider default of 4096 cuts it close.
      maxTokens: 8192,
    });
    const countries = z
      .object({ countries: z.array(CountryScoreSchema) })
      .safeParse(countriesResp.json);
    const countryScores = countries.success ? countries.data.countries : [];

    // ── Stage 3: pricing ───────────────────────────────────────
    await updateStage("pricing");
    const pricingResp = await pricingLLM.generate({
      system: PRICING_SYSTEM,
      prompt: pricingPrompt(projectInput, aggregate, locale),
      jsonSchema: PricingResultSchema as unknown as object,
      temperature: 0.4,
      maxTokens: 4096,
    });
    const pricing = PricingResultSchema.safeParse(pricingResp.json);

    // ── Stage 4: synthesis ─────────────────────────────────────
    await updateStage("recommend");
    const synthesisResp = await synthesisLLM.generate({
      system: SYNTHESIS_SYSTEM,
      prompt: synthesisPrompt(
        projectInput,
        aggregate,
        JSON.stringify(countryScores),
        JSON.stringify(pricing.success ? pricing.data : {}),
        locale,
      ),
      jsonSchema: {
        type: "object",
        properties: {
          overview: { type: "object" },
          creative: { type: "array" },
          risks: { type: "array" },
          recommendations: { type: "object" },
        },
      },
      temperature: 0.5,
      // Synthesis output is the densest in the pipeline — Korean executive
      // summary (3 paragraphs) + 6 risks with descriptions + 8-step action
      // plan + 10 channel rows easily reaches 3.5–4k output tokens, which
      // tips over the provider default of 4096 and silently truncates the
      // JSON. 16k gives plenty of headroom and is still well under tier
      // output caps.
      maxTokens: 16384,
    });

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
    await supabase
      .from("simulations")
      .update({
        status: "completed",
        current_stage: "completed",
        completed_at: new Date().toISOString(),
        success_score: result.overview?.successScore ?? null,
        best_country: result.overview?.bestCountry ?? null,
        recommended_price_cents: result.pricing?.recommendedPriceCents ?? null,
      })
      .eq("id", opts.simulationId);

    // Look up workspace + project so the success email + project status
    // update both have what they need without two extra round-trips.
    const { data: simRow } = await supabase
      .from("simulations")
      .select("project_id, workspace_id")
      .eq("id", opts.simulationId)
      .single();
    if (simRow?.project_id) {
      await supabase
        .from("projects")
        .update({ status: "completed" })
        .eq("id", simRow.project_id);
    }

    // Notify after persistence so the email link always resolves to a
    // completed sim. Best-effort: a missing RESEND_API_KEY or send error
    // logs and moves on without disturbing the simulation outcome.
    if (simRow?.workspace_id && simRow.project_id) {
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
    // Don't overwrite current_stage here — leave it pointing at whatever
    // updateStage() set it to last. The admin health dashboard groups failures
    // by stage to show which step in the pipeline is breaking, and that
    // signal is lost if every failed row reports current_stage='failed'.
    await supabase
      .from("simulations")
      .update({ status: "failed", error_message: message })
      .eq("id", opts.simulationId);

    // Notify on failure too — operators want to know without polling.
    const { data: simRow } = await supabase
      .from("simulations")
      .select("project_id, workspace_id")
      .eq("id", opts.simulationId)
      .single();
    if (simRow?.workspace_id && simRow.project_id) {
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

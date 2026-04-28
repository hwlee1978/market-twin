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

/**
 * Runs the full simulation pipeline and persists the result.
 * Designed to run inside a Vercel function or background worker — total budget ~5 min.
 *
 * Stages: personas → countries → pricing → synthesis
 * Each stage updates simulations.current_stage so the UI can render progress.
 */
export async function runSimulation(opts: RunOptions): Promise<SimulationResult> {
  const supabase = createServiceClient();
  const llm = getLLMProvider({ provider: opts.provider, model: opts.model });
  const locale: PromptLocale = opts.locale ?? "en";

  const updateStage = async (stage: string) => {
    await supabase
      .from("simulations")
      .update({ current_stage: stage, status: "running" })
      .eq("id", opts.simulationId);
  };

  await supabase
    .from("simulations")
    .update({ started_at: new Date().toISOString(), model_provider: llm.name, model_version: llm.model })
    .eq("id", opts.simulationId);

  try {
    // Load gov-stats reference data for the candidate countries.
    // Missing countries simply contribute nothing — LLM falls back to its training prior.
    // Kept inside try block so any DB hiccup gets recorded as a `failed` simulation
    // instead of leaving the row stuck in `validating` forever.
    const referenceBundles = await loadReferenceBundles(
      opts.projectInput.candidateCountries,
      opts.projectInput.category,
    );
    const referenceBlock = renderReferenceBlock(referenceBundles, locale);
    const referenceSources = collectSourceAttributions(referenceBundles);

    // ── Stage 1: personas ──────────────────────────────────────
    await updateStage("personas");
    const personas: z.infer<typeof PersonaSchema>[] = [];
    const batches = Math.max(1, Math.ceil(opts.personaCount / PERSONA_BATCH));
    let parseSkips = 0;
    for (let i = 0; i < batches; i++) {
      const remaining = opts.personaCount - personas.length;
      const batchSize = Math.min(PERSONA_BATCH, remaining);
      const r = await llm.generate({
        system: PERSONA_SYSTEM,
        prompt: personaPrompt(opts.projectInput, batchSize, locale, referenceBlock),
        jsonSchema: { type: "object", properties: { personas: { type: "array" } } },
        temperature: 0.9,
        maxTokens: 8192,
      });
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
          personas.push({ ...parsed.data, id: parsed.data.id ?? crypto.randomUUID() });
        } else {
          parseSkips++;
        }
      }
      if (personas.length >= opts.personaCount) break;
    }
    if (parseSkips > 0) {
      console.warn(`[sim ${opts.simulationId}] skipped ${parseSkips} malformed personas`);
    }
    console.log(`[sim ${opts.simulationId}] generated ${personas.length} personas`);

    // ── Stage 2: countries ─────────────────────────────────────
    await updateStage("scoring");
    const countriesResp = await llm.generate({
      system: COUNTRY_SYSTEM,
      prompt: countryPrompt(opts.projectInput, personas, locale),
      jsonSchema: { type: "object", properties: { countries: { type: "array" } } },
      temperature: 0.4,
    });
    const countries = z
      .object({ countries: z.array(CountryScoreSchema) })
      .safeParse(countriesResp.json);
    const countryScores = countries.success ? countries.data.countries : [];

    // ── Stage 3: pricing ───────────────────────────────────────
    await updateStage("pricing");
    const pricingResp = await llm.generate({
      system: PRICING_SYSTEM,
      prompt: pricingPrompt(opts.projectInput, personas, locale),
      jsonSchema: PricingResultSchema as unknown as object,
      temperature: 0.4,
    });
    const pricing = PricingResultSchema.safeParse(pricingResp.json);

    // ── Stage 4: synthesis ─────────────────────────────────────
    await updateStage("recommend");
    const synthesisResp = await llm.generate({
      system: SYNTHESIS_SYSTEM,
      prompt: synthesisPrompt(
        opts.projectInput,
        personas,
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
        : fallbackOverview(opts.projectInput, countryScores, personas),
      countries: countryScores,
      personas,
      pricing: pricing.success ? pricing.data : fallbackPricing(opts.projectInput),
      creative: synthesis.success ? synthesis.data.creative : [],
      risks: synthesis.success ? synthesis.data.risks : [],
      recommendations: synthesis.success
        ? synthesis.data.recommendations
        : { executiveSummary: "", actionPlan: [], channels: [] },
    };

    // ── Persist ────────────────────────────────────────────────
    // Stash reference-data attribution alongside the overview so UI/PDF can render it.
    // The OverviewSchema strips unknown fields when parsing LLM output, so we add `_sources`
    // here on the persistence path — it survives because Postgres stores overview as JSONB.
    const overviewWithSources = {
      ...result.overview,
      _sources: referenceSources,
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

    await supabase
      .from("simulations")
      .update({
        status: "completed",
        current_stage: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", opts.simulationId);

    await supabase
      .from("projects")
      .update({ status: "completed" })
      .eq("id", (await supabase.from("simulations").select("project_id").eq("id", opts.simulationId).single()).data?.project_id);

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from("simulations")
      .update({ status: "failed", current_stage: "failed", error_message: message })
      .eq("id", opts.simulationId);
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

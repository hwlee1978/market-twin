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
import { aggregatePersonas } from "./aggregate";
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
}

// Smaller batches are more reliably completed by the LLM.
// gpt-4o-mini and similar tend to truncate or under-deliver when asked for 25
// detailed personas in one shot; 12 yields ≥ 90% of requested entries empirically.
const PERSONA_BATCH = 12;

/**
 * Concurrency for parallel persona batches (fresh + reaction-only paths).
 *
 * Auto-scales with persona count to keep wall-clock time bounded as sims
 * grow: a 500-persona sim has 42 batches, so a fixed concurrency of 4 means
 * 11 sequential waves and ~5+ minutes for personas-stage alone. Lifting
 * concurrency to 8 cuts that to ~6 waves.
 *
 * Tier 2 Anthropic limits (~90k output tokens/min, ~1000 RPM) easily
 * accommodate concurrency 8 — each batch is ~2.5k output tokens, so 8
 * concurrent calls = 20k tokens in flight, well under the cap.
 *
 * Env override (`LLM_PERSONA_BATCH_CONCURRENCY`) always wins — useful for
 * Tier 1 environments where 4 is already the safe ceiling.
 */
function personaBatchConcurrency(personaCount: number): number {
  const envOverride = Number(process.env.LLM_PERSONA_BATCH_CONCURRENCY);
  if (Number.isFinite(envOverride) && envOverride > 0) return Math.floor(envOverride);
  if (personaCount >= 500) return 8;
  if (personaCount >= 200) return 6;
  return 4;
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
function aggregateCountryScores(
  samples: Array<z.infer<typeof CountryScoreSchema>[]>,
): z.infer<typeof CountryScoreSchema>[] {
  if (samples.length === 0) return [];
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
  const aggregated: z.infer<typeof CountryScoreSchema>[] = [];
  for (const [country, rows] of byCountry.entries()) {
    const medFinal = median(rows.map((r) => r.finalScore));
    const medDemand = median(rows.map((r) => r.demandScore));
    const medCAC = median(rows.map((r) => r.cacEstimateUsd));
    const medCompetition = median(rows.map((r) => r.competitionScore));
    // Pick the rationale from the sample whose finalScore is closest to the
    // median — keeps narrative consistent with the numbers we're showing.
    const closest = [...rows].sort(
      (a, b) => Math.abs(a.finalScore - medFinal) - Math.abs(b.finalScore - medFinal),
    )[0];
    aggregated.push({
      country,
      demandScore: Math.round(medDemand),
      cacEstimateUsd: Math.round(medCAC * 100) / 100,
      competitionScore: Math.round(medCompetition),
      finalScore: Math.round(medFinal * 10) / 10,
      rank: 0, // re-assigned below
      rationale: closest.rationale,
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
  const personaLLM = getLLMProvider({ stage: "personas", provider: opts.provider, model: opts.model });
  const countryLLM = getLLMProvider({ stage: "countries", provider: opts.provider, model: opts.model });
  const pricingLLM = getLLMProvider({ stage: "pricing", provider: opts.provider, model: opts.model });
  const synthesisLLM = getLLMProvider({ stage: "synthesis", provider: opts.provider, model: opts.model });
  // Regulatory check uses the synthesis-tier model: this needs to be reliable
  // about real laws (e.g. e-cigarette bans). Cheap models occasionally miss.
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
    const referenceBlock = renderReferenceBlock(referenceBundles, locale);
    const referenceSources = collectSourceAttributions(referenceBundles);

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
    // Concurrency scales with persona count (4 → 6 → 8) so 200/500-persona
    // sims don't sit through 11 sequential waves. See personaBatchConcurrency().
    const personaConcurrency = personaBatchConcurrency(opts.personaCount);
    if (personaConcurrency !== 4) {
      console.log(
        `[sim ${opts.simulationId}] persona batch concurrency: ${personaConcurrency} ` +
          `(scaled for ${opts.personaCount} personas)`,
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

    if (missSlots.length > 0) {
      const missBatchPlans: Array<{ slots: PersonaSlot[] }> = [];
      for (let i = 0; i < missSlots.length; i += PERSONA_BATCH) {
        missBatchPlans.push({ slots: missSlots.slice(i, i + PERSONA_BATCH) });
      }
      const t0 = Date.now();
      const missResults = await runWithConcurrency(
        personaConcurrency,
        missBatchPlans.map(({ slots }) => () =>
          personaLLM.generate({
            system: PERSONA_SYSTEM,
            prompt: personaPrompt(projectInput, slots, locale, referenceBlock),
            jsonSchema: { type: "object", properties: { personas: { type: "array" } } },
            temperature: 0.6,
            maxTokens: 8192,
          }),
        ),
      );
      console.log(
        `[sim ${opts.simulationId}] fresh persona batches: ${missBatchPlans.length}, ` +
          `${((Date.now() - t0) / 1000).toFixed(1)}s`,
      );
      for (let bi = 0; bi < missResults.length; bi++) {
        const settled = missResults[bi];
        const batchSlots = missBatchPlans[bi].slots;
        if (settled.status === "rejected") {
          console.warn(
            `[sim ${opts.simulationId}] fresh batch ${bi} failed:`,
            settled.reason instanceof Error ? settled.reason.message : settled.reason,
          );
          continue;
        }
        const r = settled.value;
        const wrapped = (r.json as { personas?: unknown[] } | null)?.personas;
        const arr = Array.isArray(wrapped) ? wrapped : [];
        if (arr.length === 0) {
          console.warn(
            `[sim ${opts.simulationId}] fresh batch ${bi} returned no array — raw:`,
            r.text.slice(0, 200),
          );
        }
        // Pair persona arr[i] with slot batchSlots[i] — used downstream when
        // saving base profiles to the pool with the assigned base_profession.
        for (let pi = 0; pi < arr.length && pi < batchSlots.length; pi++) {
          const parsed = PersonaSchema.safeParse(arr[pi]);
          if (parsed.success) {
            const sanitizedVoice = sanitizeVoice(parsed.data.voice, locale);
            if (parsed.data.voice && sanitizedVoice === null) {
              voiceSlipCount++;
              console.warn(
                `[sim ${opts.simulationId}] voice slip dropped (fresh, ${parsed.data.country}): ` +
                  `"${parsed.data.voice.slice(0, 80)}"`,
              );
            }
            const cleaned = {
              ...parsed.data,
              id: parsed.data.id ?? crypto.randomUUID(),
              objections: filterLocaleNative(parsed.data.objections, locale),
              trustFactors: filterLocaleNative(parsed.data.trustFactors, locale),
              interests: filterLocaleNative(parsed.data.interests, locale),
              voice: sanitizedVoice ?? "",
            };
            freshPairs.push({ persona: cleaned, slot: batchSlots[pi] });
          } else {
            parseSkips++;
          }
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
      const reactionBatches: PoolHit[][] = [];
      for (let i = 0; i < hits.length; i += PERSONA_BATCH) {
        reactionBatches.push(hits.slice(i, i + PERSONA_BATCH));
      }
      const tR = Date.now();
      const reactionResults = await runWithConcurrency(
        personaConcurrency,
        reactionBatches.map((batch) => () =>
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
            temperature: 0.6,
            // 12-persona batches in Korean reach ~7k output tokens (rich
            // trustFactors + objections + JSON wrapper). 4k truncates the
            // array mid-output → entire batch unparseable. 8k matches the
            // fresh-persona budget and gives enough headroom.
            maxTokens: 8192,
          }),
        ),
      );
      console.log(
        `[sim ${opts.simulationId}] reaction batches: ${reactionBatches.length}, ` +
          `${((Date.now() - tR) / 1000).toFixed(1)}s`,
      );

      const reactionRows: Array<{
        simulation_id: string;
        persona_id: string;
        trust_factors: string[];
        objections: string[];
        purchase_intent: number;
        voice: string;
      }> = [];

      for (let bi = 0; bi < reactionResults.length; bi++) {
        const settled = reactionResults[bi];
        const batch = reactionBatches[bi];
        if (settled.status === "rejected") {
          console.warn(
            `[sim ${opts.simulationId}] reaction batch ${bi} failed:`,
            settled.reason instanceof Error ? settled.reason.message : settled.reason,
          );
          continue;
        }
        const r = settled.value;
        const wrapped = (r.json as { reactions?: unknown[] } | null)?.reactions;
        const arr = Array.isArray(wrapped) ? wrapped : [];
        // Diagnostic: if no reactions parsed, dump the raw response so the
        // failure mode (truncation, schema drift, wrong wrapper key) is
        // visible without needing a debugger.
        if (arr.length === 0) {
          console.warn(
            `[sim ${opts.simulationId}] reaction batch ${bi} returned no array — raw text snippet:`,
            r.text.slice(0, 400),
          );
        }
        // Build a map of id → reaction so we match by id (LLM may reorder).
        const reactionMap = new Map<string, z.infer<typeof PersonaReactionSchema>>();
        let perBatchSchemaFails = 0;
        for (const raw of arr) {
          const parsed = PersonaReactionSchema.safeParse(raw);
          if (parsed.success) reactionMap.set(parsed.data.id, parsed.data);
          else perBatchSchemaFails++;
        }
        if (perBatchSchemaFails > 0) {
          console.warn(
            `[sim ${opts.simulationId}] reaction batch ${bi}: ${perBatchSchemaFails}/${arr.length} entries failed schema. Sample:`,
            JSON.stringify(arr[0]).slice(0, 300),
          );
        }
        for (const hit of batch) {
          const reaction = reactionMap.get(hit.base.id);
          if (!reaction) {
            parseSkips++;
            continue;
          }
          const trustFactors = filterLocaleNative(reaction.trustFactors, locale);
          const objections = filterLocaleNative(reaction.objections, locale);
          const sanitizedReactionVoice = sanitizeVoice(reaction.voice, locale);
          if (reaction.voice && sanitizedReactionVoice === null) {
            voiceSlipCount++;
            console.warn(
              `[sim ${opts.simulationId}] voice slip dropped (reaction, ${hit.base.country}): ` +
                `"${reaction.voice.slice(0, 80)}"`,
            );
          }
          const voice = sanitizedReactionVoice ?? "";
          const merged = {
            id: hit.base.id,
            ageRange: hit.base.age_range,
            gender: hit.base.gender,
            country: hit.base.country,
            incomeBand: hit.base.income_band,
            profession: hit.base.profession,
            interests: hit.base.interests ?? [],
            purchaseStyle: hit.base.purchase_style,
            priceSensitivity: hit.base.price_sensitivity as "low" | "medium" | "high",
            trustFactors,
            objections,
            purchaseIntent: reaction.purchaseIntent,
            voice,
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
      `[sim ${opts.simulationId}] voice slips: ${voiceSlipCount}/${personas.length} (locale=${locale})` +
        (voiceSlipCount === 0 ? " ✓" : ""),
    );

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
    const COUNTRY_SAMPLES = 3;
    const countryPromptText = countryPrompt(projectInput, aggregate, locale);
    const countriesResps = await Promise.all(
      Array.from({ length: COUNTRY_SAMPLES }, () =>
        countryLLM.generate({
          system: COUNTRY_SYSTEM,
          prompt: countryPromptText,
          jsonSchema: { type: "object", properties: { countries: { type: "array" } } },
          // Keep variance among samples — too low and the median collapses
          // to a single answer, defeating the point. Same temp as pricing.
          temperature: 0.4,
          // Generous output budget so Korean rationale + ≤24 candidate countries
          // never gets truncated mid-JSON. Provider default of 4096 cuts it close.
          maxTokens: 8192,
        }),
      ),
    );
    const countrySamples: Array<z.infer<typeof CountryScoreSchema>[]> = [];
    for (const resp of countriesResps) {
      const parsed = z
        .object({ countries: z.array(CountryScoreSchema) })
        .safeParse(resp.json);
      if (parsed.success) countrySamples.push(parsed.data.countries);
    }
    const countryScores =
      countrySamples.length > 0 ? aggregateCountryScores(countrySamples) : [];
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
    const PRICING_SAMPLES = 3;
    const pricingPromptText = pricingPrompt(projectInput, aggregate, locale);
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
      pricing = PricingResultSchema.safeParse(pricingCandidates[medianIdx]);
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
    const synthesisImages =
      synthesisLLM.name === "anthropic"
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
      })
      .eq("id", opts.simulationId)
      .neq("status", "cancelled");

    // Top-level wall-clock — print after persistence so the line shows up
    // last in the log stream, makes it easy to scroll back and see the total.
    console.log(
      `[sim ${opts.simulationId}] DONE — ${((Date.now() - tSimStart) / 1000).toFixed(1)}s ` +
        `total · ${personas.length} personas · ${countryScores.length} markets`,
    );

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
    // User-cancelled simulations exit through the same throw path but should
    // NOT trigger failure side effects: row is already 'cancelled', operators
    // don't need a notification, and we shouldn't downgrade status to 'failed'.
    if (message === CANCELLED_ERR) {
      console.log(`[sim ${opts.simulationId}] cancelled by user — pipeline aborted`);
      return undefined as unknown as SimulationResult;
    }
    // Don't overwrite current_stage here — leave it pointing at whatever
    // updateStage() set it to last. The admin health dashboard groups failures
    // by stage to show which step in the pipeline is breaking, and that
    // signal is lost if every failed row reports current_stage='failed'.
    // .neq("status", "cancelled") so a cancel that landed mid-flight isn't
    // silently rewritten to 'failed'.
    await supabase
      .from("simulations")
      .update({ status: "failed", error_message: message })
      .eq("id", opts.simulationId)
      .neq("status", "cancelled");

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

import { NextResponse, after } from "next/server";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { runSimulation } from "@/lib/simulation/runner";
import type { ProjectInput } from "@/lib/simulation/schemas";
import { aggregateEnsemble, type EnsembleSimSnapshot } from "@/lib/simulation/ensemble";
import { mergeNarrative } from "@/lib/simulation/ensemble-narrative";
import type { CountryScore } from "@/lib/simulation/schemas";
import { notifyEnsembleComplete } from "@/lib/email/notify";
import { canStartSim } from "@/lib/billing/plans";
import { getSubscription, getMonthlyUsage } from "@/lib/billing/usage";

// Each individual sim still fits in 800s (Vercel Pro + Fluid Compute);
// the ensemble route itself returns immediately and orchestrates via after().
export const maxDuration = 800;
export const dynamic = "force-dynamic";

/**
 * Tier presets — single source of truth for how each tier maps to
 * (parallel sims × per-sim personas × provider mix). Deep tier round-
 * robins providers across sims so the ensemble's diversity comes from
 * model diversity, not just persona diversity. The 25 deep sims fan out
 * to ~8 sims per provider (with 3 providers).
 *
 * If you change the order of llmProviders, the round-robin assignment
 * shifts but stays deterministic — sim 0 always uses providers[0].
 */
const TIER_PRESETS = {
  hypothesis: {
    parallelSims: 1,
    perSimPersonas: 200,
    llmProviders: ["anthropic"] as const,
  },
  decision: {
    parallelSims: 5,
    perSimPersonas: 200,
    llmProviders: ["anthropic"] as const,
  },
  decision_plus: {
    // 15 sims still fits a single Anthropic provider's burst tolerance
    // (Tier 2 absorbs the wave), so we don't need to bring in OpenAI /
    // Gemini at this depth. Multi-LLM stays a Deep-only feature.
    parallelSims: 15,
    perSimPersonas: 200,
    llmProviders: ["anthropic"] as const,
  },
  deep: {
    parallelSims: 25,
    perSimPersonas: 200,
    llmProviders: ["anthropic", "openai", "gemini"] as const,
  },
  deep_pro: {
    // 50 sims × 200 personas. Anthropic 17 + OpenAI 17 + Gemini 16 round-
    // robin; Gemini gets 4-wide concurrency cap (4 waves of ~5 min) so
    // total runtime is bounded by Gemini and ~20 min — pushes Vercel's
    // 800s maxDuration. If timeouts surface, we'll either bump cap-12
    // for OpenAI/Anthropic so their waves overlap Gemini's, or split
    // the run across two ensembles.
    parallelSims: 50,
    perSimPersonas: 200,
    llmProviders: ["anthropic", "openai", "gemini"] as const,
  },
} as const;
type Tier = keyof typeof TIER_PRESETS;
type ProviderName = "anthropic" | "openai" | "gemini";

/**
 * Maximum sims per provider running concurrently within a single ensemble.
 *
 * Even with retry/backoff at the LLM layer, kicking off all 8 Gemini sims
 * at once means 8 simultaneous regulatory-check calls to gemini-2.5-pro,
 * which Google reliably 503s under as "high demand" — and the retries
 * pile back into the same burst. Capping at 4 means two staggered waves,
 * which empirically gets us through.
 *
 * Anthropic and OpenAI tolerate the full deep-tier burst (9 / 8 sims),
 * so they're capped well above what any tier produces. If we ever push
 * past 12 sims for a single provider, revisit.
 */
// Defaults tuned to each provider's burst tolerance. Override via env
// when a provider is on a paid tier with higher RPM headroom or, more
// commonly, when their free tier is throttling — e.g. set
// LLM_GEMINI_SIM_CONCURRENCY=2 to lower Gemini below the default 4
// during a 503 spike without a redeploy.
function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}
const PROVIDER_SIM_CONCURRENCY: Record<ProviderName, number> = {
  anthropic: envInt("LLM_ANTHROPIC_SIM_CONCURRENCY", 12),
  openai: envInt("LLM_OPENAI_SIM_CONCURRENCY", 12),
  gemini: envInt("LLM_GEMINI_SIM_CONCURRENCY", 4),
};

const RunSchema = z.object({
  tier: z
    .enum(["hypothesis", "decision", "decision_plus", "deep", "deep_pro"])
    .default("decision"),
  notifyEmail: z.string().email().optional(),
  locale: z.enum(["ko", "en"]).default("ko"),
});

/**
 * POST /api/projects/:id/run-ensemble
 *
 * Spawns N parallel simulations of the same project, each drawing a
 * different persona sample, then aggregates them into a confidence-
 * graded recommendation when all complete. Returns ensembleId immediately
 * so the client can poll status.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await ctx.params;
  const wsCtx = await getOrCreatePrimaryWorkspace();
  if (!wsCtx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (wsCtx.status !== "active") {
    return NextResponse.json({ error: `workspace_${wsCtx.status}` }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = RunSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { tier, notifyEmail, locale } = parsed.data;
  const preset = TIER_PRESETS[tier as Tier];

  // Plan / quota gate. Block before we spend any LLM tokens — the user
  // gets a clear "upgrade" response instead of a half-completed run.
  // Service-role inside getSubscription / getMonthlyUsage; gating is
  // hot-path so two short queries beat lazy enforcement on the runner.
  const sub = await getSubscription(wsCtx.workspaceId);
  const usage = await getMonthlyUsage(wsCtx.workspaceId, sub);
  const decision = canStartSim({
    plan: sub.plan,
    trialActive: sub.trialActive,
    trialSimsUsed: sub.trialSimsUsed,
    trialSimsLimit: sub.trialSimsLimit,
    monthSimsUsed: usage.simsUsed,
    monthDeepSimsUsed: usage.deepSimsUsed,
    simTier: tier as "hypothesis" | "decision" | "decision_plus" | "deep" | "deep_pro",
  });
  if (!decision.allowed) {
    return NextResponse.json(
      { error: "plan_limit", reason: decision.reason, plan: sub.plan.slug },
      { status: 402 },
    );
  }

  // Workspace ownership check on the project.
  const supabase = await createClient();
  const { data: project, error: projectErr } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .eq("workspace_id", wsCtx.workspaceId)
    .single();
  if (projectErr || !project) {
    return NextResponse.json({ error: "project not found" }, { status: 404 });
  }

  const admin = createServiceClient();

  // 1. Create the ensemble row up front so the client gets a stable ID
  //    to poll against, even before any individual sim has been queued.
  const { data: ensemble, error: ensErr } = await admin
    .from("ensembles")
    .insert({
      project_id: project.id,
      workspace_id: project.workspace_id,
      created_by: wsCtx.userId,
      tier,
      parallel_sims: preset.parallelSims,
      per_sim_personas: preset.perSimPersonas,
      llm_providers: preset.llmProviders,
      status: "running",
      notify_email: notifyEmail ?? null,
    })
    .select("id")
    .single();
  if (ensErr || !ensemble) {
    return NextResponse.json(
      { error: ensErr?.message ?? "failed to create ensemble" },
      { status: 500 },
    );
  }

  // Trial workspaces: increment trial_sims_used so the next /run-ensemble
  // request hits the quota. Counting at ensemble creation (not on
  // completion) means a deliberate cancel still consumes the quota slot
  // — matches Stripe-style "you used your free trial" semantics.
  if (sub.plan.slug === "free_trial") {
    await admin
      .from("subscriptions")
      .update({ trial_sims_used: sub.trialSimsUsed + 1 })
      .eq("workspace_id", wsCtx.workspaceId);
  }

  // 2. Create N pending sim rows linked to the ensemble. Insertion order
  //    determines ensemble_index, which feeds the seed override so each sim
  //    draws a different persona sample. For multi-LLM tiers (deep), we
  //    round-robin over llm_providers so each sim is fixed to one provider
  //    end-to-end — the ensemble's bestCountry distribution then reflects
  //    cross-model agreement, not single-model variance.
  const simRows: Array<{ id: string; index: number; provider: ProviderName }> = [];
  for (let i = 0; i < preset.parallelSims; i++) {
    const provider = preset.llmProviders[i % preset.llmProviders.length] as ProviderName;
    const { data: sim, error: simErr } = await admin
      .from("simulations")
      .insert({
        project_id: project.id,
        workspace_id: project.workspace_id,
        status: "pending",
        persona_count: preset.perSimPersonas,
        current_stage: "validating",
        ensemble_id: ensemble.id,
        ensemble_index: i,
        model_provider: provider,
      })
      .select("id")
      .single();
    if (simErr || !sim) {
      // Mark ensemble failed; partial cleanup of already-created sims is
      // best-effort (cascade on ensemble delete cleans them up if needed).
      await admin
        .from("ensembles")
        .update({
          status: "failed",
          error_message: simErr?.message ?? "failed to create sim row",
        })
        .eq("id", ensemble.id);
      return NextResponse.json(
        { error: simErr?.message ?? "failed to create simulation" },
        { status: 500 },
      );
    }
    simRows.push({ id: sim.id, index: i, provider });
  }

  await admin.from("projects").update({ status: "running" }).eq("id", project.id);

  const projectInput: ProjectInput = {
    productName: project.product_name,
    category: project.category ?? "other",
    description: project.description ?? "",
    basePriceCents: project.base_price_cents ?? 0,
    currency: project.currency ?? "USD",
    objective: project.objective as ProjectInput["objective"],
    originatingCountry: project.originating_country ?? "KR",
    candidateCountries: project.candidate_countries ?? [],
    competitorUrls: project.competitor_urls ?? [],
    assetDescriptions: project.asset_descriptions ?? [],
    assetUrls: project.asset_urls ?? [],
  };

  // 3. Schedule all N sims in parallel via after(). Each runs independently;
  //    the LAST one to complete triggers aggregation. Vercel keeps the
  //    function alive (up to maxDuration) for after() continuations, so
  //    this is the correct lifecycle — fire-and-await would block the HTTP
  //    response until all sims finish.
  after(async () => {
    const ensembleId = ensemble.id;

    // Group sims by provider and run each group through a worker pool
    // sized for that provider's burst tolerance. Cross-provider parallelism
    // is unconstrained — anthropic/openai/gemini share no rate limits.
    const groups = new Map<ProviderName, typeof simRows>();
    for (const row of simRows) {
      const arr = groups.get(row.provider) ?? [];
      arr.push(row);
      groups.set(row.provider, arr);
    }

    const runOne = async ({
      id: simId,
      index,
      provider,
    }: (typeof simRows)[number]) => {
      try {
        await runSimulation({
          simulationId: simId,
          projectInput,
          personaCount: preset.perSimPersonas,
          locale,
          seedOverride: `${ensembleId}-${index}`,
          provider,
        });
      } catch (err) {
        console.error(`[ensemble ${ensembleId}] sim ${simId} failed:`, err);
        await admin
          .from("simulations")
          .update({
            status: "failed",
            current_stage: "failed",
            error_message: err instanceof Error ? err.message : String(err),
          })
          .eq("id", simId);
      }
    };

    await Promise.all(
      [...groups.entries()].map(async ([prov, sims]) => {
        const limit = Math.min(PROVIDER_SIM_CONCURRENCY[prov] ?? 4, sims.length);
        // Worker pool: each worker pulls the next sim off the queue.
        let cursor = 0;
        await Promise.all(
          Array.from({ length: limit }, async () => {
            while (true) {
              const idx = cursor++;
              if (idx >= sims.length) return;
              await runOne(sims[idx]);
            }
          }),
        );
      }),
    );

    // 4. All sims settled — aggregate, persist, then notify.
    try {
      const aggregate = await aggregateAndPersist({
        ensembleId,
        productName: project.product_name,
        locale,
      });
      if (aggregate) {
        await notifyEnsembleComplete({
          ensembleId,
          workspaceId: project.workspace_id,
          projectId: project.id,
          productName: project.product_name,
          locale,
          tier: tier as Tier,
          bestCountry: aggregate.recommendation.country,
          consensusPercent: aggregate.recommendation.consensusPercent,
          confidence: aggregate.recommendation.confidence,
          notifyEmail: notifyEmail ?? null,
        });
      }
    } catch (err) {
      console.error(`[ensemble ${ensembleId}] aggregation failed:`, err);
      await admin
        .from("ensembles")
        .update({
          status: "failed",
          error_message: err instanceof Error ? err.message : String(err),
          completed_at: new Date().toISOString(),
        })
        .eq("id", ensembleId);
    }
  });

  return NextResponse.json({
    ensembleId: ensemble.id,
    simulationIds: simRows.map((r) => r.id),
    tier,
    parallelSims: preset.parallelSims,
    perSimPersonas: preset.perSimPersonas,
  });
}

/**
 * Pulls the persisted simulation_results for every sim in the ensemble,
 * runs the aggregator, and stores the result on the ensemble row. Called
 * once after all sims have settled (success or failure). Returns the
 * computed aggregate so the caller can use it for follow-on actions
 * (email notification etc.) without re-querying.
 */
async function aggregateAndPersist(opts: {
  ensembleId: string;
  productName: string;
  locale: "ko" | "en";
}) {
  const { ensembleId, productName, locale } = opts;
  const admin = createServiceClient();

  type StoredResult = {
    countries: unknown[];
    personas: unknown[];
    overview?: unknown;
    risks?: unknown;
    recommendations?: unknown;
    pricing?: unknown;
    creative?: unknown[];
  };
  type EnsembleSimRow = {
    id: string;
    ensemble_index: number | null;
    best_country: string | null;
    status: string;
    model_provider: string | null;
    synthesis_provider: string | null;
    simulation_results: StoredResult | StoredResult[] | null;
  };
  const { data: rawRows, error } = await admin
    .from("simulations")
    .select(
      `id, ensemble_index, best_country, status, model_provider, synthesis_provider,
       simulation_results ( countries, personas, overview, risks, recommendations, pricing, creative )`,
    )
    .eq("ensemble_id", ensembleId);
  if (error || !rawRows) {
    throw new Error(`Failed to load ensemble sims: ${error?.message}`);
  }
  const rows = rawRows as unknown as EnsembleSimRow[];

  const completed = rows.filter((r) => r.status === "completed");
  const snapshots: EnsembleSimSnapshot[] = completed.flatMap((r) => {
    const result = Array.isArray(r.simulation_results)
      ? r.simulation_results[0]
      : r.simulation_results;
    if (!result) return [];
    const personas = (result.personas ?? []) as Array<{ country?: string; purchaseIntent?: number }>;
    const intentByCountry: Record<string, { n: number; meanIntent: number }> = {};
    const sums: Record<string, { n: number; total: number }> = {};
    for (const p of personas) {
      const c = (p.country ?? "?").toUpperCase();
      if (!sums[c]) sums[c] = { n: 0, total: 0 };
      sums[c].n += 1;
      sums[c].total += typeof p.purchaseIntent === "number" ? p.purchaseIntent : 0;
    }
    for (const [c, v] of Object.entries(sums)) {
      intentByCountry[c] = { n: v.n, meanIntent: v.n > 0 ? v.total / v.n : 0 };
    }
    // Compact persona records — drop everything we don't need downstream
    // so the in-memory snapshot list stays bounded even on deep_pro
    // (50 sims × 200 personas = 10K rows). Only intent / country / voice /
    // age / occupation feed the aggregator.
    const compactPersonas = personas.flatMap((p) => {
      const rec = p as {
        country?: string;
        purchaseIntent?: number;
        voice?: string;
        ageRange?: string;
        profession?: string;
        gender?: string;
        incomeBand?: string;
        trustFactors?: unknown;
        objections?: unknown;
      };
      if (typeof rec.purchaseIntent !== "number" || !rec.country) return [];
      return [
        {
          country: rec.country.toUpperCase(),
          purchaseIntent: rec.purchaseIntent,
          voice: rec.voice,
          ageRange: rec.ageRange,
          profession: rec.profession,
          gender: rec.gender,
          incomeBand: rec.incomeBand,
          trustFactors: Array.isArray(rec.trustFactors)
            ? (rec.trustFactors as unknown[]).filter((x): x is string => typeof x === "string")
            : undefined,
          objections: Array.isArray(rec.objections)
            ? (rec.objections as unknown[]).filter((x): x is string => typeof x === "string")
            : undefined,
        },
      ];
    });
    return [
      {
        simulationId: r.id,
        index: r.ensemble_index ?? 0,
        bestCountry: r.best_country ?? null,
        countries: (result.countries ?? []) as CountryScore[],
        personaIntentByCountry: intentByCountry,
        provider: r.model_provider ?? undefined,
        // synthesis_provider is null on rows where no failover fired —
        // fall back to model_provider so providerBreakdown works on
        // every sim regardless of whether the column was populated.
        synthesisProvider: r.synthesis_provider ?? r.model_provider ?? undefined,
        overview: (result.overview ?? undefined) as EnsembleSimSnapshot["overview"],
        risks: (result.risks ?? undefined) as EnsembleSimSnapshot["risks"],
        recommendations: (result.recommendations ?? undefined) as EnsembleSimSnapshot["recommendations"],
        pricing: (result.pricing ?? undefined) as EnsembleSimSnapshot["pricing"],
        personas: compactPersonas,
        creative: (result.creative ?? undefined) as EnsembleSimSnapshot["creative"],
      },
    ];
  });

  const aggregate = aggregateEnsemble(snapshots);
  const finalStatus = snapshots.length === 0 ? "failed" : "completed";

  // Narrative merge runs after the deterministic aggregator. Failure here
  // is non-fatal — the chart sections (recommendation / breakdown / stats)
  // are still useful even without merged risks/actions.
  if (snapshots.length > 0) {
    const narrative = await mergeNarrative({
      snapshots,
      productName,
      bestCountry: aggregate.recommendation.country,
      consensusPercent: aggregate.recommendation.consensusPercent,
      locale,
    });
    if (narrative) aggregate.narrative = narrative;
  }

  // Roll up per-sim quality audits into an ensemble-level summary.
  // The runner audited each sim individually; here we read those rows
  // and compute a single confidence_score + flag list for the
  // aggregate. The result-page hero displays the rollup; the per-sim
  // detail is available via /admin/sim-quality.
  if (snapshots.length > 0) {
    try {
      const simIds = snapshots.map((s) => s.simulationId);
      const { data: qualityRows } = await admin
        .from("simulation_quality")
        .select("simulation_id, confidence_score, quarantined, warnings")
        .in("simulation_id", simIds);

      type QualityRow = {
        simulation_id: string;
        confidence_score: number;
        quarantined: boolean;
        warnings: Array<{ code: string; severity: string; message: string }> | null;
      };
      const rows = (qualityRows ?? []) as QualityRow[];
      if (rows.length > 0) {
        const meanConfidence = Math.round(
          rows.reduce((s, r) => s + r.confidence_score, 0) / rows.length,
        );
        const quarantinedCount = rows.filter((r) => r.quarantined).length;
        // Aggregate distinct warning codes that appeared in ≥30% of sims —
        // those are systemic, not per-sim noise.
        const codeCounts = new Map<string, { count: number; severity: string; message: string }>();
        for (const r of rows) {
          for (const w of r.warnings ?? []) {
            const existing = codeCounts.get(w.code);
            if (existing) existing.count++;
            else codeCounts.set(w.code, { count: 1, severity: w.severity, message: w.message });
          }
        }
        const systemicWarnings = [...codeCounts.entries()]
          .filter(([, v]) => v.count / rows.length >= 0.3)
          .map(([code, v]) => ({
            code,
            severity: v.severity,
            message: v.message,
            simShare: Math.round((v.count / rows.length) * 100),
          }));

        // Stuff quality summary onto the aggregate so the dashboard
        // can read it without an extra fetch. EnsembleAggregate type
        // already tolerates extra fields because it's plain JSON in DB.
        (aggregate as unknown as Record<string, unknown>).quality = {
          confidenceScore: meanConfidence,
          simCount: rows.length,
          quarantinedCount,
          systemicWarnings,
        };
      }
    } catch (err) {
      console.warn(`[ensemble ${ensembleId}] quality rollup failed (non-fatal):`, err);
    }
  }

  await admin
    .from("ensembles")
    .update({
      status: finalStatus,
      aggregate_result: aggregate,
      completed_at: new Date().toISOString(),
      error_message:
        snapshots.length === 0
          ? "no completed sims to aggregate"
          : null,
    })
    .eq("id", ensembleId);

  return snapshots.length > 0 ? aggregate : null;
}

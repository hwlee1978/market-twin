import { NextResponse, after } from "next/server";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import type { ProjectInput } from "@/lib/simulation/schemas";
import {
  runEnsembleOrchestration,
  TIER_PRESETS,
  type Tier,
  type ProviderName,
  type OrchestrationSimRow,
} from "@/lib/simulation/orchestrator";
import { canStartSim } from "@/lib/billing/plans";
import { getSubscription, getMonthlyUsage } from "@/lib/billing/usage";
import { getAdminContext } from "@/lib/admin";

// Vercel function duration. Pre-flight + DB writes + after() handoff
// happen under this cap; long-running ensemble work is delegated either
// to the orchestrator (Vercel after-callback path) or to the Cloud Run
// worker (preferred, escapes this cap entirely).
export const maxDuration = 800;
export const dynamic = "force-dynamic";

const RunSchema = z.object({
  tier: z
    .enum(["hypothesis", "decision", "decision_plus", "deep", "deep_pro"])
    .default("decision"),
  notifyEmail: z.string().email().optional(),
  locale: z.enum(["ko", "en"]).default("ko"),
  /**
   * When set, this run is a "free rerun" of an existing ensemble that
   * scored below the confidence threshold. Skips the plan/quota gate
   * and trial-sim counter — the original ensemble already paid for
   * the slot. Validated server-side: parent must belong to the same
   * workspace, must have low confidence, must not already have a
   * child rerun, and must not itself be a free rerun (no chains).
   * Tier is forced to the parent's tier so the rerun is comparable.
   */
  parentEnsembleId: z.string().uuid().optional(),
});

const FREE_RERUN_CONFIDENCE_THRESHOLD = (() => {
  const env = Number(process.env.FREE_RERUN_CONFIDENCE_THRESHOLD);
  return Number.isFinite(env) && env >= 0 && env <= 100 ? env : 60;
})();

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
  let { tier } = parsed.data;
  const { notifyEmail, locale } = parsed.data;
  const { parentEnsembleId } = parsed.data;

  // Free rerun validation. Set isFreeRerun = true ONLY when every gate
  // below passes. We can't trust the client; treat the body flag as a
  // request, not an authorisation.
  let isFreeRerun = false;
  if (parentEnsembleId) {
    const adminCheck = createServiceClient();
    const { data: parent } = await adminCheck
      .from("ensembles")
      .select("id, workspace_id, tier, status, is_free_rerun, aggregate_result")
      .eq("id", parentEnsembleId)
      .maybeSingle();
    if (!parent) {
      return NextResponse.json({ error: "parent_not_found" }, { status: 404 });
    }
    if (parent.workspace_id !== wsCtx.workspaceId) {
      return NextResponse.json({ error: "parent_wrong_workspace" }, { status: 403 });
    }
    if (parent.is_free_rerun) {
      // No chains — a rerun can't itself spawn a free rerun.
      return NextResponse.json({ error: "parent_already_rerun" }, { status: 400 });
    }
    if (parent.status !== "completed") {
      return NextResponse.json({ error: "parent_not_completed" }, { status: 400 });
    }
    // Confidence gate: parent's quality must be below threshold for the
    // free rerun to make sense. Cheaper than re-running quality logic;
    // we read the rolled-up score off aggregate_result.quality.
    const parentAgg = parent.aggregate_result as { quality?: { confidenceScore?: number } } | null;
    const parentConfidence = parentAgg?.quality?.confidenceScore ?? null;
    if (parentConfidence == null) {
      return NextResponse.json({ error: "parent_no_quality" }, { status: 400 });
    }
    if (parentConfidence >= FREE_RERUN_CONFIDENCE_THRESHOLD) {
      return NextResponse.json(
        {
          error: "confidence_above_threshold",
          parentConfidence,
          threshold: FREE_RERUN_CONFIDENCE_THRESHOLD,
        },
        { status: 400 },
      );
    }
    // No existing child rerun (partial unique index also enforces this,
    // but explicit check gives a friendlier error message).
    const { data: existingChild } = await adminCheck
      .from("ensembles")
      .select("id")
      .eq("parent_ensemble_id", parentEnsembleId)
      .maybeSingle();
    if (existingChild) {
      return NextResponse.json(
        { error: "already_rerun_used", existingId: existingChild.id },
        { status: 409 },
      );
    }
    // Force tier to parent's so the rerun is directly comparable.
    tier = parent.tier as typeof tier;
    isFreeRerun = true;
  }

  const preset = TIER_PRESETS[tier as Tier];

  // Plan / quota gate. Block before we spend any LLM tokens — the user
  // gets a clear "upgrade" response instead of a half-completed run.
  // Service-role inside getSubscription / getMonthlyUsage; gating is
  // hot-path so two short queries beat lazy enforcement on the runner.
  // Free reruns bypass — the original sim already paid for the slot.
  // Super admins also bypass — internal staff (founder / ops) should
  // run any tier without burning paid quota or hitting plan-tier gates.
  const sub = await getSubscription(wsCtx.workspaceId);
  const adminCtx = await getAdminContext();
  const isSuperAdmin = adminCtx?.role === "super";
  if (!isFreeRerun && !isSuperAdmin) {
    const usage = await getMonthlyUsage(wsCtx.workspaceId, sub);
    const decision = canStartSim({
      plan: sub.plan,
      trialActive: sub.trialActive,
      trialSimsUsed: sub.trialSimsUsed,
      trialSimsLimit: sub.trialSimsLimit,
      monthSimsUsed: usage.simsUsed,
      monthDecisionPlusSimsUsed: usage.decisionPlusSimsUsed,
      monthDeepSimsUsed: usage.deepSimsUsed,
      simTier: tier as "hypothesis" | "decision" | "decision_plus" | "deep" | "deep_pro",
    });
    if (!decision.allowed) {
      return NextResponse.json(
        { error: "plan_limit", reason: decision.reason, plan: sub.plan.slug },
        { status: 402 },
      );
    }
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

  // Concurrent-ensemble guard — block double-clicks and accidental
  // background reloads from kicking off a parallel ensemble for the
  // same project. Two simultaneous Deep ensembles burn 2× quota, race
  // on persona-pool writes, and produce confusing duplicate "in
  // progress" cards in the UI. We allow stacking ensembles ACROSS
  // projects (different products evaluated simultaneously is fine);
  // it's only the same-project case we reject. Caller can retry once
  // the current one finishes / cancels / fails.
  const { data: activeEnsembles } = await admin
    .from("ensembles")
    .select("id, status")
    .eq("project_id", project.id)
    .in("status", ["pending", "running"])
    .limit(1);
  if (activeEnsembles && activeEnsembles.length > 0) {
    return NextResponse.json(
      {
        error: "ensemble_already_running",
        message:
          "An ensemble is already running for this project. Wait for it to finish or cancel it first.",
        existingEnsembleId: activeEnsembles[0].id,
      },
      { status: 409 },
    );
  }

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
      // Dedupe so the displayed provider list (joined via ", " in
      // analyses/compare and other UI) doesn't show "anthropic,
      // anthropic, anthropic, openai, gemini" for weighted-round-robin
      // tiers. The weighted array still drives sim assignment below;
      // only the metadata column gets the deduped view.
      llm_providers: Array.from(new Set(preset.llmProviders)),
      status: "running",
      notify_email: notifyEmail ?? null,
      // Persist the request locale so the Cloud Run worker (which only gets
      // ensembleId) generates narrative/hot-take in the user's language.
      locale,
      is_free_rerun: isFreeRerun,
      parent_ensemble_id: isFreeRerun ? parentEnsembleId : null,
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
  // Free reruns skip this — the original sim already paid for the slot.
  if (sub.plan.slug === "free_trial" && !isFreeRerun) {
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

  // 3. Hand off to the orchestrator. Vercel's after() keeps the function
  //    alive past the HTTP response so the orchestration runs in the
  //    background; the route returns 200 immediately.
  //
  //    When WORKER_BASE_URL is set (and the tier matches WORKER_TIER_WHITELIST
  //    if configured), the orchestration is dispatched to the Cloud Run worker
  //    via fetch — escapes Vercel's 800s function cap entirely. The worker
  //    re-loads context from DB by ensembleId so the request body stays small.
  //    Any failure (env unset, fetch error, non-202) falls back to inline
  //    orchestration on Vercel so the user always gets a result.
  after(async () => {
    const orchestrationCtx = {
      ensembleId: ensemble.id,
      productName: project.product_name,
      workspaceId: project.workspace_id,
      projectId: project.id,
      projectInput,
      locale,
      tier: tier as Tier,
      notifyEmail: notifyEmail ?? null,
      simRows: simRows.map((r): OrchestrationSimRow => ({
        id: r.id,
        index: r.index,
        provider: r.provider as ProviderName,
      })),
    };

    const dispatched = await tryDispatchToWorker({
      ensembleId: ensemble.id,
      notifyEmail: notifyEmail ?? null,
      tier: tier as Tier,
    });
    if (!dispatched) {
      // Wrap the inline orchestration in withLLMContext so every
      // nested getLLMProvider() call (per-sim personas / countries /
      // pricing / synthesis + post-sim mergeNarrative +
      // buildMarketProfile + competitor-prices/resolver) auto-logs
      // to public.llm_usage_log. The Cloud Run worker variant wraps
      // separately at its own entry. Imported lazily so the route's
      // happy path doesn't pay the cost on every dispatch.
      const { withLLMContext } = await import("@/lib/llm-context");
      await withLLMContext(
        {
          workspaceId: project.workspace_id,
          stageLabel: "ensemble-orchestrator",
          ensembleId: ensemble.id,
        },
        () => runEnsembleOrchestration(orchestrationCtx),
      );
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
 * Dispatch ensemble orchestration to the Cloud Run worker.
 *
 * Returns true when the worker accepted the job (HTTP 202); false on any
 * misconfiguration, network error, timeout, or non-202 response. The caller
 * uses the return value to decide whether to fall back to inline
 * orchestration on Vercel.
 *
 * Worker only needs `ensembleId` (and optionally `notifyEmail`) — it
 * re-derives the full orchestration context from DB via
 * `loadOrchestrationContext()`. Keeping the body minimal also means
 * Vercel→worker request stays under any reasonable size limit and we don't
 * have two copies of the context-construction logic to keep in sync.
 *
 * Tier whitelist via WORKER_TIER_WHITELIST (comma-separated). When unset,
 * all tiers route to the worker. Useful for gradual rollout (e.g. start
 * with WORKER_TIER_WHITELIST=deep,deep_pro and expand once stable).
 */
async function tryDispatchToWorker(args: {
  ensembleId: string;
  notifyEmail: string | null;
  tier: Tier;
}): Promise<boolean> {
  const baseUrl = process.env.WORKER_BASE_URL;
  const token = process.env.WORKER_BEARER_TOKEN;
  if (!baseUrl || !token) return false;

  const whitelist = process.env.WORKER_TIER_WHITELIST
    ?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (whitelist && whitelist.length > 0 && !whitelist.includes(args.tier)) {
    return false;
  }

  const ac = new AbortController();
  // 30s is generous — worker accepts in <1s and returns 202 before
  // background work starts. Anything past that is a real network problem
  // and we should fall back rather than block the after() callback.
  const timer = setTimeout(() => ac.abort(), 30_000);

  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/run-ensemble`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        ensembleId: args.ensembleId,
        notifyEmail: args.notifyEmail,
      }),
      signal: ac.signal,
    });
    if (res.status !== 202) {
      const body = await res.text().catch(() => "");
      console.error(
        `[run-ensemble] worker returned ${res.status} for ensemble ${args.ensembleId} (tier=${args.tier}): ${body.slice(0, 200)} — falling back to inline`,
      );
      return false;
    }
    console.log(
      `[run-ensemble] dispatched ensemble ${args.ensembleId} to Cloud Run worker (tier=${args.tier})`,
    );
    return true;
  } catch (err) {
    console.error(
      `[run-ensemble] worker dispatch failed for ensemble ${args.ensembleId} (tier=${args.tier}), falling back to inline:`,
      err,
    );
    return false;
  } finally {
    clearTimeout(timer);
  }
}


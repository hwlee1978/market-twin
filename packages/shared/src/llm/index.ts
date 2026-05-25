import { AnthropicProvider } from "./anthropic";
import { DeepSeekProvider } from "./deepseek";
import { GeminiProvider } from "./gemini";
import { OpenAIProvider } from "./openai";
import { XaiProvider } from "./xai";
import type { LLMProvider, LLMProviderName } from "./types";

export type { LLMProvider, LLMProviderName, LLMRequest, LLMResponse } from "./types";

/**
 * Pipeline stages that can independently pick a model.
 * Maps to env var prefixes like LLM_PERSONAS_PROVIDER, LLM_SYNTHESIS_MODEL, etc.
 */
export type SimulationStage = "personas" | "countries" | "pricing" | "synthesis";

interface ProviderOptions {
  /** When set, env-driven stage overrides (LLM_<STAGE>_PROVIDER/_MODEL) take effect. */
  stage?: SimulationStage;
  /** Caller-supplied provider — wins over all env. */
  provider?: LLMProviderName;
  /** Caller-supplied model — wins over all env. */
  model?: string;
  /**
   * Product category (free-text, typically the project.category enum like
   * "home" / "pet" / "beauty" / "food"). Used to route Anthropic
   * personas+synthesis stages to Haiku for categories where v11 benchmark
   * showed Sonnet has no accuracy advantage (펫/생활용품) — cost saving
   * without quality loss. See [[benchmark_v11_sonnet_4cat]].
   */
  category?: string | null;
  /**
   * Per-workspace LLM usage tracking. When provided, every generate()
   * call on the returned provider auto-logs to public.llm_usage_log
   * (workspace_id, provider, model, stage, tokens, cost_usd, context
   * jsonb). Powers the super-admin /admin/llm-usage dashboard.
   *
   * Pure side-effect logging — failures swallowed silently so a
   * usage-log outage never breaks a live sim. Pass workspaceId from
   * any caller that knows it (orchestrator, mrai routes, secondary-
   * actions/risks/pricing endpoints, etc.). Calls without
   * usageContext don't log — drops the entry but preserves existing
   * behaviour for legacy call sites.
   */
  usageContext?: {
    workspaceId: string;
    /** Free-text stage label override — falls back to opts.stage when
     *  the caller is in the sim pipeline. Use this for non-stage
     *  callers (e.g. "mrai-chat", "secondary-actions", "narrative-
     *  merge"). Keeps the stage column populated for every row. */
    stageLabel?: string;
    /** Optional referencing IDs — ensembleId / simulationId /
     *  conversationId — persisted in the context jsonb column for
     *  per-entity drilldowns. */
    ensembleId?: string;
    simulationId?: string;
    conversationId?: string;
  };
}

/**
 * Categories where the v11 Sonnet rerun (2026-05-20) showed Sonnet's
 * personas+synthesis has no accuracy advantage over Haiku (펫 Δ -6.7,
 * 생활용품 Δ -0.4 flat), and in fact regresses on niche K-export patterns
 * (ANF pet US→SG, monami pen VN→US). Production routes Anthropic stages
 * to Haiku for these categories to save 4× cost without quality loss.
 *
 * Matched conservatively against the project.category enum from
 * ProjectWizard.tsx ("pet" / "home"). Free-text Korean / English variants
 * also matched as a fallback in case the dropdown enum changes.
 */
export function shouldDowngradeAnthropicForCategory(
  category: string | null | undefined,
): boolean {
  if (!category) return false;
  const t = category.toLowerCase().trim();
  // 펫 (production enum "pet" + Korean/English keywords for free-text)
  if (t === "pet" || t.includes("동물") || t.includes("반려") || t.includes("펫")) return true;
  // 생활용품 (production enum "home" + Korean/English keywords)
  // Note: fixture truths historically used "appliances" for this category,
  // updated to "home" in the same change as this routing for consistency.
  if (
    t === "home" ||
    t.includes("kitchen") || t.includes("household") || t.includes("lifestyle") ||
    t.includes("furniture") || t.includes("생활용품") || t.includes("주방") ||
    t.includes("리빙") || t.includes("가구")
  ) return true;
  return false;
}

function envStage(stage: SimulationStage | undefined, key: "PROVIDER" | "MODEL"): string | undefined {
  if (!stage) return undefined;
  const v = process.env[`LLM_${stage.toUpperCase()}_${key}`];
  return v && v.trim() ? v : undefined;
}

/**
 * Per-provider stage model override — applies even when the caller passes
 * an explicit provider (e.g. ensemble forces sim N to be anthropic).
 * Pattern: `LLM_<PROVIDER>_<STAGE>_MODEL` (e.g. LLM_ANTHROPIC_PERSONAS_MODEL).
 *
 * Used for benchmarks where the operator wants to swap one provider's
 * stage model without affecting other providers in a multi-LLM ensemble.
 * See [[benchmark_haiku_override]].
 */
function envProviderStageModel(
  provider: LLMProviderName | undefined,
  stage: SimulationStage | undefined,
): string | undefined {
  if (!provider || !stage) return undefined;
  const v = process.env[`LLM_${provider.toUpperCase()}_${stage.toUpperCase()}_MODEL`];
  return v && v.trim() ? v : undefined;
}

/**
 * Per-provider model defaults by stage. Used when a caller forces a
 * provider (e.g. ensemble Deep tier round-robins anthropic/openai/gemini
 * across sims) but doesn't supply a model — without this map we'd hand a
 * Claude model ID to OpenAI's SDK and crash. Convention: the cheaper /
 * faster model for high-volume stages (personas, countries, pricing) and
 * the stronger model for the synthesis stage that drives the recommendation.
 */
const PROVIDER_STAGE_DEFAULTS: Record<LLMProviderName, Record<SimulationStage, string>> = {
  anthropic: {
    personas: "claude-sonnet-4-6",
    countries: "claude-haiku-4-5-20251001",
    pricing: "claude-haiku-4-5-20251001",
    synthesis: "claude-sonnet-4-6",
  },
  openai: {
    // Upgraded from gpt-4o → gpt-5.4-mini (2026-05-18) after gpt-4o
    // synthesis stage repeatedly hit Vercel 20-min function timeout on
    // multi-LLM ensembles (Lingtea/FRONT2LINE: 4-7 sims stuck per run).
    // gpt-5.4-mini is 2-3x faster on synthesis-class outputs at similar
    // quality, and ~90% cheaper than gpt-4o per token. Anthropic/DeepSeek
    // never hit the timeout on the same prompts.
    personas: "gpt-5.4-mini",
    countries: "gpt-5.4-mini",
    pricing: "gpt-5.4-mini",
    synthesis: "gpt-5.4-mini",
  },
  gemini: {
    personas: "gemini-2.5-flash",
    countries: "gemini-2.5-flash",
    pricing: "gemini-2.5-flash",
    // Pro for synthesis matches the cross-model intent of the deep tier:
    // each provider's strongest reasoning model on the final stage.
    // Requires Gemini API paid billing on the API key — Google AI Pro
    // (consumer 5TB plan) does NOT cover this.
    synthesis: "gemini-2.5-pro",
  },
  xai: {
    // Grok-3-mini across all stages — chosen for reliability after
    // both Grok-4 (reasoning, blew past SDK timeout) and Grok-3 (still
    // too slow on 12-persona batches under load) timed out repeatedly.
    // Grok-3-mini is the smaller / faster sibling, $0.30/$0.50 per 1M
    // tok, runs in 5-15s typical. Voice quality drops some vs Grok-3 /
    // Sonnet but the top-voice filter surfaces Sonnet voices first
    // anyway — the mini model's contribution is cross-LLM scoring.
    // Override per-stage via LLM_<STAGE>_MODEL=grok-3 if a synthesis
    // call genuinely needs the bigger model.
    personas: "grok-3-mini",
    countries: "grok-3-mini",
    pricing: "grok-3-mini",
    synthesis: "grok-3-mini",
  },
  deepseek: {
    // deepseek-chat (V3) across all stages — non-reasoning, structured-
    // output friendly, $0.27/$1.10 per 1M tok. Lands roughly between
    // Haiku and Sonnet on quality at a fraction of the cost. We don't
    // use deepseek-reasoner (R1) because the persona-batch workload
    // doesn't benefit from chain-of-thought and reasoning models hit
    // SDK timeouts (xAI Grok-4 lesson).
    personas: "deepseek-chat",
    countries: "deepseek-chat",
    pricing: "deepseek-chat",
    synthesis: "deepseek-chat",
  },
};

/**
 * Resolves the LLM to use, with this priority:
 *   1. explicit opts.provider / opts.model (e.g. from a per-request override)
 *   2. stage-specific env (LLM_PERSONAS_PROVIDER, LLM_SYNTHESIS_MODEL, ...)
 *   3. default env (LLM_DEFAULT_PROVIDER, LLM_DEFAULT_MODEL)
 *   4. provider+stage hardcoded fallback (PROVIDER_STAGE_DEFAULTS)
 *
 * The stage-aware layer lets us mix and match cheap-but-capable models for
 * high-volume calls (persona batches) with stronger models where it matters
 * most (final synthesis), without code changes.
 */
export function getLLMProvider(opts: ProviderOptions = {}): LLMProvider {
  const provider =
    opts.provider ??
    (envStage(opts.stage, "PROVIDER") as LLMProviderName | undefined) ??
    (process.env.LLM_DEFAULT_PROVIDER as LLMProviderName | undefined) ??
    "anthropic";

  // Env-driven model resolution. Two-layer override:
  //   1. Per-provider stage env (LLM_ANTHROPIC_PERSONAS_MODEL) — applies
  //      even when caller forces opts.provider, because the env var is
  //      explicitly scoped to one provider. Safe for multi-LLM ensembles
  //      since other providers' sims won't pick it up.
  //   2. Provider-agnostic stage env (LLM_PERSONAS_MODEL) — only applies
  //      when no explicit provider override (legacy single-provider mode),
  //      because otherwise we'd hand a Claude model ID to OpenAI's SDK.
  const perProviderModel = envProviderStageModel(provider, opts.stage);
  const envModel = perProviderModel
    ?? (opts.provider
      ? undefined
      : (envStage(opts.stage, "MODEL") ?? process.env.LLM_DEFAULT_MODEL));
  // Category-based downgrade: route Anthropic personas+synthesis to Haiku
  // for categories where Sonnet has no accuracy advantage (펫/생활용품).
  // Sits below env overrides so operators can still pin a specific model
  // via LLM_ANTHROPIC_<STAGE>_MODEL for benchmark / debug runs.
  const categoryDowngrade =
    provider === "anthropic" &&
    (opts.stage === "personas" || opts.stage === "synthesis") &&
    shouldDowngradeAnthropicForCategory(opts.category)
      ? PROVIDER_STAGE_DEFAULTS.anthropic.countries  // = Haiku
      : undefined;
  const stageDefault = opts.stage ? PROVIDER_STAGE_DEFAULTS[provider][opts.stage] : undefined;
  const model = opts.model ?? envModel ?? categoryDowngrade ?? stageDefault;

  let raw: LLMProvider;
  switch (provider) {
    case "anthropic":
      raw = new AnthropicProvider(model ?? PROVIDER_STAGE_DEFAULTS.anthropic.synthesis);
      break;
    case "openai":
      raw = new OpenAIProvider(model ?? PROVIDER_STAGE_DEFAULTS.openai.synthesis);
      break;
    case "gemini":
      raw = new GeminiProvider(model ?? PROVIDER_STAGE_DEFAULTS.gemini.synthesis);
      break;
    case "xai":
      raw = new XaiProvider(model ?? PROVIDER_STAGE_DEFAULTS.xai.synthesis);
      break;
    case "deepseek":
      raw = new DeepSeekProvider(
        model ?? PROVIDER_STAGE_DEFAULTS.deepseek.synthesis,
      );
      break;
    default:
      throw new Error(`Unknown LLM provider: ${provider}`);
  }

  // Wrap with usage tracking when the caller passed a workspaceId.
  // Falls through (no-op) for legacy callers — they keep producing
  // tokens but won't show on the super-admin dashboard. As call sites
  // get instrumented over time the dashboard fills out.
  if (opts.usageContext?.workspaceId) {
    return wrapWithUsageLogging(raw, {
      workspaceId: opts.usageContext.workspaceId,
      stage: opts.usageContext.stageLabel ?? opts.stage ?? "unknown",
      ensembleId: opts.usageContext.ensembleId,
      simulationId: opts.usageContext.simulationId,
      conversationId: opts.usageContext.conversationId,
    });
  }
  return raw;
}

/**
 * Wrap an LLMProvider so every generate() call fires an async insert
 * into public.llm_usage_log. The wrapper preserves the original
 * provider's behaviour 1:1 (same generate signature, same response
 * shape, same errors) — logging is purely additive. Async + fire-
 * and-forget so a usage-log outage / DB downtime never breaks a live
 * sim. The optional `usageLogger` injection lets the wrapper run in
 * the packages/shared bundle without pulling in the @/lib/supabase
 * Next-only client at import time.
 */
type UsageLogPayload = {
  workspaceId: string;
  provider: LLMProviderName;
  model: string;
  stage: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
  costUsd: number;
  ensembleId?: string;
  simulationId?: string;
  conversationId?: string;
};

let usageLogger:
  | ((payload: UsageLogPayload) => Promise<void> | void)
  | null = null;

/** Caller (Next-side bootstrap) registers the actual DB-writing
 *  function. Until set, wrapped providers run normally but skip
 *  logging — failsafe for unit tests, scripts, and other contexts
 *  without a Supabase connection. */
export function setLLMUsageLogger(
  fn: (payload: UsageLogPayload) => Promise<void> | void,
): void {
  usageLogger = fn;
}

function wrapWithUsageLogging(
  inner: LLMProvider,
  ctx: {
    workspaceId: string;
    stage: string;
    ensembleId?: string;
    simulationId?: string;
    conversationId?: string;
  },
): LLMProvider {
  return {
    name: inner.name,
    model: inner.model,
    async generate(req) {
      const result = await inner.generate(req);
      if (usageLogger) {
        try {
          const inputTokens = result.usage?.inputTokens ?? 0;
          const outputTokens = result.usage?.outputTokens ?? 0;
          const cacheCreation = result.usage?.cacheCreationInputTokens;
          const cacheRead = result.usage?.cacheReadInputTokens;
          const costUsd = estimateCostUsd(
            inner.name,
            inner.model,
            inputTokens,
            outputTokens,
            cacheCreation,
            cacheRead,
          );
          // Fire-and-forget: don't await inside the generate path so
          // a slow DB doesn't add latency to LLM calls.
          void Promise.resolve(
            usageLogger({
              workspaceId: ctx.workspaceId,
              provider: inner.name,
              model: inner.model,
              stage: ctx.stage,
              inputTokens,
              outputTokens,
              cacheCreationInputTokens: cacheCreation,
              cacheReadInputTokens: cacheRead,
              costUsd,
              ensembleId: ctx.ensembleId,
              simulationId: ctx.simulationId,
              conversationId: ctx.conversationId,
            }),
          ).catch((err) =>
            console.warn("[llm-usage] log failed (non-fatal):", err),
          );
        } catch (err) {
          console.warn("[llm-usage] log build failed (non-fatal):", err);
        }
      }
      return result;
    },
  };
}

/**
 * Per-1M-token USD pricing for each provider × model. Updated
 * 2026-05-26. Defaults to Sonnet-tier pricing for unknown models so
 * the dashboard still shows a non-zero estimate. Cache pricing:
 * Anthropic creation is 1.25× input, cache read is 0.1× input.
 */
function estimateCostUsd(
  provider: LLMProviderName,
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheCreationTokens?: number,
  cacheReadTokens?: number,
): number {
  const lc = model.toLowerCase();
  let inputPer1M = 3;
  let outputPer1M = 15;
  if (provider === "anthropic") {
    if (lc.includes("haiku")) {
      inputPer1M = 1;
      outputPer1M = 5;
    } else if (lc.includes("opus")) {
      inputPer1M = 15;
      outputPer1M = 75;
    } else {
      // sonnet default
      inputPer1M = 3;
      outputPer1M = 15;
    }
  } else if (provider === "openai") {
    if (lc.includes("mini") || lc.includes("nano")) {
      inputPer1M = 0.15;
      outputPer1M = 0.6;
    } else if (lc.includes("gpt-4") || lc.includes("o1") || lc.includes("o3")) {
      inputPer1M = 2.5;
      outputPer1M = 10;
    } else {
      inputPer1M = 1;
      outputPer1M = 4;
    }
  } else if (provider === "gemini") {
    if (lc.includes("flash")) {
      inputPer1M = 0.075;
      outputPer1M = 0.3;
    } else {
      inputPer1M = 1.25;
      outputPer1M = 5;
    }
  } else if (provider === "deepseek") {
    inputPer1M = 0.27;
    outputPer1M = 1.1;
  } else if (provider === "xai") {
    inputPer1M = 2;
    outputPer1M = 10;
  }
  const inputCost = (inputTokens / 1_000_000) * inputPer1M;
  const outputCost = (outputTokens / 1_000_000) * outputPer1M;
  const cacheCreate =
    cacheCreationTokens != null
      ? (cacheCreationTokens / 1_000_000) * inputPer1M * 1.25
      : 0;
  const cacheRead =
    cacheReadTokens != null
      ? (cacheReadTokens / 1_000_000) * inputPer1M * 0.1
      : 0;
  return (
    Math.round((inputCost + outputCost + cacheCreate + cacheRead) * 1_000_000) /
    1_000_000
  );
}

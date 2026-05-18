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
  const stageDefault = opts.stage ? PROVIDER_STAGE_DEFAULTS[provider][opts.stage] : undefined;
  const model = opts.model ?? envModel ?? stageDefault;

  switch (provider) {
    case "anthropic":
      return new AnthropicProvider(model ?? PROVIDER_STAGE_DEFAULTS.anthropic.synthesis);
    case "openai":
      return new OpenAIProvider(model ?? PROVIDER_STAGE_DEFAULTS.openai.synthesis);
    case "gemini":
      return new GeminiProvider(model ?? PROVIDER_STAGE_DEFAULTS.gemini.synthesis);
    case "xai":
      return new XaiProvider(model ?? PROVIDER_STAGE_DEFAULTS.xai.synthesis);
    case "deepseek":
      return new DeepSeekProvider(
        model ?? PROVIDER_STAGE_DEFAULTS.deepseek.synthesis,
      );
    default:
      throw new Error(`Unknown LLM provider: ${provider}`);
  }
}

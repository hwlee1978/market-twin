import { AnthropicProvider } from "./anthropic";
import { GeminiProvider } from "./gemini";
import { OpenAIProvider } from "./openai";
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
    personas: "gpt-4o",
    countries: "gpt-4o-mini",
    pricing: "gpt-4o-mini",
    synthesis: "gpt-4o",
  },
  gemini: {
    personas: "gemini-2.5-flash",
    countries: "gemini-2.5-flash",
    pricing: "gemini-2.5-flash",
    // Was gemini-2.5-pro, but Google enforces a separate (much smaller)
    // free-tier quota on Pro that fails the deep tier round-robin with
    // 429s in practice. Flash is plenty for synthesis given the persona
    // input is already pre-aggregated; revisit if we move to a paid tier.
    synthesis: "gemini-2.5-flash",
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

  // Env-driven model only applies when the caller did NOT pass an explicit
  // provider override. Otherwise we'd hand e.g. an Anthropic model ID to
  // OpenAI when the ensemble forces openai for one of its sims.
  const envModel = opts.provider
    ? undefined
    : (envStage(opts.stage, "MODEL") ?? process.env.LLM_DEFAULT_MODEL);
  const stageDefault = opts.stage ? PROVIDER_STAGE_DEFAULTS[provider][opts.stage] : undefined;
  const model = opts.model ?? envModel ?? stageDefault;

  switch (provider) {
    case "anthropic":
      return new AnthropicProvider(model ?? PROVIDER_STAGE_DEFAULTS.anthropic.synthesis);
    case "openai":
      return new OpenAIProvider(model ?? PROVIDER_STAGE_DEFAULTS.openai.synthesis);
    case "gemini":
      return new GeminiProvider(model ?? PROVIDER_STAGE_DEFAULTS.gemini.synthesis);
    default:
      throw new Error(`Unknown LLM provider: ${provider}`);
  }
}

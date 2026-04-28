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
 * Resolves the LLM to use, with this priority:
 *   1. explicit opts.provider / opts.model (e.g. from a per-request override)
 *   2. stage-specific env (LLM_PERSONAS_PROVIDER, LLM_SYNTHESIS_MODEL, ...)
 *   3. default env (LLM_DEFAULT_PROVIDER, LLM_DEFAULT_MODEL)
 *   4. hardcoded fallbacks
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

  const model =
    opts.model ??
    envStage(opts.stage, "MODEL") ??
    process.env.LLM_DEFAULT_MODEL;

  switch (provider) {
    case "anthropic":
      return new AnthropicProvider(model ?? "claude-sonnet-4-6");
    case "openai":
      return new OpenAIProvider(model ?? "gpt-4o");
    case "gemini":
      return new GeminiProvider(model ?? "gemini-2.5-flash");
    default:
      throw new Error(`Unknown LLM provider: ${provider}`);
  }
}

import { AnthropicProvider } from "./anthropic";
import { GeminiProvider } from "./gemini";
import { OpenAIProvider } from "./openai";
import type { LLMProvider, LLMProviderName } from "./types";

export type { LLMProvider, LLMProviderName, LLMRequest, LLMResponse } from "./types";

interface ProviderOptions {
  provider?: LLMProviderName;
  model?: string;
}

export function getLLMProvider(opts: ProviderOptions = {}): LLMProvider {
  const provider =
    opts.provider ?? (process.env.LLM_DEFAULT_PROVIDER as LLMProviderName | undefined) ?? "anthropic";
  const envModel = process.env.LLM_DEFAULT_MODEL;

  switch (provider) {
    case "anthropic":
      return new AnthropicProvider(opts.model ?? envModel ?? "claude-sonnet-4-6");
    case "openai":
      return new OpenAIProvider(opts.model ?? envModel ?? "gpt-4o");
    case "gemini":
      return new GeminiProvider(opts.model ?? envModel ?? "gemini-2.5-flash");
    default:
      throw new Error(`Unknown LLM provider: ${provider}`);
  }
}

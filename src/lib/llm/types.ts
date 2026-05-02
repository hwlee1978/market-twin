export type LLMProviderName = "anthropic" | "openai" | "gemini";

export interface LLMRequest {
  /** System / instruction prompt. */
  system?: string;
  /** Main user prompt. */
  prompt: string;
  /**
   * Optional public-URL image references. Providers that support vision
   * (Anthropic) attach them as image content blocks alongside the prompt;
   * providers that don't (OpenAI/Gemini in this codebase today) silently
   * drop them — caller decides whether to gate vision-dependent flows on
   * provider name. URLs must be publicly fetchable.
   */
  images?: string[];
  /** Optional JSON schema for structured output. If provided, the provider will request JSON. */
  jsonSchema?: object;
  temperature?: number;
  maxTokens?: number;
}

export interface LLMResponse {
  text: string;
  /** Parsed JSON if `jsonSchema` was supplied, otherwise undefined. */
  json?: unknown;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
  raw?: unknown;
}

export interface LLMProvider {
  readonly name: LLMProviderName;
  readonly model: string;
  generate(req: LLMRequest): Promise<LLMResponse>;
}

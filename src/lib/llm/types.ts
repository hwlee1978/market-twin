export type LLMProviderName =
  | "anthropic"
  | "openai"
  | "gemini"
  | "xai"
  | "deepseek";

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
   *
   * Prefer `imagesInline` when possible — Anthropic's URL form makes the
   * provider's backend fetch the URL, which times out at ~5s and returns
   * non-retryable HTTP 400 when our Supabase Storage bucket is slow to
   * respond. Pre-fetching ourselves and passing inline base64 avoids
   * that failure mode entirely.
   */
  images?: string[];
  /**
   * Optional inline image payloads — the provider gets the bytes directly
   * and never has to fetch a URL. Use these when you have control over
   * fetch timing (e.g. ensemble-level pre-fetch in run-ensemble route).
   * Only Anthropic consumes them today; other providers ignore them.
   */
  imagesInline?: Array<{ mediaType: string; base64: string }>;
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

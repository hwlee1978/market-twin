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
  /**
   * Optional AbortSignal — when triggered, the provider should abort the
   * in-flight HTTP call immediately. The runner threads this through
   * every LLM call so a user cancellation stops live requests instead
   * of waiting for the next stage boundary. Providers without native
   * SDK support throw AbortError on next opportunity (best-effort).
   */
  signal?: AbortSignal;
  /**
   * Optional key hint for the array we expect in the JSON response.
   * Used by the partial-JSON-recovery layer when the response gets
   * truncated mid-array (e.g. Anthropic max_tokens, OpenAI/DeepSeek
   * stream-stop). When set, recovery reconstructs `{ [arrayKey]: [...] }`
   * from any complete entries that survived the truncation, salvaging
   * 8-11 personas from a 12-batch instead of dropping the whole batch.
   *
   * Common values: "personas", "reactions", "countries", "creatives".
   * Optional — recovery still works without it, just falls back to
   * first-array extraction (which produces a bare array, requiring
   * the caller to handle the shape difference).
   */
  expectedArrayKey?: string;
  /**
   * When true (default), Anthropic-only: mark the system prompt with
   * cache_control so subsequent calls with the same system within the
   * cache TTL hit the cache for ~90% input-cost savings. Anthropic
   * silently ignores when the system block is below the per-model
   * minimum (1024 tokens for Sonnet, 2048 for Haiku) so always-on is
   * safe. Set false explicitly for transient single-use prompts where
   * the 1.25× cache-write premium would be net-negative.
   *
   * Other providers ignore this flag (OpenAI auto-caches via its own
   * mechanism; Gemini/xAI/DeepSeek don't currently support equivalent).
   */
  cacheSystem?: boolean;
}

export interface LLMResponse {
  text: string;
  /** Parsed JSON if `jsonSchema` was supplied, otherwise undefined. */
  json?: unknown;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    /** Anthropic prompt caching: tokens written to cache on this call. */
    cacheCreationInputTokens?: number;
    /** Anthropic prompt caching: tokens read from cache (paid at 0.1×). */
    cacheReadInputTokens?: number;
  };
  raw?: unknown;
}

export interface LLMProvider {
  readonly name: LLMProviderName;
  readonly model: string;
  generate(req: LLMRequest): Promise<LLMResponse>;
}

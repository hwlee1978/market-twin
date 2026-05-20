/**
 * Per-model input/output token pricing (USD per million tokens).
 *
 * Reference: provider docs as of late 2025 / early 2026. Tier-1 paid
 * tier prices, no batch / cached discounts. When a model isn't in
 * the table, falls back to the provider's mid-tier representative
 * (e.g. unknown anthropic → sonnet pricing) so we never silently
 * record $0.
 *
 * Update cadence: every quarter or when a new model lands. Changes
 * here only affect new sims (existing rows already persisted their
 * computed cost at sim-completion time).
 */

interface PriceUsdPerMTok {
  input: number;
  output: number;
}

const PRICE_TABLE: Record<string, Record<string, PriceUsdPerMTok>> = {
  anthropic: {
    "claude-sonnet-4-6": { input: 3, output: 15 },
    "claude-haiku-4-5-20251001": { input: 0.8, output: 4 },
    "claude-haiku-4-5": { input: 0.8, output: 4 },
  },
  openai: {
    "gpt-4o": { input: 2.5, output: 10 },
    "gpt-4o-mini": { input: 0.15, output: 0.6 },
    "gpt-4.1": { input: 2.5, output: 10 },
    "gpt-4.1-mini": { input: 0.15, output: 0.6 },
    // GPT-5.4 family — pricing follows the 4.1 generation pattern until
    // OpenAI publishes the official 5.4 sheet. Adjust here once verified.
    "gpt-5.4": { input: 2.5, output: 10 },
    "gpt-5.4-mini": { input: 0.25, output: 1.0 },
    "gpt-5.5": { input: 5, output: 20 },
  },
  gemini: {
    "gemini-2.5-pro": { input: 1.25, output: 5 },
    "gemini-2.5-flash": { input: 0.075, output: 0.3 },
  },
  xai: {
    // Grok-4 sits in the same price tier as Sonnet 4.6.
    "grok-4": { input: 3, output: 15 },
    "grok-3": { input: 3, output: 15 },
    "grok-3-mini": { input: 0.3, output: 0.5 },
  },
  deepseek: {
    "deepseek-chat": { input: 0.27, output: 1.1 },
    "deepseek-reasoner": { input: 0.55, output: 2.19 },
  },
};

const PROVIDER_FALLBACK: Record<string, PriceUsdPerMTok> = {
  // Sonnet / gpt-4o / gemini-pro are the "what would the average cost be"
  // when we can't identify the exact model — slight overestimate is safer
  // than silent zero.
  anthropic: { input: 3, output: 15 },
  openai: { input: 2.5, output: 10 },
  gemini: { input: 1.25, output: 5 },
  xai: { input: 3, output: 15 },
  deepseek: { input: 0.27, output: 1.1 },
};

/**
 * Cost for a single LLM call in cents (rounded to nearest integer cent
 * after summing input + output components). Returns 0 when usage data
 * is missing — caller can decide whether to skip recording or warn.
 *
 * Anthropic prompt caching pricing (2026-05-20):
 *   - Cache write: 1.25× normal input rate
 *   - Cache read:  0.10× normal input rate
 *   - Regular input (non-cached): 1.0× input rate
 *
 * Caller passes cache-write and cache-read tokens separately when known.
 * The Anthropic SDK's `input_tokens` field excludes both cache writes
 * and cache reads — they're reported in their own counters. Other
 * providers don't surface caching today and pass undefined for both.
 */
export function llmCallCostCents(
  provider: string,
  model: string,
  inputTokens: number | undefined,
  outputTokens: number | undefined,
  cacheWriteTokens: number | undefined = 0,
  cacheReadTokens: number | undefined = 0,
): number {
  if (!inputTokens && !outputTokens && !cacheWriteTokens && !cacheReadTokens) return 0;
  const price =
    PRICE_TABLE[provider]?.[model] ??
    PROVIDER_FALLBACK[provider] ??
    PROVIDER_FALLBACK.openai;
  const dollars =
    ((inputTokens ?? 0) / 1_000_000) * price.input +
    ((cacheWriteTokens ?? 0) / 1_000_000) * price.input * 1.25 +
    ((cacheReadTokens ?? 0) / 1_000_000) * price.input * 0.10 +
    ((outputTokens ?? 0) / 1_000_000) * price.output;
  return Math.round(dollars * 100);
}

/** Format cents as $X.XX. Convenience for billing UIs. */
export function formatCentsUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

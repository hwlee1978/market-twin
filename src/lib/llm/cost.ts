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
  },
  gemini: {
    "gemini-2.5-pro": { input: 1.25, output: 5 },
    "gemini-2.5-flash": { input: 0.075, output: 0.3 },
  },
};

const PROVIDER_FALLBACK: Record<string, PriceUsdPerMTok> = {
  // Sonnet / gpt-4o / gemini-pro are the "what would the average cost be"
  // when we can't identify the exact model — slight overestimate is safer
  // than silent zero.
  anthropic: { input: 3, output: 15 },
  openai: { input: 2.5, output: 10 },
  gemini: { input: 1.25, output: 5 },
};

/**
 * Cost for a single LLM call in cents (rounded to nearest integer cent
 * after summing input + output components). Returns 0 when usage data
 * is missing — caller can decide whether to skip recording or warn.
 */
export function llmCallCostCents(
  provider: string,
  model: string,
  inputTokens: number | undefined,
  outputTokens: number | undefined,
): number {
  if (!inputTokens && !outputTokens) return 0;
  const price =
    PRICE_TABLE[provider]?.[model] ??
    PROVIDER_FALLBACK[provider] ??
    PROVIDER_FALLBACK.openai;
  const dollars =
    ((inputTokens ?? 0) / 1_000_000) * price.input +
    ((outputTokens ?? 0) / 1_000_000) * price.output;
  return Math.round(dollars * 100);
}

/** Format cents as $X.XX. Convenience for billing UIs. */
export function formatCentsUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

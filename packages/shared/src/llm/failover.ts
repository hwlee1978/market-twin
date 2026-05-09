import type { LLMProvider, LLMRequest, LLMResponse } from "./types";

/**
 * Provider-failover wrapper. Tries the primary LLM first; if its retry
 * policy exhausts on a retryable error (5xx / 429 / network), invokes
 * the fallback factory and tries once more there.
 *
 * Why this exists (per memory note llm_provider_failover.md):
 *   Gemini 2.5 Pro routinely 503s with "model is currently experiencing
 *   high demand" during peak global traffic. Tier-1 paid status doesn't
 *   shield against it — it's Google-side capacity, not a per-account
 *   rate limit. Even with our 5-attempt × jittered backoff totalling
 *   ~3 minutes, sustained spikes still leak through and kill sims.
 *
 * Scope: every high-volume stage uses this — synthesis, personas,
 * countries, pricing, and (transitively) regulatory. Earlier scope was
 * synthesis-only on the theory that volume stages tolerate provider
 * variance, but in practice a single-stage outage on persona generation
 * (Gemini 503 storm or Anthropic url-fetch timeout) wipes out entire
 * sims even though the rest of the pipeline would have completed fine.
 * Trading a small attribution drift on failover for sims that actually
 * finish has been the right tradeoff.
 *
 * Honest attribution: every fallback fire writes to `onFallback` so
 * the sim runner can record which provider actually produced the
 * output. The aggregator's providerBreakdown reads that, not the
 * sim's nominal provider, so cross-model agreement remains accurate.
 */

interface FailoverOptions {
  /** Stage name for logs. */
  stage: string;
  /** Sim id for log correlation. */
  simId?: string;
  /** Lazy fallback constructor — called only on actual failover, so the
   *  fallback API key isn't validated at startup. */
  makeFallback: () => LLMProvider;
  /** Called on actual failover with the original error and the names
   *  of primary / fallback providers. Lets the runner record state. */
  onFallback?: (info: {
    primary: string;
    fallback: string;
    error: unknown;
  }) => void;
}

export function withProviderFallback(
  primary: LLMProvider,
  opts: FailoverOptions,
): LLMProvider {
  return {
    name: primary.name,
    model: primary.model,
    async generate(req: LLMRequest): Promise<LLMResponse> {
      try {
        return await primary.generate(req);
      } catch (err) {
        if (!isRetryableUpstreamError(err)) {
          // Auth, schema, or schema-only errors — fallback won't help.
          throw err;
        }
        const fallback = opts.makeFallback();
        const tag = `${opts.stage}${opts.simId ? ` sim=${opts.simId.slice(0, 8)}` : ""}`;
        console.warn(
          `[failover] ${tag} primary (${primary.name}) exhausted retries — trying fallback (${fallback.name})`,
          err instanceof Error ? err.message : err,
        );
        opts.onFallback?.({
          primary: primary.name,
          fallback: fallback.name,
          error: err,
        });
        return await fallback.generate(req);
      }
    },
  };
}

/**
 * Mirrors retry.ts's classify() — retryable upstream errors are the
 * same set we'd retry on. We don't import classify directly because
 * it's not exported and a duplicate keeps this module independent.
 */
function isRetryableUpstreamError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const r = err as Record<string, unknown>;
  for (const k of ["status", "statusCode", "code"]) {
    const v = r[k];
    const n = typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : null;
    if (n === 429 || n === 500 || n === 502 || n === 503 || n === 504) return true;
  }
  // Some Google SDKs surface 503 inside the message string only.
  if (err instanceof Error) {
    const m = err.message;
    if (/(\b503\b|\b502\b|\b500\b|\b429\b|high demand|overloaded)/i.test(m)) return true;
  }
  return false;
}

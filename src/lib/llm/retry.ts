/**
 * Retry policy shared by every LLM provider wrapper.
 *
 * Real-world failure modes we MUST recover from on a deep-tier ensemble:
 *  - 429 from OpenAI/Gemini when burst exceeds TPM/RPM cap (rate limit).
 *    Provider hands back a hint like "Please try again in 8.44s" — we
 *    honor that wait, then retry.
 *  - 503 "model is currently experiencing high demand" (Gemini especially).
 *    Pure transient — exponential backoff handles it.
 *  - 500/502/504 from any provider — same exponential backoff.
 *
 * 4xx other than 429 (auth, bad request, missing model) are NOT retried —
 * the call won't succeed on the next attempt and silent retries hide bugs.
 */

const DEFAULT_MAX_ATTEMPTS = 3;
const BACKOFF_MS = [1000, 3000, 9000];
const MAX_PARSED_WAIT_MS = 60_000;

export type RetryContext = {
  provider: string;
  /** Free-form short label, e.g. "personas", "synthesis". Logged for triage. */
  stage?: string;
};

export async function withLLMRetry<T>(
  fn: () => Promise<T>,
  ctx: RetryContext,
  maxAttempts: number = DEFAULT_MAX_ATTEMPTS,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const decision = classify(err);
      if (!decision.retry || attempt === maxAttempts - 1) {
        throw err;
      }
      const delayMs = decision.waitMs ?? BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
      const tag = ctx.stage ? `${ctx.provider}/${ctx.stage}` : ctx.provider;
      console.warn(
        `[llm retry] ${tag} attempt ${attempt + 1}/${maxAttempts} — ${decision.reason} — waiting ${delayMs}ms`,
      );
      await sleep(delayMs);
    }
  }
  throw lastErr;
}

interface RetryDecision {
  retry: boolean;
  waitMs?: number;
  reason: string;
}

function classify(err: unknown): RetryDecision {
  if (!err || typeof err !== "object") {
    return { retry: false, reason: "non-error throw" };
  }
  const status = pickStatus(err);
  const message = pickMessage(err);

  if (status === 429) {
    const parsedWait = extractRetryAfterMs(err, message);
    return {
      retry: true,
      waitMs: parsedWait,
      reason: parsedWait
        ? `429 rate-limited; provider asked for ${parsedWait}ms`
        : "429 rate-limited",
    };
  }
  if (status === 503 || status === 502 || status === 500 || status === 504) {
    return { retry: true, reason: `${status} transient upstream` };
  }
  return { retry: false, reason: `non-retryable (status=${status ?? "?"})` };
}

function pickStatus(err: unknown): number | undefined {
  const r = err as Record<string, unknown>;
  for (const k of ["status", "statusCode", "code"]) {
    const v = r[k];
    if (typeof v === "number") return v;
    if (typeof v === "string" && /^\d+$/.test(v)) return Number(v);
  }
  return undefined;
}

function pickMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  const r = err as Record<string, unknown>;
  return typeof r.message === "string" ? r.message : "";
}

function extractRetryAfterMs(err: unknown, message: string): number | undefined {
  // OpenAI SDK exposes response headers — prefer the explicit Retry-After
  // header when present. Falls back to parsing the message hint, which
  // both OpenAI and Gemini include in their 429 responses.
  const headers = (err as { headers?: Record<string, string> }).headers;
  const headerVal = headers?.["retry-after"] ?? headers?.["Retry-After"];
  if (headerVal) {
    const seconds = Number(headerVal);
    if (Number.isFinite(seconds) && seconds > 0) {
      return clampWait(seconds * 1000);
    }
  }
  // "Please try again in 8.44s" / "in 10.218s" / "in 1m23s"
  const sec = message.match(/try again in ([\d.]+)\s*s/i);
  if (sec) return clampWait(parseFloat(sec[1]) * 1000);
  return undefined;
}

function clampWait(ms: number): number {
  // Add 200ms padding so we don't race the provider's clock by a hair, and
  // cap at 60s so a misbehaving provider can't pin our worker indefinitely.
  return Math.min(MAX_PARSED_WAIT_MS, Math.ceil(ms) + 200);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

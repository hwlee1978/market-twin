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

// 5 attempts × exponential backoff with jitter so a Gemini 2.5 Pro
// "high demand" 503 spike — which can last 30-90s during peak hours —
// doesn't kill an entire 25-sim ensemble. Earlier 3×[1s/3s/9s] = 13s
// total wait was insufficient and routinely cost us 4-5 sims per deep
// run. New schedule covers ~3 minutes of rolling backoff before we give
// up. Jitter (±20%) avoids thundering herd when N parallel sims all
// retry the same upstream at the same moment.
const DEFAULT_MAX_ATTEMPTS = 5;
const BACKOFF_MS = [1000, 5000, 15000, 45000, 120000];
const JITTER_FRACTION = 0.2;
const MAX_PARSED_WAIT_MS = 60_000;

function jitter(ms: number): number {
  const swing = ms * JITTER_FRACTION;
  return Math.round(ms + (Math.random() * 2 - 1) * swing);
}

export type RetryContext = {
  provider: string;
  /** Free-form short label, e.g. "personas", "synthesis". Logged for triage. */
  stage?: string;
  /** Caller's AbortSignal — when triggered, retry loop exits immediately
   * (raises the most recent error) and the backoff sleep is interrupted.
   * Without this, a cancelled sim sits through up to ~3 minutes of
   * jittered backoff before the runner notices. */
  signal?: AbortSignal;
};

export async function withLLMRetry<T>(
  fn: () => Promise<T>,
  ctx: RetryContext,
  maxAttempts: number = DEFAULT_MAX_ATTEMPTS,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (ctx.signal?.aborted) {
      // Abort fired between attempts (or before first try). Surface the
      // abort reason if available, otherwise the last upstream error.
      throw ctx.signal.reason ?? lastErr ?? new Error("aborted");
    }
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      // SDK-level abort propagates as a known shape (DOMException name
      // "AbortError" in fetch land, or the SDK's own APIUserAbortError).
      // Don't retry those — caller cancelled, escalate immediately.
      if (isAbortError(err)) throw err;
      const decision = classify(err);
      if (!decision.retry || attempt === maxAttempts - 1) {
        throw err;
      }
      const baseDelay = decision.waitMs ?? BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
      const delayMs = jitter(baseDelay);
      const tag = ctx.stage ? `${ctx.provider}/${ctx.stage}` : ctx.provider;
      console.warn(
        `[llm retry] ${tag} attempt ${attempt + 1}/${maxAttempts} — ${decision.reason} — waiting ${delayMs}ms`,
      );
      await sleepCancelable(delayMs, ctx.signal);
    }
  }
  throw lastErr;
}

function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const r = err as { name?: unknown };
  if (r.name === "AbortError") return true;
  // OpenAI SDK throws APIUserAbortError; Anthropic SDK uses AbortError;
  // both expose a constructor name we can match on.
  const ctor = (err as { constructor?: { name?: string } }).constructor;
  if (ctor?.name && /Abort/i.test(ctor.name)) return true;
  return false;
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
  // No HTTP status but the SDK threw — typically connection-layer
  // failures (request timeout, ECONNRESET, socket hang up). Worth a
  // retry: a retried call against a different worker / fresh socket
  // often succeeds. xAI's Grok flagged this when the persona-batch
  // call timed out on Grok-4 (reasoning model overran the SDK's
  // 10-minute default timeout) — without this branch the timeout
  // failed the whole sim instead of letting backoff kick in.
  if (status === undefined && /timed out|timeout|econn|socket hang up|fetch failed|network/i.test(message)) {
    return { retry: true, reason: `connection error: ${message.slice(0, 80)}` };
  }
  // Anthropic-specific: HTTP 400 "timed out while trying to download
  // the file" — fired when their backend can't fetch a URL we passed
  // as `image.source.type=url` within ~5s. Anthropic's own header says
  // `x-should-retry: false`, but a retry IS worth attempting because
  // the failure is in their fetch worker (transient infra), not in
  // our request shape. Backstop only — the primary fix is the
  // ensemble-level pre-fetch path (asset-fetch.ts) that ships base64
  // inline so Anthropic doesn't fetch anything.
  if (status === 400 && /timed out while trying to download/i.test(message)) {
    return {
      retry: true,
      reason: "anthropic url-fetch timeout (backstop retry)",
    };
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

/** Sleep that resolves early when the supplied AbortSignal fires. The
 *  resolution looks like a normal completion — caller's next loop
 *  iteration sees `signal.aborted === true` and exits via the loop
 *  guard, so we don't need to throw here. */
function sleepCancelable(ms: number, signal: AbortSignal | undefined): Promise<void> {
  if (!signal) return sleep(ms);
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

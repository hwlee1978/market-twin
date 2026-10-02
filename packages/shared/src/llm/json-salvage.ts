/**
 * What to do when a provider returns JSON we can't use.
 *
 * Anthropic's provider has handled this since the 2026-05 persona-loss
 * incident: re-sample once when a complete response won't parse, throw
 * when a truncated one can't be recovered so the failover wrapper tries
 * someone else, and alert when a truncated one was only partially
 * recovered. The other four providers did none of it — they returned
 * `json: undefined` and let the caller decide, which in practice meant
 * the caller silently fell back.
 *
 * A Consensus run surfaced the cost: one DeepSeek synthesis came back
 * at 2,988 tokens with nothing recoverable, and that simulation
 * contributed no risks, no actions and no summary to a six-sim report.
 * A single low-temperature re-sample is the fix Anthropic already had.
 *
 * This is that logic, once, for everyone.
 */
import { alertOpsAsync } from "@/lib/email/ops-alert";
import { recoverJsonFromText } from "./json-parse";

/** One call's raw outcome, in whatever shape the provider reports it. */
export interface SalvageAttempt {
  text: string;
  /** The provider stopped because it hit the output cap. */
  truncated: boolean;
  outputTokens: number;
}

export interface SalvageParams {
  /** Provider name, for logs and the alert's dedupe key. */
  provider: string;
  /** Salvage only applies when the caller asked for JSON. */
  wantsJson: boolean;
  /** The cap that was requested, quoted in the error and the alert. */
  maxTokens: number;
  /** Hint passed through to the partial-array recovery. */
  arrayKey?: string;
  /** A cancelled request should not be re-sampled. */
  aborted?: boolean;
  first: SalvageAttempt;
  /**
   * Re-run the identical request at a low temperature. Called at most
   * once, and only for a complete response whose JSON wouldn't parse —
   * re-sampling a truncated one would just truncate again.
   */
  resample: () => Promise<SalvageAttempt>;
}

export interface SalvageResult {
  text: string;
  json: unknown;
  outputTokens: number;
}

export async function salvageJsonResponse(p: SalvageParams): Promise<SalvageResult> {
  const recover = (text: string) =>
    p.wantsJson ? recoverJsonFromText(text, { arrayKey: p.arrayKey }) : undefined;

  let { text, truncated, outputTokens } = p.first;
  let json = recover(text);

  // A complete response whose JSON won't parse is usually a transient
  // sampling defect — an unescaped newline inside a long string, most
  // often at high temperature. withLLMRetry never sees it because the
  // HTTP call succeeded. One re-sample at low temperature near-always
  // comes back clean, and prompt caching makes the retry's input nearly
  // free. We only re-sample what we couldn't use anyway, so the
  // creativity lost to a low temperature costs nothing.
  if (p.wantsJson && json === undefined && !truncated && !p.aborted) {
    console.warn(
      `[${p.provider}] JSON unparseable on a complete response ` +
        `(output ${outputTokens} tok) — re-sampling once at low temperature`,
    );
    const second = await p.resample();
    text = second.text;
    truncated = second.truncated;
    outputTokens = second.outputTokens;
    json = recover(text);
  }

  if (truncated) {
    if (p.wantsJson && json === undefined) {
      // Hard failure — throwing is what lets the failover wrapper try a
      // different provider. Returning an empty result instead makes the
      // caller drop the whole batch with no idea why.
      throw new Error(
        `${p.provider} response truncated at max_tokens=${p.maxTokens} ` +
          `(used ${outputTokens}) — JSON unrecoverable, request retry/failover`,
      );
    }
    console.warn(
      `[${p.provider}] response hit max_tokens=${p.maxTokens} ceiling — output truncated. ` +
        `Used ${outputTokens} tokens. Partial JSON recovered (caller may see incomplete array).`,
    );
    // Recovered, but short — items the model meant to emit are gone and
    // the caller cannot tell. Collapsed hourly per provider per ceiling:
    // a run that clips once usually clips repeatedly.
    void alertOpsAsync({
      kind: "llm_output_truncated",
      severity: "warn",
      summary: `${p.provider} 응답이 max_tokens=${p.maxTokens}에서 잘렸습니다 — 부분 복구된 결과가 그대로 사용됩니다`,
      dedupeKey: `${p.provider}:${p.maxTokens}`,
      dedupeMinutes: 60,
      details: { provider: p.provider, maxTokens: p.maxTokens, usedTokens: outputTokens },
    });
  }

  return { text, json, outputTokens };
}

/** OpenAI-compatible APIs (OpenAI, DeepSeek, xAI) report the cap this way. */
export function hitLengthCap(finishReason: string | null | undefined): boolean {
  return finishReason === "length";
}

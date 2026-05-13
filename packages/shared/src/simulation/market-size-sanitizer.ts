/**
 * Output-side sanity check for the LLM-emitted `marketSize.estimateUsd`
 * string. The prompt block at prompts.ts:894 instructs the model to
 * anchor on Tavily snippets when they carry specific figures, but
 * compliance isn't 100% — the same residual-hallucination pattern that
 * shows up in competitor-price claims (ad15926) can land here too.
 * If the snippets say "$3-5B" and the LLM emits "$15B", a downstream
 * KOTRA-style review sees both the inflated figure AND the cited
 * sources without any indication they don't actually agree.
 *
 * This helper extracts USD-billion-unit values from both sides, builds
 * a permissive tolerance band around the snippet evidence (0.5×–2×
 * the snippet min/max), and flags estimates that fall outside it. The
 * tolerance is wide on purpose: Tavily snippets often mix current TAM
 * with projected 2028 / 2030 figures, and the LLM "split-the-difference"
 * estimate should pass through cleanly. Only outright divergence flags.
 *
 * When evidence is too thin to bound the estimate (<2 distinct numbers
 * extracted from snippets), the check returns `unknown` rather than
 * a false-positive flag.
 */

export interface TavilySnippetForSanitizer {
  title?: string | null;
  content?: string | null;
}

export type MarketSizeGroundingStatus =
  | { status: "ok"; snippetValuesUsdB: number[]; claimedValueUsdB: number }
  | { status: "no-snippets" }
  | { status: "unknown"; snippetValuesUsdB: number[]; claimedValueUsdB?: number }
  | {
      status: "mismatch";
      snippetValuesUsdB: number[];
      claimedValueUsdB: number;
      snippetRangeUsdB: { low: number; high: number };
      toleranceBandUsdB: { low: number; high: number };
      direction: "above" | "below";
    };

const TOLERANCE_MULTIPLIER = 2;

/**
 * Pull every "$X billion / $X B / $X-Y B / $X trillion" magnitude from
 * a free-text body. Returns USD-billion-unit values. Trillion ranges
 * are converted (1T = 1000B). Single-value mentions and ranges both
 * land flat in the array — range endpoints become two separate entries.
 *
 * Intentionally permissive: catches "$3.5B", "$3.5 billion", "USD 3.5B",
 * "3.5–5B", "3.5 to 5 billion", "approximately $3 billion". Does NOT
 * catch raw "3500 million" (no $) — false-positive risk on unit-less
 * numbers is higher than the catch rate gain.
 */
export function extractUsdBillionValues(text: string): number[] {
  if (!text) return [];
  const out: number[] = [];

  // Range pattern: $3.5–5 B, $3.5-5 billion, 3.5 to 5 B, etc.
  // Matches "$? num1 [–-/to] num2 [B/billion/T/trillion]" with optional
  // whitespace + currency prefix.
  const rangeRe =
    /(?:US?D?\s*)?\$?\s*(\d+(?:\.\d+)?)\s*(?:[-–~/]|\s+to\s+)\s*(\d+(?:\.\d+)?)\s*(billion|b|trillion|t)\b/gi;
  for (const m of text.matchAll(rangeRe)) {
    const low = parseFloat(m[1]);
    const high = parseFloat(m[2]);
    const unit = m[3].toLowerCase();
    if (Number.isFinite(low) && Number.isFinite(high) && low > 0 && high > 0) {
      const factor = unit.startsWith("t") ? 1000 : 1;
      out.push(low * factor, high * factor);
    }
  }

  // Single-value pattern: $3.5B, $3.5 billion, USD 3.5T, etc.
  // Run after the range pass — text already partially matched, but
  // matchAll on a stateful regex doesn't double-count when patterns
  // are different.
  const singleRe =
    /(?:US?D?\s*)?\$\s*(\d+(?:\.\d+)?)\s*(billion|b|trillion|t)\b/gi;
  for (const m of text.matchAll(singleRe)) {
    const value = parseFloat(m[1]);
    const unit = m[2].toLowerCase();
    if (Number.isFinite(value) && value > 0) {
      const factor = unit.startsWith("t") ? 1000 : 1;
      out.push(value * factor);
    }
  }

  // Dedupe values within 0.5% — handles the case where the range and
  // single-value patterns both match the same span. e.g. "$3.5-5B"
  // would emit [3.5, 5] from the range, but if the same body also
  // says "$3.5B currently", the single-value pattern adds another
  // 3.5 — dedupe so the snippet range doesn't get triple-weighted.
  const sorted = [...out].sort((a, b) => a - b);
  const deduped: number[] = [];
  for (const v of sorted) {
    if (deduped.length === 0 || v / deduped[deduped.length - 1] > 1.005) {
      deduped.push(v);
    }
  }
  return deduped;
}

/**
 * Concatenate a Tavily-shaped snippet array into the sanitizer input.
 * Title and content both go in — sometimes the dollar figure only
 * appears in the title ("Korea Footwear Market — $3.5B 2024 TAM").
 */
export function snippetsToSearchBody(
  snippets: TavilySnippetForSanitizer[],
): string {
  return snippets
    .map((s) => `${s.title ?? ""}\n${s.content ?? ""}`)
    .join("\n\n");
}

/**
 * Pick the "primary" claimed value from the LLM's estimateUsd string.
 * Most LLM outputs phrase as "$3.5B annually" or "$3.5–5B (TAM)". When
 * a range is given, take the midpoint — that's the value a KOTRA
 * reader would treat as the headline figure.
 */
export function pickClaimedValueUsdB(estimateUsd: string): number | undefined {
  const values = extractUsdBillionValues(estimateUsd);
  if (values.length === 0) return undefined;
  if (values.length === 1) return values[0];
  // Range: take the midpoint of the spread the LLM emitted.
  const sorted = [...values].sort((a, b) => a - b);
  return (sorted[0] + sorted[sorted.length - 1]) / 2;
}

/**
 * Main entry point. Compare the LLM-emitted estimateUsd against the
 * Tavily snippet evidence and return a grounding status the renderer
 * can act on.
 */
export function checkMarketSizeGrounding(
  estimateUsd: string | undefined | null,
  snippets: TavilySnippetForSanitizer[] | undefined | null,
): MarketSizeGroundingStatus {
  if (!snippets || snippets.length === 0) {
    return { status: "no-snippets" };
  }
  const snippetValues = extractUsdBillionValues(
    snippetsToSearchBody(snippets),
  );
  // Need ≥2 distinct numbers to define a tolerance band — a single
  // number alone could be a typo, an outlier, or a year mention
  // ("$3B by 2028" leaves only "3" as the extracted figure with no
  // current-year anchor).
  if (snippetValues.length < 2) {
    const claimed = estimateUsd ? pickClaimedValueUsdB(estimateUsd) : undefined;
    return {
      status: "unknown",
      snippetValuesUsdB: snippetValues,
      claimedValueUsdB: claimed,
    };
  }
  const claimed = estimateUsd ? pickClaimedValueUsdB(estimateUsd) : undefined;
  if (claimed === undefined) {
    return {
      status: "unknown",
      snippetValuesUsdB: snippetValues,
    };
  }

  const snippetLow = Math.min(...snippetValues);
  const snippetHigh = Math.max(...snippetValues);
  const bandLow = snippetLow / TOLERANCE_MULTIPLIER;
  const bandHigh = snippetHigh * TOLERANCE_MULTIPLIER;

  if (claimed < bandLow) {
    return {
      status: "mismatch",
      snippetValuesUsdB: snippetValues,
      claimedValueUsdB: claimed,
      snippetRangeUsdB: { low: snippetLow, high: snippetHigh },
      toleranceBandUsdB: { low: bandLow, high: bandHigh },
      direction: "below",
    };
  }
  if (claimed > bandHigh) {
    return {
      status: "mismatch",
      snippetValuesUsdB: snippetValues,
      claimedValueUsdB: claimed,
      snippetRangeUsdB: { low: snippetLow, high: snippetHigh },
      toleranceBandUsdB: { low: bandLow, high: bandHigh },
      direction: "above",
    };
  }

  return {
    status: "ok",
    snippetValuesUsdB: snippetValues,
    claimedValueUsdB: claimed,
  };
}

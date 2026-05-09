/**
 * Shared JSON-recovery utility for LLM providers. Handles three failure
 * modes that produce silent data loss when each provider's safeParseJson
 * gives up:
 *
 *   1. Markdown code fences ("```json ... ```") wrapping the response —
 *      strip and re-parse.
 *   2. Trailing prose after the closing brace ("Here is the JSON: {...}
 *      Hope this helps!") — extract the largest balanced {...} or [...]
 *      block.
 *   3. **Truncated arrays** mid-response (the big one) — Anthropic
 *      hitting max_tokens mid-persona-batch returned 11 complete
 *      personas + 1 incomplete + EOF. Old recovery (regex `/\{[\s\S]*\}/`)
 *      failed because the closing `}` was never emitted, so the entire
 *      batch (all 12 personas) was lost. New recovery extracts complete
 *      `{...}` blocks from the truncated array using a balanced-brace
 *      scan — the 11 valid personas survive, only the incomplete one
 *      is dropped.
 *
 * Usage from a provider:
 *
 *   const json = recoverJsonFromText(rawText, {
 *     // Optional: caller may hint at expected array key. When set, the
 *     // recovery prefers reconstructing { [key]: [partial-array] }
 *     // shape over a top-level array. e.g. "personas" / "reactions" /
 *     // "countries" as appropriate per stage.
 *     arrayKey: "personas",
 *   });
 */

interface RecoveryOptions {
  /** Hint for the array key the caller is hoping to reconstruct. When
   *  set and the partial recovery succeeds at that key, the result is
   *  shaped as `{ [arrayKey]: [...] }`. */
  arrayKey?: string;
}

/**
 * Best-effort JSON recovery — returns parsed value or undefined.
 * Order of attempts:
 *   1. Direct JSON.parse on trimmed text (covers the happy path).
 *   2. Strip markdown fences.
 *   3. Extract largest balanced {...} block via balanced-brace scan.
 *   4. Partial array recovery — reconstruct { arrayKey: [...] } from
 *      complete `{...}` blocks inside a truncated array.
 *
 * Each step uses balanced-brace counting (not regex), which handles
 * nested objects, escaped quotes, and unicode correctly. Regex-based
 * extraction was the source of the 2026-05-10 silent persona loss
 * (Anthropic max_tokens truncation → regex couldn't find closing brace
 * → entire batch dropped).
 */
export function recoverJsonFromText(
  text: string,
  opts: RecoveryOptions = {},
): unknown {
  if (!text) return undefined;
  const cleaned = stripMarkdown(text.trim());

  // 1. Happy path.
  try {
    return JSON.parse(cleaned);
  } catch {
    // fall through
  }

  // 2. Largest balanced object/array block extraction.
  const balanced = extractBalancedBlock(cleaned);
  if (balanced !== null) {
    try {
      return JSON.parse(balanced);
    } catch {
      // fall through to partial recovery
    }
  }

  // 3. Partial array recovery — the headline value-add.
  if (opts.arrayKey) {
    const partial = recoverPartialArray(cleaned, opts.arrayKey);
    if (partial !== undefined) return partial;
  }
  // Try without a hint — recover the first array we can find.
  const partialUnkeyed = recoverPartialArray(cleaned, null);
  if (partialUnkeyed !== undefined) return partialUnkeyed;

  return undefined;
}

/* ────────────────────────────────── helpers ─── */

function stripMarkdown(text: string): string {
  return text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

/**
 * Find the largest substring that's a syntactically balanced JSON
 * object or array. Handles strings (including escaped quotes), nested
 * braces, and ignores unbalanced trailing prose.
 *
 * Returns null when no balanced block exists (e.g. truncated mid-entry).
 */
function extractBalancedBlock(text: string): string | null {
  const start = findFirstStructuralChar(text, 0);
  if (start === -1) return null;
  const open = text[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function findFirstStructuralChar(text: string, from: number): number {
  for (let i = from; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{" || ch === "[") return i;
  }
  return -1;
}

/**
 * Reconstruct a partial array from truncated text. Strategy:
 *
 * 1. Locate the array start. When `arrayKey` is provided, look for
 *    `"<key>"\s*:\s*[`. Otherwise find the first `[`.
 * 2. From the `[`, scan forward extracting complete `{...}` blocks
 *    using balanced-brace logic. Stop when we hit either the closing
 *    `]` or end-of-text mid-entry.
 * 3. Return either:
 *    - With key: `{ [arrayKey]: [block1, block2, ...] }`
 *    - Without key: `[block1, block2, ...]`
 *
 * Returns undefined when no complete blocks could be extracted (e.g.
 * truncation cut off the very first entry).
 */
function recoverPartialArray(text: string, arrayKey: string | null): unknown {
  let arrayStart: number;
  if (arrayKey) {
    const escaped = arrayKey.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const keyRegex = new RegExp(`"${escaped}"\\s*:\\s*\\[`);
    const match = keyRegex.exec(text);
    if (!match) return undefined;
    arrayStart = match.index + match[0].length;
  } else {
    const firstBracket = text.indexOf("[");
    if (firstBracket === -1) return undefined;
    arrayStart = firstBracket + 1;
  }

  const blocks: unknown[] = [];
  let i = arrayStart;
  while (i < text.length) {
    // Skip whitespace and commas between entries.
    while (i < text.length && /[\s,]/.test(text[i])) i++;
    if (i >= text.length) break;
    if (text[i] === "]") break; // end of array
    if (text[i] !== "{") break; // non-object entries (string array etc.) — bail
    // Try to extract a balanced object starting here.
    const objStart = i;
    let depth = 0;
    let inString = false;
    let escape = false;
    let objEnd = -1;
    for (let j = objStart; j < text.length; j++) {
      const ch = text[j];
      if (escape) {
        escape = false;
        continue;
      }
      if (inString) {
        if (ch === "\\") escape = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          objEnd = j;
          break;
        }
      }
    }
    if (objEnd === -1) break; // truncation hit mid-object → stop here
    const blockText = text.slice(objStart, objEnd + 1);
    try {
      blocks.push(JSON.parse(blockText));
    } catch {
      // Malformed object — skip and advance past it.
    }
    i = objEnd + 1;
  }

  if (blocks.length === 0) return undefined;
  return arrayKey ? { [arrayKey]: blocks } : blocks;
}

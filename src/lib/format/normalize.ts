/**
 * Unicode normalization for LLM-emitted text. Catches the decorative-
 * character mess the model occasionally produces:
 *   - circled letters (ⓐⓑⓞ) → plain a/b/o via NFKC compatibility decomposition
 *   - fullwidth digits / Latin → halfwidth
 *   - math italic / sans-serif Latin → plain
 *   - ornamental and smart quotes (❛ ❜ ❝ ❞ ‘ ’ “ ”) → straight quotes
 *
 * Why this matters: rendered output (web + PDF) ships only standard
 * Latin / Hangul / CJK glyphs in the registered fonts. Any decorative
 * variant the LLM emits triggers a font fallback in the middle of a
 * word, which breaks alignment and weight (e.g. "Momo Shopping (jⓞ"
 * renders the ⓞ in a different system font and the parenthetical
 * wraps oddly).
 *
 * Applied at render time so existing data without a backfill still
 * benefits. NFKC is safe for Korean / CJK content — Hangul syllable
 * blocks and CJK ideographs decompose to themselves under NFKC.
 */

export function normalizeLLMText(text: string | undefined | null): string {
  if (!text) return "";
  return text
    .normalize("NFKC")
    .replace(/[❛-❞]/g, "'")
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/  +/g, " ")
    .trim();
}

/**
 * Unicode normalization for LLM-emitted text. Catches the decorative-
 * character mess the model occasionally produces:
 *   - circled letters (ⓐⓑⓞ) → plain a/b/o via NFKC compatibility decomposition
 *   - fullwidth digits / Latin → halfwidth
 *   - math italic / sans-serif Latin → plain
 *   - ornamental and smart quotes (❛ ❜ ❝ ❞ ‘ ’ “ ”) → straight quotes
 *   - modifier letters (ʼ ʹ ˈ) → stripped — LLM uses them as fancy apostrophes
 *   - combining diacritical marks (U+0300-U+036F) — LLM noise, safe to strip
 *     for Korean (precomposed Hangul) and CJK
 *   - zero-width / direction marks / variation selectors — invisible noise
 *
 * Why this matters: rendered output (web + PDF) ships only standard
 * Latin / Hangul / CJK glyphs in the registered fonts. Any decorative
 * variant the LLM emits triggers a font fallback in the middle of a
 * word, which breaks alignment and weight.
 *
 * Applied at render time so existing data benefits without a backfill.
 * Regexes use \uXXXX escapes throughout so the source file stays
 * ASCII-safe — literal zero-width characters in the source caused a
 * TypeScript "Unterminated regular expression" parse error on the
 * first revision.
 */

export function normalizeLLMText(text: string | undefined | null): string {
  if (!text) return "";
  return (
    text
      .normalize("NFKC")
      // Heavy ornamental quote marks U+275B-U+275E (❛ ❜ ❝ ❞).
      .replace(/[❛-❞]/g, "'")
      // Smart / curly single quotes + low-9 quote U+2018-U+201B.
      .replace(/[‘-‛]/g, "'")
      // Smart / curly double quotes + low-9 + reversed U+201C-U+201F.
      .replace(/[“-‟]/g, '"')
      // Prime / double-prime / reversed-prime / quadruple-prime
      // U+2032-U+2037 + U+2057.
      .replace(/[′-‷⁗]/g, "'")
      // Modifier letters U+02B0-U+02FF (U+02BC ʼ is the most common
      // LLM-emitted stylized apostrophe; the registered fonts don't
      // carry these glyphs).
      .replace(/[ʰ-˿]/g, "")
      // Combining diacritical marks U+0300-U+036F — LLM noise. Safe
      // for Korean (precomposed Hangul U+AC00-U+D7AF) and CJK.
      .replace(/[̀-ͯ]/g, "")
      // Zero-width chars + direction marks: ZWSP, ZWNJ, ZWJ, LRM, RLM,
      // LRE, RLE, PDF, LRO, RLO (U+200B-U+200F, U+202A-U+202E),
      // LRI, RLI, FSI, PDI (U+2066-U+2069), BOM (U+FEFF). Invisible
      // but break word boundaries / cluster wrong under font fallback.
      .replace(/[​-‏‪-‮⁦-⁩﻿]/g, "")
      // Variation selectors VS1-VS16 (U+FE00-U+FE0F) + supplementary
      // VS17-VS256 (U+E0100-U+E01EF).
      .replace(/[︀-️]/g, "")
      .replace(/[\u{E0100}-\u{E01EF}]/gu, "")
      .replace(/  +/g, " ")
      .trim()
  );
}

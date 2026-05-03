/**
 * Detects + filters cross-language LLM leakage in persona free-text fields.
 *
 * The persona prompt strictly requires every text field to be in the run's locale,
 * but even strong models occasionally leak a persona's "native" language through —
 * e.g. a JP persona producing `objections=["価格が高い"]` during a Korean-locale run.
 * Such items pollute aggregations across tabs (objection top-N, trust-factor counts).
 *
 * Used at two layers:
 *   1. Parse-time (runner.ts) — sanitizes new personas before persistence.
 *   2. Display-time (Risks/Countries/Personas tabs) — defends against legacy data
 *      already persisted with leakage before this filter existed.
 */

const HANGUL_RE = /\p{Script=Hangul}/u;
const HIRAGANA_KATAKANA_RE = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
const HAN_RE = /\p{Script=Han}/u;

export type LocaleHint = "ko" | "en" | string;

/**
 * True when `s` is "native" to the run locale.
 *
 * Rules:
 * - `ko`: must contain at least one Hangul character. Pure-CJK-without-Hangul
 *   (Japanese / Chinese leak) and pure-Latin (English leak) are rejected.
 *   Mixed strings like "USDA 유기농 인증" pass — they have Hangul.
 * - `en` (and any other locale): must contain NO CJK script.
 *
 * Numbers / punctuation alone are treated as locale-neutral and rejected for `ko`
 * (no Hangul) but accepted for `en`. This is fine for our use case — short
 * stand-alone tokens like "USDA" are never the only content of an objection.
 */
export function isLocaleNative(s: string, locale: LocaleHint): boolean {
  const t = s.trim();
  if (!t) return false;
  if (locale === "ko") return HANGUL_RE.test(t);
  // English / Latin-script default: reject any CJK presence.
  return !HANGUL_RE.test(t) && !HIRAGANA_KATAKANA_RE.test(t) && !HAN_RE.test(t);
}

export function filterLocaleNative(items: string[] | undefined, locale: LocaleHint): string[] {
  if (!items || items.length === 0) return [];
  return items.filter((s) => isLocaleNative(s, locale));
}

/**
 * Sanitize a voice (1인칭) field. Voice is single-sentence and customer-facing,
 * so a slip is more visible than a leaked objection. Stricter than the array
 * filter because mixed JP+KO voices ("成分表 확인 못 해요") still contain Hangul
 * and would pass `isLocaleNative` — we want those rejected too.
 *
 * Returns the original voice if it's clean for the locale, or `null` if it
 * contains forbidden script / persona-break patterns (caller should log +
 * replace with empty string).
 *
 * Rejection rules — script:
 * - `ko`: requires Hangul AND forbids hiragana/katakana. Han (한자) is allowed
 *   since Korean uses Hanja and brand names may include CJK chars.
 * - `en` (and any other locale): forbids ALL CJK script (Hangul/Hiragana/
 *   Katakana/Han).
 *
 * Rejection rules — persona-break (locale-independent):
 * - LLM self-reference ("as a language model", "AI assistant", "I cannot",
 *   "죄송하지만 저는") — model dropped persona mode mid-voice.
 * - Markdown formatting (**bold**, [link](url)) — voice should be plain
 *   spoken text, not formatted prose.
 * - Naked URLs — personas don't paste URLs into reaction quotes.
 */
export function sanitizeVoice(voice: string | undefined, locale: LocaleHint): string | null {
  if (!voice) return null;
  const t = voice.trim();
  if (!t) return null;

  // ── persona-break patterns (apply to every locale) ──
  if (LLM_SELF_REF_RE.test(t)) return null;
  if (MARKDOWN_RE.test(t)) return null;
  if (URL_RE.test(t)) return null;

  // ── script rules ──
  if (locale === "ko") {
    if (!HANGUL_RE.test(t)) return null;
    if (HIRAGANA_KATAKANA_RE.test(t)) return null;
    return voice;
  }
  if (HANGUL_RE.test(t) || HIRAGANA_KATAKANA_RE.test(t) || HAN_RE.test(t)) return null;
  return voice;
}

// LLM persona-break giveaways. Case-insensitive Korean + English markers.
// Keep this conservative — false positives drop real voices, so each entry
// has to be a phrase a real customer would essentially never use.
const LLM_SELF_REF_RE =
  /\b(as an? (ai|language model|assistant|llm)|i (cannot|can't|am unable to|am an ai|am a language)|i'm an? (ai|assistant|language model)|sorry,? (but )?(i|as)|i don't have (the )?ability)\b|저는 (인공지능|AI|언어 ?모델|어시스턴트)|죄송하지만 저는|저는 .{0,20}(할 수 없|드릴 수 없)/i;

// Markdown headers / bold / italics / links / fenced code. Personas don't
// format their inner monologue — when this fires it's leaked LLM output.
const MARKDOWN_RE = /(\*\*[^*]+\*\*|__[^_]+__|\[[^\]]+\]\([^)]+\)|^#+ |```)/m;

// Naked URLs and bare schemes.
const URL_RE = /https?:\/\/|www\./i;

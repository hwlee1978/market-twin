/**
 * Shared font registration + per-character font selection. Both the
 * single-sim PDF (pdf.tsx) and the ensemble PDF (ensemble-pdf.tsx) need
 * the same Pretendard + Noto Sans JP fallback story for Korean / CJK
 * coverage; pulling it here means we register once at module load time
 * and don't duplicate the font URLs.
 */
import { Font } from "@react-pdf/renderer";

Font.register({
  family: "AppFont",
  fonts: [
    {
      src: "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/public/static/Pretendard-Regular.otf",
      fontWeight: 400,
    },
    {
      src: "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/public/static/Pretendard-Medium.otf",
      fontWeight: 500,
    },
    {
      src: "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/public/static/Pretendard-SemiBold.otf",
      fontWeight: 600,
    },
    {
      src: "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/packages/pretendard/dist/public/static/Pretendard-Bold.otf",
      fontWeight: 700,
    },
  ],
});

// AppFontCJK — Noto Sans JP. Used ONLY for Japanese kana (hiragana +
// katakana) because Noto Sans JP's Han glyph coverage is JIS-centric
// and misses Traditional Chinese characters used in Taiwan / Hong Kong
// market reports (蝦皮 / 全家 / 大潤發 / 食品安全衛生管理法 etc.).
Font.register({
  family: "AppFontCJK",
  fonts: [
    {
      src: "https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Sans/SubsetOTF/JP/NotoSansJP-Regular.otf",
      fontWeight: 400,
    },
    {
      src: "https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Sans/SubsetOTF/JP/NotoSansJP-Bold.otf",
      fontWeight: 700,
    },
  ],
});

// AppFontCJK_TC — Noto Sans Traditional Chinese. Han glyph coverage is
// the widest of the Noto CJK subsets — includes Traditional Chinese,
// Simplified Chinese, and Japanese Han characters. Used for ALL Han
// ideographs (Unicode CJK Unified Ideographs block) so Taiwan / China
// market reports render cleanly. Added 2026-05-14 after the Jinro
// validation runs surfaced mojibake on Taiwanese chain names + Chinese
// regulation references.
Font.register({
  family: "AppFontCJK_TC",
  fonts: [
    {
      src: "https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Sans/SubsetOTF/TC/NotoSansTC-Regular.otf",
      fontWeight: 400,
    },
    {
      src: "https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Sans/SubsetOTF/TC/NotoSansTC-Bold.otf",
      fontWeight: 700,
    },
  ],
});

/**
 * Every face we register, as (family, weight) pairs.
 *
 * react-pdf fetches these from jsDelivr lazily, at the moment a glyph
 * needs them, and a fetch that fails does not fail the render — it
 * substitutes. That is how a published sample report ended up missing
 * NotoSansTC-Bold: bold Traditional-Chinese text reflowed onto a
 * fallback and the document silently came out five pages shorter.
 *
 * A report is a paid deliverable. Substituting is worse than failing,
 * so `ensureFontsLoaded` below turns a missing font into an error the
 * caller has to handle.
 */
const REGISTERED_FACES: ReadonlyArray<{ fontFamily: string; fontWeight: number }> = [
  { fontFamily: "AppFont", fontWeight: 400 },
  { fontFamily: "AppFont", fontWeight: 500 },
  { fontFamily: "AppFont", fontWeight: 600 },
  { fontFamily: "AppFont", fontWeight: 700 },
  { fontFamily: "AppFontCJK", fontWeight: 400 },
  { fontFamily: "AppFontCJK", fontWeight: 700 },
  { fontFamily: "AppFontCJK_TC", fontWeight: 400 },
  { fontFamily: "AppFontCJK_TC", fontWeight: 700 },
];

export class FontLoadError extends Error {
  constructor(public readonly faces: string[]) {
    super(`PDF fonts failed to load: ${faces.join(", ")}`);
    this.name = "FontLoadError";
  }
}

/**
 * Fetch every registered face up front and throw if any is missing.
 *
 * Call before rendering. Loads are cached by react-pdf, so paying this
 * cost here costs nothing later in the render — it only moves the
 * failure to a point where we can still refuse to produce the file.
 *
 * One retry: these are CDN fetches and a single blip should not cost a
 * customer their download.
 */
export async function ensureFontsLoaded(): Promise<void> {
  const failed: string[] = [];
  await Promise.all(
    REGISTERED_FACES.map(async (face) => {
      const label = `${face.fontFamily}@${face.fontWeight}`;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          await Font.load(face);
          return;
        } catch (err) {
          if (attempt === 1) {
            failed.push(`${label} (${err instanceof Error ? err.message : String(err)})`);
          }
        }
      }
    }),
  );
  if (failed.length > 0) throw new FontLoadError(failed);
}

/** True if there's at least one Hangul / kana / CJK ideograph in the string. */
function fontForChar(ch: string): string | undefined {
  if (/[가-힯]/.test(ch)) return undefined;
  // Japanese kana (hiragana U+3040-309F, katakana U+30A0-30FF) → JP font
  if (/[぀-ゟ゠-ヿ]/.test(ch)) return "AppFontCJK";
  // Han ideographs (U+4E00-9FFF) → TC font for broadest coverage.
  // TC subset includes Japanese-used Han glyphs too, so this path
  // is safe for Korean Hanja (真露 etc.) and Japanese kanji as well.
  if (/[一-鿿]/.test(ch)) return "AppFontCJK_TC";
  return undefined;
}

export interface TextRun {
  text: string;
  font?: string;
}

/**
 * Splits a mixed-script string into runs by font family so each character
 * renders with a font that actually supports it. Pretendard handles
 * Hangul + Latin; Noto Sans JP handles all CJK ideographs + kana.
 */
export function splitByFont(text: string): TextRun[] {
  const runs: TextRun[] = [];
  let buffer = "";
  let currentFont: string | undefined;
  let initialized = false;
  for (const ch of text) {
    const f = fontForChar(ch);
    if (!initialized) {
      currentFont = f;
      buffer = ch;
      initialized = true;
      continue;
    }
    if (f === currentFont) {
      buffer += ch;
    } else {
      if (buffer) runs.push({ text: buffer, font: currentFont });
      buffer = ch;
      currentFont = f;
    }
  }
  if (buffer) runs.push({ text: buffer, font: currentFont });
  return runs;
}

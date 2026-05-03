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

/** True if there's at least one Hangul / kana / CJK ideograph in the string. */
function fontForChar(ch: string): string | undefined {
  if (/[가-힯]/.test(ch)) return undefined;
  if (/[぀-ゟ゠-ヿ]/.test(ch)) return "AppFontCJK";
  if (/[一-鿿]/.test(ch)) return "AppFontCJK";
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

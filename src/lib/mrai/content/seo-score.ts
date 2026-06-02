import { getPlatformSpec, getSEOWeights, type SEOWeights } from "../platform-rules";

/**
 * Heuristic SEO scorer (0-100) per platform. NOT a real Google/Naver
 * algorithm — gives an immediate "this draft has problems" signal
 * during creation, then we layer real GSC/네이버 데이터 later.
 *
 * Returns per-sub-score breakdown so the UI can show "what's hurting"
 * (e.g. "키워드 누락 -25, 해시태그 부족 -10").
 */

export type SEOInput = {
  platform: string;
  seoTitle?: string | null;
  seoDescription?: string | null;
  seoKeywords?: string[] | null;
  body: string;
  hashtags?: string[] | null;
  ctaText?: string | null;
};

export type SEOSubScore = {
  weight: number;
  score: number;          // 0..1
  note: string;
};

export type SEOScoreResult = {
  total: number;          // 0..100
  breakdown: Record<keyof SEOWeights, SEOSubScore>;
};

export function scoreSEO(input: SEOInput): SEOScoreResult {
  const w = getSEOWeights(input.platform);
  const spec = getPlatformSpec(input.platform);
  const primaryKw = (input.seoKeywords ?? [])[0]?.toLowerCase() ?? "";
  const body = input.body ?? "";
  const bodyLower = body.toLowerCase();

  // --- titleKeyword: primary kw in title OR first 80 chars of body
  const titleHas =
    primaryKw &&
    ((input.seoTitle ?? "").toLowerCase().includes(primaryKw) ||
      bodyLower.slice(0, 80).includes(primaryKw));
  const titleKeyword: SEOSubScore = {
    weight: w.titleKeyword,
    score: primaryKw ? (titleHas ? 1 : 0.2) : 0.5,
    note: !primaryKw
      ? "primary 키워드 미지정"
      : titleHas
        ? "타이틀/첫 줄에 키워드 포함"
        : "타이틀에 primary 키워드 없음",
  };

  // --- hookStrength: first line punchy?
  //     proxy: first sentence length 8-25 words AND contains 숫자/?/! 또는 contrarian word
  const firstSentence = body.split(/[.!?\n]/)[0]?.trim() ?? "";
  const wordCount = firstSentence.split(/\s+/).filter(Boolean).length;
  const hasNumber = /\d/.test(firstSentence);
  const hasPunch = /[?!]|왜|어떻게|이유|진짜|how|why|secret|truth|never|always|stop|only/i.test(firstSentence);
  const lengthOk = wordCount >= 5 && wordCount <= 30;
  const hookScore = (lengthOk ? 0.5 : 0.2) + (hasNumber ? 0.2 : 0) + (hasPunch ? 0.3 : 0);
  const hookStrength: SEOSubScore = {
    weight: w.hookStrength,
    score: Math.min(1, hookScore),
    note: lengthOk
      ? `${wordCount}단어 후크${hasPunch ? " + 후킹 단어" : ""}${hasNumber ? " + 숫자" : ""}`
      : `첫 문장 길이 ${wordCount}단어 (권장 5-30)`,
  };

  // --- keywordDensity: primary kw appears 1-3% of body words
  const totalWords = bodyLower.split(/\s+/).filter(Boolean).length || 1;
  const kwOccurrences = primaryKw
    ? bodyLower.split(primaryKw).length - 1
    : 0;
  const density = kwOccurrences / totalWords;
  let densityScore = 0.4;
  if (!primaryKw) densityScore = 0.5;
  else if (density >= 0.005 && density <= 0.03) densityScore = 1;
  else if (density > 0 && density < 0.005) densityScore = 0.6;
  else if (density > 0.03 && density <= 0.06) densityScore = 0.7;
  else if (density > 0.06) densityScore = 0.3;
  const keywordDensity: SEOSubScore = {
    weight: w.keywordDensity,
    score: densityScore,
    note: primaryKw
      ? `키워드 ${kwOccurrences}회 / 밀도 ${(density * 100).toFixed(1)}%`
      : "primary 키워드 없음",
  };

  // --- hashtagFit: count within platform norm range
  const tagCount = (input.hashtags ?? []).filter(Boolean).length;
  const max = spec.hashtagMaxCount;
  const min = max > 5 ? Math.max(3, Math.floor(max * 0.5)) : Math.max(1, Math.floor(max * 0.5));
  let tagScore: number;
  if (max === 0) tagScore = tagCount === 0 ? 1 : 0.5;
  else if (tagCount === 0) tagScore = 0.2;
  else if (tagCount < min) tagScore = 0.6;
  else if (tagCount > max) tagScore = 0.5;
  else tagScore = 1;
  const hashtagFit: SEOSubScore = {
    weight: w.hashtagFit,
    score: tagScore,
    note:
      max === 0
        ? "이 플랫폼은 해시태그 비사용 권장"
        : `${tagCount}개 (권장 ${min}-${max})`,
  };

  // --- structure: H2/H3 markers in long-form
  const hasHeadings = /(^|\n)#{1,3}\s+|<h[1-3]/.test(body);
  const structure: SEOSubScore = {
    weight: w.structure,
    score: w.structure === 0 ? 1 : hasHeadings ? 1 : 0.4,
    note:
      w.structure === 0
        ? "이 플랫폼은 헤딩 불필요"
        : hasHeadings
          ? "H2/H3 사용됨"
          : "헤딩 없음 (긴 본문 가독성↓)",
  };

  // --- ctaPresence
  const ctaScore = input.ctaText && input.ctaText.trim().length >= 3 ? 1 : 0.3;
  const ctaPresence: SEOSubScore = {
    weight: w.ctaPresence,
    score: ctaScore,
    note: ctaScore === 1 ? `"${input.ctaText}"` : "CTA 없음 또는 너무 짧음",
  };

  const breakdown = {
    titleKeyword,
    hookStrength,
    keywordDensity,
    hashtagFit,
    structure,
    ctaPresence,
  };
  const total = Math.round(
    Object.values(breakdown).reduce((acc, s) => acc + s.weight * s.score, 0) * 100,
  );
  return { total, breakdown };
}

/**
 * Per-platform content constraints + tone hints + SEO weighting.
 *
 * The drafter LLM reads PLATFORM_PROMPT[platform] to shape body length,
 * hashtag style, CTA voice. The SEO scorer reads SEO_WEIGHTS[platform]
 * to weight where keyword density matters (e.g. title-heavy for Naver,
 * hook-heavy for TikTok).
 *
 * Adding a new platform: append both maps. Anything not in the map
 * falls back to PLATFORM_PROMPT.other / SEO_WEIGHTS.other.
 */

export type Platform =
  | "x_twitter"
  | "instagram"
  | "youtube"
  | "naver_blog"
  | "naver_smartstore"
  | "tiktok"
  | "threads"
  | "kakao_channel"
  | "facebook"
  | "linkedin"
  | "reddit"
  | "other";

export type PlatformPromptSpec = {
  label: string;
  bodyLengthHint: string;       // human description for LLM prompt
  bodyMaxChars: number;          // hard cap (post-process trims)
  hashtagStyle: string;          // "2-3 inline" / "8-12 grouped at end" etc.
  hashtagMaxCount: number;
  ctaStyle: string;
  imagePromptStyle: string;
  exampleHook: string;
};

export const PLATFORM_PROMPT: Record<Platform, PlatformPromptSpec> = {
  x_twitter: {
    label: "X (Twitter)",
    bodyLengthHint: "280자 이하 단문. 첫 문장이 후크. 줄바꿈 1-2회 허용.",
    bodyMaxChars: 280,
    hashtagStyle: "본문에 자연스럽게 1-2개 inline. 영문 소문자.",
    hashtagMaxCount: 3,
    ctaStyle: "묵시적 (질문형 OK). 외부 링크는 별도 reply로.",
    imagePromptStyle: "16:9 또는 1:1 단일 이미지. 텍스트 overlay 금지.",
    exampleHook: "Most cashmere ages badly. Ours doesn't. Here's why →",
  },
  instagram: {
    label: "Instagram",
    bodyLengthHint:
      "첫 125자가 잘리지 않는 핵심. 전체 캐럴셀 caption 500-1000자. 줄바꿈으로 호흡 분리.",
    bodyMaxChars: 2200,
    hashtagStyle: "8-12개를 본문 끝에 한 덩어리. 영문 + 현지어 혼용.",
    hashtagMaxCount: 12,
    ctaStyle: "Soft CTA — 'link in bio' / DM 유도 / 댓글 질문.",
    imagePromptStyle:
      "1:1 또는 4:5 5-7장 캐럴셀. 1st = 후크 이미지, 마지막 = CTA 카드.",
    exampleHook: "💌 매일 입는 캐시미어를 어떻게 골라야 할까?",
  },
  youtube: {
    label: "YouTube",
    bodyLengthHint:
      "Title ≤60자. Description: 첫 150자가 SERP/검색 미리보기. 전체 800-2000자, timestamp 포함.",
    bodyMaxChars: 5000,
    hashtagStyle: "Description 끝에 3-5개. Title에 1개 허용 (#shorts 등).",
    hashtagMaxCount: 5,
    ctaStyle: "구독 + 알림 + 댓글 질문 + 영상 내 카드 클릭 유도.",
    imagePromptStyle:
      "Thumbnail 16:9. 큰 텍스트 (3-5단어) + 인물 표정/제품 클로즈업.",
    exampleHook: "캐시미어의 99%는 가짜다 | 진짜를 찾는 3가지 방법",
  },
  naver_blog: {
    label: "네이버 블로그",
    bodyLengthHint:
      "Long-form 1500-2500자. H2/H3 키워드 자연 배치. 단락 4-7줄. 사진 6-10장 사이사이 삽입.",
    bodyMaxChars: 5000,
    hashtagStyle: "글 하단 5-10개. 한글 키워드 위주.",
    hashtagMaxCount: 10,
    ctaStyle: "스마트스토어/공홈 링크 + 이웃추가 유도.",
    imagePromptStyle:
      "대표 썸네일 1장 + 인포그래픽 1-2장 + 제품 컷 6-8장. 정사각 또는 세로.",
    exampleHook: "캐시미어 100% 진위 구별법 — 사면 안 되는 5가지 신호",
  },
  naver_smartstore: {
    label: "네이버 스마트스토어",
    bodyLengthHint:
      "상품 상세 — H1 (≤40자) + 베네핏 3-5개 + 스펙 표 + 후기 인용.",
    bodyMaxChars: 3000,
    hashtagStyle: "검색 키워드 5-8개. 카테고리 + 시즌 + 소재.",
    hashtagMaxCount: 8,
    ctaStyle: "장바구니 + 톡톡 문의 + 리뷰 유도.",
    imagePromptStyle:
      "1:1 메인 1장 + 디테일 6-10장 + 사이즈 차트 1장.",
    exampleHook: "[2026 FW] 매일 입는 캐시미어 100% — 무료배송",
  },
  tiktok: {
    label: "TikTok",
    bodyLengthHint:
      "Caption 80-150자. 1초 후크가 핵심 (영상 의존). 트렌드 사운드 명시.",
    bodyMaxChars: 300,
    hashtagStyle: "3-5개 trending + niche 혼합. 영문 위주.",
    hashtagMaxCount: 5,
    ctaStyle: "Implicit (저장/공유 유도). 'link in bio'.",
    imagePromptStyle:
      "9:16 vertical. 첫 프레임 = texture / before-after / unboxing.",
    exampleHook: "POV: 90초 안에 캐시미어 진짜/가짜 구별하는 법",
  },
  threads: {
    label: "Threads",
    bodyLengthHint: "500자 이하. 대화 thread 분할 가능 (2-3개).",
    bodyMaxChars: 500,
    hashtagStyle: "본문에 0-2개. 과도한 해시태그 비추.",
    hashtagMaxCount: 3,
    ctaStyle: "질문형 + 의견 유도.",
    imagePromptStyle: "1:1 또는 4:5 1-3장.",
    exampleHook: "솔직히 한국 캐시미어 브랜드 다 비슷한 줄 알았는데",
  },
  kakao_channel: {
    label: "카카오 채널",
    bodyLengthHint: "메시지 + CTA 버튼. 본문 200-500자.",
    bodyMaxChars: 1000,
    hashtagStyle: "사용 안 함.",
    hashtagMaxCount: 0,
    ctaStyle: "버튼 — '구매하기' / '쿠폰 받기' / '상세보기'.",
    imagePromptStyle: "와이드 헤더 이미지 1장 (1080×500).",
    exampleHook: "신규 컬렉션 단독 오픈 — 채널 구독자 5% 추가 할인",
  },
  facebook: {
    label: "Facebook",
    bodyLengthHint: "300-500자. 첫 80자가 줄임 미리보기.",
    bodyMaxChars: 2000,
    hashtagStyle: "0-3개. 마지막에 그룹.",
    hashtagMaxCount: 3,
    ctaStyle: "Soft — 더보기 / 공유 유도.",
    imagePromptStyle: "1.91:1 또는 1:1 1-4장.",
    exampleHook: "한국 캐시미어 브랜드가 미국 진출을 결정한 이유",
  },
  linkedin: {
    label: "LinkedIn",
    bodyLengthHint: "1200-1500자. 첫 3줄이 critical (펼치기 전).",
    bodyMaxChars: 3000,
    hashtagStyle: "3-5개 마지막에. 영문 PascalCase.",
    hashtagMaxCount: 5,
    ctaStyle: "Comment 유도 + 회사 follow.",
    imagePromptStyle: "1.91:1 헤더 + 인포그래픽 1-3장.",
    exampleHook:
      "We sold $X cashmere to the US this year. Here are 3 things we got wrong.",
  },
  reddit: {
    label: "Reddit",
    bodyLengthHint:
      "Title (≤300자) + Self-text 400-1500자. 광고 톤 금지, 정보 중심.",
    bodyMaxChars: 2000,
    hashtagStyle: "사용 안 함.",
    hashtagMaxCount: 0,
    ctaStyle: "Soft. 직접 링크 비추 — 본문에 가치 먼저.",
    imagePromptStyle: "선택 — 인포그래픽 1장 또는 비교 사진.",
    exampleHook: "Korean cashmere brand AMA — 3 years, here's what scaled and what didn't",
  },
  other: {
    label: "기타",
    bodyLengthHint: "300-500자.",
    bodyMaxChars: 1500,
    hashtagStyle: "관련 키워드 3-5개.",
    hashtagMaxCount: 5,
    ctaStyle: "명시적 CTA 1개.",
    imagePromptStyle: "1:1 1장.",
    exampleHook: "이번 신규 컬렉션의 핵심 한 줄",
  },
};

// SEO sub-score weights per platform — what to penalize/reward.
// All weights inside one platform sum to 1.0.
export type SEOWeights = {
  titleKeyword: number;       // title or first-line contains primary keyword
  hookStrength: number;       // first sentence/frame is grabby
  keywordDensity: number;     // primary keyword 1-3% across body
  hashtagFit: number;         // hashtag count + relevance within platform norm
  structure: number;          // H2/H3 use for long-form
  ctaPresence: number;        // explicit CTA exists
};

export const SEO_WEIGHTS: Record<Platform, SEOWeights> = {
  x_twitter:        { titleKeyword: 0.10, hookStrength: 0.45, keywordDensity: 0.10, hashtagFit: 0.15, structure: 0.00, ctaPresence: 0.20 },
  instagram:        { titleKeyword: 0.10, hookStrength: 0.30, keywordDensity: 0.10, hashtagFit: 0.35, structure: 0.00, ctaPresence: 0.15 },
  youtube:          { titleKeyword: 0.35, hookStrength: 0.25, keywordDensity: 0.15, hashtagFit: 0.10, structure: 0.05, ctaPresence: 0.10 },
  naver_blog:       { titleKeyword: 0.30, hookStrength: 0.10, keywordDensity: 0.25, hashtagFit: 0.10, structure: 0.20, ctaPresence: 0.05 },
  naver_smartstore: { titleKeyword: 0.35, hookStrength: 0.10, keywordDensity: 0.20, hashtagFit: 0.10, structure: 0.15, ctaPresence: 0.10 },
  tiktok:           { titleKeyword: 0.10, hookStrength: 0.50, keywordDensity: 0.05, hashtagFit: 0.25, structure: 0.00, ctaPresence: 0.10 },
  threads:          { titleKeyword: 0.10, hookStrength: 0.45, keywordDensity: 0.10, hashtagFit: 0.10, structure: 0.05, ctaPresence: 0.20 },
  kakao_channel:    { titleKeyword: 0.20, hookStrength: 0.30, keywordDensity: 0.10, hashtagFit: 0.00, structure: 0.05, ctaPresence: 0.35 },
  facebook:         { titleKeyword: 0.15, hookStrength: 0.35, keywordDensity: 0.10, hashtagFit: 0.10, structure: 0.05, ctaPresence: 0.25 },
  linkedin:         { titleKeyword: 0.20, hookStrength: 0.35, keywordDensity: 0.15, hashtagFit: 0.10, structure: 0.10, ctaPresence: 0.10 },
  reddit:           { titleKeyword: 0.30, hookStrength: 0.35, keywordDensity: 0.10, hashtagFit: 0.00, structure: 0.15, ctaPresence: 0.10 },
  other:            { titleKeyword: 0.20, hookStrength: 0.30, keywordDensity: 0.15, hashtagFit: 0.15, structure: 0.05, ctaPresence: 0.15 },
};

export function getPlatformSpec(platform: string): PlatformPromptSpec {
  return PLATFORM_PROMPT[platform as Platform] ?? PLATFORM_PROMPT.other;
}

export function getSEOWeights(platform: string): SEOWeights {
  return SEO_WEIGHTS[platform as Platform] ?? SEO_WEIGHTS.other;
}

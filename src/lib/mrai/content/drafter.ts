import { getLLMProvider } from "@/lib/llm";
import { getPlatformSpec } from "./platform-rules";
import { scoreSEO } from "./seo-score";
import type { Locale } from "./strategist";

/**
 * Content Drafter — Sprint 2 of Phase 9.
 *
 * Takes a marketing channel + topic + (optional) campaign label, and
 * emits N drafts (variants for A/B testing). Each draft is shaped to
 * the platform's body length, hashtag style, and CTA voice via
 * platform-rules.ts.
 *
 * Output is BOTH the JSON (so the API can persist directly to
 * mrai_content_drafts) and a heuristic SEO score so the UI can
 * immediately render a "이 변형은 SEO 84점" badge.
 */

export type DrafterChannelContext = {
  platform: string;
  handle: string;
  display_name: string | null;
  market_country: string | null;
  target_segments: string[];
  posting_style: string | null;
  bio_text: string | null;
};

export type DraftVariant = {
  variant_label: string;       // "A" / "B" / "C"
  body_text: string;
  hashtags: string[];
  cta_text: string | null;
  image_prompt: string | null;
  seo_title: string | null;
  seo_description: string | null;
  seo_keywords: string[];
  seo_meta: Record<string, unknown>;
  seo_score: number;
  seo_notes: Record<string, unknown>;
};

export type DrafterInput = {
  channel: DrafterChannelContext;
  topic: string;
  campaignLabel?: string | null;
  goal?: string | null;
  variantCount?: number;       // default 3 (A/B/C)
  locale?: Locale;             // default 'ko'
  brandContext?: string;       // arbitrary extra context from memories
};

export type DrafterResult = {
  variants: DraftVariant[];
  inputTokens: number;
  outputTokens: number;
  ms: number;
};

const SYSTEM_KO = `당신은 Mr. AI의 ContentDrafter (= 카피라이터 Agent) 입니다.

역할:
- 마케팅 채널 + topic을 입력받아 platform-spec에 맞춘 A/B/C 콘텐츠 변형을 생성.
- 각 변형은 다른 후크 angle 또는 다른 톤을 시도. 같은 topic이라도 어떤 변형이 페르소나 반응을 잘 끌어내는지 시뮬레이션으로 검증할 것임.

원칙:
- 플랫폼 규격 (글자수, 해시태그 개수, CTA 스타일)을 반드시 준수.
- 브랜드 voice + posting_style을 절대 이탈하지 말 것 — 일반 카피 톤 금지.
- 첫 줄/첫 프레임이 모든 것 — 후크 약하면 점수 박살.
- 타겟 세그먼트의 실제 어휘로 작성. "프리미엄"이라고 쓰지 말고 그들이 쓰는 단어를 써.
- SEO 키워드는 자연스럽게 본문에 녹임. 키워드 스터핑 금지.
- 모르는 정보는 placeholder 금지 — "[가격]" 같은 거 쓰지 말고 일반 문구로 우회.

A/B/C 차별화 전략:
- A: 가장 직접적 (베네핏 + 사실 중심)
- B: 스토리텔링 (감정/페르소나 중심)
- C: contrarian/질문형 (호기심 트리거)

출력은 JSON. 각 variant마다 platform-specific 필드 채울 것.`;

const SYSTEM_EN = `You are Mr. AI's ContentDrafter (= the copywriter Agent).

Role:
- Given a marketing channel + topic, emit A/B/C variants shaped to the
  platform spec.
- Each variant tries a different hook angle or tone — the persona-reactor
  will simulate which one drives the best engagement.

Principles:
- Strictly obey platform spec (char count, hashtag count, CTA style).
- NEVER drift from brand voice + posting_style. No generic copy tone.
- The first line/frame is everything — weak hook = wrecked score.
- Use the target segment's actual vocabulary. Don't say "premium" — say
  what they would say.
- Weave SEO keywords naturally. NO keyword stuffing.
- If you don't know a fact, do NOT use a placeholder like "[price]" —
  re-phrase to avoid the missing info.

A/B/C differentiation:
- A: most direct (benefit + fact)
- B: story-driven (emotion / persona)
- C: contrarian / question-led (curiosity trigger)

Output is JSON with platform-specific fields per variant.`;

export async function runContentDrafter(input: DrafterInput): Promise<DrafterResult> {
  const variantCount = Math.min(Math.max(input.variantCount ?? 3, 1), 5);
  const locale = input.locale ?? "ko";
  const spec = getPlatformSpec(input.channel.platform);

  const channelBlock = [
    `Platform: ${spec.label}`,
    `Handle: @${input.channel.handle}`,
    input.channel.display_name ? `Display name: ${input.channel.display_name}` : null,
    input.channel.market_country ? `Target market: ${input.channel.market_country}` : null,
    input.channel.target_segments.length > 0
      ? `Target segments: ${input.channel.target_segments.join(" / ")}`
      : null,
    input.channel.bio_text ? `Bio: ${input.channel.bio_text}` : null,
    input.channel.posting_style ? `Posting style: ${input.channel.posting_style}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const specBlock = [
    `Body length: ${spec.bodyLengthHint} (HARD MAX ${spec.bodyMaxChars} chars)`,
    `Hashtag style: ${spec.hashtagStyle} (max ${spec.hashtagMaxCount})`,
    `CTA style: ${spec.ctaStyle}`,
    `Image prompt style: ${spec.imagePromptStyle}`,
    `Example hook: "${spec.exampleHook}"`,
  ].join("\n");

  const variantStrategies =
    locale === "en"
      ? [
          "A: direct — lead with benefit + concrete fact",
          "B: story — open with a persona scene or moment",
          "C: contrarian — start with a question or pattern-break",
          "D: data — open with a number or stat",
          "E: ASMR/sensory — open with a sensation",
        ].slice(0, variantCount)
      : [
          "A: 직접형 — 베네핏 + 구체적 사실로 시작",
          "B: 스토리형 — 페르소나 장면/순간으로 시작",
          "C: 역발상형 — 질문 또는 통념 깨기로 시작",
          "D: 데이터형 — 숫자/스탯으로 시작",
          "E: 감각형 — 감각/질감 묘사로 시작",
        ].slice(0, variantCount);

  const prompt = `# Topic
${input.topic}

${input.campaignLabel ? `# Campaign\n${input.campaignLabel}\n` : ""}${input.goal ? `# Goal\n${input.goal}\n` : ""}
# Channel
${channelBlock}

# Platform spec (MUST follow)
${specBlock}

${input.brandContext ? `# Brand context\n${input.brandContext}\n` : ""}
# Variants to produce (${variantCount}개)
${variantStrategies.join("\n")}

---

위 정보를 모두 활용해 각 variant마다 다음 필드를 채운 JSON을 반환하세요:
- variant_label ("A" / "B" / ...)
- body_text (플랫폼 규격 준수)
- hashtags (배열, 플랫폼 max 이하)
- cta_text (없으면 빈 문자열)
- image_prompt (이미지 생성용 영문 프롬프트 — 스타일 + 구도 + 톤)
- seo_title (≤60자 / YouTube/Naver/SmartStore면 필수, 다른 곳은 빈 문자열 가능)
- seo_description (≤160자 / Naver/YouTube에서 SERP에 노출)
- seo_keywords (이 콘텐츠로 노릴 primary + secondary 키워드 3-7개)
- seo_meta (플랫폼별 부가 — 예: { naver_blog: { category }, youtube: { tags, thumbnail_text } })

전체 응답: { "variants": [...] }`;

  const system = locale === "en" ? SYSTEM_EN : SYSTEM_KO;
  const provider = getLLMProvider({ provider: "anthropic" });

  const t0 = Date.now();
  const res = await provider.generate({
    system,
    prompt,
    temperature: 0.7,
    maxTokens: 4000,
    cacheSystem: true,
    jsonSchema: {
      type: "object",
      required: ["variants"],
      properties: {
        variants: {
          type: "array",
          minItems: 1,
          maxItems: 5,
          items: {
            type: "object",
            required: ["variant_label", "body_text"],
            properties: {
              variant_label: { type: "string", maxLength: 4 },
              body_text: { type: "string", maxLength: 5000 },
              hashtags: {
                type: "array",
                items: { type: "string", maxLength: 60 },
                maxItems: 15,
              },
              cta_text: { type: "string", maxLength: 200 },
              image_prompt: { type: "string", maxLength: 500 },
              seo_title: { type: "string", maxLength: 120 },
              seo_description: { type: "string", maxLength: 300 },
              seo_keywords: {
                type: "array",
                items: { type: "string", maxLength: 60 },
                maxItems: 10,
              },
              seo_meta: { type: "object", additionalProperties: true },
            },
          },
        },
      },
    },
  });
  const ms = Date.now() - t0;

  const raw = (res.json as { variants?: Array<Partial<DraftVariant>> }) ?? {};
  const rawVariants = Array.isArray(raw.variants) ? raw.variants : [];

  const variants: DraftVariant[] = rawVariants.slice(0, variantCount).map((v, i) => {
    const label = typeof v.variant_label === "string" ? v.variant_label : String.fromCharCode(65 + i);
    const body = (typeof v.body_text === "string" ? v.body_text : "").slice(0, spec.bodyMaxChars);
    const hashtags = Array.isArray(v.hashtags)
      ? v.hashtags
          .filter((h): h is string => typeof h === "string")
          .slice(0, spec.hashtagMaxCount)
          .map((h) => (h.startsWith("#") ? h : `#${h}`))
      : [];
    const cta = typeof v.cta_text === "string" && v.cta_text.trim() ? v.cta_text.trim() : null;
    const imagePrompt = typeof v.image_prompt === "string" ? v.image_prompt : null;
    const seoTitle = typeof v.seo_title === "string" ? v.seo_title : null;
    const seoDescription = typeof v.seo_description === "string" ? v.seo_description : null;
    const seoKeywords = Array.isArray(v.seo_keywords)
      ? v.seo_keywords.filter((k): k is string => typeof k === "string").slice(0, 10)
      : [];
    const seoMeta = (v.seo_meta && typeof v.seo_meta === "object" ? v.seo_meta : {}) as Record<
      string,
      unknown
    >;

    const score = scoreSEO({
      platform: input.channel.platform,
      seoTitle,
      seoDescription,
      seoKeywords,
      body,
      hashtags,
      ctaText: cta,
    });

    return {
      variant_label: label,
      body_text: body,
      hashtags,
      cta_text: cta,
      image_prompt: imagePrompt,
      seo_title: seoTitle,
      seo_description: seoDescription,
      seo_keywords: seoKeywords,
      seo_meta: seoMeta,
      seo_score: score.total,
      seo_notes: score.breakdown as unknown as Record<string, unknown>,
    };
  });

  return {
    variants,
    inputTokens: res.usage?.inputTokens ?? 0,
    outputTokens: res.usage?.outputTokens ?? 0,
    ms,
  };
}

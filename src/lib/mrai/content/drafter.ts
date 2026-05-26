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
  body_text_ko: string | null;       // Korean translation (null when native = ko)
  hashtags: string[];
  cta_text: string | null;
  cta_text_ko: string | null;
  image_prompt: string | null;
  seo_title: string | null;
  seo_title_ko: string | null;
  seo_description: string | null;
  seo_description_ko: string | null;
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

⚠️ 소재 vs 브랜드 (CRITICAL):
- 브랜드명 = 워크스페이스 이름 (예: "Le Mouton" / "르무통"). 소비자 카피에서는 이것만 브랜드로 사용.
- 소재 기술명 (예: "H1-TEX", "Gore-Tex", "CloudTec") = 자사가 보유한 소재/기술 이름이지 브랜드가 아님. Bio나 컨텍스트에 등장해도 카피 헤드라인이나 CTA에서 브랜드처럼 쓰지 말 것.
- 잘못된 예: "H1-TEX 整天舒適" / "H1-TEX 새로 만났다" (← H1-TEX를 브랜드처럼 위치)
- 맞는 예: "르무통의 메리노 울 한 켤레, 종일 부드럽다" / "H1-TEX 기술로 만든 메리노 울 어퍼" (← 소재 기술 설명일 때만)
- image_prompt에는 절대 "H1-TEX" / "Gore-Tex" 같은 소재명을 텍스트로 새겨달라는 지시 금지.

⚠️ Bilingual 출력 (CRITICAL):
- body_text / cta_text / seo_title / seo_description은 채널의 **target market 모국어**로 자연스럽게 작성.
  · market_country=KR → 한국어
  · market_country=US → 영어
  · market_country=JP → 일본어
  · market_country=TW → 번체 중국어
  · market_country=CN → 간체 중국어
- 같은 의미를 **_ko 필드**에 한국어로 번역. 한국 오퍼레이터가 카드에서 원어 + 번역 동시에 봐야 함.
- market=KR인 경우 _ko 필드는 원본과 동일하게 채우거나 null.
- hashtags는 번역 불필요 (#LeMouton 같은 보편 태그가 많아 native로 OK).
- image_prompt는 항상 영문 (이미지 생성 도구가 영어).

출력은 JSON. 각 variant마다 platform-specific 필드 + _ko 번역을 모두 채울 것.`;

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

⚠️ Bilingual output (CRITICAL):
- body_text / cta_text / seo_title / seo_description must be in the
  channel's target-market native language (KR→Korean, US→English,
  JP→Japanese, TW→Traditional Chinese, CN→Simplified Chinese).
- ALSO provide _ko fields with a Korean translation of each so the
  Korean operator can review.
- hashtags + image_prompt do NOT need translation.

Output is JSON. Each variant must include both native text AND _ko translations.`;

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
- image_prompt (이미지 생성용 영문 프롬프트 — 스타일 + 구도 + 톤. ⚠️ 소재 기술명(H1-TEX, Gore-Tex 등)이나 인증명(RWS, OEKO-TEX 등)을 이미지에 텍스트로 넣지 말 것. 시각적 디테일만 묘사 — 예: "merino wool knit close-up showing fiber direction" OK, "with 'H1-TEX' badge visible" 금지.)
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
    // 16K: bilingual output doubles per-variant token count. Long topics
    // from AI suggestions + 3-5 variants × (body + body_ko + title +
    // title_ko + desc + desc_ko + image_prompt + hashtags + seo_meta)
    // can easily hit 10-12K. 16K gives a safety margin against silent
    // truncation that leaves zero valid variants.
    maxTokens: 16000,
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
              body_text_ko: { type: ["string", "null"], maxLength: 5000 },
              hashtags: {
                type: "array",
                items: { type: "string", maxLength: 60 },
                maxItems: 15,
              },
              cta_text: { type: "string", maxLength: 200 },
              cta_text_ko: { type: ["string", "null"], maxLength: 200 },
              image_prompt: { type: "string", maxLength: 500 },
              seo_title: { type: "string", maxLength: 120 },
              seo_title_ko: { type: ["string", "null"], maxLength: 120 },
              seo_description: { type: "string", maxLength: 300 },
              seo_description_ko: { type: ["string", "null"], maxLength: 300 },
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
    const bodyKoRaw = typeof v.body_text_ko === "string" ? v.body_text_ko : null;
    const bodyKo =
      bodyKoRaw && bodyKoRaw.trim() && bodyKoRaw.trim() !== body.trim()
        ? bodyKoRaw.slice(0, spec.bodyMaxChars)
        : null;
    const cta = typeof v.cta_text === "string" && v.cta_text.trim() ? v.cta_text.trim() : null;
    const ctaKoRaw = typeof v.cta_text_ko === "string" ? v.cta_text_ko : null;
    const ctaKo = ctaKoRaw && ctaKoRaw.trim() && ctaKoRaw.trim() !== cta ? ctaKoRaw.trim() : null;
    const imagePrompt = typeof v.image_prompt === "string" ? v.image_prompt : null;
    const seoTitle = typeof v.seo_title === "string" ? v.seo_title : null;
    const seoTitleKoRaw = typeof v.seo_title_ko === "string" ? v.seo_title_ko : null;
    const seoTitleKo =
      seoTitleKoRaw && seoTitleKoRaw.trim() && seoTitleKoRaw.trim() !== seoTitle
        ? seoTitleKoRaw.trim()
        : null;
    const seoDescription = typeof v.seo_description === "string" ? v.seo_description : null;
    const seoDescriptionKoRaw =
      typeof v.seo_description_ko === "string" ? v.seo_description_ko : null;
    const seoDescriptionKo =
      seoDescriptionKoRaw &&
      seoDescriptionKoRaw.trim() &&
      seoDescriptionKoRaw.trim() !== seoDescription
        ? seoDescriptionKoRaw.trim()
        : null;
    const seoKeywords = Array.isArray(v.seo_keywords)
      ? v.seo_keywords.filter((k): k is string => typeof k === "string").slice(0, 10)
      : [];
    const seoMetaRaw = (v.seo_meta && typeof v.seo_meta === "object" ? v.seo_meta : {}) as Record<
      string,
      unknown
    >;
    // Stash translations under seo_meta.translations.ko so the DB row
    // carries them without a schema migration (mrai_content_drafts has
    // only single-language columns).
    const seoMeta: Record<string, unknown> = { ...seoMetaRaw };
    if (bodyKo || ctaKo || seoTitleKo || seoDescriptionKo) {
      seoMeta.translations = {
        ko: {
          body_text: bodyKo,
          cta_text: ctaKo,
          seo_title: seoTitleKo,
          seo_description: seoDescriptionKo,
        },
      };
    }

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
      body_text_ko: bodyKo,
      hashtags,
      cta_text: cta,
      cta_text_ko: ctaKo,
      image_prompt: imagePrompt,
      seo_title: seoTitle,
      seo_title_ko: seoTitleKo,
      seo_description: seoDescription,
      seo_description_ko: seoDescriptionKo,
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

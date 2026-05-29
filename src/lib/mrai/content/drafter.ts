import { getLLMProvider } from "@/lib/llm";
import { getPlatformSpec } from "./platform-rules";
import { scoreSEO } from "./seo-score";
import { scoreLLMSEO } from "@/lib/mrai/seo/llm-seo-score";
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
  /** Number of carousel/detail frames the image generator will produce.
   * Injected into the image_prompt so prompt-described count matches
   * actual output (no more "7-frame" prompt but 4 generated images). */
  frameCount?: number;
  locale?: Locale;             // default 'ko'
  brandContext?: string;       // arbitrary extra context from memories
  /** Recent posts already on this channel. Drafter uses them to lock in
   *  narrator voice continuity — new variants must read like the same
   *  speaker who wrote the prior posts. */
  priorPosts?: Array<{ body_text: string; created_at: string }>;
  /** LLM-SEO content format. When set, drafter uses a specialized prompt
   *  that produces structures answer-engines love to cite. Default
   *  "default" = current natural-tone drafter. */
  contentFormat?: "default" | "comparison" | "qa" | "explainer" | "listicle";
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

🔑 톤 (가장 중요 — 어기면 점수 박살):
브랜드 채널 포스트지만 **사내 마케팅팀이 쓴 보도자료처럼 들리면 안 됨**. 실제 그 브랜드를 좋아하거나 운영하는 한 사람이 자기 계정에서 쓰는 것처럼 자연스럽게.

❌ 금지 패턴 (전형적 "관계자 글" 느낌):
- 외부 권위 인용 자랑: "Vogue가 ~라고 했다", "Forbes는 ~를 꼽았다"
- 자사를 3인칭으로 추켜세우기: "(자사명)은 한국 OO다", "우리는 ~를 만든다"
- 과장 형용사 / 추상 마케팅 단어: "프리미엄", "혁신적", "최상의", "독보적", "countless", "redefining"
- 슬로건형 한 문장 단위: "Seoul is the source.", "Built where the trend starts."
- 모방품/경쟁사 까기 직접 언급 (질투처럼 보임)

✅ 자연스러운 톤 패턴:
- 1인칭 일상 관찰 / 작은 순간: "오늘 회의 1시간 서서 했는데 발이 안 아팠다."
- 창업자/디자이너의 솔직한 메모: "원단 샘플 7번째 만에 통과. 8번째는 더 부드러움."
- 사용자 후기 같은 디테일: "양말이 미끄러져서 짜증나는데 이 신발은 그게 없다."
- 약간 자조적/유머: "또 짝퉁 봤다. 모직 결이 달라서 한 눈에 보임."
- 일정/스케줄 자연스러운 언급: "주말에 한강 7km 걸었음."

원칙:
- 플랫폼 규격 (글자수, 해시태그 개수, CTA 스타일)을 반드시 준수.
- 브랜드 voice + posting_style을 절대 이탈하지 말 것.
- 첫 줄/첫 프레임이 모든 것 — 후크 약하면 점수 박살.
- 타겟 세그먼트의 실제 어휘로 작성. "프리미엄"이라고 쓰지 말고 그들이 쓰는 단어를 써.
- SEO 키워드는 자연스럽게 본문에 녹임. 키워드 스터핑 금지.
- 모르는 정보는 placeholder 금지 — "[가격]" 같은 거 쓰지 말고 일반 문구로 우회.
- 외부 매체 인용은 사실관계 확실하지 않으면 절대 금지 (fake quote 위험).

A/B/C 차별화 전략:
- A: 가장 직접적 (베네핏 + 사실 중심)
- B: 스토리텔링 (감정/페르소나 중심)
- C: contrarian/질문형 (호기심 트리거)

⚠️ 소재 vs 브랜드 (CRITICAL):
- 브랜드명 = 워크스페이스 이름. 소비자 카피에서는 이것만 브랜드로 사용.
- 소재 기술명 (예: "Gore-Tex", "CloudTec", 자사 보유 소재명) = 자사가 보유한 소재/기술 이름이지 브랜드가 아님. Bio나 컨텍스트에 등장해도 카피 헤드라인이나 CTA에서 브랜드처럼 쓰지 말 것.
- 잘못된 예: "(소재명) 整天舒適" / "(소재명) 새로 만났다" (← 소재명을 브랜드처럼 위치)
- 맞는 예: "(자사 브랜드)의 한 켤레, 종일 부드럽다" / "(소재명) 기술로 만든 어퍼" (← 소재 기술 설명일 때만)
- image_prompt에는 절대 소재명을 텍스트로 새겨달라는 지시 금지.

⚠️ Bilingual 출력 (CRITICAL):
- body_text / cta_text / seo_title / seo_description은 채널의 **target market 모국어**로 자연스럽게 작성.
  · market_country=KR → 한국어
  · market_country=US → 영어
  · market_country=JP → 일본어
  · market_country=TW → 번체 중국어
  · market_country=CN → 간체 중국어
- 같은 의미를 **_ko 필드**에 한국어로 번역. 한국 오퍼레이터가 카드에서 원어 + 번역 동시에 봐야 함.
- market=KR인 경우 _ko 필드는 원본과 동일하게 채우거나 null.
- hashtags는 번역 불필요 (브랜드 태그처럼 보편 태그가 많아 native로 OK).
- image_prompt는 항상 영문 (이미지 생성 도구가 영어).

출력은 JSON. 각 variant마다 platform-specific 필드 + _ko 번역을 모두 채울 것.

🔒 출력 wrapper key (절대 어기지 말 것):
- 최상위 JSON shape은 정확히 \`{ "variants": [...] }\`
- "drafts" / "posts" / "items" / "results" 같은 다른 wrapper key 절대 금지
- 최상위 array 직출력 ([...]) 절대 금지 — 반드시 객체로 감쌀 것
- 첫 글자는 \`{\` , 마지막 글자는 \`}\` — 그 사이만 JSON, prose 금지`;

const SYSTEM_EN = `You are Mr. AI's ContentDrafter (= the copywriter Agent).

Role:
- Given a marketing channel + topic, emit A/B/C variants shaped to the
  platform spec.
- Each variant tries a different hook angle or tone — the persona-reactor
  will simulate which one drives the best engagement.

🔑 TONE (most important — break this and the score tanks):
This is a brand channel, but posts MUST NOT sound like a corporate
press release written by an in-house marketing team. Write like one
real person who likes (or runs) the brand posting from their own feed.

❌ Forbidden patterns (the "company insider" smell):
- Name-dropping external authority as flex: "Vogue called ___",
  "Forbes featured ___". Reads as PR brag.
- 3rd-person self-aggrandizement: "(Brand) is Korean merino.",
  "We make ___." Reads as press release.
- Marketing abstractions / superlatives: "premium", "best-in-class",
  "innovative", "redefining", "countless", "unrivaled".
- Slogan-style standalone lines: "Seoul is the source.",
  "Built where the trend starts."
- Direct knockoff/competitor jabs (sounds jealous).

✅ Natural patterns:
- 1st-person small moments: "Stood through a 1-hour meeting today.
  Feet didn't hurt."
- Honest founder/designer notes: "7th fabric sample passed. 8th is
  softer."
- Reviewer-style specifics: "Socks slip in most sneakers. Not these."
- Slightly self-deprecating humor: "Saw another knockoff. Wool grain
  gives it away every time."
- Casual schedule/diary mentions: "Walked 7km along the river this
  weekend."

Principles:
- Strictly obey platform spec (char count, hashtag count, CTA style).
- NEVER drift from brand voice + posting_style.
- The first line/frame is everything — weak hook = wrecked score.
- Use the target segment's actual vocabulary. Don't say "premium" — say
  what they would say.
- Weave SEO keywords naturally. NO keyword stuffing.
- If you don't know a fact, do NOT use a placeholder like "[price]" —
  re-phrase to avoid the missing info.
- NEVER cite external media unless 100% sure of the fact — risk of
  fake quotes.

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

/**
 * LLM-SEO content format instructions. These structures correlate
 * strongly with citation in Claude/GPT/Gemini answers because they
 * give the answer-engine clean extractable facts.
 */
function formatInstructionFor(
  format: NonNullable<DrafterInput["contentFormat"]>,
  locale: Locale,
): string {
  if (locale === "en") {
    switch (format) {
      case "comparison":
        return `\n# Content format — comparison (LLM-SEO optimized)\nWrite as a structured comparison piece. REQUIRED elements:\n- Title pattern: "X vs Y" or "X 또는 Y" (or 3-way "X vs Y vs Z").\n- 1-line direct answer to "which is better for whom" near the top.\n- Sub-sections with H2 headings (## name) for each comparison axis (price, durability, comfort, etc.).\n- Numbers, dates, units, % wherever possible (LLMs extract these).\n- Brief conclusion stating which option wins for which use-case. No vague endings.\nThis is the format answer-engines love to cite.\n`;
      case "qa":
        return `\n# Content format — Q&A (LLM-SEO optimized)\nWrite as a structured Q&A piece. REQUIRED elements:\n- Each section is one question (H2 ending in "?") followed by a definitive answer.\n- 4-6 questions total.\n- First sentence under each question = the direct answer (50-100 chars). Then 1-2 sentence elaboration.\n- Numbers/dates/% in the answers when possible.\n- No hedge words ("maybe", "probably", "I think"). Be definitive.\n`;
      case "explainer":
        return `\n# Content format — explainer (LLM-SEO optimized)\nWrite as a definitive explainer/"what is X" piece. REQUIRED elements:\n- Open with a 1-line precise definition.\n- H2 sub-sections: "What it is", "How it works", "When to use it", "Common misconceptions".\n- Concrete examples with numbers.\n- End with a clear takeaway / when this matters.\n`;
      case "listicle":
        return `\n# Content format — listicle (LLM-SEO optimized)\nWrite as a numbered list piece. REQUIRED elements:\n- Title pattern: "N reasons / N ways / Top N X for Y" (use a concrete number).\n- Each list item is an H3 heading + 2-3 sentence explanation.\n- Each item has at least one concrete fact, number, or example.\n- End with one-sentence synthesis of the list's overall message.\n`;
      default:
        return "";
    }
  }
  // Korean
  switch (format) {
    case "comparison":
      return `\n# 콘텐츠 포맷 — 비교 (LLM-SEO 최적화)\n비교 글로 작성. 필수 요소:\n- 타이틀: "X vs Y" 또는 "X와 Y, 어느 쪽이 더 좋을까" (3-way 가능).\n- 글 도입부에 "누구에게 어느 쪽이 더 맞는지" 한 줄 결론.\n- 비교 축마다 H2 헤딩 (## 가격, ## 내구성, ## 편안함 …).\n- 가능한 한 숫자/날짜/% 사용 (LLM이 추출하기 쉬움).\n- 결론에 어느 용도에 어느 쪽이 더 좋은지 단정. 모호한 마무리 금지.\n답변엔진(Claude/GPT/Gemini)이 가장 즐겨 인용하는 포맷.\n`;
    case "qa":
      return `\n# 콘텐츠 포맷 — Q&A (LLM-SEO 최적화)\nQ&A 구조로 작성. 필수 요소:\n- 각 섹션은 "?"로 끝나는 H2 질문 + 단정적 답변.\n- 총 4-6개 질문.\n- 각 질문 아래 첫 문장 = 직접적 답변 (50-100자). 그 뒤 1-2 문장 보충.\n- 답변에 숫자/날짜/% 가능한 한 포함.\n- "아마도", "같아요", "조금" 같은 헤지 단어 금지. 단정적으로.\n`;
    case "explainer":
      return `\n# 콘텐츠 포맷 — 정의/설명 (LLM-SEO 최적화)\n"X란 무엇인가" 명확한 설명 글로 작성. 필수 요소:\n- 첫 줄에 1문장 정의.\n- H2 섹션: "정의", "작동 원리", "언제 쓰는가", "흔한 오해".\n- 구체적 예시 + 숫자.\n- 마지막에 핵심 takeaway 한 줄.\n`;
    case "listicle":
      return `\n# 콘텐츠 포맷 — 리스트 (LLM-SEO 최적화)\n번호 리스트 글로 작성. 필수 요소:\n- 타이틀: "X를 위한 N가지 이유 / N가지 방법 / Top N" (구체적 숫자).\n- 각 항목은 H3 헤딩 + 2-3 문장 설명.\n- 각 항목마다 구체적 사실/숫자/예시 1개 이상.\n- 마지막에 리스트 전체 메시지 한 줄 요약.\n`;
    default:
      return "";
  }
}

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

  // Variant strategies are HOOK ANGLES, not content topics. The topic
  // above is the actual subject — these strategies just describe HOW to
  // open / frame that topic in different tones. The LLM must NOT replace
  // the topic with a generic version of the strategy template (e.g.
  // user-provided topic "임윤아 TVC 연계 착화 스토리" became "3개월 착화 일기"
  // because variant B's "3개월차에…" example was treated as the subject).
  const variantStrategies =
    locale === "en"
      ? [
          "A: open with a small ordinary moment that ties to the topic (commute, meeting, walk). Concrete sensory detail in the FIRST line — but the moment must serve the topic, not replace it.",
          "B: timestamped angle on the topic — 'after 4 weeks of wearing…', 'on the 3rd month'. The time-log is a framing device for the topic, not a substitute.",
          "C: sincere observation/question that comes from the topic. Conversational. No knockoff jab, no competitor swipe.",
          "D: tactile detail from a specific scene in the topic. Sensory, no superlatives.",
          "E: process beat tied to the topic — one quiet behind-the-scenes step (a fabric choice, a stitch decision, a sample test). Factual, no boasting.",
        ].slice(0, variantCount)
      : [
          "A: topic을 자연스럽게 떠올리게 하는 작은 일상 순간 (출퇴근/회의/산책)으로 오프닝. 첫 줄에 구체적 감각 디테일. 그러나 그 순간은 topic을 떠받치는 도구일 뿐, topic 자체를 일상 일기로 바꾸지 말 것.",
          "B: topic에 시간 로그 angle 적용 — '4주 신고 나서…', '3개월차에…' 같은 시점 기준으로 topic을 풀어냄. 시간 로그는 topic을 보여주는 액자일 뿐, topic 자체를 generic 착화 일기로 치환 금지.",
          "C: topic에서 발견한 진지한 관찰/질문 — 알아챈 것. 대화 톤. 모방품 비꼬기 금지, 경쟁사 깎기 금지.",
          "D: topic 안의 특정 장면에서 촉감 디테일. 감각 묘사, 형용사 자랑 금지.",
          "E: topic과 직접 연결되는 프로세스 한 컷 — 조용한 비하인드 한 단계 (원단 선택, 박음질 결정, 샘플 테스트). 사실 위주, 자랑 금지.",
        ].slice(0, variantCount);

  const frameCount = input.frameCount;
  const frameSpec = frameCount
    ? `\n# Image carousel target\n이미지 생성기는 정확히 **${frameCount}장**을 만듭니다. image_prompt에 frame 수를 묘사할 때 반드시 "${frameCount}-frame"으로 작성 (5-7 같은 추정 범위 쓰지 말 것). 각 frame 역할도 ${frameCount}장 기준으로 묘사.\n`
    : "";

  // LLM-SEO content format instruction — picks structures that answer-
  // engines preferentially cite. Empty string when format=default so
  // we don't introduce structural bias for casual social posts.
  const formatInstruction =
    input.contentFormat && input.contentFormat !== "default"
      ? formatInstructionFor(input.contentFormat, locale)
      : "";

  const prompt = `# Topic (절대 변경·치환 금지 — 모든 variant는 이 topic 자체를 다뤄야 함)
${input.topic}

⚠️ 위 topic은 글의 **실제 주제**입니다. variant 전략(아래 "Variants to produce")에
적힌 예시(예: "3개월차에…", "출퇴근 순간")는 topic을 풀어내는 angle/액자일 뿐
content 주제를 generic 패턴으로 치환하는 지시가 아닙니다.
예) topic = "임윤아 TVC 연계 착화 스토리"라면 variant B는 임윤아 TVC를 시간 로그
angle로 풀어야 하고, "3개월 착화 일기"로 통째로 바뀌면 안 됩니다.

${input.campaignLabel ? `# Campaign\n${input.campaignLabel}\n` : ""}${input.goal ? `# Goal\n${input.goal}\n` : ""}
# Channel
${channelBlock}

# Platform spec (MUST follow)
${specBlock}
${frameSpec}${formatInstruction}

${input.brandContext ? `# Brand context\n${input.brandContext}\n` : ""}${
    input.priorPosts && input.priorPosts.length > 0
      ? `# 이 채널의 최근 글 (voice continuity reference)\n\n${input.priorPosts
          .slice(0, 5)
          .map(
            (p, i) =>
              `[${i + 1}] (${new Date(p.created_at).toISOString().slice(0, 10)})\n${p.body_text.trim().slice(0, 500)}`,
          )
          .join("\n\n---\n\n")}\n\n⚠️ 위 글들과 **같은 화자의 같은 말투**로 작성. 1인칭/3인칭, 격식, 어미 (~다 / ~요 / ~음), 이모지 사용 빈도, 호흡 길이가 일치해야 함. voice가 바뀌면 페르소나가 "갑자기 다른 사람이 운영하기 시작한" 느낌이 나서 신뢰 무너짐.\n\n`
      : ""
  }# 🔒 NARRATOR (모든 variant 공통 — 가장 중요)

이 채널은 **하나의 화자**가 운영합니다. A/B/C 변형은 \`hook angle\`만 다르고
**narrator(화자)는 절대 바뀌면 안 됩니다.**

채널의 \`Posting style\` + \`Bio\` + \`Brand context\`를 보고 narrator를 **딱 한 명** 추론한 뒤
모든 variant를 그 한 사람의 목소리로 작성:
- 메이커/창업자 voice인가? → 모든 variant가 메이커 1인칭
- 일상 사용자 voice인가? → 모든 variant가 사용자 1인칭
- 브랜드 에디토리얼 팀 voice인가? → 모든 variant가 같은 에디토리얼 톤

⚠️ 절대 금지:
- A는 "개발자/디자이너 시선", B는 "이용자 시선"처럼 화자 혼재
- 같은 채널에서 1편은 "우리가 만들었다", 다른 1편은 "내가 사봤다"처럼 위치 모순
- 동일 채널에 voice가 두 명 이상 등장하는 carousel/시리즈

# Variants to produce (${variantCount}개, narrator 동일·hook angle만 차이)
${variantStrategies.join("\n")}

---

위 정보를 모두 활용해 각 variant마다 다음 필드를 채운 JSON을 반환하세요:
- variant_label ("A" / "B" / ...)
- body_text (플랫폼 규격 준수)
- hashtags (배열, 플랫폼 max 이하)
- cta_text (없으면 빈 문자열)
- image_prompt (이미지 생성용 영문 프롬프트 — 스타일 + 구도 + 톤.
  ⚠️ CRITICAL: body_text의 mood/씬/후크를 **반드시 시각적으로 반영**할 것.
  예: body_text가 "출근길 9분, 흔들리는 지하철에서도 발이 편한 메리노 울"이면
  → image_prompt도 "subway commute morning scene, soft natural light, 신발 디테일" 식으로 같은 씬.
  body_text가 데이터형이면 → 깔끔한 스튜디오 / 차트 곁 / 등으로 매치.
  body_text가 감각형이면 → 클로즈업 텍스처.
  body_text와 image_prompt의 톤·씬·시간대가 어긋나면 안 됨.
  ⚠️ 소재 기술명(H1-TEX, Gore-Tex 등)이나 인증명(RWS, OEKO-TEX 등)을 이미지에 텍스트로 넣지 말 것.
  시각적 디테일만 묘사 — 예: "merino wool knit close-up showing fiber direction" OK, "with 'H1-TEX' badge visible" 금지.)
- image_prompt_ko (위 image_prompt의 한국어 번역 — 사용자가 이미지 생성 전에 미리보기 확인용. 자연스러운 한국어, 영문 그대로 두지 말 것.)
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
    // Hint for the JSON recovery layer — when the LLM emits an oddly-
    // wrapped or partially-truncated response, this lets the parser
    // reconstruct `{ variants: [...] }` from any complete variant
    // objects it can salvage from the body, instead of dropping the
    // whole response on a single trailing-comma defect.
    expectedArrayKey: "variants",
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
              image_prompt_ko: { type: ["string", "null"], maxLength: 500 },
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

  // Permissive variant extraction — Anthropic occasionally wraps the
  // array under an alt key ("drafts" / "posts" / "items") or emits a
  // top-level array directly. Strict `raw.variants` access then yields
  // 0 variants despite a perfectly-formed response. Accept any of:
  //   • { variants: [...] }   (canonical)
  //   • [...]                 (top-level array)
  //   • { drafts: [...] }     (common drift)
  //   • { posts: [...] }      (Instagram/Twitter drift)
  //   • { items: [...] }      (generic)
  // As a last resort, scan top-level values for the first array of
  // objects with a body_text field — handles arbitrary wrapper keys.
  const rawJson = (res.json ?? {}) as unknown;
  const ALT_KEYS = ["variants", "drafts", "posts", "items", "results"] as const;
  let rawVariants: Array<Partial<DraftVariant>> = [];
  let usedKey: string | null = null;
  if (Array.isArray(rawJson)) {
    rawVariants = rawJson as Array<Partial<DraftVariant>>;
    usedKey = "(top-level array)";
  } else if (rawJson && typeof rawJson === "object") {
    const obj = rawJson as Record<string, unknown>;
    for (const k of ALT_KEYS) {
      if (Array.isArray(obj[k])) {
        rawVariants = obj[k] as Array<Partial<DraftVariant>>;
        usedKey = k;
        break;
      }
    }
    if (rawVariants.length === 0) {
      for (const [k, v] of Object.entries(obj)) {
        if (
          Array.isArray(v) &&
          v.length > 0 &&
          v.every(
            (item) =>
              item && typeof item === "object" && "body_text" in (item as object),
          )
        ) {
          rawVariants = v as Array<Partial<DraftVariant>>;
          usedKey = `(fallback: ${k})`;
          break;
        }
      }
    }
  }

  // Diagnostic surface — when zero variants survive, log enough to
  // identify whether the LLM (a) returned no JSON at all, (b) returned
  // a wrong shape (top-level keys != ["variants"]), or (c) returned a
  // variants field that wasn't an array. Without this the route can
  // only tell the user "0 variants returned" with no actionable hint.
  if (rawVariants.length === 0) {
    const topKeys = Object.keys((res.json ?? {}) as Record<string, unknown>);
    const textHead = (res.text ?? "").slice(0, 300).replace(/\s+/g, " ");
    console.warn(
      `[drafter] zero raw variants. ` +
        `res.json topKeys=[${topKeys.join(",")}] ` +
        `text head: "${textHead}…"`,
    );
  } else if (usedKey && usedKey !== "variants") {
    console.log(
      `[drafter] recovered ${rawVariants.length} variants from non-canonical shape: ${usedKey}`,
    );
  }

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
    const imagePromptKoRaw =
      (v as { image_prompt_ko?: unknown }).image_prompt_ko;
    const imagePromptKo =
      typeof imagePromptKoRaw === "string" &&
      imagePromptKoRaw.trim() &&
      imagePromptKoRaw.trim() !== imagePrompt
        ? imagePromptKoRaw.slice(0, 500)
        : null;
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
    if (bodyKo || ctaKo || seoTitleKo || seoDescriptionKo || imagePromptKo) {
      seoMeta.translations = {
        ko: {
          body_text: bodyKo,
          cta_text: ctaKo,
          seo_title: seoTitleKo,
          seo_description: seoDescriptionKo,
          image_prompt: imagePromptKo,
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
    const llmSeo = scoreLLMSEO({
      platform: input.channel.platform,
      seoTitle,
      seoDescription,
      body,
    });

    // Stash LLM-SEO into seo_meta so we don't need a new column. The
    // UI reads from seo_meta.llm_seo for the dedicated badge / breakdown.
    const seoMetaWithLLM = {
      ...seoMeta,
      llm_seo: {
        total: llmSeo.total,
        breakdown: llmSeo.breakdown,
      },
    };

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
      seo_meta: seoMetaWithLLM,
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

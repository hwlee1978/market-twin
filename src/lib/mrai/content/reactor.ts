import { getLLMProvider } from "@/lib/llm";
import { getPlatformSpec } from "../platform-rules";
import type { Locale } from "../types";

/**
 * Persona Reaction Simulator — Sprint 3 of Phase 9.
 *
 * Takes a content draft + a SAMPLE of personas, and asks each persona
 * (via LLM) to react: love / like / neutral / dislike / ignore, plus
 * per-action intent (like, click, share, save, comment) 0-1, plus a
 * 1-sentence reaction quote and (optionally) a comment they'd leave.
 *
 * Batching: 5 personas per LLM call to balance per-persona reasoning
 * fidelity against latency/cost. Concurrent batches × 4 in parallel.
 *
 * The aggregator (callers) converts these rows into the rates + top
 * quotes that mrai_content_simulations stores. We KEEP raw per-persona
 * rows in mrai_persona_reactions so the UI can drill down.
 */

export type PersonaForReaction = {
  id: string;
  age_range: string;
  gender: string;
  country: string;
  income_band: string;
  profession: string;
  base_profession: string;
  interests: string[];
  purchase_style: string;
  price_sensitivity: string;
};

export type DraftForReaction = {
  body_text: string;
  hashtags: string[];
  cta_text: string | null;
  image_prompt: string | null;
  seo_title: string | null;
  campaign_label: string | null;
  variant_label: string;
};

export type ChannelForReaction = {
  platform: string;
  handle: string;
  market_country: string | null;
  display_name: string | null;
};

export type Reaction = "love" | "like" | "neutral" | "dislike" | "ignore";

export type PersonaReactionResult = {
  persona_id: string;
  persona_summary: Record<string, unknown>;
  reaction: Reaction;
  like_intent: number;
  click_intent: number;
  share_intent: number;
  save_intent: number;
  comment_intent: number;
  comment_text: string | null;
  comment_text_ko: string | null;
  rejection_reason: string | null;
  rejection_reason_ko: string | null;
  reaction_quote: string;
  reaction_quote_ko: string;
};

export type ReactorInput = {
  draft: DraftForReaction;
  channel: ChannelForReaction;
  personas: PersonaForReaction[];
  locale?: Locale;
};

export type ReactorResult = {
  reactions: PersonaReactionResult[];
  inputTokens: number;
  outputTokens: number;
  ms: number;
};

const BATCH_SIZE = 5;
const CONCURRENCY = 4;

const SYSTEM_KO = `당신은 페르소나 시점의 콘텐츠 반응 시뮬레이터입니다.

역할:
- 사용자가 제공하는 (1) 콘텐츠 드래프트, (2) 콘텐츠가 올라간 플랫폼/채널, (3) ${BATCH_SIZE}명의 페르소나를 입력받음.
- 각 페르소나 시점에서 "내가 이 콘텐츠를 피드에서 봤다면 어떻게 반응할지" 시뮬레이션.
- 반응 = love / like / neutral / dislike / ignore 중 1개 + 각 행동 intent (0-1) + 1-2문장 반응 quote + (선택) 댓글 text + (선택) 거부 이유.

원칙 (중요):
- 각 페르소나는 독립적으로 평가. 절대 다른 페르소나의 반응에 영향 받지 말 것.
- 가장 흔한 실제 행동은 "scroll past = ignore" (50-70%). 무조건 like/love 비율 30% 넘으면 false positive 의심.
- 가격 민감도 + 소득 + 직업이 의사결정에 강하게 영향. 프리미엄 제품에 저소득 페르소나가 love하면 비현실적.
- 플랫폼 맥락 무시 금지. X에서 long-form은 ignore, 네이버 블로그에서 단문은 가치 부족으로 dislike.
- reaction_quote는 페르소나가 실제 쓸 만한 1-인칭 한 줄. "나는 ~할 것 같아" / "이거 별로다" / "흠..." 등.
- comment_text는 "정말 댓글 남길 만한 콘텐츠"일 때만 채움. 보통 null.
- rejection_reason은 dislike/ignore일 때 1구절 — "가격이 안 보임" / "광고티 남" / "내 관심 분야 아님".

⚠️ Bilingual 규칙 (CRITICAL):
- reaction_quote / comment_text / rejection_reason은 페르소나의 **모국어로 자연스럽게** 작성.
  · 일본인 → 일본어 / 대만인 → 번체 중국어 / 중국인 → 간체 중국어 / 미국인 → 영어 / 한국인 → 한국어.
- 같은 의미를 _ko 필드에 한국어로 번역. 사용자(한국인 오퍼레이터)가 카드에서 원어와 한국어 동시에 봐야 함.
- 한국인 페르소나는 _ko 필드를 원본과 동일하게 채워도 됨.
- 예: 일본인 → reaction_quote "これ、私の通勤バッグに合いそう", reaction_quote_ko "이거 내 출근가방에 잘 어울릴 것 같아"
- 예: 대만인 → reaction_quote "看起來太貴族風了, 我穿不出來", reaction_quote_ko "너무 귀족스러워서 내가 소화 못 할 듯"
- 예: 미국인 → reaction_quote "lowkey gorgeous but I need to see the price first", reaction_quote_ko "은근 예쁘긴 한데 가격부터 봐야 함"

출력 JSON:
{
  "reactions": [
    {
      "persona_id": "ID",
      "reaction": "love" | "like" | "neutral" | "dislike" | "ignore",
      "like_intent": 0-1,
      "click_intent": 0-1,
      "share_intent": 0-1,
      "save_intent": 0-1,
      "comment_intent": 0-1,
      "comment_text": "..." | null,
      "rejection_reason": "..." | null,
      "reaction_quote": "1-인칭 한 줄"
    }
  ]
}`;

const SYSTEM_EN = `You simulate persona-perspective reactions to content.

You receive (1) a content draft, (2) the platform/channel context, and
(3) ${BATCH_SIZE} personas. For EACH persona independently, predict how
THEY would react if this content surfaced in their feed.

Output one of: love / like / neutral / dislike / ignore — plus 0-1 intent
per action (like, click, share, save, comment) and a 1-person reaction
quote. Add comment_text only when realistically engaging; usually null.
Add rejection_reason for dislike/ignore.

Critical principles:
- Evaluate each persona INDEPENDENTLY. No bleed.
- Scroll past = ignore is the most common real-world reaction (50-70%).
  If your like+love share exceeds 30%, suspect a false positive.
- Price sensitivity + income + profession heavily shape decisions. A
  low-income persona loving a premium product is unrealistic.
- Honor platform context. Long-form on X = ignore. Short copy on Naver
  Blog = dislike (low value).
- reaction_quote = the persona's actual 1st-person line (1 short sentence).

Output JSON schema:
{ "reactions": [{ persona_id, reaction, like_intent, ..., reaction_quote, ... }] }`;

function buildPersonaBlock(personas: PersonaForReaction[]): string {
  return personas
    .map(
      (p, i) =>
        `[${i + 1}] id=${p.id}
   ${p.age_range} ${p.gender} · ${p.country} · ${p.income_band}
   직업: ${p.profession}
   관심사: ${p.interests.slice(0, 6).join(", ") || "(미상)"}
   구매 스타일: ${p.purchase_style} / 가격민감도: ${p.price_sensitivity}`,
    )
    .join("\n\n");
}

function buildDraftBlock(d: DraftForReaction, c: ChannelForReaction): string {
  const spec = getPlatformSpec(c.platform);
  return [
    `Platform: ${spec.label}`,
    `Channel: @${c.handle}${c.display_name ? ` (${c.display_name})` : ""}`,
    c.market_country ? `Market: ${c.market_country}` : null,
    d.campaign_label ? `Campaign: ${d.campaign_label}` : null,
    `Variant: ${d.variant_label}`,
    d.seo_title ? `Title: ${d.seo_title}` : null,
    "",
    "--- 본문 ---",
    d.body_text,
    "--- 끝 ---",
    "",
    d.hashtags.length > 0 ? `Hashtags: ${d.hashtags.join(" ")}` : null,
    d.cta_text ? `CTA: ${d.cta_text}` : null,
    d.image_prompt ? `(상상할 이미지: ${d.image_prompt})` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

async function runBatch(
  draftBlock: string,
  personas: PersonaForReaction[],
  locale: Locale,
): Promise<{
  reactions: PersonaReactionResult[];
  inputTokens: number;
  outputTokens: number;
}> {
  const personaBlock = buildPersonaBlock(personas);
  const prompt = `# 콘텐츠
${draftBlock}

# 평가할 페르소나 (${personas.length}명)
${personaBlock}

---

각 페르소나마다 독립적으로 반응을 출력하세요. persona_id는 위 id 값을 정확히 복사.`;

  const system = locale === "en" ? SYSTEM_EN : SYSTEM_KO;
  const provider = getLLMProvider({ provider: "anthropic" });

  const res = await provider.generate({
    system,
    prompt,
    temperature: 0.4,
    maxTokens: 3000,
    cacheSystem: true,
    jsonSchema: {
      type: "object",
      required: ["reactions"],
      properties: {
        reactions: {
          type: "array",
          minItems: 1,
          maxItems: BATCH_SIZE,
          items: {
            type: "object",
            required: ["persona_id", "reaction", "reaction_quote", "reaction_quote_ko"],
            properties: {
              persona_id: { type: "string" },
              reaction: { type: "string", enum: ["love", "like", "neutral", "dislike", "ignore"] },
              like_intent: { type: "number", minimum: 0, maximum: 1 },
              click_intent: { type: "number", minimum: 0, maximum: 1 },
              share_intent: { type: "number", minimum: 0, maximum: 1 },
              save_intent: { type: "number", minimum: 0, maximum: 1 },
              comment_intent: { type: "number", minimum: 0, maximum: 1 },
              comment_text: { type: ["string", "null"], maxLength: 400 },
              comment_text_ko: { type: ["string", "null"], maxLength: 400 },
              rejection_reason: { type: ["string", "null"], maxLength: 200 },
              rejection_reason_ko: { type: ["string", "null"], maxLength: 200 },
              reaction_quote: { type: "string", maxLength: 200 },
              reaction_quote_ko: { type: "string", maxLength: 200 },
            },
          },
        },
      },
    },
  });

  const raw = (res.json as { reactions?: Array<Partial<PersonaReactionResult>> }) ?? {};
  const rawArr = Array.isArray(raw.reactions) ? raw.reactions : [];

  const byId = new Map(personas.map((p) => [p.id, p] as const));
  const reactions: PersonaReactionResult[] = [];
  for (const r of rawArr) {
    const personaId = typeof r.persona_id === "string" ? r.persona_id : null;
    if (!personaId) continue;
    const persona = byId.get(personaId);
    if (!persona) continue;
    reactions.push({
      persona_id: personaId,
      persona_summary: {
        country: persona.country,
        ageRange: persona.age_range,
        gender: persona.gender,
        profession: persona.profession,
        incomeBand: persona.income_band,
        priceSensitivity: persona.price_sensitivity,
      },
      reaction: (r.reaction as Reaction) ?? "ignore",
      like_intent: clamp01(r.like_intent),
      click_intent: clamp01(r.click_intent),
      share_intent: clamp01(r.share_intent),
      save_intent: clamp01(r.save_intent),
      comment_intent: clamp01(r.comment_intent),
      comment_text:
        typeof r.comment_text === "string" && r.comment_text.trim() ? r.comment_text.trim() : null,
      comment_text_ko:
        typeof r.comment_text_ko === "string" && r.comment_text_ko.trim()
          ? r.comment_text_ko.trim()
          : null,
      rejection_reason:
        typeof r.rejection_reason === "string" && r.rejection_reason.trim()
          ? r.rejection_reason.trim()
          : null,
      rejection_reason_ko:
        typeof r.rejection_reason_ko === "string" && r.rejection_reason_ko.trim()
          ? r.rejection_reason_ko.trim()
          : null,
      reaction_quote: typeof r.reaction_quote === "string" ? r.reaction_quote : "",
      reaction_quote_ko:
        typeof r.reaction_quote_ko === "string" && r.reaction_quote_ko.trim()
          ? r.reaction_quote_ko
          : typeof r.reaction_quote === "string"
            ? r.reaction_quote
            : "",
    });
  }
  return {
    reactions,
    inputTokens: res.usage?.inputTokens ?? 0,
    outputTokens: res.usage?.outputTokens ?? 0,
  };
}

function clamp01(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

export async function runPersonaReactor(input: ReactorInput): Promise<ReactorResult> {
  const locale = input.locale ?? "ko";
  const t0 = Date.now();

  const draftBlock = buildDraftBlock(input.draft, input.channel);

  // Split personas into mini-batches of BATCH_SIZE
  const batches: PersonaForReaction[][] = [];
  for (let i = 0; i < input.personas.length; i += BATCH_SIZE) {
    batches.push(input.personas.slice(i, i + BATCH_SIZE));
  }

  // Run CONCURRENCY at a time
  const allReactions: PersonaReactionResult[] = [];
  let inputTokens = 0;
  let outputTokens = 0;
  let cursor = 0;
  async function worker() {
    while (cursor < batches.length) {
      const myIdx = cursor++;
      const batch = batches[myIdx];
      if (!batch) break;
      const { reactions, inputTokens: it, outputTokens: ot } = await runBatch(
        draftBlock,
        batch,
        locale,
      );
      allReactions.push(...reactions);
      inputTokens += it;
      outputTokens += ot;
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  return {
    reactions: allReactions,
    inputTokens,
    outputTokens,
    ms: Date.now() - t0,
  };
}

// ─── Aggregator ─────────────────────────────────────────────────────

export type AggregatedSimulation = {
  persona_sample_size: number;
  like_rate: number;
  click_rate: number;
  share_rate: number;
  save_rate: number;
  comment_rate: number;
  reaction_distribution: Record<Reaction, number>;
  top_positive_quotes: Array<{ quote: string; quote_ko: string; persona: string }>;
  top_objection_quotes: Array<{
    quote: string;
    quote_ko: string;
    persona: string;
    reason: string | null;
    reason_ko: string | null;
  }>;
  segment_breakdown: Record<string, { like_rate: number; n: number }>;
};

const POSITIVE: Reaction[] = ["love", "like"];
const NEGATIVE: Reaction[] = ["dislike", "ignore"];

function pctOf(n: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((n / total) * 10000) / 100;
}

export function aggregateReactions(
  reactions: PersonaReactionResult[],
): AggregatedSimulation {
  const n = reactions.length;
  const dist: Record<Reaction, number> = {
    love: 0,
    like: 0,
    neutral: 0,
    dislike: 0,
    ignore: 0,
  };
  for (const r of reactions) {
    dist[r.reaction] = (dist[r.reaction] ?? 0) + 1;
  }

  // Rates as % of personas with intent >= 0.5 (would actually take action)
  const likeRate = pctOf(
    reactions.filter((r) => r.like_intent >= 0.5).length,
    n,
  );
  const clickRate = pctOf(
    reactions.filter((r) => r.click_intent >= 0.5).length,
    n,
  );
  const shareRate = pctOf(
    reactions.filter((r) => r.share_intent >= 0.5).length,
    n,
  );
  const saveRate = pctOf(
    reactions.filter((r) => r.save_intent >= 0.5).length,
    n,
  );
  const commentRate = pctOf(
    reactions.filter((r) => r.comment_intent >= 0.5).length,
    n,
  );

  const reaction_distribution: Record<Reaction, number> = {
    love: pctOf(dist.love, n),
    like: pctOf(dist.like, n),
    neutral: pctOf(dist.neutral, n),
    dislike: pctOf(dist.dislike, n),
    ignore: pctOf(dist.ignore, n),
  };

  // Top quotes — positive = highest like_intent love/like; objection = dislike/ignore with most-evocative quote
  const positives = reactions
    .filter((r) => POSITIVE.includes(r.reaction) && r.reaction_quote.length > 5)
    .sort((a, b) => b.like_intent + b.save_intent - (a.like_intent + a.save_intent))
    .slice(0, 6)
    .map((r) => ({
      quote: r.reaction_quote,
      quote_ko: r.reaction_quote_ko || r.reaction_quote,
      persona: `${r.persona_summary.ageRange ?? ""} ${r.persona_summary.country ?? ""} ${r.persona_summary.profession ?? ""}`.trim(),
    }));

  const objections = reactions
    .filter((r) => NEGATIVE.includes(r.reaction) && (r.reaction_quote.length > 5 || r.rejection_reason))
    .sort((a, b) => a.like_intent - b.like_intent) // most negative first
    .slice(0, 6)
    .map((r) => ({
      quote: r.reaction_quote,
      quote_ko: r.reaction_quote_ko || r.reaction_quote,
      persona: `${r.persona_summary.ageRange ?? ""} ${r.persona_summary.country ?? ""} ${r.persona_summary.profession ?? ""}`.trim(),
      reason: r.rejection_reason,
      reason_ko: r.rejection_reason_ko || r.rejection_reason,
    }));

  // Segment breakdown by age_range
  const segments = new Map<string, { positive: number; total: number }>();
  for (const r of reactions) {
    const key = String(r.persona_summary.ageRange ?? "unknown");
    const cell = segments.get(key) ?? { positive: 0, total: 0 };
    cell.total += 1;
    if (POSITIVE.includes(r.reaction)) cell.positive += 1;
    segments.set(key, cell);
  }
  const segment_breakdown: Record<string, { like_rate: number; n: number }> = {};
  for (const [k, v] of segments) {
    segment_breakdown[k] = { like_rate: pctOf(v.positive, v.total), n: v.total };
  }

  return {
    persona_sample_size: n,
    like_rate: likeRate,
    click_rate: clickRate,
    share_rate: shareRate,
    save_rate: saveRate,
    comment_rate: commentRate,
    reaction_distribution,
    top_positive_quotes: positives,
    top_objection_quotes: objections,
    segment_breakdown,
  };
}

import { getLLMProvider } from "@/lib/llm";
import { createServiceClient } from "@/lib/supabase/server";
import { loadWorkspaceMemories } from "../memory";

/**
 * Mr. AI Channel Recommender — turns a simulation's recommended market
 * into a curated list of "where should we actually post about this"
 * platforms + specific handles/subreddits/blogs, scored by fit with
 * the product, target persona, and country culture.
 *
 * Two-source design:
 *   1) Static catalog (country × channel-type) — short curated list of
 *      hubs that consistently work for D2C / consumer brands in each
 *      market. Keeps the LLM grounded so it doesn't hallucinate dead
 *      subreddits or non-existent handles.
 *   2) LLM pass (Anthropic Sonnet) — picks from the catalog + adds
 *      product-specific suggestions (e.g. for a comfort-shoe brand →
 *      r/Sneakers + r/BuyItForLife + Wirecutter shoe vertical), then
 *      writes a rationale per pick.
 *
 * Output is persisted to mrai_channel_recommendations. UI shows them
 * as cards with a "Activate" toggle (sets `selected=true`), and the
 * Phase 3 content generator pulls only selected channels.
 */

export type ChannelType =
  | "reddit"
  | "instagram"
  | "tiktok"
  | "twitter"
  | "youtube"
  | "linkedin"
  | "facebook"
  | "naver_blog"
  | "naver_cafe"
  | "kakao_channel"
  | "note"         // JP
  | "ameba_blog"   // JP
  | "weibo"        // CN
  | "xiaohongshu"  // CN
  | "wirecutter"
  | "press_release"
  | "newsletter"
  | "other";

export interface RecommendedChannel {
  countryCode: string;
  channelType: ChannelType;
  channelName: string;
  rationale: string;
  priority: number; // 0-100
  metadata: Record<string, unknown>;
}

/**
 * Static seed catalog. Each entry is "for this country, these are the
 * baseline platforms you'd consider for a D2C consumer brand". The LLM
 * uses this as a candidate pool + can add brand-specific picks.
 */
const COUNTRY_CHANNEL_CATALOG: Record<string, Array<{ type: ChannelType; hub: string; note: string }>> = {
  US: [
    { type: "reddit", hub: "r/BuyItForLife · r/[product subreddit]", note: "long-form review + AMA culture" },
    { type: "tiktok", hub: "TikTok #[category]Tok", note: "short-form discovery, Gen Z+Millennial" },
    { type: "instagram", hub: "IG Reels + Shop", note: "lifestyle aesthetic + shopping integration" },
    { type: "wirecutter", hub: "NYT Wirecutter category page", note: "editorial gold standard for considered purchases" },
    { type: "youtube", hub: "YouTube Shorts + creator review channels", note: "search-driven product research" },
    { type: "twitter", hub: "X/Twitter founder voice + reply guy strategy", note: "B2B reach, indie hacker visibility" },
    { type: "newsletter", hub: "Substack / Beehiiv niche newsletters", note: "trust transfer from creator to brand" },
  ],
  JP: [
    { type: "instagram", hub: "IG (Reels + Stories)", note: "visual-first, 20-40대 women heavy" },
    { type: "twitter", hub: "X/Twitter (Japan is X's largest non-US market)", note: "consumer reviews + news" },
    { type: "tiktok", hub: "TikTok Japan", note: "growing fast in 10-30대" },
    { type: "note", hub: "Note.com 카테고리 매거진", note: "long-form thoughtful content, indie-aesthetic" },
    { type: "ameba_blog", hub: "Ameba blog 인플루언서 협업", note: "주부·뷰티·라이프 영향력 큼" },
    { type: "youtube", hub: "YouTube 리뷰 채널", note: "Japanese viewers research extensively before buy" },
    { type: "press_release", hub: "PR TIMES + @Press", note: "Japan media still respects formal PR releases" },
  ],
  KR: [
    { type: "naver_blog", hub: "네이버 블로그 (체험단)", note: "검색 SEO 핵심, 네이버 검색이 1순위" },
    { type: "instagram", hub: "Instagram (Reels + 협찬)", note: "20-40대 라이프스타일" },
    { type: "youtube", hub: "유튜브 (롱폼 리뷰 + 쇼츠)", note: "deep-dive 리뷰 + 짧은 hook 병행" },
    { type: "naver_cafe", hub: "네이버 카페 (관련 커뮤니티)", note: "타겟 커뮤니티 직접 침투" },
    { type: "kakao_channel", hub: "카카오 채널 + 알림톡", note: "리타겟·재구매 직접 채널" },
    { type: "tiktok", hub: "TikTok 한국", note: "10-20대 가속 성장" },
  ],
  TW: [
    { type: "instagram", hub: "Instagram 대만", note: "TW Gen Z+Millennial 핵심" },
    { type: "facebook", hub: "Facebook 그룹 + Pages", note: "대만은 FB가 여전히 강함" },
    { type: "youtube", hub: "YouTube 대만 크리에이터", note: "리뷰·언박싱" },
    { type: "tiktok", hub: "TikTok 대만", note: "성장 단계" },
    { type: "xiaohongshu", hub: "샤오훙슈 (소홍서)", note: "여성 라이프스타일·뷰티 강세, 본토 cross-over" },
  ],
  CN: [
    { type: "xiaohongshu", hub: "샤오훙슈", note: "여성 25-35 라이프스타일·뷰티 핵심" },
    { type: "weibo", hub: "Weibo (브랜드 공식 + KOL 협업)", note: "대중적 도달 + 캠페인 hub" },
    { type: "tiktok", hub: "Douyin (TikTok CN)", note: "라이브 커머스 핵심" },
    { type: "youtube", hub: "Bilibili 리뷰", note: "젊은층 long-form 리뷰" },
  ],
  SG: [
    { type: "instagram", hub: "Instagram 싱가포르", note: "다문화 영어권 라이프스타일" },
    { type: "tiktok", hub: "TikTok SG", note: "Gen Z 가속" },
    { type: "facebook", hub: "Facebook 그룹", note: "expat·local 커뮤니티" },
    { type: "linkedin", hub: "LinkedIn (B2B / 임원 콘텐츠)", note: "비즈니스 hub" },
  ],
};

export interface RecommendInput {
  workspaceId: string;
  ensembleId?: string | null;
  /** Countries to recommend channels for. Usually winner + runner-up. */
  countries: string[];
  /** Product name (helps LLM pick category-relevant subreddits/handles). */
  productName?: string;
  /** Optional product category for additional grounding. */
  category?: string;
  locale?: "ko" | "en";
}

export interface RecommendResult {
  inserted: number;
  recommendations: Array<RecommendedChannel & { id: string }>;
}

export async function recommendChannels(input: RecommendInput): Promise<RecommendResult> {
  const memories = await loadWorkspaceMemories(input.workspaceId);
  const memoryBlock = memories.length
    ? memories.map((m) => `[${m.kind}] ${m.title}: ${m.body.slice(0, 300)}`).join("\n")
    : "(메모리 없음)";

  const catalogBlock = input.countries
    .map((c) => {
      const rows = COUNTRY_CHANNEL_CATALOG[c.toUpperCase()];
      if (!rows) return `## ${c}\n(catalog 없음 — LLM이 직접 추론)`;
      return `## ${c}\n${rows.map((r) => `- ${r.type} | ${r.hub} — ${r.note}`).join("\n")}`;
    })
    .join("\n\n");

  const system = `당신은 D2C 브랜드의 글로벌 마케팅 채널 전략 전문가입니다.
워크스페이스 메모리 + 시뮬레이션 추천 국가 + 채널 catalog를 종합해, 각 국가별로 6~10개의 구체적 채널을 추천하세요.

== 규칙 ==
- 각 국가별로 최소 6개, 최대 10개 채널.
- 일반 플랫폼 이름이 아닌 **구체적인 sub/handle/topic**으로 (예: "Reddit" ❌ → "r/BuyItForLife" ✅).
- 메모리의 제품/타겟 페르소나/USP를 인용한 rationale 1~2문장 (한국어).
- channelType은 enum 중 하나: reddit | instagram | tiktok | twitter | youtube | linkedin | facebook | naver_blog | naver_cafe | kakao_channel | note | ameba_blog | weibo | xiaohongshu | wirecutter | press_release | newsletter | other
- priority는 0-100. 가장 임팩트 큰 채널이 높음 (90+). 일반 채널은 60-75. 보너스 채널은 40-55.
- catalog에 없는 specific한 후보(예: "Wirecutter 컴포트 슈즈 카테고리 에디터")도 자유롭게 제안 OK — 단 실제 존재하는 것만.

응답은 반드시 유효한 JSON 한 객체. 외부 텍스트·코드펜스 없이.`;

  const langHint = input.locale === "en" ? "English rationale" : "한국어 rationale";
  const prompt = `워크스페이스 메모리 (제품·USP·타겟·KPI):
${memoryBlock}

추천이 필요한 시장:
${input.countries.join(", ")}

제품: ${input.productName ?? "(메모리에서 추출)"}
카테고리: ${input.category ?? "(메모리에서 추출)"}
${langHint}

== 국가별 baseline catalog ==
${catalogBlock}

== 응답 JSON 스키마 ==
{
  "recommendations": [
    {
      "countryCode": "US",
      "channelType": "reddit",
      "channelName": "r/Sneakers",
      "rationale": "...",
      "priority": 90,
      "metadata": { "url": "...", "audience": "...", "format_hint": "..." }
    }
  ]
}`;

  const provider = getLLMProvider({ provider: "anthropic" });
  const res = await provider.generate({
    system,
    prompt,
    temperature: 0.3,
    maxTokens: 4000,
    cacheSystem: false,
  });
  const text = (res.text ?? "").trim();
  if (!text) throw new Error("empty recommender response");

  const parsed = parseJsonLoose(text);
  const list = normalizeRecommendations(parsed, input.countries);

  // Persist
  const admin = createServiceClient();
  const rows = list.map((r) => ({
    workspace_id: input.workspaceId,
    ensemble_id: input.ensembleId ?? null,
    country_code: r.countryCode,
    channel_type: r.channelType,
    channel_name: r.channelName,
    rationale: r.rationale,
    priority: r.priority,
    metadata: r.metadata,
  }));
  const { data, error } = await admin
    .from("mrai_channel_recommendations")
    .insert(rows)
    .select("id, country_code, channel_type, channel_name, rationale, priority, metadata");
  if (error) throw new Error(`save recommendations: ${error.message}`);

  return {
    inserted: data?.length ?? 0,
    recommendations: (data ?? []).map((d: {
      id: string;
      country_code: string;
      channel_type: string;
      channel_name: string;
      rationale: string;
      priority: number;
      metadata: Record<string, unknown> | null;
    }) => ({
      id: d.id,
      countryCode: d.country_code,
      channelType: d.channel_type as ChannelType,
      channelName: d.channel_name,
      rationale: d.rationale,
      priority: d.priority,
      metadata: d.metadata ?? {},
    })),
  };
}

function parseJsonLoose(text: string): unknown {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("recommender returned non-JSON");
    return JSON.parse(m[0]);
  }
}

const VALID_TYPES = new Set<string>([
  "reddit",
  "instagram",
  "tiktok",
  "twitter",
  "youtube",
  "linkedin",
  "facebook",
  "naver_blog",
  "naver_cafe",
  "kakao_channel",
  "note",
  "ameba_blog",
  "weibo",
  "xiaohongshu",
  "wirecutter",
  "press_release",
  "newsletter",
  "other",
]);

function normalizeRecommendations(raw: unknown, countries: string[]): RecommendedChannel[] {
  const obj = raw as { recommendations?: unknown };
  const arr = Array.isArray(obj?.recommendations) ? obj.recommendations : [];
  const validCountries = new Set(countries.map((c) => c.toUpperCase()));
  const out: RecommendedChannel[] = [];
  for (const item of arr) {
    const r = item as Partial<RecommendedChannel> | null;
    if (!r) continue;
    const country = (r.countryCode ?? "").toString().toUpperCase().slice(0, 2);
    if (!validCountries.has(country)) continue;
    const type = (r.channelType ?? "other").toString();
    const channelType = (VALID_TYPES.has(type) ? type : "other") as ChannelType;
    const channelName = (r.channelName ?? "").toString().slice(0, 200);
    if (!channelName) continue;
    out.push({
      countryCode: country,
      channelType,
      channelName,
      rationale: (r.rationale ?? "").toString().slice(0, 600),
      priority: typeof r.priority === "number" ? Math.max(0, Math.min(100, Math.round(r.priority))) : 50,
      metadata: (r.metadata && typeof r.metadata === "object" ? r.metadata : {}) as Record<string, unknown>,
    });
  }
  // Sort by country then priority desc — for predictable card order.
  out.sort((a, b) =>
    a.countryCode === b.countryCode
      ? b.priority - a.priority
      : a.countryCode.localeCompare(b.countryCode),
  );
  return out;
}

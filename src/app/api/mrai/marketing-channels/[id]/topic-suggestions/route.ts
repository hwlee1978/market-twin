import { NextResponse } from "next/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { getLLMProvider } from "@/lib/llm";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/mrai/marketing-channels/[id]/topic-suggestions
 *
 * LLM-suggested content topics tailored to:
 *   1. This channel's platform / market / target segments / posting tone
 *   2. Workspace's brand fundamentals (top memories)
 *   3. Freshly crawled context — new product launches, news mentions,
 *      competitor moves from the last 14 days (auto-crawl source memories).
 *
 * Returns 5 topics, each with rationale + suggested campaign_label +
 * suggested goal so the modal can one-click-fill the form.
 */

type Suggestion = {
  topic: string;
  rationale: string;
  campaign_label: string | null;
  goal: string | null;
  tag: "신상품" | "트렌드" | "경쟁사 대응" | "브랜드 스토리" | "계절/시즌" | "고객 인사이트" | "이벤트";
};

const SYSTEM = `당신은 워크스페이스 브랜드의 SNS 콘텐츠 기획 전문가입니다.

작업:
- 채널 컨텍스트 + 워크스페이스 브랜드 메모리 + 최근 14일 크롤된 메모리(자사 사이트 변동/뉴스/경쟁사 동향)를 종합하여 **5개의 콘텐츠 주제**를 제안.

제안 원칙:
- 우선순위:
  1. **최신 크롤 정보** 활용 (예: 어제 자사 사이트에 신상 등록 → "신상품" 주제 / 경쟁사가 가격 인하 → "경쟁사 대응" 주제 / 뉴스에 카테고리 트렌드 → "트렌드 주제")
  2. 채널 타겟 세그먼트가 실제로 관심 가질 만한 주제
  3. 동일 캠페인 라벨로 반복하지 말고 다양한 angle
- 주제는 카피라이팅 가능한 구체적 형태 (예 "신제품 출시" ❌ → "메이트 페블 그레이 컬러, 일주일 신어본 후기 — 워싱이 다른 이유" ✅)
- 채널 플랫폼 특성 반영: Instagram = 비주얼 + 라이프스타일 / X = 짧고 후킹 / YouTube = 스토리/인사이트 / Naver Blog = 상세 가이드 / TikTok = 트렌드 사운드 + 1초 후크

출력 JSON: { "suggestions": [{ "topic": "...", "rationale": "...", "campaign_label": "...", "goal": "...", "tag": "..." }] }

규칙:
- topic: 한국어 한 문장 (max 100자) — 카피라이터가 바로 작업 시작할 수 있는 수준의 구체성
- rationale: 1-2문장 (max 200자) — "왜 이 주제인가" + 어떤 메모리/크롤 정보를 참고했는지 명시
- campaign_label: 10-30자 한국어 (예: "FW26 신상 시리즈" / "Allbirds 비교")
- goal: 1문장 한국어 (예: "신규 컬렉션 인지도 + 사전예약 유도")
- tag: 신상품 / 트렌드 / 경쟁사 대응 / 브랜드 스토리 / 계절/시즌 / 고객 인사이트 / 이벤트 중 1개
- 5개 모두 채울 것 — 정보 부족 시 브랜드 스토리/계절 주제로 메움`;

type MemoryRow = {
  title: string | null;
  body: string | null;
  kind: string;
  created_at: string;
  crawl_source_id: string | null;
};

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const wsCtx = await getOrCreatePrimaryWorkspace();
  if (!wsCtx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = await createClient();

  // Channel context
  const { data: channel, error: chErr } = await supabase
    .from("mrai_marketing_channels")
    .select(
      "platform, handle, display_name, market_country, target_segments, posting_style, bio_text",
    )
    .eq("id", id)
    .eq("workspace_id", wsCtx.workspaceId)
    .single();
  if (chErr || !channel) {
    return NextResponse.json({ error: "channel_not_found" }, { status: 404 });
  }

  // Workspace top memories (brand context)
  const { data: topMems } = await supabase
    .from("mrai_memories")
    .select("title, body, kind, created_at, crawl_source_id")
    .eq("workspace_id", wsCtx.workspaceId)
    .is("crawl_source_id", null)
    .order("created_at", { ascending: false })
    .limit(12);
  const brandMems = (topMems ?? []) as MemoryRow[];

  // Recent crawled memories (last 14 days)
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86_400_000).toISOString();
  const { data: crawledRows } = await supabase
    .from("mrai_memories")
    .select("title, body, kind, created_at, crawl_source_id")
    .eq("workspace_id", wsCtx.workspaceId)
    .not("crawl_source_id", "is", null)
    .gte("created_at", fourteenDaysAgo)
    .order("created_at", { ascending: false })
    .limit(20);
  const crawledMems = (crawledRows ?? []) as MemoryRow[];

  // Recently published topics — avoid suggesting the same campaign again
  const { data: recentDrafts } = await supabase
    .from("mrai_content_drafts")
    .select("campaign_label, body_text, created_at")
    .eq("workspace_id", wsCtx.workspaceId)
    .order("created_at", { ascending: false })
    .limit(8);

  const brandBlock = brandMems
    .map((m) => `- [${m.kind}] ${m.title ?? ""}: ${(m.body ?? "").slice(0, 200)}`)
    .join("\n");

  const crawledBlock =
    crawledMems.length === 0
      ? "(아직 자동 크롤 데이터 없음 — 자동 크롤링 소스에 자사 사이트/뉴스/경쟁사 등록 권장)"
      : crawledMems
          .map(
            (m) =>
              `- ${m.created_at.slice(0, 10)} ${m.title ?? ""}: ${(m.body ?? "").slice(0, 200)}`,
          )
          .join("\n");

  const recentCampaigns = ((recentDrafts ?? []) as Array<{ campaign_label: string | null; body_text: string }>)
    .map((d) => d.campaign_label)
    .filter((l): l is string => Boolean(l && l.trim()))
    .slice(0, 5);

  const prompt = `# 채널
Platform: ${channel.platform}
Handle: @${channel.handle}
${channel.display_name ? `Display: ${channel.display_name}\n` : ""}Market: ${channel.market_country ?? "N/A"}
Target segments: ${(channel.target_segments ?? []).join(" / ")}
${channel.bio_text ? `Bio: ${channel.bio_text}\n` : ""}${channel.posting_style ? `Posting style: ${channel.posting_style}` : ""}

# 워크스페이스 브랜드 메모리 (top ${brandMems.length})
${brandBlock || "(없음)"}

# 최근 14일 자동 크롤 메모리 (신상/뉴스/경쟁사)
${crawledBlock}

# 최근 사용된 캠페인 라벨 (반복 회피)
${recentCampaigns.length > 0 ? recentCampaigns.join(", ") : "(없음)"}

---

위 정보를 종합해 이 채널에 적합한 5개의 콘텐츠 주제를 제안하세요. 최근 크롤된 변동이 있으면 그것을 1-2개 주제로 우선 채택. 각 주제마다 rationale로 어떤 메모리/크롤을 참고했는지 명시.`;

  const provider = getLLMProvider({ provider: "anthropic" });
  const res = await provider.generate({
    system: SYSTEM,
    prompt,
    temperature: 0.6,
    maxTokens: 3000,
    cacheSystem: true,
    jsonSchema: {
      type: "object",
      required: ["suggestions"],
      properties: {
        suggestions: {
          type: "array",
          minItems: 3,
          maxItems: 5,
          items: {
            type: "object",
            required: ["topic", "rationale", "tag"],
            properties: {
              topic: { type: "string", maxLength: 200 },
              rationale: { type: "string", maxLength: 300 },
              campaign_label: { type: ["string", "null"], maxLength: 60 },
              goal: { type: ["string", "null"], maxLength: 200 },
              tag: {
                type: "string",
                enum: [
                  "신상품",
                  "트렌드",
                  "경쟁사 대응",
                  "브랜드 스토리",
                  "계절/시즌",
                  "고객 인사이트",
                  "이벤트",
                ],
              },
            },
          },
        },
      },
    },
  });

  const raw = (res.json as { suggestions?: Array<Partial<Suggestion>> }) ?? {};
  const suggestions: Suggestion[] = (Array.isArray(raw.suggestions) ? raw.suggestions : [])
    .filter((s) => typeof s.topic === "string")
    .map((s) => ({
      topic: s.topic as string,
      rationale: typeof s.rationale === "string" ? s.rationale : "",
      campaign_label:
        typeof s.campaign_label === "string" && s.campaign_label.trim()
          ? s.campaign_label.trim()
          : null,
      goal: typeof s.goal === "string" && s.goal.trim() ? s.goal.trim() : null,
      tag: (s.tag as Suggestion["tag"]) ?? "브랜드 스토리",
    }));

  return NextResponse.json({
    suggestions,
    sources_used: {
      brand_memories: brandMems.length,
      crawled_memories: crawledMems.length,
      recent_campaigns: recentCampaigns.length,
    },
  });
}

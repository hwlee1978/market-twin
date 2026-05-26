import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import Anthropic from "@anthropic-ai/sdk";
import { loadProductProfile } from "@/lib/mrai/content/product-profile";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const InputSchema = z.object({
  user_hint: z.string().trim().max(500).optional(),
});

/**
 * POST /api/mrai/content-drafts/[id]/image-prompt/refresh
 *
 * Regenerates the image_prompt (and Korean translation) for a draft.
 * Used by the "🔄 다른 프롬프트" button on the image-gen preview modal
 * — user can iterate on the prompt before committing to a $0.04-0.17
 * image generation call.
 *
 * Inputs:
 *   - user_hint (optional): extra direction from user, e.g.
 *     "더 미니멀하고 어두운 톤" / "lifestyle scene in NYC"
 *
 * Persists new image_prompt + seo_meta.translations.ko.image_prompt
 * directly on the draft so the next image-gen call uses it.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const wsCtx = await getOrCreatePrimaryWorkspace();
  if (!wsCtx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = InputSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data: draft, error } = await supabase
    .from("mrai_content_drafts")
    .select(
      `id, body_text, campaign_label, variant_label, hashtags, cta_text, image_prompt, seo_meta, marketing_channel_id,
       channel:mrai_marketing_channels!marketing_channel_id(platform, market_country, target_segments, posting_style, bio_text)`,
    )
    .eq("id", id)
    .eq("workspace_id", wsCtx.workspaceId)
    .single();
  if (error || !draft) {
    return NextResponse.json({ error: "draft_not_found" }, { status: 404 });
  }

  const channel = Array.isArray(draft.channel) ? draft.channel[0] : draft.channel;
  const profile = await loadProductProfile(wsCtx.workspaceId);

  const channelSummary = [
    `Platform: ${channel?.platform ?? "other"}`,
    channel?.market_country ? `Market: ${channel.market_country}` : null,
    channel?.target_segments?.length
      ? `Target: ${channel.target_segments.join(", ")}`
      : null,
    channel?.posting_style ? `Posting style: ${channel.posting_style}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const productSummary = profile
    ? [
        `Category: ${profile.category}`,
        profile.description ? `Product: ${profile.description}` : null,
        profile.visual_features?.colors?.length
          ? `Colors: ${profile.visual_features.colors.join(", ")}`
          : null,
      ]
        .filter(Boolean)
        .join("\n")
    : "(no product profile)";

  const SYSTEM = `당신은 마케팅 이미지 프롬프트 작성자입니다.

주어진 콘텐츠 드래프트 + 채널 컨텍스트 + 제품 정보를 바탕으로 image_prompt를 새로 작성하세요.

규칙:
- image_prompt = 영문 (gpt-image-1이 영어에서 최고 성능)
- 길이 50-150자
- 시각적 디테일 (스타일, 구도, 조명, 분위기, 배경)만 묘사
- 제품의 색상/소재명을 강제 텍스트로 박지 말 것 (예: "H1-TEX", "Gore-Tex", "100% Wool")
- 한국어 번역 (image_prompt_ko)도 함께 — 사용자가 한국어로 미리보기
- 이전 프롬프트와 같은 angle 반복 금지 — 다른 분위기/구도/씬 제안

출력 JSON: { "image_prompt": "영문", "image_prompt_ko": "한국어" }`;

  const userHint = parsed.data.user_hint?.trim();
  const userPrompt = `# 드래프트
${draft.body_text.slice(0, 400)}

${draft.campaign_label ? `Campaign: ${draft.campaign_label}\n` : ""}# 채널
${channelSummary}

# 제품
${productSummary}

# 이전 image_prompt
${draft.image_prompt ?? "(none)"}

${userHint ? `# 사용자 추가 지시\n${userHint}\n` : ""}---

이전과 다른 angle/분위기로 새 image_prompt를 작성하세요.`;

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });
  }
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  let resp;
  try {
    resp = await client.messages.create({
      model: "claude-sonnet-4-6",
      // 4K — long carousel prompts (7-frame Instagram) can run 500-800
      // tokens EN + similar KO. 800 was truncating mid-JSON.
      max_tokens: 4000,
      system: SYSTEM,
      messages: [{ role: "user", content: userPrompt }],
    });
  } catch (e) {
    return NextResponse.json(
      { error: "llm_failed", detail: e instanceof Error ? e.message : "?" },
      { status: 500 },
    );
  }

  const rawText = resp.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .filter(Boolean)
    .join("\n")
    .trim();
  // Strip markdown code fences if present (```json ... ```)
  const fenceMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenceMatch ? fenceMatch[1].trim() : rawText;
  // Extract first balanced JSON object
  const m = candidate.match(/\{[\s\S]*\}/);
  const stopReason = resp.stop_reason;
  if (!m) {
    return NextResponse.json(
      {
        error: "parse_failed",
        detail:
          `LLM 응답에 JSON 객체가 없습니다 (stop_reason=${stopReason}). 출력 토큰 ${resp.usage?.output_tokens ?? "?"} — 응답이 잘렸을 가능성. 다시 시도하세요.`,
      },
      { status: 500 },
    );
  }
  let parsedOut: { image_prompt?: string; image_prompt_ko?: string };
  try {
    parsedOut = JSON.parse(m[0]);
  } catch (e) {
    return NextResponse.json(
      {
        error: "parse_failed",
        detail: `JSON 파싱 실패 (stop_reason=${stopReason}, 출력 토큰 ${resp.usage?.output_tokens ?? "?"}). ${e instanceof Error ? e.message : ""}`,
      },
      { status: 500 },
    );
  }
  if (!parsedOut.image_prompt || !parsedOut.image_prompt_ko) {
    return NextResponse.json(
      {
        error: "missing_fields",
        detail: `image_prompt=${parsedOut.image_prompt ? "OK" : "missing"}, image_prompt_ko=${parsedOut.image_prompt_ko ? "OK" : "missing"}. 다시 시도하세요.`,
      },
      { status: 500 },
    );
  }

  // Update draft
  const svc = createServiceClient();
  const seoMeta = (draft.seo_meta as Record<string, unknown> | null) ?? {};
  const translations =
    ((seoMeta.translations as Record<string, unknown>) ?? {}) as Record<string, unknown>;
  const koTrans =
    ((translations.ko as Record<string, unknown>) ?? {}) as Record<string, unknown>;
  koTrans.image_prompt = parsedOut.image_prompt_ko;
  translations.ko = koTrans;
  seoMeta.translations = translations;

  const { error: uErr } = await svc
    .from("mrai_content_drafts")
    .update({
      image_prompt: parsedOut.image_prompt,
      seo_meta: seoMeta,
    })
    .eq("id", id)
    .eq("workspace_id", wsCtx.workspaceId);
  if (uErr) {
    return NextResponse.json({ error: uErr.message }, { status: 500 });
  }

  return NextResponse.json({
    image_prompt: parsedOut.image_prompt,
    image_prompt_ko: parsedOut.image_prompt_ko,
  });
}

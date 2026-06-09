import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { runContentDrafter } from "@/lib/mrai/content/drafter";
import { defaultFrameCountForPlatform } from "@/lib/mrai/content/image-gen";
import { loadWorkspaceMemories } from "@/lib/mrai/memory";

export const dynamic = "force-dynamic";
// Drafter loads workspace memories + prior posts + brand context, then
// runs a single multi-variant LLM call (up to 16K tokens, bilingual). With
// 3-5 variants on Sonnet the wall-clock can exceed 120s — especially when
// the JSON-schema layer retries once — surfacing as a 504
// FUNCTION_INVOCATION_TIMEOUT. 300s (Pro Fluid, matching the ensemble-pdf
// route) gives headroom for a slow generation + one retry. NOTE: this is a
// reliability backstop; the real latency fix is parallelising variants or
// using a faster drafting model (tracked separately).
export const maxDuration = 300;

/**
 * GET  /api/mrai/marketing-channels/[id]/drafts
 *   → list all drafts attached to this channel, grouped by campaign
 *
 * POST /api/mrai/marketing-channels/[id]/drafts
 *   → generate A/B/C drafts via the content drafter and persist
 *     them as variants. Payload: { topic, campaignLabel?, goal?,
 *     variantCount?, locale? }
 */

const GenerateSchema = z.object({
  topic: z.string().trim().min(3).max(300),
  campaignLabel: z.string().trim().max(120).optional(),
  goal: z.string().trim().max(500).optional(),
  variantCount: z.number().int().min(1).max(5).optional(),
  locale: z.enum(["ko", "en"]).optional(),
  contentFormat: z
    .enum(["default", "comparison", "qa", "explainer", "listicle"])
    .optional(),
});

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const wsCtx = await getOrCreatePrimaryWorkspace();
  if (!wsCtx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mrai_content_drafts")
    .select(
      "id, campaign_label, variant_label, parent_draft_id, body_text, hashtags, cta_text, image_prompt, image_url, image_urls, source, seo_title, seo_description, seo_keywords, seo_meta, seo_score, seo_notes, seo_scored_at, scheduled_at, created_at",
    )
    .eq("workspace_id", wsCtx.workspaceId)
    .eq("marketing_channel_id", id)
    .order("created_at", { ascending: false })
    .limit(60);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const drafts = data ?? [];

  // Annotate each draft with publication + simulation-winner state.
  let pubMap = new Map<string, string>();
  let simLikeRate = new Map<string, number>();
  if (drafts.length > 0) {
    const draftIds = drafts.map((d) => d.id);
    const [pubsQ, simsQ] = await Promise.all([
      supabase
        .from("mrai_content_publications")
        .select("content_draft_id, published_at")
        .eq("workspace_id", wsCtx.workspaceId)
        .in("content_draft_id", draftIds)
        .order("published_at", { ascending: false }),
      supabase
        .from("mrai_content_simulations")
        .select("content_draft_id, like_rate, created_at")
        .eq("workspace_id", wsCtx.workspaceId)
        .in("content_draft_id", draftIds)
        .order("created_at", { ascending: false }),
    ]);
    for (const p of pubsQ.data ?? []) {
      const k = p.content_draft_id as string;
      if (!pubMap.has(k)) pubMap.set(k, p.published_at as string);
    }
    for (const s of simsQ.data ?? []) {
      const k = s.content_draft_id as string;
      if (!simLikeRate.has(k) && typeof s.like_rate === "number") {
        simLikeRate.set(k, s.like_rate);
      }
    }
  }

  // Compute winner per campaign — the variant with the highest latest
  // simulated like_rate. Only marks a winner when 2+ variants compete
  // AND the leader actually has a meaningful like_rate (>= 5%).
  const byCampaign = new Map<
    string,
    Array<{ id: string; like_rate: number }>
  >();
  for (const d of drafts) {
    const lr = simLikeRate.get(d.id);
    if (typeof lr !== "number") continue;
    const key = d.campaign_label ?? "_no_campaign_";
    if (!byCampaign.has(key)) byCampaign.set(key, []);
    byCampaign.get(key)!.push({ id: d.id, like_rate: lr });
  }
  const winnerIds = new Set<string>();
  for (const arr of byCampaign.values()) {
    if (arr.length < 2) continue; // need a head-to-head
    arr.sort((a, b) => b.like_rate - a.like_rate);
    if (arr[0].like_rate >= 0.05) winnerIds.add(arr[0].id);
  }

  const annotated = drafts.map((d) => ({
    ...d,
    last_published_at: pubMap.get(d.id) ?? null,
    latest_like_rate: simLikeRate.get(d.id) ?? null,
    is_campaign_winner: winnerIds.has(d.id),
  }));
  return NextResponse.json({ drafts: annotated });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const wsCtx = await getOrCreatePrimaryWorkspace();
  if (!wsCtx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = GenerateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data: channel, error: chErr } = await supabase
    .from("mrai_marketing_channels")
    .select(
      "id, platform, handle, display_name, market_country, target_segments, posting_style, bio_text",
    )
    .eq("id", id)
    .eq("workspace_id", wsCtx.workspaceId)
    .single();
  if (chErr || !channel) {
    return NextResponse.json({ error: "channel_not_found" }, { status: 404 });
  }

  // Brand context: top-K memories so the drafter writes in the
  // workspace's actual voice (vs generic copy).
  let brandContext = "";
  try {
    const memories = await loadWorkspaceMemories(wsCtx.workspaceId);
    brandContext = memories
      .slice(0, 8)
      .map((m) => `- ${m.body}`)
      .join("\n");
  } catch {
    // Memories optional — drafter falls back to channel-only context.
  }

  // Voice continuity: load the most recent drafts on this channel so the
  // new variants read like the same speaker. Without this, every fresh
  // generation re-rolled narrator from scratch, producing one feed with
  // multiple unrelated voices.
  let priorPosts: Array<{ body_text: string; created_at: string }> = [];
  try {
    const { data: priorRows } = await supabase
      .from("mrai_content_drafts")
      .select("body_text, created_at")
      .eq("workspace_id", wsCtx.workspaceId)
      .eq("marketing_channel_id", id)
      .not("body_text", "is", null)
      .order("created_at", { ascending: false })
      .limit(5);
    priorPosts = (priorRows ?? [])
      .filter((r) => typeof r.body_text === "string" && r.body_text.trim().length > 20)
      .map((r) => ({
        body_text: r.body_text as string,
        created_at: r.created_at as string,
      }));
  } catch {
    // Voice-continuity is best-effort; drafter still works without it.
  }

  let result;
  try {
    result = await runContentDrafter({
      channel: {
        platform: channel.platform,
        handle: channel.handle,
        display_name: channel.display_name,
        market_country: channel.market_country,
        target_segments: channel.target_segments ?? [],
        posting_style: channel.posting_style,
        bio_text: channel.bio_text,
      },
      topic: parsed.data.topic,
      campaignLabel: parsed.data.campaignLabel,
      goal: parsed.data.goal,
      variantCount: parsed.data.variantCount ?? 3,
      priorPosts: priorPosts.length > 0 ? priorPosts : undefined,
      contentFormat: parsed.data.contentFormat ?? undefined,
      // Tell the drafter the actual frame count image-gen will produce
      // so image_prompt's described frame count matches reality.
      frameCount: defaultFrameCountForPlatform(channel.platform),
      // Content language follows the channel's TARGET MARKET, not the
      // operator UI: a US channel (@brand_us) must publish English, a KR
      // channel Korean. The drafter still produces a Korean translation
      // (body_text_ko) for the operator to read. Explicit request locale
      // overrides. Drafter supports ko/en, so any non-KR market → en.
      locale:
        parsed.data.locale ??
        (channel.market_country
          ? channel.market_country.toUpperCase() === "KR"
            ? "ko"
            : "en"
          : "ko"),
      brandContext: brandContext || undefined,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "drafter_failed";
    console.error("[drafter] failed:", msg, {
      channel_id: id,
      topic: parsed.data.topic.slice(0, 100),
      variant_count: parsed.data.variantCount,
    });
    return NextResponse.json(
      { error: "drafter_failed", detail: msg },
      { status: 500 },
    );
  }
  if (result.variants.length === 0) {
    console.error("[drafter] zero variants returned", {
      channel_id: id,
      topic: parsed.data.topic.slice(0, 100),
      input_tokens: result.inputTokens,
      output_tokens: result.outputTokens,
      ms: result.ms,
    });
    const truncated = result.outputTokens >= 15000;
    const hint = truncated
      ? "응답이 16K 토큰 한도 근처에서 잘렸을 수 있습니다. variant 개수를 2개로 줄이거나 topic·goal 길이를 절반으로 줄여서 재시도하세요."
      : "응답은 정상 길이지만 LLM 이 JSON 구조를 빗나갔습니다. 동일 입력으로 한 번 더 시도 (LLM 일시적 noise), 또는 다른 contentFormat 으로 변경하세요. Vercel 로그에서 [drafter] zero raw variants 항목 확인 가능.";
    return NextResponse.json(
      {
        error: "drafter_no_variants",
        detail: `LLM이 유효한 variant를 0개 반환했습니다.\n출력 토큰: ${result.outputTokens} (16000 한도)\n→ ${hint}`,
      },
      { status: 500 },
    );
  }

  // Get auth'd user id for created_by
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Persist variants. The first inserted row becomes the "parent" so
  // the other variants point at it (variant tree).
  const svc = createServiceClient();
  const now = new Date().toISOString();
  const baseCols = {
    workspace_id: wsCtx.workspaceId,
    marketing_channel_id: id,
    campaign_label: parsed.data.campaignLabel ?? null,
    source: "ai-drafted" as const,
    created_by: user?.id ?? null,
  };

  const inserted: Array<Record<string, unknown>> = [];
  let parentId: string | null = null;
  for (const v of result.variants) {
    const row = {
      ...baseCols,
      variant_label: v.variant_label,
      parent_draft_id: parentId,
      body_text: v.body_text,
      hashtags: v.hashtags,
      cta_text: v.cta_text,
      image_prompt: v.image_prompt,
      seo_title: v.seo_title,
      seo_description: v.seo_description,
      seo_keywords: v.seo_keywords,
      seo_meta: v.seo_meta,
      seo_score: v.seo_score,
      seo_notes: v.seo_notes,
      seo_scored_at: now,
    };
    const { data, error } = await svc
      .from("mrai_content_drafts")
      .insert(row)
      .select("*")
      .single();
    if (error) {
      return NextResponse.json(
        { error: error.message, partial: inserted },
        { status: 500 },
      );
    }
    inserted.push(data);
    if (parentId === null) parentId = data.id as string;
  }

  return NextResponse.json({
    drafts: inserted,
    usage: {
      input_tokens: result.inputTokens,
      output_tokens: result.outputTokens,
      ms: result.ms,
    },
  });
}

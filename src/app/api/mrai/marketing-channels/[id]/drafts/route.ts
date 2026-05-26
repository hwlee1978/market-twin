import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { runContentDrafter } from "@/lib/mrai/content/drafter";
import { loadWorkspaceMemories } from "@/lib/mrai/memory";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
      "id, campaign_label, variant_label, parent_draft_id, body_text, hashtags, cta_text, image_prompt, image_url, image_urls, source, seo_title, seo_description, seo_keywords, seo_meta, seo_score, seo_notes, seo_scored_at, created_at",
    )
    .eq("workspace_id", wsCtx.workspaceId)
    .eq("marketing_channel_id", id)
    .order("created_at", { ascending: false })
    .limit(60);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ drafts: data ?? [] });
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
      locale: parsed.data.locale ?? "ko",
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
    return NextResponse.json(
      {
        error: "drafter_no_variants",
        detail: `LLM이 유효한 variant를 0개 반환했습니다.\n출력 토큰: ${result.outputTokens} (≥15000이면 출력 truncation)\n→ variant 개수를 2개로 줄이거나 topic을 짧게 다시 시도하세요.`,
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

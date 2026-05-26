import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  defaultFrameCountForPlatform,
  generateImagesForDraft,
} from "@/lib/mrai/content/image-gen";
import { loadImageGenSettings } from "@/lib/mrai/content/image-gen-settings-loader";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const DeleteSchema = z.object({
  frame_index: z.number().int().min(0).max(6),
});

const RegenSchema = z.object({
  frame_index: z.number().int().min(0).max(6),
  prompt_override: z.string().trim().max(800).optional(),
});

type Gallery = Array<{ url: string; frame_index: number; size: string }>;

/**
 * DELETE /api/mrai/content-drafts/[id]/images/frame
 *   body: { frame_index }
 *   → removes one frame from the draft. If frame 0 (cover) removed and
 *     gallery has remaining frames, promotes gallery[0] to cover.
 *
 * POST   /api/mrai/content-drafts/[id]/images/frame
 *   body: { frame_index, prompt_override? }
 *   → regenerates that single frame in-place. Uses workspace settings
 *     + references + (optional) prompt override on top of the draft's
 *     existing image_prompt.
 */
export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const wsCtx = await getOrCreatePrimaryWorkspace();
  if (!wsCtx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = DeleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data: draft, error } = await supabase
    .from("mrai_content_drafts")
    .select("image_url, image_urls")
    .eq("id", id)
    .eq("workspace_id", wsCtx.workspaceId)
    .single<{ image_url: string | null; image_urls: Gallery }>();
  if (error || !draft) {
    return NextResponse.json({ error: "draft_not_found" }, { status: 404 });
  }

  const idx = parsed.data.frame_index;
  let newCover = draft.image_url;
  let newGallery: Gallery = draft.image_urls ?? [];

  if (idx === 0) {
    // Removing cover — promote first gallery frame to cover if available
    if (newGallery.length > 0) {
      const [first, ...rest] = newGallery;
      newCover = first.url;
      newGallery = rest.map((g, i) => ({ ...g, frame_index: i + 1 }));
    } else {
      newCover = null;
    }
  } else {
    // Remove gallery[idx-1] (gallery starts at frame_index 1)
    newGallery = newGallery
      .filter((g) => g.frame_index !== idx)
      // Re-index to be contiguous
      .map((g, i) => ({ ...g, frame_index: i + 1 }));
  }

  const svc = createServiceClient();
  const { data: updated, error: uErr } = await svc
    .from("mrai_content_drafts")
    .update({ image_url: newCover, image_urls: newGallery })
    .eq("id", id)
    .eq("workspace_id", wsCtx.workspaceId)
    .select("id, image_url, image_urls")
    .single();
  if (uErr) {
    return NextResponse.json({ error: uErr.message }, { status: 500 });
  }
  return NextResponse.json({ draft: updated });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const wsCtx = await getOrCreatePrimaryWorkspace();
  if (!wsCtx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = RegenSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data: draft, error: dErr } = await supabase
    .from("mrai_content_drafts")
    .select(
      `id, image_prompt, image_url, image_urls, marketing_channel_id, variant_label,
       channel:mrai_marketing_channels!marketing_channel_id(platform, handle, bio_text, posting_style)`,
    )
    .eq("id", id)
    .eq("workspace_id", wsCtx.workspaceId)
    .single();
  if (dErr || !draft) {
    return NextResponse.json({ error: "draft_not_found" }, { status: 404 });
  }

  const basePrompt = draft.image_prompt ?? "";
  if (!basePrompt.trim()) {
    return NextResponse.json({ error: "no_image_prompt" }, { status: 400 });
  }
  const channelData = Array.isArray(draft.channel) ? draft.channel[0] : draft.channel;
  const platform = channelData?.platform ?? "other";

  // Combine base prompt with optional override
  const composedPrompt = parsed.data.prompt_override
    ? `${basePrompt}\n\nAdditional direction for this frame: ${parsed.data.prompt_override}`
    : basePrompt;

  const brandHint = [channelData?.bio_text, channelData?.posting_style]
    .filter(Boolean)
    .join(" — ")
    .slice(0, 200);

  // Load references
  const { data: refRows } = await supabase
    .from("mrai_brand_assets")
    .select("id, image_url, asset_type, label")
    .eq("workspace_id", wsCtx.workspaceId)
    .order("use_count", { ascending: true })
    .limit(20);
  const allRefs = (refRows ?? []) as Array<{
    id: string;
    image_url: string;
    asset_type: string;
    label: string | null;
  }>;
  const pickFrom = (type: string, n: number) =>
    allRefs.filter((r) => r.asset_type === type).slice(0, n);
  const ambassadors = pickFrom("ambassador", 2);
  const logos = pickFrom("logo", 1);
  const products = pickFrom("product", ambassadors.length >= 2 ? 1 : 2);
  const lifestyle = pickFrom("lifestyle", 1);
  const packaging = pickFrom("packaging", 1);
  let references = [...ambassadors, ...logos, ...products, ...lifestyle, ...packaging].slice(0, 4);
  if (references.length === 0) references = allRefs.slice(0, 4);

  const settings = await loadImageGenSettings(wsCtx.workspaceId);
  const totalFrames = defaultFrameCountForPlatform(platform);
  const idx = parsed.data.frame_index;

  let result;
  try {
    result = await generateImagesForDraft({
      workspaceId: wsCtx.workspaceId,
      draftId: id,
      prompt: composedPrompt,
      platform,
      frameCount: totalFrames,
      brandHint: brandHint || undefined,
      variantLabel: draft.variant_label,
      references: references.length > 0 ? references : undefined,
      settings: settings ?? undefined,
      singleFrameIndex: idx,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "regen_failed" },
      { status: 500 },
    );
  }

  if (result.images.length === 0) {
    return NextResponse.json({ error: "no_image_returned" }, { status: 500 });
  }
  const newImg = result.images[0];

  // Update the draft — replace cover (frame 0) or splice into gallery
  const currentGallery = (draft.image_urls ?? []) as Gallery;
  const svc = createServiceClient();
  let updateBody: { image_url?: string | null; image_urls?: Gallery } = {};
  if (idx === 0) {
    updateBody = { image_url: newImg.url };
  } else {
    const updatedGallery = currentGallery.filter((g) => g.frame_index !== idx);
    updatedGallery.push({
      url: newImg.url,
      frame_index: idx,
      size: newImg.size,
    });
    updatedGallery.sort((a, b) => a.frame_index - b.frame_index);
    updateBody = { image_urls: updatedGallery };
  }
  const { data: updated, error: uErr } = await svc
    .from("mrai_content_drafts")
    .update(updateBody)
    .eq("id", id)
    .eq("workspace_id", wsCtx.workspaceId)
    .select("id, image_url, image_urls")
    .single();
  if (uErr) {
    return NextResponse.json(
      { error: uErr.message, partial: { new_image: newImg } },
      { status: 500 },
    );
  }
  return NextResponse.json({
    draft: updated,
    frame_index: idx,
    cost_usd: result.cost_usd,
    ms: result.ms,
  });
}

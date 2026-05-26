import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  defaultFrameCountForPlatform,
  generateImagesForDraft,
} from "@/lib/mrai/content/image-gen";

export const dynamic = "force-dynamic";
export const maxDuration = 240;

const InputSchema = z.object({
  frameCount: z.number().int().min(1).max(7).optional(),
  brandHint: z.string().max(300).optional(),
});

/**
 * POST /api/mrai/content-drafts/[id]/images
 *
 * Generates N images via gpt-image-1 medium quality, uploads them to
 * Supabase Storage (`mrai-content` bucket), and updates the draft row:
 *   - image_url       → cover (frame 0)
 *   - image_urls jsonb → array of {url, frame_index, size} for all frames
 *
 * Default frame count follows platform:
 *   instagram / naver_blog: 4 (cover + 3 details)
 *   smartstore: 5
 *   tiktok / youtube: 1 (thumbnail)
 *   else: 1
 *
 * Cost: $0.042/frame (gpt-image-1 medium). Wall time ~10-20s per frame.
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
  const { data: draft, error: dErr } = await supabase
    .from("mrai_content_drafts")
    .select(
      `id, image_prompt, body_text, marketing_channel_id, variant_label,
       channel:mrai_marketing_channels!marketing_channel_id(platform, handle, bio_text, posting_style)`,
    )
    .eq("id", id)
    .eq("workspace_id", wsCtx.workspaceId)
    .single();
  if (dErr || !draft) {
    return NextResponse.json({ error: "draft_not_found" }, { status: 404 });
  }

  if (!draft.image_prompt || draft.image_prompt.trim().length < 10) {
    return NextResponse.json(
      { error: "no_image_prompt", detail: "이 드래프트에 이미지 프롬프트가 없습니다." },
      { status: 400 },
    );
  }

  const channelData = Array.isArray(draft.channel) ? draft.channel[0] : draft.channel;
  const platform = channelData?.platform ?? "other";
  const frameCount = parsed.data.frameCount ?? defaultFrameCountForPlatform(platform);

  // Build brand-hint by taking the channel's posting_style + bio (lite context for the image model).
  const brandHint = [channelData?.bio_text, channelData?.posting_style]
    .filter(Boolean)
    .join(" — ")
    .slice(0, 200);

  // Load workspace brand assets — prefer product type, fall back to any.
  // Caps at 4 so gpt-image-1's image-edit input budget isn't blown.
  const { data: refRows } = await supabase
    .from("mrai_brand_assets")
    .select("id, image_url, asset_type, label")
    .eq("workspace_id", wsCtx.workspaceId)
    .order("use_count", { ascending: true })
    .limit(8);
  const allRefs = (refRows ?? []) as Array<{
    id: string;
    image_url: string;
    asset_type: string;
    label: string | null;
  }>;
  // Prefer product references when available; fall back to whatever exists.
  const productRefs = allRefs.filter((r) => r.asset_type === "product").slice(0, 4);
  const references = productRefs.length > 0 ? productRefs : allRefs.slice(0, 4);

  let result;
  try {
    result = await generateImagesForDraft({
      workspaceId: wsCtx.workspaceId,
      draftId: id,
      prompt: draft.image_prompt,
      platform,
      frameCount,
      brandHint: brandHint || undefined,
      variantLabel: draft.variant_label,
      references: references.length > 0 ? references : undefined,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "image_gen_failed" },
      { status: 500 },
    );
  }

  // Persist URLs onto the draft. Use service client because we want to
  // bypass any auth ambiguity for this background-ish write.
  const svc = createServiceClient();
  const cover = result.images[0];
  const gallery = result.images.slice(1).map((img) => ({
    url: img.url,
    frame_index: img.frame_index,
    size: img.size,
  }));
  const { data: updated, error: uErr } = await svc
    .from("mrai_content_drafts")
    .update({
      image_url: cover?.url ?? null,
      image_urls: gallery,
    })
    .eq("id", id)
    .eq("workspace_id", wsCtx.workspaceId)
    .select("id, image_url, image_urls")
    .single();
  if (uErr) {
    return NextResponse.json(
      { error: uErr.message, partial: { images: result.images, cost_usd: result.cost_usd } },
      { status: 500 },
    );
  }

  return NextResponse.json({
    draft: updated,
    images: result.images,
    cost_usd: result.cost_usd,
    ms: result.ms,
  });
}

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
export const maxDuration = 240;

const InputSchema = z.object({
  frameCount: z.number().int().min(1).max(7).optional(),
  brandHint: z.string().max(300).optional(),
  /** Overrides draft.image_prompt for THIS generation AND persists
   *  the new prompt back to the draft (so later regens use it too). */
  image_prompt_override: z.string().trim().min(10).max(2000).optional(),
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

  // Resolve the prompt: user override (manual edit) wins, then DB value.
  const effectivePrompt =
    parsed.data.image_prompt_override?.trim() || draft.image_prompt?.trim() || "";
  if (effectivePrompt.length < 10) {
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

  // Load workspace brand assets. Pass the FULL ambassador + product
  // pools to image-gen so its per-frame random source picker has
  // every uploaded photo to rotate through. Other types still capped.
  const [ambassadorQ, productQ, otherQ] = await Promise.all([
    supabase
      .from("mrai_brand_assets")
      .select("id, image_url, asset_type, label")
      .eq("workspace_id", wsCtx.workspaceId)
      .eq("asset_type", "ambassador")
      .order("use_count", { ascending: true }),
    supabase
      .from("mrai_brand_assets")
      .select("id, image_url, asset_type, label")
      .eq("workspace_id", wsCtx.workspaceId)
      .eq("asset_type", "product")
      .order("use_count", { ascending: true }),
    supabase
      .from("mrai_brand_assets")
      .select("id, image_url, asset_type, label")
      .eq("workspace_id", wsCtx.workspaceId)
      .not("asset_type", "in", "(ambassador,product)")
      .order("use_count", { ascending: true })
      .limit(20),
  ]);
  type Ref = {
    id: string;
    image_url: string;
    asset_type: string;
    label: string | null;
  };
  const ambassadors = (ambassadorQ.data ?? []) as Ref[];
  const products = (productQ.data ?? []) as Ref[];
  const otherRefs = (otherQ.data ?? []) as Ref[];
  const pickFrom = (type: string, n: number) =>
    otherRefs.filter((r) => r.asset_type === type).slice(0, n);
  const lifestyle = pickFrom("lifestyle", 2);
  const packaging = pickFrom("packaging", 1);
  const logos = pickFrom("logo", 1); // composite-only
  let references: Ref[] = [
    ...products,
    ...ambassadors,
    ...lifestyle,
    ...packaging,
    ...logos,
  ];
  if (references.length === 0) {
    references = [
      ...products.slice(0, 4),
      ...ambassadors.slice(0, 2),
      ...otherRefs.slice(0, 2),
    ];
  }
  console.log(
    `[images-route] pools — ambassador=${ambassadors.length}, product=${products.length} (full library)`,
  );

  const userSettings = await loadImageGenSettings(wsCtx.workspaceId);

  let result;
  try {
    result = await generateImagesForDraft({
      workspaceId: wsCtx.workspaceId,
      draftId: id,
      prompt: effectivePrompt,
      platform,
      frameCount,
      brandHint: brandHint || undefined,
      variantLabel: draft.variant_label,
      references: references.length > 0 ? references : undefined,
      settings: userSettings ?? undefined,
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
  const updatePayload: {
    image_url: string | null;
    image_urls: typeof gallery;
    image_prompt?: string;
  } = {
    image_url: cover?.url ?? null,
    image_urls: gallery,
  };
  // If user edited the prompt, persist it so future regens use it too.
  if (parsed.data.image_prompt_override?.trim()) {
    updatePayload.image_prompt = parsed.data.image_prompt_override.trim();
  }
  const { data: updated, error: uErr } = await svc
    .from("mrai_content_drafts")
    .update(updatePayload)
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

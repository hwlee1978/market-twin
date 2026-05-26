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

  // Load workspace brand assets — mix product + logo + lifestyle so the
  // image generator can show the real product wearing the real brand logo
  // (not the material tech name like "H1-TEX"). Cap at 4 to stay within
  // gpt-image-1's image-edit input budget.
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
  // Priority for the 4-slot reference set, in marketing-effect order:
  //   1. Ambassador (contracted celebrity/model) — face MUST appear in
  //      output. User explicitly flagged this as the highest-leverage
  //      asset: "광고 계약된 연예인이 expose되면 더 효과 있음".
  //   2. Logo — brand mark must appear on the product.
  //   3. Product — silhouette/colorway reference.
  //   4. Lifestyle or packaging — for scene continuity.
  //
  // Up to 2 ambassador refs allowed when available (one face shot +
  // one full-body), then 1 logo, 1 product. Falls back through queue
  // when buckets are empty.
  const pickFrom = (type: string, n: number) =>
    allRefs.filter((r) => r.asset_type === type).slice(0, n);
  const ambassadors = pickFrom("ambassador", 2);
  const logos = pickFrom("logo", 1);
  const products = pickFrom("product", ambassadors.length >= 2 ? 1 : 2);
  const lifestyle = pickFrom("lifestyle", 1);
  const packaging = pickFrom("packaging", 1);
  let references = [
    ...ambassadors,
    ...logos,
    ...products,
    ...lifestyle,
    ...packaging,
  ].slice(0, 4);
  if (references.length === 0) references = allRefs.slice(0, 4);

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

import OpenAI from "openai";
import { createServiceClient } from "@/lib/supabase/server";
import { getPlatformSpec, type Platform } from "./platform-rules";

/**
 * Image generator — Sprint 4 of Phase 9.
 *
 * Uses OpenAI gpt-image-1 (quality=medium) to generate platform-shaped
 * imagery from a draft's image_prompt. Uploads to Supabase Storage
 * bucket `mrai-content` and returns public URLs.
 *
 * Per-platform aspect ratios:
 *   - X / Facebook / LinkedIn:  1536x1024 (1.5:1 landscape)
 *   - Instagram / Threads:      1024x1024 (1:1) or 1024x1536 (2:3 portrait)
 *   - YouTube thumbnail:        1536x1024 (16:9)
 *   - TikTok / Reels:           1024x1536 (9:16 portrait)
 *   - Naver Blog/Smartstore:    1024x1024 default
 *
 * gpt-image-1 size options: 1024x1024 / 1024x1536 / 1536x1024.
 */

export type ImageGenInput = {
  prompt: string;
  platform: string;
  frameCount: number;          // 1 = cover only, 2+ = carousel
  brandHint?: string;           // brand voice fragment to enrich prompt
  variantLabel?: string;
};

export type GeneratedImage = {
  url: string;
  path: string;          // storage path (for cleanup)
  frame_index: number;
  size: string;
};

export type ImageGenResult = {
  images: GeneratedImage[];
  cost_usd: number;
  ms: number;
};

const COST_PER_IMAGE_MEDIUM = 0.042; // gpt-image-1 medium quality, all sizes

function aspectFor(platform: string): "1024x1024" | "1024x1536" | "1536x1024" {
  const p = platform as Platform;
  if (p === "x_twitter" || p === "facebook" || p === "linkedin" || p === "youtube") {
    return "1536x1024";
  }
  if (p === "tiktok") {
    return "1024x1536";
  }
  // Instagram, threads, naver_blog, naver_smartstore, kakao_channel, reddit, other → square
  return "1024x1024";
}

function buildFramePrompt(
  basePrompt: string,
  platform: string,
  frameIndex: number,
  totalFrames: number,
  brandHint?: string,
): string {
  const spec = getPlatformSpec(platform);
  const parts: string[] = [];

  if (totalFrames === 1) {
    parts.push(`Editorial brand image for ${spec.label}. ${basePrompt}`);
  } else if (frameIndex === 0) {
    parts.push(
      `Cover image (frame 1 of ${totalFrames}) for a ${spec.label} carousel. Must work as a thumbnail/hook. ${basePrompt}`,
    );
  } else {
    const detailRoles = [
      "Detail shot — product texture / fabric close-up",
      "Lifestyle shot — product worn in real environment",
      "Comparison or before-after shot",
      "Behind-the-scenes / atelier shot",
      "Final CTA card with subtle text (≤4 English words)",
    ];
    const role = detailRoles[(frameIndex - 1) % detailRoles.length];
    parts.push(
      `Carousel frame ${frameIndex + 1} of ${totalFrames} for ${spec.label}. ${role}. Visual continuity with cover. ${basePrompt}`,
    );
  }

  if (brandHint) {
    parts.push(`Brand voice: ${brandHint}.`);
  }
  parts.push(
    "Photographic, editorial fashion magazine aesthetic. Natural lighting. No fake text overlays. No watermarks. No collages.",
  );
  return parts.join(" ");
}

async function uploadToStorage(
  base64: string,
  workspaceId: string,
  draftId: string,
  frameIndex: number,
): Promise<{ url: string; path: string }> {
  const supabase = createServiceClient();
  const buffer = Buffer.from(base64, "base64");
  const path = `${workspaceId}/${draftId}/frame-${frameIndex}-${Date.now()}.png`;
  const { error: upErr } = await supabase.storage
    .from("mrai-content")
    .upload(path, buffer, {
      contentType: "image/png",
      cacheControl: "31536000", // 1 year
      upsert: false,
    });
  if (upErr) {
    throw new Error(`storage upload failed: ${upErr.message}`);
  }
  const { data: pub } = supabase.storage.from("mrai-content").getPublicUrl(path);
  return { url: pub.publicUrl, path };
}

export async function generateImagesForDraft(input: {
  workspaceId: string;
  draftId: string;
  prompt: string;
  platform: string;
  frameCount: number;
  brandHint?: string;
  variantLabel?: string;
}): Promise<ImageGenResult> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not set");
  }
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const t0 = Date.now();
  const size = aspectFor(input.platform);
  const frames = Math.min(Math.max(input.frameCount, 1), 7);

  const images: GeneratedImage[] = [];
  // Sequential generation — gpt-image-1 has aggressive rate limits and
  // we want frame N to remember frame N-1's prompt thread for visual
  // continuity. Latency: ~10-20s per frame.
  for (let i = 0; i < frames; i++) {
    const framePrompt = buildFramePrompt(
      input.prompt,
      input.platform,
      i,
      frames,
      input.brandHint,
    );
    const res = await openai.images.generate({
      model: "gpt-image-1",
      prompt: framePrompt,
      size,
      quality: "medium",
      n: 1,
    });
    const b64 = res.data?.[0]?.b64_json;
    if (!b64) {
      throw new Error(`gpt-image-1 returned no image for frame ${i}`);
    }
    const uploaded = await uploadToStorage(b64, input.workspaceId, input.draftId, i);
    images.push({
      url: uploaded.url,
      path: uploaded.path,
      frame_index: i,
      size,
    });
  }

  return {
    images,
    cost_usd: Number((frames * COST_PER_IMAGE_MEDIUM).toFixed(4)),
    ms: Date.now() - t0,
  };
}

export function defaultFrameCountForPlatform(platform: string): number {
  const p = platform as Platform;
  if (p === "instagram") return 4;       // cover + 3 details (user's choice)
  if (p === "naver_blog") return 4;       // cover + 3 inline
  if (p === "naver_smartstore") return 5; // main + 4 detail
  if (p === "tiktok" || p === "youtube") return 1; // thumbnail only
  return 1;
}

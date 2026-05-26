import OpenAI from "openai";
import { toFile } from "openai/uploads";
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
  hasReferences = false,
  hasLogoReference = false,
  hasAmbassadorReference = false,
): string {
  const spec = getPlatformSpec(platform);
  const parts: string[] = [];

  if (hasReferences) {
    parts.push(
      "Use the attached reference photos as the authoritative source for product appearance (silhouette, color, material, branding). DO NOT invent a different product. The generated image must look like the SAME product as the references, just in a different scene / angle / framing.",
    );
  }
  if (hasLogoReference) {
    parts.push(
      "One of the references is the brand LOGO. The product in the generated image MUST carry this exact brand logo (in the same position the references show — e.g. shoe tongue, heel patch, side stamp). The logo must be readable but not over-sized.",
    );
  }
  if (hasAmbassadorReference) {
    parts.push(
      "CRITICAL: One or more references contain a contracted brand AMBASSADOR (real celebrity or model under advertising contract). You MUST preserve their exact face, hairstyle, body proportions, skin tone, eye color, and any signature features — they are the most marketing-valuable asset in this content. Do NOT invent a different person, generic model, or generic Asian/Western model — render the SAME individual from the reference, in a different pose / scene / outfit / framing if the prompt asks for one, but ALWAYS the same identifiable face. If the reference shows a partial figure (e.g. just torso), you may extrapolate the rest of the body but the face must match. If you cannot maintain face fidelity, prefer to crop the face out (back-of-head, lower-body-only) rather than substitute a different person.",
    );
  }

  if (totalFrames === 1) {
    parts.push(`Editorial brand image for ${spec.label}. ${basePrompt}`);
  } else if (frameIndex === 0) {
    parts.push(
      `Cover image (frame 1 of ${totalFrames}) for a ${spec.label} carousel. Must work as a thumbnail/hook. ${basePrompt}`,
    );
  } else {
    const detailRoles = [
      "Detail shot — product texture / material close-up",
      "Lifestyle shot — product worn in real environment",
      "Different angle of the same product (3/4, top-down, sole detail for shoes)",
      "Behind-the-scenes / atelier / packaging shot",
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
    "Photographic, editorial fashion magazine aesthetic. Natural lighting.",
  );
  // Hard constraints — common AI-image failure modes for fashion product shots.
  parts.push(
    "DO NOT render any technical material trademarks or fabric tech names as visible text on the product (e.g. 'H1-TEX', 'Gore-Tex', 'Merino', '100% Wool'). Only the brand's own consumer-facing logo (from the reference) may appear. No watermarks. No fake reviews. No collages or multi-panel layouts. No invented certification badges.",
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

export type BrandReference = {
  id: string;
  image_url: string;
  asset_type: string;
  label: string | null;
};

async function fetchAsFile(url: string, name: string): Promise<File> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`reference fetch failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const mime = res.headers.get("content-type") ?? "image/png";
  return toFile(buf, name, { type: mime });
}

export async function generateImagesForDraft(input: {
  workspaceId: string;
  draftId: string;
  prompt: string;
  platform: string;
  frameCount: number;
  brandHint?: string;
  variantLabel?: string;
  references?: BrandReference[];   // workspace brand assets to use as visual reference
}): Promise<ImageGenResult> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not set");
  }
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const t0 = Date.now();
  const size = aspectFor(input.platform);
  const frames = Math.min(Math.max(input.frameCount, 1), 7);
  const refs = (input.references ?? []).slice(0, 4); // cap to 4 to stay under gpt-image-1's input budget

  // Pre-fetch reference images once; reuse across all frame calls.
  const refFiles: File[] = [];
  if (refs.length > 0) {
    for (let i = 0; i < refs.length; i++) {
      try {
        refFiles.push(await fetchAsFile(refs[i].image_url, `ref-${i}.png`));
      } catch (e) {
        console.warn(`[image-gen] skipping reference ${i}:`, e instanceof Error ? e.message : e);
      }
    }
  }

  const images: GeneratedImage[] = [];
  const usedReferenceIds = new Set<string>();
  const hasLogo = refs.some((r) => r.asset_type === "logo");
  // Sequential generation — gpt-image-1 has aggressive rate limits and
  // we want frame N to remember frame N-1's prompt thread for visual
  // continuity. Latency: ~15-25s per frame with references.
  for (let i = 0; i < frames; i++) {
    const framePrompt = buildFramePrompt(
      input.prompt,
      input.platform,
      i,
      frames,
      input.brandHint,
      refs.length > 0,
      hasLogo,
    );

    let res;
    if (refFiles.length > 0) {
      // IMAGE EDIT mode — gpt-image-1 grounds the output on the reference
      // photos so the generated marketing imagery actually matches the
      // brand's real product.
      res = await openai.images.edit({
        model: "gpt-image-1",
        image: refFiles,
        prompt: framePrompt,
        size,
        quality: "medium",
        n: 1,
      });
      // Track which references were "used" (we sent all of them with
      // each frame — count once per generation).
      if (i === 0) refs.forEach((r) => usedReferenceIds.add(r.id));
    } else {
      // No references uploaded → fall back to text-only generate (lower
      // brand fidelity but doesn't block the user).
      res = await openai.images.generate({
        model: "gpt-image-1",
        prompt: framePrompt,
        size,
        quality: "medium",
        n: 1,
      });
    }
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

  // Increment use_count on the references we actually used. Fire-and-
  // forget — not fatal if it fails.
  if (usedReferenceIds.size > 0) {
    const svc = createServiceClient();
    void svc
      .rpc("increment_brand_asset_use_count", { p_ids: Array.from(usedReferenceIds) })
      .then(({ error }: { error: { message: string } | null }) => {
        if (error) {
          // Fallback: per-row update if the RPC isn't defined yet
          for (const aid of usedReferenceIds) {
            void svc
              .from("mrai_brand_assets")
              .update({ use_count: 1, last_used_at: new Date().toISOString() })
              .eq("id", aid);
          }
        }
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

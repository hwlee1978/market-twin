import OpenAI from "openai";
import { toFile } from "openai/uploads";
import { createServiceClient } from "@/lib/supabase/server";
import { getPlatformSpec, type Platform } from "./platform-rules";
import { compositeLogoOnImage } from "./composite-logo";

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

  // ─── CRITICAL VISUAL RULES — top of the prompt so the model can't
  // forget by the time it reads later instructions ───────────────────
  if (hasLogoReference) {
    parts.push(
      "VISUAL RULE — PRODUCT TEXT/LOGO: The product surface (e.g. shoe upper, side, tongue, heel for footwear) MUST carry ONLY the exact brand logo from the attached reference image, in the same position references show. EXACT MATCH ONLY — same shape, same letterforms, same proportions. Do NOT invent or alter the brand name. Do NOT render any other text on the product (no material tech names like 'H1-TEX' / 'Gore-Tex' / 'Merino' / '100% Wool', no sub-brand names, no certifications, no taglines). If you cannot reproduce the exact logo letterforms, crop / angle the product so the logo isn't visible rather than write a wrong / garbled version.",
    );
  } else {
    parts.push(
      "VISUAL RULE — NO TEXT ON PRODUCT: There is NO logo reference attached. The product surface (e.g. shoe upper, side, tongue, heel) MUST be COMPLETELY CLEAN — no printed text, no brand marks, no logos, no material trademarks (H1-TEX / Gore-Tex / Merino / etc.), no certification badges, no invented letter shapes. ZERO text on the product. The brand mark will be added in post-production. Hallucinated brand text (e.g. fake Latin-script garbled like 'Lachiisoan') is the #1 failure mode — avoid at all cost.",
    );
  }

  if (hasReferences) {
    parts.push(
      "Use the attached reference photos as the authoritative source for product appearance (silhouette, color, material). DO NOT invent a different product. The generated image must look like the SAME product as the references, just in a different scene / angle / framing.",
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
    // Note: removed the old "CTA card with subtle text" role — it was
    // actively asking the model to render text, and gpt-image-1 produces
    // garbled letters far more often than legible ones.
    const detailRoles = [
      "Detail shot — product texture / material close-up (no text)",
      "Lifestyle shot — product worn in real environment (no signage / price tags / labels visible)",
      "Different angle of the same product (3/4, top-down, sole detail for shoes — no text)",
      "Behind-the-scenes / atelier shot (no shop signage, no whiteboard text)",
      "Pure-color background composition with the product as hero (no text, no badges)",
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

  // ─── HARD NO-TEXT RULE — gpt-image-1 is unreliable at text rendering
  // (especially Korean / CJK / numbers). Garbled fake letters like
  // "Bredisn", "Lachiisoan", random digits on scales/price tags etc.
  // ruin every campaign. So we ban ALL incidental text rendering and
  // the user's actual logo (if any) is the ONLY permitted text. Even
  // that should be omitted if the model can't reproduce the exact
  // letterforms.
  parts.push(
    `ABSOLUTE NO-TEXT RULE: Do not render ANY of the following as visible text in the image —
- Material trademarks: H1-TEX, Gore-Tex, Merino, 100% Wool, etc.
- Random Latin / Korean / Chinese / Japanese letter shapes anywhere (shoes, walls, signage, scales, displays, price tags, packaging, whiteboards, books, screens, name tags).
- Numbers on devices (no scales showing "6027", no displays showing arbitrary digits, no price tags with prices).
- Invented sub-brand names, certifications, awards, ratings, taglines.
- Any letterforms on the product surface other than the brand's exact logo from the reference image.
If you cannot reproduce the exact reference logo, OMIT IT — show a clean unbranded surface or crop the product so the logo area is out of frame. Garbled letters are WORSE than no logo. Choose composition / framing / angle that avoids text-bearing surfaces entirely.`,
  );
  parts.push(
    "No watermarks. No fake reviews or testimonials. No collages or multi-panel layouts. No invented certification badges.",
  );
  return parts.join(" ");
}

async function uploadToStorage(
  buffer: Buffer,
  workspaceId: string,
  draftId: string,
  frameIndex: number,
): Promise<{ url: string; path: string }> {
  const supabase = createServiceClient();
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
  const logoRef = refs.find((r) => r.asset_type === "logo");
  const hasLogo = !!logoRef;
  // Pre-fetch logo buffer once for post-production composite (avoids
  // hitting Storage CDN per-frame).
  let logoBufferForComposite: Buffer | null = null;
  if (logoRef) {
    try {
      const r = await fetch(logoRef.image_url);
      if (r.ok) logoBufferForComposite = Buffer.from(await r.arrayBuffer());
    } catch (e) {
      console.warn("[image-gen] logo prefetch failed:", e instanceof Error ? e.message : e);
    }
  }
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
    let finalBuffer: Buffer = Buffer.from(b64, "base64") as Buffer;
    // Post-production logo composite — guarantees a correct brand mark
    // appears in every frame (gpt-image-1 can't reliably render text,
    // so we let it generate a clean unbranded product and stamp the
    // real logo PNG on top).
    if (logoBufferForComposite) {
      try {
        finalBuffer = await compositeLogoOnImage(
          finalBuffer,
          { buffer: logoBufferForComposite },
          {
            position: "bottom-right",
            size_pct: 11,
            opacity: 1.0,
            padding_pct: 3.5,
            with_backdrop: true,
          },
        );
      } catch (e) {
        // Composite failure should never break the whole generation —
        // fall back to the AI image as-is.
        console.warn(
          `[image-gen] logo composite failed on frame ${i}:`,
          e instanceof Error ? e.message : e,
        );
      }
    }
    const uploaded = await uploadToStorage(
      finalBuffer,
      input.workspaceId,
      input.draftId,
      i,
    );
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

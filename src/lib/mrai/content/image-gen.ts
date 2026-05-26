import OpenAI from "openai";
import { toFile } from "openai/uploads";
import { createServiceClient } from "@/lib/supabase/server";
import { getPlatformSpec, type Platform } from "./platform-rules";
import { compositeLogoOnImage } from "./composite-logo";
import { detectLogoPlacement } from "./logo-placement";

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

  // ─── ABSOLUTE VISUAL RULE — applies whether or not a logo exists.
  // Logo is always added via post-production composite (sharp overlay),
  // NEVER painted by the model. The model's job is to produce a
  // completely UNBRANDED product. Any letter/text the model paints on
  // the product will be wrong (garbled "Le Misdard" / "Lachiisoan" /
  // "Bredisn" type hallucinations are the universal failure mode).
  parts.push(
    "VISUAL RULE — UNBRANDED PRODUCT: The product (e.g. shoe upper, side, tongue, heel, sole) MUST be COMPLETELY CLEAN with ZERO text or logo anywhere on its surface. Imagine a factory-fresh sample BEFORE the branding/printing step. NO printed text, NO brand marks, NO embroidered names, NO material trademarks (H1-TEX / Gore-Tex / Merino / 100% Wool), NO certification badges, NO invented letter shapes (e.g. 'Le Misdard', 'Lachiisoan', 'Bredisn' style hallucinations). The brand logo is added separately via post-production overlay — do NOT paint it. Hallucinated brand text on the product is the #1 failure mode and will ruin the campaign.",
  );
  if (hasLogoReference) {
    parts.push(
      "Note: a brand logo will be composited as a small corner watermark AFTER generation. You do NOT need to include the logo anywhere in this image. Focus on a clean unbranded product.",
    );
  }

  if (hasReferences) {
    parts.push(
      "PRODUCT FIDELITY (CRITICAL): The first 1-2 reference photos show the EXACT real product. The product in your output MUST match those references in: silhouette outline, upper material/texture (felted wool? leather? mesh?), lace placement and count, eyelet positions, sole shape and thickness, stitching pattern, color/colorway. DO NOT generalize to a different sneaker style. DO NOT switch to a different colorway. DO NOT change the silhouette. Treat the references as a strict blueprint — the only freedom you have is scene / angle / framing / lighting / model wearing it.",
    );
  }
  if (hasAmbassadorReference) {
    parts.push(
      "CRITICAL: One or more references contain a contracted brand AMBASSADOR (real celebrity or model under advertising contract). You MUST preserve their exact face, hairstyle, body proportions, skin tone, eye color, and any signature features — they are the most marketing-valuable asset in this content. Do NOT invent a different person, generic model, or generic Asian/Western model — render the SAME individual from the reference, in a different pose / scene / outfit / framing if the prompt asks for one, but ALWAYS the same identifiable face. If the reference shows a partial figure (e.g. just torso), you may extrapolate the rest of the body but the face must match. If you cannot maintain face fidelity, prefer to crop the face out (back-of-head, lower-body-only) rather than substitute a different person.",
    );
  }

  if (totalFrames === 1) {
    parts.push(
      `Hero brand image for ${spec.label}. The product MUST be the dominant subject, occupying at least 40% of the frame, in sharp focus, matching the reference photos exactly. ${basePrompt}`,
    );
  } else if (frameIndex === 0) {
    parts.push(
      `Cover image (frame 1 of ${totalFrames}) for a ${spec.label} carousel. The product MUST be the dominant subject (≥45% of frame), centered and in sharp focus, on a clean uncluttered background. Match the reference photos exactly (silhouette, color, material). NO people in this frame. ${basePrompt}`,
    );
  } else {
    // Role-specific prompts — each one explicitly mandates what MUST be
    // visible so we don't get the "lifestyle frame with no shoes visible"
    // failure mode. Avoid roles that demand text rendering.
    const detailRoles = [
      "Detail close-up — fabric/material texture of the product, NO people, NO text, fills frame with the product surface only",
      "Lifestyle shot — the product MUST be clearly visible and in sharp focus, occupying at least 25% of frame. If a person is shown (e.g. walking), their feet wearing the shoes MUST be in frame and prominent. If the head is shown, the face MUST be visible (not cropped, not blurred, not back-of-head). Choose: full-body shot OR feet-down crop, NOT a torso-only shot where neither face nor shoes appear",
      "Different angle of the same product (3/4 view, top-down, OR sole detail). NO people, NO text. The product silhouette must clearly match the reference photos",
      "Hero pure-color background — the product centered, dramatic lighting, NO people, NO text. The product silhouette must match references exactly",
      "Product paired with a complementary object (e.g. shoebox, plant, simple chair). The product must remain the dominant subject ≥35% of frame. NO people, NO text",
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

/**
 * Frame roles → which reference types matter for that frame.
 *
 * The model gets confused when it has to blend a person photo with a
 * product photo. So we send role-appropriate references per frame:
 *   - cover / detail / hero / product-paired → PRODUCT ONLY (no people)
 *   - lifestyle → product + ambassador (and prompt demands both visible)
 *
 * For non-shoe categories this still works: replace "product" with
 * "main item being marketed".
 */
function pickRefsForFrame(
  allRefs: BrandReference[],
  totalFrames: number,
  frameIndex: number,
): BrandReference[] {
  const byType = (t: string) => allRefs.filter((r) => r.asset_type === t);
  const products = byType("product");
  const ambassadors = byType("ambassador");
  const lifestyle = byType("lifestyle");
  const packaging = byType("packaging");

  // Single-frame generation → product-anchored hero
  if (totalFrames === 1) {
    return [...products.slice(0, 2), ...packaging.slice(0, 1)].slice(0, 3);
  }

  // Cover → strictly product
  if (frameIndex === 0) {
    return [...products.slice(0, 3), ...packaging.slice(0, 1)].slice(0, 3);
  }

  // detailRoles index = (frameIndex - 1) % 5
  // 0=detail, 1=lifestyle, 2=different-angle, 3=hero, 4=paired
  const roleIdx = (frameIndex - 1) % 5;
  if (roleIdx === 1) {
    // Lifestyle — product + ambassador both needed
    return [
      ...products.slice(0, 1),
      ...ambassadors.slice(0, 1),
      ...lifestyle.slice(0, 1),
    ].slice(0, 3);
  }
  // All other detail roles — product only (no people, no scene clutter)
  return [...products.slice(0, 2), ...packaging.slice(0, 1)].slice(0, 3);
}

export type ImageGenSettings = {
  logo_position: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center";
  logo_size_pct: number;
  logo_padding_pct: number;
  logo_opacity: number;
  logo_with_backdrop: boolean;
  logo_composite_enabled: boolean;
  /** product_surface = Vision-detect + place on product naturally.
   *  corner_watermark = fixed bottom-right (cheap, reliable). */
  logo_placement_mode: "product_surface" | "corner_watermark";
  prompt_strictness: "creative" | "balanced" | "strict";
  quality: "low" | "medium" | "high";
};

const DEFAULT_SETTINGS: ImageGenSettings = {
  logo_position: "bottom-right",
  logo_size_pct: 11,
  logo_padding_pct: 3.5,
  logo_opacity: 1.0,
  logo_with_backdrop: true,
  logo_composite_enabled: true,
  logo_placement_mode: "product_surface",
  prompt_strictness: "strict",
  quality: "medium",
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
  settings?: Partial<ImageGenSettings>;
  /** When set, generate only the single frame at this index and return
   * just that one. Used by the per-frame regenerate endpoint. */
  singleFrameIndex?: number;
}): Promise<ImageGenResult> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not set");
  }
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const t0 = Date.now();
  const size = aspectFor(input.platform);
  const totalFrames = Math.min(Math.max(input.frameCount, 1), 7);
  const settings: ImageGenSettings = { ...DEFAULT_SETTINGS, ...input.settings };
  // Cap at 5 here so caller can include logo (filtered out below for
  // model input) without losing a non-logo slot. Effective gpt-image-1
  // input is still ≤4 after logo filter.
  // Accept all refs (caller may pass more than 4); per-frame logic
  // picks the right subset based on role.
  const allRefs = input.references ?? [];

  const logoRef = allRefs.find((r) => r.asset_type === "logo");
  // Logo is HANDLED ENTIRELY BY POST-PRODUCTION COMPOSITE (sharp overlay).
  // We deliberately do NOT pass the logo to gpt-image-1 as a reference,
  // because doing so trains the model to paint a (garbled) version of
  // it onto the product surface ("Le Misdard" / "Lachiisoan" / etc.).
  // The composite stamps the real PNG on top after generation.
  const willComposite = !!logoRef && settings.logo_composite_enabled;
  const hasLogo = willComposite; // for prompt-builder flag

  // Pre-fetch ALL non-logo references once (used across frames per role).
  const nonLogoRefs = allRefs.filter((r) => r.asset_type !== "logo");
  const fileByRefId = new Map<string, File>();
  for (let i = 0; i < nonLogoRefs.length; i++) {
    try {
      const f = await fetchAsFile(nonLogoRefs[i].image_url, `ref-${i}.png`);
      fileByRefId.set(nonLogoRefs[i].id, f);
    } catch (e) {
      console.warn(`[image-gen] skipping reference:`, e instanceof Error ? e.message : e);
    }
  }

  const images: GeneratedImage[] = [];
  const usedReferenceIds = new Set<string>();
  // Pre-fetch logo buffer once for post-production composite (avoids
  // hitting Storage CDN per-frame).
  let logoBufferForComposite: Buffer | null = null;
  if (logoRef && settings.logo_composite_enabled) {
    try {
      const r = await fetch(logoRef.image_url);
      if (r.ok) logoBufferForComposite = Buffer.from(await r.arrayBuffer());
    } catch (e) {
      console.warn("[image-gen] logo prefetch failed:", e instanceof Error ? e.message : e);
    }
  }
  // Determine frame range — full generation OR single-frame regenerate
  const frameIndices: number[] =
    typeof input.singleFrameIndex === "number"
      ? [Math.max(0, Math.min(input.singleFrameIndex, totalFrames - 1))]
      : Array.from({ length: totalFrames }, (_, i) => i);

  // Sequential generation — gpt-image-1 has aggressive rate limits and
  // we want frame N to remember frame N-1's prompt thread for visual
  // continuity. Latency: ~15-25s per frame with references.
  for (const i of frameIndices) {
    // Pick role-appropriate references for this frame
    const frameRefs = pickRefsForFrame(nonLogoRefs, totalFrames, i);
    const refFiles: File[] = frameRefs
      .map((r) => fileByRefId.get(r.id))
      .filter((f): f is File => Boolean(f));
    const hasAmbassador = frameRefs.some((r) => r.asset_type === "ambassador");

    const framePrompt = buildFramePrompt(
      input.prompt,
      input.platform,
      i,
      totalFrames,
      input.brandHint,
      frameRefs.length > 0,
      hasLogo,
      hasAmbassador,
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
        quality: settings.quality,
        n: 1,
      });
      // Track which references were "used" (we sent all of them with
      // each frame — count once per generation. Logo also tracked via
      // composite path below.
      frameRefs.forEach((r) => usedReferenceIds.add(r.id));
    } else {
      // No references uploaded → fall back to text-only generate (lower
      // brand fidelity but doesn't block the user).
      res = await openai.images.generate({
        model: "gpt-image-1",
        prompt: framePrompt,
        size,
        quality: settings.quality,
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
        let explicit:
          | { x: number; y: number; width: number; height?: number; rotation_deg?: number }
          | undefined;
        if (settings.logo_placement_mode === "product_surface") {
          // Run vision detection on the AI-generated frame.
          const placement = await detectLogoPlacement(finalBuffer);
          if (placement.found && (placement.confidence ?? 0) >= 0.55) {
            explicit = {
              x: placement.x!,
              y: placement.y!,
              width: placement.width!,
              height: placement.height,
              rotation_deg: placement.rotation_deg,
            };
            console.log(
              `[image-gen] vision placed logo on frame ${i}: ${placement.location} ` +
                `(${placement.x},${placement.y}) ${placement.width}×${placement.height} ` +
                `rot=${placement.rotation_deg}° conf=${placement.confidence}`,
            );
          } else {
            console.warn(
              `[image-gen] vision detect failed/low-conf on frame ${i} — falling back to corner watermark. notes=${placement.notes}`,
            );
          }
        }
        finalBuffer = await compositeLogoOnImage(
          finalBuffer,
          { buffer: logoBufferForComposite },
          explicit
            ? {
                opacity: settings.logo_opacity,
                with_backdrop: false,
                explicit,
              }
            : {
                position: settings.logo_position,
                size_pct: settings.logo_size_pct,
                opacity: settings.logo_opacity,
                padding_pct: settings.logo_padding_pct,
                with_backdrop: settings.logo_with_backdrop,
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
    cost_usd: Number((images.length * COST_PER_IMAGE_MEDIUM).toFixed(4)),
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

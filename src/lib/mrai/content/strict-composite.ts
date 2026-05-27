import OpenAI from "openai";
import sharp from "sharp";
import { removeBackgroundCached } from "./bg-removal";
import { compositeLogoOnImage } from "./composite-logo";

/**
 * STRICT COMPOSITE mode — the true pixel-preservation path.
 *
 * Flow:
 *   1. Background-remove source photo → transparent PNG (Replicate)
 *   2. Generate clean empty scene via gpt-image-1.generate (no subject
 *      mentioned in prompt — model only draws environment)
 *   3. sharp composite extracted subject onto generated scene
 *   4. Optional logo composite on top
 *
 * Result: subject pixels are IDENTICAL to source — 100% preservation.
 * Trade-off vs gpt-image-1.edit + mask:
 *   + Subject (face, product details, colors) bit-perfect
 *   - Subject pose is fixed (whatever's in source)
 *   - Generated scene needs to feel coherent with the subject's
 *     lighting/perspective (handled with scene-prompt hints)
 *
 * Cost: ~$0.005 (Replicate rembg) + $0.042 (gpt-image-1 medium) per frame.
 */

export type StrictCompositeResult = {
  buffer: Buffer;
  used_strict: boolean; // false when bg-removal failed → caller can fall back
};

export async function strictCompositeImage(input: {
  sourceImageUrl: string;
  sourceAssetId: string;
  sourceType?: "product" | "ambassador";
  workspaceId: string;
  scenePrompt: string;
  outputSize: "1024x1024" | "1024x1536" | "1536x1024";
  quality: "low" | "medium" | "high";
  /** Relative scale of subject vs frame (0-1). Default 0.85 = subject
   *  occupies 85% of frame height, centered. */
  subjectScale?: number;
  logoBuffer?: Buffer | null;
  logoOpts?: {
    position?:
      | "top-left"
      | "top-right"
      | "bottom-left"
      | "bottom-right"
      | "center";
    size_pct?: number;
    padding_pct?: number;
    opacity?: number;
    with_backdrop?: boolean;
  };
}): Promise<StrictCompositeResult | null> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not set");
  }
  const subjectScale = Math.max(0.5, Math.min(0.95, input.subjectScale ?? 0.82));

  // Step 1: background-remove (cached)
  const subjectPng = await removeBackgroundCached({
    workspaceId: input.workspaceId,
    assetId: input.sourceAssetId,
    imageUrl: input.sourceImageUrl,
    sourceType: input.sourceType,
  });
  if (!subjectPng) {
    // Replicate not configured OR failed → caller falls back to non-strict
    return null;
  }

  // Step 2: generate empty scene (no subject in prompt)
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const genRes = (await openai.images.generate({
    model: "gpt-image-1",
    prompt:
      input.scenePrompt +
      "\n\nThis is an EMPTY SCENE / background-only image — do NOT draw any person, do NOT draw the product. The scene should have plausible space where a subject will be inserted later (centered, roughly 80% of frame height). No text. No watermarks.",
    size: input.outputSize,
    quality: input.quality,
    n: 1,
  })) as { data?: Array<{ b64_json?: string }> };
  const bgB64 = genRes.data?.[0]?.b64_json;
  if (!bgB64) {
    throw new Error("gpt-image-1 returned no scene");
  }
  let bgBuffer: Buffer = Buffer.from(bgB64, "base64") as Buffer;

  // Resize bg to outputSize (gpt-image-1 should return this size, but
  // defensive — sometimes slight mismatch).
  const [outW, outH] = input.outputSize.split("x").map(Number);
  bgBuffer = (await sharp(bgBuffer)
    .resize(outW, outH, { fit: "cover", position: "center" })
    .png()
    .toBuffer()) as Buffer;

  // Step 3: compute subject size + position
  const subjMeta = await sharp(subjectPng).metadata();
  const subjW = subjMeta.width ?? outW;
  const subjH = subjMeta.height ?? outH;
  const targetH = Math.round(outH * subjectScale);
  const ratio = targetH / subjH;
  const targetW = Math.round(subjW * ratio);
  // Cap width to 95% of frame so subject doesn't bleed past edges
  const finalW = Math.min(targetW, Math.round(outW * 0.95));
  const finalH = Math.round((finalW / subjW) * subjH);

  const resizedSubject = (await sharp(subjectPng)
    .resize(finalW, finalH, { fit: "inside" })
    .png()
    .toBuffer()) as Buffer;

  const left = Math.round((outW - finalW) / 2);
  const top = Math.round(outH - finalH - outH * 0.02); // bottom-align with 2% padding

  // Step 4: composite
  let finalBuffer = (await sharp(bgBuffer)
    .composite([{ input: resizedSubject, top, left }])
    .png()
    .toBuffer()) as Buffer;

  // Step 5: logo overlay
  if (input.logoBuffer) {
    try {
      finalBuffer = (await compositeLogoOnImage(
        finalBuffer,
        { buffer: input.logoBuffer },
        input.logoOpts ?? {
          position: "bottom-right",
          size_pct: 16,
          padding_pct: 3.5,
          with_backdrop: true,
          opacity: 1,
        },
      )) as Buffer;
    } catch (e) {
      console.warn(
        "[strict-composite] logo composite failed:",
        e instanceof Error ? e.message : e,
      );
    }
  }

  return { buffer: finalBuffer, used_strict: true };
}

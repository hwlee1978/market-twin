import OpenAI from "openai";
import sharp from "sharp";
import { compositeLogoOnImage } from "./composite-logo";

/**
 * Lifestyle image generation via gpt-image-1.edit with product
 * references (no bg-removal, no composite seam).
 *
 * When to use this instead of strict-composite:
 *   - Frame role is "lifestyle" (in-context, in-use, magazine-style)
 *   - OR the chosen source product photo has people/hands/context that
 *     bg-removal can't cleanly separate — compositing the bg-removed
 *     cutout shows rectangular crop seams of the hand etc.
 *
 * What the model does:
 *   The product reference images give it the product's appearance
 *   (silhouette, colorway, stitching, branding label). The scene
 *   prompt describes the surroundings. gpt-image-1.edit blends them
 *   into a single coherent photograph where the product looks like
 *   it was actually photographed in that environment — no composite
 *   seam, natural shadows, consistent lighting.
 *
 *   Trade-off vs strict-composite: product pixels aren't bit-perfect
 *   (model interprets the reference) but the result is FAR more
 *   natural than a rectangular cutout on a generated bg.
 *
 * Cost: ~$0.042 (gpt-image-1 medium) per frame. No bg-removal call.
 */

async function fetchAsFile(url: string, name: string): Promise<File> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${name}: ${res.status}`);
  const ab = await res.arrayBuffer();
  const contentType = res.headers.get("content-type") || "image/png";
  return new File([ab], name, { type: contentType });
}

export type LifestyleResult = {
  buffer: Buffer;
};

export async function generateLifestyleWithRefs(input: {
  productRefs: Array<{ id: string; image_url: string }>;
  scenePrompt: string;
  outputSize: "1024x1024" | "1024x1536" | "1536x1024";
  quality: "low" | "medium" | "high";
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
}): Promise<LifestyleResult> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY not set");
  }
  if (input.productRefs.length === 0) {
    throw new Error("generateLifestyleWithRefs requires at least one product ref");
  }

  // Fetch up to 4 references — more would dilute the signal and burn tokens
  const refFiles: File[] = [];
  for (let i = 0; i < Math.min(input.productRefs.length, 4); i++) {
    const r = input.productRefs[i];
    try {
      refFiles.push(await fetchAsFile(r.image_url, `ref-${i}.png`));
    } catch (e) {
      console.warn(
        `[lifestyle-gen] skipping ref ${r.id}:`,
        e instanceof Error ? e.message : e,
      );
    }
  }
  if (refFiles.length === 0) {
    throw new Error("no product references could be fetched");
  }

  const REALISM =
    "Render as a photorealistic editorial photograph: natural depth of " +
    "field, authentic camera lighting, plausible shadows on the product " +
    "consistent with the scene's light direction. No illustration, no " +
    "anime, no 3D-render look.";
  const REFERENCE_INSTRUCTION =
    "The input image(s) show the EXACT product to feature. Reproduce its " +
    "silhouette, colorway, stitching, sole shape, and overall design " +
    "faithfully — but naturally placed in the scene below. Do NOT alter " +
    "the product's design.";
  const TEXT_FREE_PRODUCT =
    "IMPORTANT — the product must be COMPLETELY UNBRANDED in this render. " +
    "Do NOT draw any text, letters, words, logos, brand marks, tags, " +
    "stitched labels, embossed names, printed names, or any writing on " +
    "the product surface anywhere — not on the sole, not on the heel, " +
    "not on the tongue, not on the pull tab, not on the side panel. " +
    "If the reference shows text on the product, OMIT that text and " +
    "render that area as plain blank material (clean rubber, clean " +
    "fabric, clean leather). No garbled letters, no fake brand names. " +
    "Brand identity is added separately as a corner stamp.";
  const COMPOSITION =
    "Composition: editorial magazine style. Subject placed at a rule-of-" +
    "thirds intersection with leading lines toward it, balanced negative " +
    "space, clear focal hierarchy, soft cinematic depth.";
  const NEGATION =
    "NO text overlays, NO writing on the product surface beyond what's " +
    "in the reference, NO watermarks, NO duplicate copies of the product " +
    "in the background. ONE product instance only.";

  const fullPrompt = [
    "Lifestyle scene: " + input.scenePrompt.trim(),
    "",
    REFERENCE_INSTRUCTION,
    "",
    TEXT_FREE_PRODUCT,
    "",
    COMPOSITION,
    "",
    REALISM,
    "",
    NEGATION,
  ].join("\n");

  console.log(
    `[lifestyle-gen] refs=${refFiles.length} scene="${input.scenePrompt.slice(0, 80)}…"`,
  );

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const editRes = (await openai.images.edit({
    model: "gpt-image-1",
    image: refFiles as unknown as File, // SDK accepts File[] at runtime
    prompt: fullPrompt,
    size: input.outputSize,
    quality: input.quality,
    n: 1,
  } as Parameters<typeof openai.images.edit>[0])) as {
    data?: Array<{ b64_json?: string }>;
  };
  const b64 = editRes.data?.[0]?.b64_json;
  if (!b64) throw new Error("gpt-image-1.edit returned no image");

  let buf: Buffer = Buffer.from(b64, "base64");

  // Resize defensively to exact output dims
  const [outW, outH] = input.outputSize.split("x").map(Number);
  buf = (await sharp(buf)
    .resize(outW, outH, { fit: "cover", position: "center" })
    .png()
    .toBuffer()) as Buffer;

  // Logo overlay
  if (input.logoBuffer) {
    try {
      buf = (await compositeLogoOnImage(
        buf,
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
        "[lifestyle-gen] logo composite failed:",
        e instanceof Error ? e.message : e,
      );
    }
  }

  return { buffer: buf };
}

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import sharp from "sharp";
import { removeBackgroundCached } from "./bg-removal";
import { compositeLogoOnImage } from "./composite-logo";

/**
 * STRICT COMPOSITE mode — the true pixel-preservation path.
 *
 * Flow:
 *   1. Background-remove source photo → transparent PNG (Replicate)
 *   2. Sanitize scene prompt: strip ALL product/merchandise mentions
 *      with a fast Claude Haiku call. gpt-image-1 hallucinates extra
 *      shoes on the floor if the prompt mentions shoes — so we feed
 *      it pure environment text.
 *   3. Generate clean empty scene via gpt-image-1.generate
 *   4. sharp composite extracted subject onto generated scene at a
 *      scale chosen from the subject's aspect ratio (full-body fills
 *      bottom; portrait sits smaller and slightly higher).
 *   5. Optional logo composite on top
 *
 * Result: subject pixels are IDENTICAL to source — 100% preservation.
 * Cost: ~$0.005 (Replicate) + ~$0.0005 (Haiku) + ~$0.042 (gpt-image-1).
 */

export type StrictCompositeResult = {
  buffer: Buffer;
  used_strict: boolean;
};

/**
 * Curated scene template catalog. gpt-image-1 cannot hallucinate
 * products when fed a known-clean environment description.
 *
 * Picking strategy: ask Claude Haiku to return ONLY a template index
 * matching the content's mood. Free-form scene generation (previous
 * approach) leaked product/material vocabulary — e.g. a Le Mouton
 * prompt produced a tight close-up of yarn/knit because the model
 * latched onto "wool texture" hints.
 */
const SCENE_TEMPLATES: Array<{ key: string; prompt: string }> = [
  {
    key: "korean-spring-park",
    prompt:
      "Sunlit Korean park path with cherry-blossom trees and soft pink petals on the ground, late-morning warm light, gentle bokeh in the background, peaceful springtime atmosphere",
  },
  {
    key: "minimalist-seoul-cafe",
    prompt:
      "Minimalist Seoul cafe interior with floor-to-ceiling windows, light wood floors, simple wooden table, hanging green plants, soft natural daylight, calm cozy vibe",
  },
  {
    key: "modern-apartment-living",
    prompt:
      "Modern Korean apartment living room with large window, wooden flooring, white linen curtains diffusing daylight, indoor plants in clay pots, calm everyday ambience",
  },
  {
    key: "weekend-morning-kitchen",
    prompt:
      "Bright weekend-morning kitchen interior with white tile walls, sunlight pouring through a sheer-curtained window, simple shelves, warm cozy mood",
  },
  {
    key: "autumn-residential-street",
    prompt:
      "Quiet residential Seoul street in autumn, golden ginkgo leaves on the pavement, low brick walls, warm late-afternoon light",
  },
  {
    key: "rooftop-evening-skyline",
    prompt:
      "Seoul rooftop terrace at golden hour, distant city skyline softly out of focus, simple concrete floor, warm amber light, calm peaceful evening",
  },
  {
    key: "bookstore-interior",
    prompt:
      "Independent bookstore interior with warm wooden shelves, soft pendant lighting, neutral cream walls, atmospheric quiet daytime mood",
  },
  {
    key: "ocean-promenade",
    prompt:
      "Sunny coastal promenade with whitewashed low wall, distant calm blue ocean and clear sky, soft breeze, light bokeh, summer afternoon",
  },
  {
    key: "studio-cyc-soft",
    prompt:
      "Bright photography studio with seamless cream cyclorama background, even soft daylight from a single large window, clean minimalist editorial look",
  },
  {
    key: "indoor-courtyard-garden",
    prompt:
      "Calm indoor courtyard garden with potted greenery, stone tile floor, white plaster walls, dappled natural light from above, serene atmosphere",
  },
  {
    key: "library-reading-room",
    prompt:
      "Quiet reading room with tall windows, neutral linen sofa, side table with a glass of water, soft afternoon light, calm focused mood",
  },
  {
    key: "winter-balcony",
    prompt:
      "Warm interior view through a balcony window, soft sunlight, neutral linen curtains, modern minimalist Korean home, peaceful winter morning",
  },
];

const DEFAULT_SCENE_INDEX = 1; // minimalist Seoul cafe

/**
 * Sanitize a user-written scene prompt with Claude Haiku.
 *
 * Goal: keep the user's lighting / mood / arrangement / specific objects
 * that ARE NOT products (magazines, plants, concrete floor, light
 * quality, color palette) and STRIP every mention of footwear, shoes,
 * sneakers, clothing, bags, the subject pair, "한 켤레", brand names.
 *
 * Returns null on hard failure → caller falls back to template catalog.
 */
async function stripProductsFromScene(rawPrompt: string): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const resp = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      system:
        "You rewrite marketing image prompts to describe ONLY the empty " +
        "environment that surrounds a product. The product itself will be " +
        "added later as a separate layer, so any mention of it in the scene " +
        "description causes hallucinated duplicates.\n\n" +
        "Rules:\n" +
        "1. KEEP: lighting, color palette, mood, surface (concrete, wood…), " +
        "spatial layout, secondary objects (magazines, plants, books, " +
        "windows, walls, sky), camera angle (top-down, eye-level…), focal " +
        "depth, aspect ratio hints.\n" +
        "2. REMOVE: shoes, sneakers, footwear, kicks, runners, trainers, " +
        "boots, sandals, knit-wool/merino references that imply the shoe, " +
        "clothing, apparel, bags, accessories, models, brand names, " +
        "'한 켤레', 'a pair', 'one pair', '제품', 'product'.\n" +
        "3. Output a single short paragraph in English describing only the " +
        "remaining environment. No headings, no preamble, no quotes.\n" +
        "4. If nothing remains after stripping, output exactly: SCENE_EMPTY",
      messages: [{ role: "user", content: rawPrompt }],
    });
    const text = resp.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .filter(Boolean)
      .join("")
      .trim();
    if (!text || text === "SCENE_EMPTY" || text.length < 15) return null;
    return text;
  } catch (e) {
    console.warn(
      "[strict-composite] strip products LLM failed:",
      e instanceof Error ? e.message : e,
    );
    return null;
  }
}

async function pickSceneTemplate(rawPrompt: string): Promise<{
  key: string;
  prompt: string;
}> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return SCENE_TEMPLATES[DEFAULT_SCENE_INDEX];
  }
  const catalog = SCENE_TEMPLATES.map(
    (t, i) => `${i}. ${t.key}: ${t.prompt.slice(0, 80)}…`,
  ).join("\n");
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const resp = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 30,
      system:
        "Pick the scene template index (0-" +
        (SCENE_TEMPLATES.length - 1) +
        ") that best matches the mood/setting hinted at by a marketing-image prompt. " +
        "Output ONLY the integer index, nothing else.\n\n" +
        "Templates:\n" +
        catalog,
      messages: [{ role: "user", content: rawPrompt.slice(0, 600) }],
    });
    const text = resp.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .filter(Boolean)
      .join("")
      .trim();
    const m = text.match(/\d+/);
    if (!m) return SCENE_TEMPLATES[DEFAULT_SCENE_INDEX];
    const idx = parseInt(m[0], 10);
    if (isNaN(idx) || idx < 0 || idx >= SCENE_TEMPLATES.length) {
      return SCENE_TEMPLATES[DEFAULT_SCENE_INDEX];
    }
    return SCENE_TEMPLATES[idx];
  } catch (e) {
    console.warn(
      "[strict-composite] scene template LLM pick failed, using default:",
      e instanceof Error ? e.message : e,
    );
    return SCENE_TEMPLATES[DEFAULT_SCENE_INDEX];
  }
}

/**
 * Pick subject scale + vertical placement from the subject's aspect
 * ratio. A full-body shot (very tall) fills 88% of frame and bottoms
 * out. A bust shot (closer to square) sits at 62% and ends near the
 * lower-third so the composite doesn't look like a head floating on
 * a corridor.
 */
function pickSubjectLayout(subjW: number, subjH: number): {
  scaleH: number;
  bottomPaddingPct: number;
} {
  const ratio = subjH / subjW;
  if (ratio >= 2.2) {
    // Tall full-body shot
    return { scaleH: 0.9, bottomPaddingPct: 0.01 };
  }
  if (ratio >= 1.6) {
    // 3/4-body
    return { scaleH: 0.82, bottomPaddingPct: 0.02 };
  }
  if (ratio >= 1.2) {
    // Half-body / waist-up
    return { scaleH: 0.7, bottomPaddingPct: 0.05 };
  }
  // Bust / close-up portrait
  return { scaleH: 0.6, bottomPaddingPct: 0.08 };
}

export async function strictCompositeImage(input: {
  sourceImageUrl: string;
  sourceAssetId: string;
  sourceType?: "product" | "ambassador";
  workspaceId: string;
  scenePrompt: string;
  outputSize: "1024x1024" | "1024x1536" | "1536x1024";
  quality: "low" | "medium" | "high";
  /** Override the aspect-ratio-derived scale (rarely used). */
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

  // Step 1: background-remove (cached)
  const subjectPng = await removeBackgroundCached({
    workspaceId: input.workspaceId,
    assetId: input.sourceAssetId,
    imageUrl: input.sourceImageUrl,
    sourceType: input.sourceType,
  });
  if (!subjectPng) return null;

  // Step 2: build the scene prompt for gpt-image-1.
  //
  // Even with strong negation, gpt-image-1 still draws shoes/products
  // when the user's prompt itself mentions them ("minimalist knit wool
  // sneakers on concrete floor"). So we sanitize the user prompt with
  // Claude Haiku first — strip product/brand/clothing nouns, keep
  // environment / mood / lighting / arrangement. Result is a clean
  // scene description that the subject (bg-removed product) can be
  // composited onto without ghost duplicates.
  //
  // Fallback: when the prompt is empty or sanitization fails, use the
  // curated 12-entry catalog (Haiku picks closest mood).
  const trimmedScene = (input.scenePrompt ?? "").trim();
  let basePrompt: string;
  let modeLabel: string;
  if (trimmedScene.length >= 40) {
    const stripped = await stripProductsFromScene(trimmedScene);
    if (stripped) {
      basePrompt = stripped;
      modeLabel = "user-prompt-stripped";
    } else {
      const tpl = await pickSceneTemplate(trimmedScene);
      basePrompt = tpl.prompt;
      modeLabel = `template-fallback:${tpl.key}`;
    }
  } else {
    const tpl = await pickSceneTemplate(trimmedScene);
    basePrompt = tpl.prompt;
    modeLabel = `template:${tpl.key}`;
  }
  console.log(
    `[strict-composite] scene mode=${modeLabel} prompt="${basePrompt.slice(0, 140)}…"`,
  );

  const REALISM_BAKE =
    "Render as a PHOTOREALISTIC photograph — natural depth of field, " +
    "authentic camera lighting, realistic textures and shadows. " +
    "No illustration, no anime, no 3D-render look, no painted style.";
  // NOTE: do NOT hint "subject will be inserted later" — gpt-image-1
  // interprets that as a request to pre-draw a placeholder, which
  // produces phantom mini-shoes / props in the composite center.
  // Instead, frame the requirement as "this image is FINAL as a
  // background plate, no foreground objects".
  const NEGATION =
    "CRITICAL: this image is the FINAL background plate. It will NOT " +
    "be edited further. It must contain ONLY the environment described " +
    "above and nothing else. ABSOLUTELY NO people, faces, hands, or " +
    "body parts. ABSOLUTELY NO shoes, sneakers, footwear, clothing, " +
    "bags, accessories, or any product items anywhere in the frame. " +
    "NO toy versions, NO miniature versions, NO mannequins, NO " +
    "ghosted or faded silhouettes of products. NO text, writing, " +
    "words, watermarks, logos, or brand marks. If the environment " +
    "description above mentions a product or brand, IGNORE that " +
    "mention — render only the surrounding environment without the " +
    "product. Center foreground area must be cleanly empty.";

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const genRes = (await openai.images.generate({
    model: "gpt-image-1",
    prompt: `${basePrompt}\n\n${REALISM_BAKE}\n\n${NEGATION}`,
    size: input.outputSize,
    quality: input.quality,
    n: 1,
  })) as { data?: Array<{ b64_json?: string }> };
  const bgB64 = genRes.data?.[0]?.b64_json;
  if (!bgB64) throw new Error("gpt-image-1 returned no scene");
  let bgBuffer: Buffer = Buffer.from(bgB64, "base64") as Buffer;

  const [outW, outH] = input.outputSize.split("x").map(Number);
  bgBuffer = (await sharp(bgBuffer)
    .resize(outW, outH, { fit: "cover", position: "center" })
    .png()
    .toBuffer()) as Buffer;

  // Step 3: compute subject size + position from aspect ratio
  const subjMeta = await sharp(subjectPng).metadata();
  const subjW = subjMeta.width ?? outW;
  const subjH = subjMeta.height ?? outH;
  const layout = pickSubjectLayout(subjW, subjH);
  const effectiveScale =
    typeof input.subjectScale === "number"
      ? Math.max(0.5, Math.min(0.95, input.subjectScale))
      : layout.scaleH;

  const targetH = Math.round(outH * effectiveScale);
  const ratio = targetH / subjH;
  const targetW = Math.round(subjW * ratio);
  const finalW = Math.min(targetW, Math.round(outW * 0.95));
  const finalH = Math.round((finalW / subjW) * subjH);

  const resizedSubject = (await sharp(subjectPng)
    .resize(finalW, finalH, { fit: "inside" })
    .png()
    .toBuffer()) as Buffer;

  const left = Math.round((outW - finalW) / 2);
  const top = Math.round(outH - finalH - outH * layout.bottomPaddingPct);

  console.log(
    `[strict-composite] subject ratio=${(subjH / subjW).toFixed(2)} → scale=${effectiveScale} bottomPad=${layout.bottomPaddingPct}`,
  );

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

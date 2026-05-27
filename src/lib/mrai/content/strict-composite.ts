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

  // Step 2: pick scene template (curated catalog), call gpt-image-1
  const tpl = await pickSceneTemplate(input.scenePrompt);
  console.log(`[strict-composite] scene template: ${tpl.key}`);

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const genRes = (await openai.images.generate({
    model: "gpt-image-1",
    prompt:
      tpl.prompt +
      "\n\nThis is an EMPTY ENVIRONMENT scene — background only. " +
      "ABSOLUTELY NO people, NO faces, NO hands, NO body parts. " +
      "ABSOLUTELY NO shoes, NO sneakers, NO clothing items, NO bags, " +
      "NO merchandise, NO product props, NO objects on the floor. " +
      "Only architecture, natural elements, atmosphere. " +
      "NO text, NO writing, NO words, NO watermarks, NO logos. " +
      "Leave centered vertical space (roughly 60% of frame height) " +
      "where a subject will be inserted later.",
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

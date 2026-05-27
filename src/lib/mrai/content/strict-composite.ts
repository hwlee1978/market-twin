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
 * Use Claude Haiku to extract ONLY environment from the content prompt.
 * Strips brand names, product mentions, merchandise descriptions —
 * anything that would tempt gpt-image-1 to draw products in the
 * background. Returns a pure scene-only description.
 *
 * Falls back to a generic neutral scene on LLM failure (still better
 * than letting product keywords through).
 */
async function sanitizeScenePrompt(rawPrompt: string): Promise<string> {
  const FALLBACK =
    "soft natural indoor environment with clean architectural lines, warm afternoon light, empty floor and walls";
  if (!process.env.ANTHROPIC_API_KEY) return FALLBACK;
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const resp = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      system:
        "You extract pure ENVIRONMENT descriptions from marketing image prompts. " +
        "Rules:\n" +
        "1. Output ONLY the scene/setting (where it takes place, lighting, mood, architecture, nature).\n" +
        "2. STRIP every mention of products, merchandise, brand names, shoes, sneakers, clothing, bags, items, " +
        "people, models, faces, hands holding things, body parts.\n" +
        "3. Output a single English sentence or two, no headings, no preamble.\n" +
        "4. If the original mentions a specific real place context (cafe, park, subway, beach), keep that.\n" +
        "5. If you cannot extract a scene, output: '" +
        FALLBACK +
        "'",
      messages: [{ role: "user", content: rawPrompt }],
    });
    const text = resp.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .filter(Boolean)
      .join("")
      .trim();
    if (!text || text.length < 10) return FALLBACK;
    return text;
  } catch (e) {
    console.warn(
      "[strict-composite] sanitize scene LLM failed, using fallback:",
      e instanceof Error ? e.message : e,
    );
    return FALLBACK;
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

  // Step 2: sanitize scene prompt (strip products) and call gpt-image-1
  const cleanScene = await sanitizeScenePrompt(input.scenePrompt);
  console.log(
    `[strict-composite] sanitized scene: "${cleanScene.slice(0, 120)}…"`,
  );

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const genRes = (await openai.images.generate({
    model: "gpt-image-1",
    prompt:
      cleanScene +
      "\n\nThis is an EMPTY ENVIRONMENT scene — background only. " +
      "ABSOLUTELY NO people, NO faces, NO hands, NO body parts. " +
      "ABSOLUTELY NO products, NO shoes, NO sneakers, NO clothing items, " +
      "NO bags, NO merchandise, NO objects on the floor or surfaces. " +
      "If unsure, leave that area empty. Only architecture, natural " +
      "elements, atmosphere. NO text. NO watermarks. NO logos. " +
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

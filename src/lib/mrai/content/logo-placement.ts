import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";

/**
 * Vision-detected logo placement.
 *
 * Calls Claude Sonnet vision to identify where on the generated product
 * image a brand logo should naturally go (shoe tongue, heel patch, side
 * panel, chest area for apparel, etc.) and returns pixel coordinates
 * + rotation. composite-logo then stamps the real logo PNG there with
 * sharp.
 *
 * Failure modes:
 *   - found=false → vision couldn't detect a clear product surface →
 *     caller falls back to corner-watermark composite.
 *   - low confidence (<0.5) → caller may also fall back.
 *
 * Cost: 1 Claude Sonnet vision call per image (~$0.005 with prompt
 * caching). For a 4-frame IG carousel that's ~$0.02 total.
 */

export type LogoPlacement = {
  found: boolean;
  /** Top-left x in pixels of the placement bounding box */
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  /** Rotation in degrees, positive = clockwise. Range -45 to +45. */
  rotation_deg?: number;
  /** Where on the product the logo sits (free text for debugging) */
  location?: string;
  confidence?: number;
  notes?: string;
};

const SYSTEM = `You are a product photo analyst. Given an image of a product (typically footwear or apparel), identify the BEST single position to overlay a small brand logo as if it were printed/embroidered/stamped on the product naturally.

For SHOES (sneakers, walkers, etc.), prefer in priority order:
  1. Side panel (lateral side, mid-shoe — where Nike swoosh would sit)
  2. Shoe tongue (front-center top of the shoe upper)
  3. Heel patch (back of shoe near the heel collar)

For APPAREL:
  1. Left chest (where polo logos sit)
  2. Sleeve cuff
  3. Hem tag

Rules:
- Pick ONE position only (the most natural).
- Bounding box must lie INSIDE the visible product, not on background or skin.
- Width ~6-15% of image width is natural for a logo.
- Box should be roughly horizontal — small rotation (±15°) only when the surface plane requires it.
- If multiple products are visible, pick the one most centered / largest.
- If NO clear product surface is visible (extreme close-up, abstract, blurred), return found=false.
- Report low confidence (<0.6) if you're guessing.

Return JSON only:
{
  "found": true/false,
  "x": top-left X in pixels,
  "y": top-left Y in pixels,
  "width": pixels,
  "height": pixels,
  "rotation_deg": -45 to 45,
  "location": "shoe tongue" | "side panel" | "heel patch" | "left chest" | etc,
  "confidence": 0-1,
  "notes": one-sentence reasoning
}`;

const RESPONSE_SCHEMA_REMINDER = `Respond with JSON ONLY — no prose before or after. Schema:
{"found":boolean,"x":number,"y":number,"width":number,"height":number,"rotation_deg":number,"location":string,"confidence":number,"notes":string}`;

export async function detectLogoPlacement(
  imageBuffer: Buffer,
): Promise<LogoPlacement> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { found: false, notes: "ANTHROPIC_API_KEY not set" };
  }
  // Resize image to keep vision call cheap (max 1024 on longest side)
  const downsized = await sharp(imageBuffer)
    .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();
  const meta = await sharp(downsized).metadata();
  const downsizedW = meta.width ?? 1024;
  const downsizedH = meta.height ?? 1024;
  const fullMeta = await sharp(imageBuffer).metadata();
  const fullW = fullMeta.width ?? downsizedW;
  const fullH = fullMeta.height ?? downsizedH;
  const scaleX = fullW / downsizedW;
  const scaleY = fullH / downsizedH;

  const base64 = downsized.toString("base64");

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  let resp;
  try {
    resp = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 600,
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: "image/png", data: base64 },
            },
            { type: "text", text: RESPONSE_SCHEMA_REMINDER },
          ],
        },
      ],
    });
  } catch (e) {
    return {
      found: false,
      notes: `vision call failed: ${e instanceof Error ? e.message : "unknown"}`,
    };
  }

  // Extract text response — sdk types include thinking/tool_use blocks too
  const text = resp.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .filter(Boolean)
    .join("\n")
    .trim();

  // Strip ```json fences if present
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { found: false, notes: `no JSON in vision response: ${text.slice(0, 100)}` };
  }
  let parsed: Partial<LogoPlacement>;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch (e) {
    return { found: false, notes: `JSON parse failed: ${e instanceof Error ? e.message : "?"}` };
  }

  if (!parsed.found) {
    return { found: false, notes: parsed.notes ?? "vision returned found=false" };
  }
  if (
    typeof parsed.x !== "number" ||
    typeof parsed.y !== "number" ||
    typeof parsed.width !== "number" ||
    typeof parsed.height !== "number"
  ) {
    return { found: false, notes: "vision returned partial coords" };
  }

  // Scale back from downsized → full-size
  return {
    found: true,
    x: Math.round(parsed.x * scaleX),
    y: Math.round(parsed.y * scaleY),
    width: Math.round(parsed.width * scaleX),
    height: Math.round(parsed.height * scaleY),
    rotation_deg: typeof parsed.rotation_deg === "number" ? parsed.rotation_deg : 0,
    location: parsed.location,
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
    notes: parsed.notes,
  };
}

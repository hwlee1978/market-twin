import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Subject extraction for strict composite.
 *
 * gpt-image-1.edit + mask doesn't preserve subjects pixel-perfectly.
 * The clean path is to extract the subject from the source photo and
 * composite it onto an AI-generated empty scene.
 *
 * Three strategies, in order:
 *   1. PRIMARY — Vision-crop: Anthropic vision detects subject bbox,
 *      sharp crops to bbox + applies feathered elliptical alpha mask
 *      so edges blend softly into the new background. Not pixel-perfect
 *      segmentation but the FACE/PRODUCT pixels stay 100% original.
 *      Zero external dependencies (already use Anthropic + sharp).
 *
 *   2. FALLBACK — Replicate API (when REPLICATE_API_TOKEN is set):
 *      true alpha-channel background removal. Better quality edges
 *      but throttle/billing dependent.
 *
 *   3. FINAL FALLBACK — null returned, caller uses mask-edit touchup.
 *
 * Results are cached in Storage by asset_id so re-runs are free.
 */

// ─── Vision-crop (PRIMARY) ────────────────────────────────────────

type BBox = { x: number; y: number; width: number; height: number };

async function detectSubjectBoxVision(
  imageBuffer: Buffer,
  sourceType: "product" | "ambassador",
): Promise<BBox | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;

  // Downsize for vision call (cheaper)
  const downsized = await sharp(imageBuffer)
    .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();
  const meta = await sharp(downsized).metadata();
  const dw = meta.width ?? 1024;
  const dh = meta.height ?? 1024;
  const fullMeta = await sharp(imageBuffer).metadata();
  const fw = fullMeta.width ?? dw;
  const fh = fullMeta.height ?? dh;
  const scaleX = fw / dw;
  const scaleY = fh / dh;

  const systemPrompt =
    sourceType === "ambassador"
      ? "Output the tightest bounding box covering the ENTIRE PERSON (head-to-toe) and the PRODUCT they hold or wear. JSON only: {x, y, width, height} in pixels. Tight around the visible subject, NO background margins."
      : "Output the tightest bounding box covering the MAIN PRODUCT. JSON only: {x, y, width, height} in pixels. Tight around the product, NO background margins.";

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  let resp;
  try {
    resp = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 200,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/png",
                data: downsized.toString("base64"),
              },
            },
            { type: "text", text: "JSON only." },
          ],
        },
      ],
    });
  } catch (e) {
    console.warn("[bg-removal] vision call failed:", e instanceof Error ? e.message : e);
    return null;
  }

  const text = resp.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .filter(Boolean)
    .join("")
    .trim();
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const parsed = JSON.parse(m[0]) as Partial<BBox>;
    if (
      typeof parsed.x !== "number" ||
      typeof parsed.y !== "number" ||
      typeof parsed.width !== "number" ||
      typeof parsed.height !== "number" ||
      parsed.width < 10 ||
      parsed.height < 10
    ) {
      return null;
    }
    return {
      x: Math.round(parsed.x * scaleX),
      y: Math.round(parsed.y * scaleY),
      width: Math.round(parsed.width * scaleX),
      height: Math.round(parsed.height * scaleY),
    };
  } catch {
    return null;
  }
}

/**
 * Crop the source to the vision-detected bbox + apply a feathered
 * elliptical alpha mask so the cropped region blends softly into the
 * new background when composited. Not a true segmentation but the
 * face / product pixels stay 100% original.
 */
async function visionCropExtract(
  imageBuffer: Buffer,
  sourceType: "product" | "ambassador",
): Promise<Buffer | null> {
  const bbox = await detectSubjectBoxVision(imageBuffer, sourceType);
  if (!bbox) {
    console.warn("[bg-removal] vision bbox detection failed");
    return null;
  }
  const fullMeta = await sharp(imageBuffer).metadata();
  const fw = fullMeta.width ?? bbox.x + bbox.width;
  const fh = fullMeta.height ?? bbox.y + bbox.height;

  // Add small padding around bbox so the feather has room to fade
  const padPct = 0.06;
  const padX = Math.round(bbox.width * padPct);
  const padY = Math.round(bbox.height * padPct);
  const cropX = Math.max(0, bbox.x - padX);
  const cropY = Math.max(0, bbox.y - padY);
  const cropW = Math.min(fw - cropX, bbox.width + padX * 2);
  const cropH = Math.min(fh - cropY, bbox.height + padY * 2);

  // Crop source to padded bbox
  const cropped = await sharp(imageBuffer)
    .extract({ left: cropX, top: cropY, width: cropW, height: cropH })
    .png()
    .toBuffer();

  // Build feathered elliptical alpha mask matching the crop size
  // Inner solid ellipse covers subject; outer fades to transparent.
  const innerRx = Math.round(cropW * 0.42);
  const innerRy = Math.round(cropH * 0.44);
  const outerRx = Math.round(cropW * 0.5);
  const outerRy = Math.round(cropH * 0.5);
  const cx = Math.round(cropW / 2);
  const cy = Math.round(cropH / 2);
  // SVG radial gradient for soft edge
  const maskSvg = `<svg width="${cropW}" height="${cropH}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="g" cx="${cx}" cy="${cy}" r="${outerRx}" fx="${cx}" fy="${cy}" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="white" stop-opacity="1"/>
        <stop offset="${Math.round((innerRx / outerRx) * 100)}%" stop-color="white" stop-opacity="1"/>
        <stop offset="100%" stop-color="white" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${cropW}" height="${cropH}" fill="black"/>
    <ellipse cx="${cx}" cy="${cy}" rx="${outerRx}" ry="${outerRy}" fill="url(#g)"/>
  </svg>`;
  const maskBuffer = await sharp(Buffer.from(maskSvg)).png().toBuffer();

  // Apply mask as alpha — use sharp.joinChannel approach
  // Sharp's composite with 'dest-in' takes alpha from the mask
  const out = await sharp(cropped)
    .ensureAlpha()
    .composite([{ input: maskBuffer, blend: "dest-in" }])
    .png()
    .toBuffer();
  return out;
}

// ─── Replicate (FALLBACK) ─────────────────────────────────────────

const MODEL_CANDIDATES: Array<{ owner: string; name: string }> = [
  { owner: "lucataco", name: "remove-bg" },
  { owner: "cjwbw", name: "rembg" },
  { owner: "851-labs", name: "background-remover" },
  { owner: "pollinations", name: "modnet" },
];

type ReplicatePrediction = {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output: string | string[] | null;
  error: string | null;
};

const MIN_INTERVAL_MS = 12_000;
let lastCallAt = 0;
async function paceReplicateCalls(): Promise<void> {
  const sinceLast = Date.now() - lastCallAt;
  if (sinceLast < MIN_INTERVAL_MS && lastCallAt > 0) {
    const wait = MIN_INTERVAL_MS - sinceLast;
    console.log(`[bg-removal/replicate] pacing — waiting ${(wait / 1000).toFixed(1)}s`);
    await new Promise((r) => setTimeout(r, wait));
  }
  lastCallAt = Date.now();
}

async function tryReplicateModel(
  owner: string,
  name: string,
  imageUrl: string,
  token: string,
): Promise<{ res: Response; body: string }> {
  const res = await fetch(
    `https://api.replicate.com/v1/models/${owner}/${name}/predictions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Prefer: "wait",
      },
      body: JSON.stringify({ input: { image: imageUrl } }),
    },
  );
  const body = await res.text();
  return { res, body };
}

async function callReplicate(
  imageUrl: string,
  token: string,
): Promise<Buffer> {
  const BACKOFF_MS = [12_000, 25_000];
  let lastErr = "";
  let createBody = "";

  modelLoop: for (const m of MODEL_CANDIDATES) {
    for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
      await paceReplicateCalls();
      const r = await tryReplicateModel(m.owner, m.name, imageUrl, token);
      if (r.res.ok) {
        createBody = r.body;
        console.log(`[bg-removal/replicate] using ${m.owner}/${m.name}`);
        break modelLoop;
      }
      if (r.res.status === 429 && attempt < BACKOFF_MS.length) {
        await new Promise((res) => setTimeout(res, BACKOFF_MS[attempt]));
        continue;
      }
      lastErr = `${m.owner}/${m.name}: HTTP ${r.res.status}`;
      continue modelLoop;
    }
  }
  if (!createBody) throw new Error(`Replicate failed: ${lastErr}`);
  let pred = JSON.parse(createBody) as ReplicatePrediction;

  const t0 = Date.now();
  while (pred.status === "starting" || pred.status === "processing") {
    if (Date.now() - t0 > 60_000) throw new Error("Replicate timeout");
    await new Promise((r) => setTimeout(r, 2000));
    const pollRes = await fetch(
      `https://api.replicate.com/v1/predictions/${pred.id}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    pred = (await pollRes.json()) as ReplicatePrediction;
  }
  if (pred.status !== "succeeded") {
    throw new Error(`Replicate ${pred.status}: ${pred.error ?? "?"}`);
  }
  const outUrl = Array.isArray(pred.output) ? pred.output[0] : pred.output;
  if (!outUrl) throw new Error("Replicate no output");
  const outRes = await fetch(outUrl);
  return Buffer.from(await outRes.arrayBuffer());
}

// ─── Public API ───────────────────────────────────────────────────

export async function removeBackgroundCached(input: {
  workspaceId: string;
  assetId: string;
  imageUrl: string;
  sourceType?: "product" | "ambassador";
}): Promise<Buffer | null> {
  const svc = createServiceClient();
  const cachePath = `${input.workspaceId}/extracted/${input.assetId}.png`;

  // Check cache
  const { data: existing } = await svc.storage
    .from("mrai-content")
    .download(cachePath);
  if (existing) {
    const arr = await existing.arrayBuffer();
    return Buffer.from(arr);
  }

  // Fetch source bytes
  const srcRes = await fetch(input.imageUrl);
  if (!srcRes.ok) {
    console.warn(`[bg-removal] source fetch failed: ${srcRes.status}`);
    return null;
  }
  const srcBuf = Buffer.from(await srcRes.arrayBuffer());

  // PRIMARY: vision-crop + feather (no external deps, always works)
  let buf: Buffer | null = null;
  try {
    console.log("[bg-removal] trying vision-crop (Anthropic bbox + sharp feather)...");
    buf = await visionCropExtract(srcBuf, input.sourceType ?? "ambassador");
    if (buf) console.log("[bg-removal] ✓ vision-crop succeeded");
  } catch (e) {
    console.warn("[bg-removal] vision-crop failed:", e instanceof Error ? e.message : e);
  }

  // FALLBACK: Replicate
  if (!buf && process.env.REPLICATE_API_TOKEN) {
    try {
      console.log("[bg-removal] vision-crop unavailable, trying Replicate...");
      buf = await callReplicate(input.imageUrl, process.env.REPLICATE_API_TOKEN);
    } catch (e) {
      console.warn("[bg-removal] Replicate also failed:", e instanceof Error ? e.message : e);
    }
  }

  if (!buf) return null;

  // Cache (fire-and-forget)
  void svc.storage
    .from("mrai-content")
    .upload(cachePath, buf, {
      contentType: "image/png",
      cacheControl: "31536000",
      upsert: true,
    })
    .then(({ error }: { error: { message: string } | null }) => {
      if (error) console.warn("[bg-removal] cache upload failed:", error.message);
    });

  return buf;
}

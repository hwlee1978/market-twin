import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Subject extraction via Replicate background-removal models, with an
 * optional vision-based pre-crop to a single product.
 *
 * Pipeline:
 *   1. (NEW) Claude Sonnet vision detects the LARGEST single product
 *      bbox in the source. If the source is a multi-product marketing
 *      flatlay, we crop to just one before bg-removal — otherwise
 *      Replicate cleanly mattes ALL of them into one cutout, producing
 *      ghost duplicates when composited onto a new scene.
 *   2. Upload the cropped source to Storage so Replicate can fetch it
 *      via public URL.
 *   3. Replicate bg-removal models try in sequence (rembg/u2net family).
 *   4. Final transparent PNG cached at extracted/{asset_id}.png.
 *
 * Step 1 is best-effort: if vision fails or returns no clear bbox we
 * fall through to the original source URL and let Replicate handle
 * whatever's in there.
 */

const MODEL_CANDIDATES: Array<{ owner: string; name: string }> = [
  { owner: "lucataco", name: "remove-bg" },
  { owner: "851-labs", name: "background-remover" },
  { owner: "cjwbw", name: "rembg" },
];

type ReplicatePrediction = {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output: string | string[] | null;
  error: string | null;
};

async function getLatestVersion(
  owner: string,
  name: string,
  token: string,
): Promise<string | null> {
  const r = await fetch(`https://api.replicate.com/v1/models/${owner}/${name}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return null;
  try {
    const j = (await r.json()) as { latest_version?: { id?: string } };
    return j.latest_version?.id ?? null;
  } catch {
    return null;
  }
}

async function createPrediction(
  owner: string,
  name: string,
  imageUrl: string,
  token: string,
): Promise<{ status: number; body: string; retryAfterMs: number }> {
  // Use the version-explicit endpoint (/v1/predictions with body.version)
  // — the `/v1/models/{owner}/{name}/predictions` endpoint only works
  // for official models, returns 404 for community ones.
  const version = await getLatestVersion(owner, name, token);
  if (!version) {
    return { status: 404, body: "model_not_found", retryAfterMs: 0 };
  }
  const res = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "wait",
    },
    body: JSON.stringify({ version, input: { image: imageUrl } }),
  });
  const body = await res.text();
  let retryAfterMs = 0;
  // Replicate sends retry_after (seconds) in the JSON body on 429
  try {
    const j = JSON.parse(body) as { retry_after?: number };
    if (typeof j.retry_after === "number") retryAfterMs = j.retry_after * 1000;
  } catch {}
  // Or via Retry-After header
  const hdr = res.headers.get("retry-after");
  if (!retryAfterMs && hdr) {
    const n = parseFloat(hdr);
    if (!isNaN(n)) retryAfterMs = n * 1000;
  }
  return { status: res.status, body, retryAfterMs };
}

async function pollPrediction(
  id: string,
  token: string,
): Promise<ReplicatePrediction> {
  const t0 = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (Date.now() - t0 > 60_000) throw new Error("Replicate timeout (60s)");
    await new Promise((r) => setTimeout(r, 1500));
    const res = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const pred = (await res.json()) as ReplicatePrediction;
    if (pred.status !== "starting" && pred.status !== "processing") return pred;
  }
}

async function callReplicate(
  imageUrl: string,
  token: string,
): Promise<Buffer | null> {
  // Strategy: pick one model and retry it honoring Replicate's
  // retry_after on 429. Don't cycle models because the throttle is
  // account-level (per-second budget), so trying another model
  // immediately just wastes another 429 in the budget.
  //
  // Throttled accounts (<$5 credit) get 6 req/min burst 1 — so we wait
  // the precise retry_after the API tells us, then attempt again.
  const MAX_429_RETRIES = 3;
  const MAX_HARD_ERRORS = 2; // tolerate transient failures
  let hardErrors = 0;

  modelLoop: for (const m of MODEL_CANDIDATES) {
    let throttleRetries = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const t0 = Date.now();
      const create = await createPrediction(m.owner, m.name, imageUrl, token);
      if (create.status === 429) {
        if (throttleRetries >= MAX_429_RETRIES) {
          console.warn(
            `[bg-removal/replicate] ${m.owner}/${m.name} 429 after ${MAX_429_RETRIES} retries — giving up on this model`,
          );
          continue modelLoop;
        }
        const wait = Math.max(create.retryAfterMs, 1000) + 500;
        console.log(
          `[bg-removal/replicate] ${m.owner}/${m.name} 429 (throttled by account-level limit, <$5 credit). Retry-After ${(wait / 1000).toFixed(1)}s [attempt ${throttleRetries + 1}/${MAX_429_RETRIES}]`,
        );
        await new Promise((r) => setTimeout(r, wait));
        throttleRetries++;
        continue;
      }
      if (create.status < 200 || create.status >= 300) {
        hardErrors++;
        console.warn(
          `[bg-removal/replicate] ${m.owner}/${m.name} HTTP ${create.status}: ${create.body.slice(0, 200)}`,
        );
        if (hardErrors >= MAX_HARD_ERRORS) return null;
        continue modelLoop;
      }
      let pred: ReplicatePrediction;
      try {
        pred = JSON.parse(create.body) as ReplicatePrediction;
      } catch {
        console.warn(
          `[bg-removal/replicate] ${m.owner}/${m.name} bad response: ${create.body.slice(0, 200)}`,
        );
        continue modelLoop;
      }
      // Prefer:wait often returns terminal status immediately
      if (pred.status === "starting" || pred.status === "processing") {
        try {
          pred = await pollPrediction(pred.id, token);
        } catch (e) {
          console.warn(
            `[bg-removal/replicate] ${m.owner}/${m.name} poll failed:`,
            e instanceof Error ? e.message : e,
          );
          continue modelLoop;
        }
      }
      if (pred.status !== "succeeded") {
        console.warn(
          `[bg-removal/replicate] ${m.owner}/${m.name} ${pred.status}: ${pred.error ?? "?"}`,
        );
        continue modelLoop;
      }
      const outUrl = Array.isArray(pred.output) ? pred.output[0] : pred.output;
      if (!outUrl) {
        console.warn(`[bg-removal/replicate] ${m.owner}/${m.name} no output`);
        continue modelLoop;
      }
      const outRes = await fetch(outUrl);
      if (!outRes.ok) {
        console.warn(
          `[bg-removal/replicate] ${m.owner}/${m.name} output fetch ${outRes.status}`,
        );
        continue modelLoop;
      }
      const buf = Buffer.from(await outRes.arrayBuffer());
      console.log(
        `[bg-removal/replicate] ✓ ${m.owner}/${m.name} succeeded in ${Date.now() - t0}ms`,
      );
      return buf;
    }
  }
  return null;
}

/**
 * Detect the largest single-product bounding box in a marketing photo.
 *
 * Returns bbox in ORIGINAL source coordinates, or null on failure.
 * Falls back gracefully so caller can use the raw source.
 */
type BBox = { x: number; y: number; width: number; height: number };

async function detectLargestProductBbox(
  sourceBuf: Buffer,
  sourceType: "product" | "ambassador",
): Promise<BBox | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const downsized = await sharp(sourceBuf)
      .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer();
    const dMeta = await sharp(downsized).metadata();
    const fMeta = await sharp(sourceBuf).metadata();
    const dw = dMeta.width ?? 1024;
    const dh = dMeta.height ?? 1024;
    const fw = fMeta.width ?? dw;
    const fh = fMeta.height ?? dh;
    const scaleX = fw / dw;
    const scaleY = fh / dh;

    const system =
      sourceType === "ambassador"
        ? "Return JSON only: {x, y, width, height} for the bounding box covering the SINGLE largest person (head-to-toe) including any product they wear or hold. Tight crop, no background margins. Coordinates in pixels of the supplied image."
        : "A marketing photo may contain ONE OR MULTIPLE product copies (e.g. multiple shoes in a flatlay). Return JSON only: {x, y, width, height} for the bounding box covering the SINGLE LARGEST product instance — NOT the union of all products. If multiple identical products overlap, pick the one most clearly in foreground. Tight crop, no background. Coordinates in pixels of the supplied image.";

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const resp = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 200,
      system,
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
    const text = resp.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .filter(Boolean)
      .join("")
      .trim();
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
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
      x: Math.max(0, Math.round(parsed.x * scaleX)),
      y: Math.max(0, Math.round(parsed.y * scaleY)),
      width: Math.round(parsed.width * scaleX),
      height: Math.round(parsed.height * scaleY),
    };
  } catch (e) {
    console.warn(
      "[bg-removal/pre-crop] vision bbox failed:",
      e instanceof Error ? e.message : e,
    );
    return null;
  }
}

/**
 * Pre-crop the source to a single product, upload the cropped image,
 * and return its public URL. Falls back to the original imageUrl if
 * any step fails — vision may legitimately decline on edge cases.
 */
async function preCropSourceToSingleSubject(input: {
  workspaceId: string;
  assetId: string;
  imageUrl: string;
  sourceType: "product" | "ambassador";
}): Promise<string> {
  const svc = createServiceClient();
  const cropCachePath = `${input.workspaceId}/cropped/${input.assetId}.png`;

  // If we already have a cropped version cached, reuse its public URL.
  const { data: existing } = await svc.storage
    .from("mrai-content")
    .download(cropCachePath);
  if (existing) {
    const { data: pub } = svc.storage
      .from("mrai-content")
      .getPublicUrl(cropCachePath);
    console.log(`[bg-removal/pre-crop] reusing cached crop for ${input.assetId}`);
    return pub.publicUrl;
  }

  // Fetch source bytes
  let srcBuf: Buffer;
  try {
    const r = await fetch(input.imageUrl);
    if (!r.ok) return input.imageUrl;
    srcBuf = Buffer.from(await r.arrayBuffer());
  } catch {
    return input.imageUrl;
  }

  // Detect single-subject bbox
  const bbox = await detectLargestProductBbox(srcBuf, input.sourceType);
  if (!bbox) {
    console.log(
      `[bg-removal/pre-crop] vision returned no bbox for ${input.assetId} — using source as-is`,
    );
    return input.imageUrl;
  }
  const meta = await sharp(srcBuf).metadata();
  const fw = meta.width ?? bbox.x + bbox.width;
  const fh = meta.height ?? bbox.y + bbox.height;

  // Add a small padding so bg-removal has room around the subject
  const padPct = 0.08;
  const padX = Math.round(bbox.width * padPct);
  const padY = Math.round(bbox.height * padPct);
  const cropX = Math.max(0, bbox.x - padX);
  const cropY = Math.max(0, bbox.y - padY);
  const cropW = Math.min(fw - cropX, bbox.width + padX * 2);
  const cropH = Math.min(fh - cropY, bbox.height + padY * 2);

  // If the bbox is already 95%+ of the frame, cropping buys nothing —
  // skip the upload roundtrip.
  if (cropW * cropH > fw * fh * 0.95) {
    console.log(
      `[bg-removal/pre-crop] bbox fills frame for ${input.assetId} — no crop needed`,
    );
    return input.imageUrl;
  }

  let croppedBuf: Buffer;
  try {
    croppedBuf = await sharp(srcBuf)
      .extract({ left: cropX, top: cropY, width: cropW, height: cropH })
      .png()
      .toBuffer();
  } catch (e) {
    console.warn(
      "[bg-removal/pre-crop] sharp crop failed:",
      e instanceof Error ? e.message : e,
    );
    return input.imageUrl;
  }

  // Upload + return public URL for Replicate to fetch
  const { error: upErr } = await svc.storage
    .from("mrai-content")
    .upload(cropCachePath, croppedBuf, {
      contentType: "image/png",
      cacheControl: "31536000",
      upsert: true,
    });
  if (upErr) {
    console.warn(`[bg-removal/pre-crop] upload failed: ${upErr.message}`);
    return input.imageUrl;
  }
  const { data: pub } = svc.storage
    .from("mrai-content")
    .getPublicUrl(cropCachePath);
  console.log(
    `[bg-removal/pre-crop] cropped ${input.assetId} ${fw}x${fh} → ${cropW}x${cropH}`,
  );
  return pub.publicUrl;
}

export async function removeBackgroundCached(input: {
  workspaceId: string;
  assetId: string;
  imageUrl: string;
  sourceType?: "product" | "ambassador";
}): Promise<Buffer | null> {
  const svc = createServiceClient();
  const cachePath = `${input.workspaceId}/extracted/${input.assetId}.png`;

  // Cache hit?
  const { data: existing } = await svc.storage
    .from("mrai-content")
    .download(cachePath);
  if (existing) {
    const arr = await existing.arrayBuffer();
    console.log(`[bg-removal] cache hit ${input.assetId}`);
    return Buffer.from(arr);
  }

  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    console.warn("[bg-removal] REPLICATE_API_TOKEN not set — cannot extract");
    return null;
  }

  // NEW: vision pre-crop to a single subject. If source is already a
  // single-product photo, vision detects ~full-frame bbox and we use
  // the original URL. Multi-product marketing flatlays get cropped
  // to the largest single instance, avoiding ghost duplicates in the
  // alpha cutout.
  const replicateInputUrl = await preCropSourceToSingleSubject({
    workspaceId: input.workspaceId,
    assetId: input.assetId,
    imageUrl: input.imageUrl,
    sourceType: input.sourceType ?? "product",
  });

  let buf: Buffer | null = null;
  try {
    buf = await callReplicate(replicateInputUrl, token);
  } catch (e) {
    console.warn(
      "[bg-removal] callReplicate threw:",
      e instanceof Error ? e.message : e,
    );
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

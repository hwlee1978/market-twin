import { createServiceClient } from "@/lib/supabase/server";

/**
 * Background removal via Replicate API.
 *
 * Why: gpt-image-1.edit + mask is NOT strict pixel preservation. It
 * uses the mask as a "soft hint" and freely recomposes the subject,
 * producing wrong persons / different shoes than the source. The only
 * reliable path for 100% subject fidelity is:
 *
 *   1. Background-remove the source photo → transparent PNG of subject
 *   2. Generate an empty scene (no person/product) via gpt-image-1
 *   3. Composite the extracted subject onto the new scene via sharp
 *
 * This module handles step 1. We use Replicate's 851-labs/background-
 * remover (~$0.003-0.005/call) which gives clean alpha for both
 * people and products. Results are cached in Storage so re-generating
 * the same draft doesn't re-pay.
 *
 * Setup: add REPLICATE_API_TOKEN to .env.local (get from
 * replicate.com/account/api-tokens).
 */

// Use Replicate's model-name endpoint (auto-resolves to latest version).
// More resilient than hardcoding version hashes — if the maintainer
// pushes an update, we get it without code changes.
const MODEL_OWNER = "851-labs";
const MODEL_NAME = "background-remover";

type ReplicatePrediction = {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output: string | string[] | null;
  error: string | null;
};

async function callReplicate(
  imageUrl: string,
  token: string,
): Promise<Buffer> {
  // Create prediction via model endpoint (auto-resolves latest version)
  const createRes = await fetch(
    `https://api.replicate.com/v1/models/${MODEL_OWNER}/${MODEL_NAME}/predictions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Prefer: "wait",
      },
      body: JSON.stringify({
        input: { image: imageUrl, format: "png" },
      }),
    },
  );
  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Replicate create failed (${createRes.status}): ${errText.slice(0, 200)}`);
  }
  let pred = (await createRes.json()) as ReplicatePrediction;

  // If still processing after Prefer:wait, poll until done (max 60s more)
  const t0 = Date.now();
  while (pred.status === "starting" || pred.status === "processing") {
    if (Date.now() - t0 > 60_000) {
      throw new Error("Replicate timeout (60s polling)");
    }
    await new Promise((r) => setTimeout(r, 2000));
    const pollRes = await fetch(
      `https://api.replicate.com/v1/predictions/${pred.id}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!pollRes.ok) {
      throw new Error(`Replicate poll failed (${pollRes.status})`);
    }
    pred = (await pollRes.json()) as ReplicatePrediction;
  }

  if (pred.status !== "succeeded") {
    throw new Error(`Replicate ${pred.status}: ${pred.error ?? "unknown"}`);
  }
  const outUrl = Array.isArray(pred.output) ? pred.output[0] : pred.output;
  if (!outUrl) {
    throw new Error("Replicate output missing");
  }

  const outRes = await fetch(outUrl);
  if (!outRes.ok) {
    throw new Error(`Output fetch failed (${outRes.status})`);
  }
  return Buffer.from(await outRes.arrayBuffer());
}

/**
 * Background-remove an image and return the transparent PNG.
 * Results are cached in Storage keyed by (workspace_id, asset_id) so
 * re-generations of the same source are free.
 */
export async function removeBackgroundCached(input: {
  workspaceId: string;
  assetId: string;       // mrai_brand_assets.id (for cache key)
  imageUrl: string;       // source image URL
}): Promise<Buffer | null> {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    return null; // caller will fall back to non-composite path
  }
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

  // Not cached → call Replicate
  let buf: Buffer;
  try {
    buf = await callReplicate(input.imageUrl, token);
  } catch (e) {
    console.warn(
      "[bg-removal] failed:",
      e instanceof Error ? e.message : e,
    );
    return null;
  }

  // Upload to cache (fire-and-forget — return immediately even if upload fails)
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

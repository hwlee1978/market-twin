import { createServiceClient } from "@/lib/supabase/server";

/**
 * Subject extraction via Replicate background-removal models.
 *
 * Why Replicate only (no vision-crop fallback): the previous vision-crop
 * + elliptical-feather mask left a rectangular bbox crop visible against
 * the new background — caused the user-visible "two heads stacked"
 * disaster. Proper alpha matting from rembg/u2net is the only reliable
 * way. If Replicate isn't reachable, caller must fall back to using the
 * source photo as-is (no background replacement), NOT to a hacky crop.
 *
 * Output: PNG buffer with transparent background. null on hard failure.
 * Cached in Storage by asset_id — repeat runs are free.
 *
 * Models tried in order (first success wins). Each is community-known
 * and stable; if one rate-limits we cycle to the next, then short
 * backoff and retry the first.
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

async function createPrediction(
  owner: string,
  name: string,
  imageUrl: string,
  token: string,
): Promise<{ status: number; body: string }> {
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
  return { status: res.status, body: await res.text() };
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
  // Two passes through the candidate list. First pass: try each model
  // once. If all 429, second pass: short backoff then retry.
  const SECOND_PASS_BACKOFF_MS = 5_000;

  for (let pass = 0; pass < 2; pass++) {
    if (pass === 1) {
      console.log(
        `[bg-removal/replicate] pass 1 all throttled, retrying in ${SECOND_PASS_BACKOFF_MS}ms`,
      );
      await new Promise((r) => setTimeout(r, SECOND_PASS_BACKOFF_MS));
    }
    let sawThrottle = false;
    for (const m of MODEL_CANDIDATES) {
      const t0 = Date.now();
      const create = await createPrediction(m.owner, m.name, imageUrl, token);
      if (create.status === 429) {
        sawThrottle = true;
        console.log(
          `[bg-removal/replicate] ${m.owner}/${m.name} 429 (throttled)`,
        );
        continue;
      }
      if (create.status < 200 || create.status >= 300) {
        console.warn(
          `[bg-removal/replicate] ${m.owner}/${m.name} HTTP ${create.status}: ${create.body.slice(0, 200)}`,
        );
        continue;
      }
      let pred = JSON.parse(create.body) as ReplicatePrediction;
      // Prefer:wait often returns terminal status immediately
      if (pred.status === "starting" || pred.status === "processing") {
        try {
          pred = await pollPrediction(pred.id, token);
        } catch (e) {
          console.warn(
            `[bg-removal/replicate] ${m.owner}/${m.name} poll failed:`,
            e instanceof Error ? e.message : e,
          );
          continue;
        }
      }
      if (pred.status !== "succeeded") {
        console.warn(
          `[bg-removal/replicate] ${m.owner}/${m.name} ${pred.status}: ${pred.error ?? "?"}`,
        );
        continue;
      }
      const outUrl = Array.isArray(pred.output) ? pred.output[0] : pred.output;
      if (!outUrl) {
        console.warn(`[bg-removal/replicate] ${m.owner}/${m.name} no output`);
        continue;
      }
      const outRes = await fetch(outUrl);
      if (!outRes.ok) {
        console.warn(
          `[bg-removal/replicate] ${m.owner}/${m.name} output fetch ${outRes.status}`,
        );
        continue;
      }
      const buf = Buffer.from(await outRes.arrayBuffer());
      console.log(
        `[bg-removal/replicate] ✓ ${m.owner}/${m.name} succeeded in ${Date.now() - t0}ms`,
      );
      return buf;
    }
    // If no model was throttled, no point retrying — they all hard-failed
    if (!sawThrottle) {
      console.warn(
        "[bg-removal/replicate] all models hard-failed (non-429) — giving up",
      );
      return null;
    }
  }
  return null;
}

export async function removeBackgroundCached(input: {
  workspaceId: string;
  assetId: string;
  imageUrl: string;
  /** Currently unused — Replicate's model selection is the same for
   *  ambassador vs product. Kept for signature compatibility. */
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

  let buf: Buffer | null = null;
  try {
    buf = await callReplicate(input.imageUrl, token);
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

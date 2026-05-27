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

import { createServiceClient } from "@/lib/supabase/server";

/**
 * 홍보영상 생성 — Replicate image-to-video (Stable Video Diffusion).
 *
 * 입력: 기존 product/lifestyle 이미지 URL.
 * 출력: 3-4초 MP4 클립 (subtle camera motion + product showcase).
 * 비용: ~$0.20 per video (SVD-XT, 25 frames at 1024x576).
 * 시간: ~30-90초 (polling).
 *
 * 모델 선택 근거: text-to-video는 한국 제품 specificity 부족.
 *               image-to-video는 기존 product photo를 입력으로 받으므로
 *               브랜드 정체성 보존 (영상이 다른 신발을 만들어내지 않음).
 *
 * 저장: Replicate 출력 URL은 24h 후 만료 → Supabase Storage `challenge`
 *      버킷으로 업로드해 영구 보존.
 */

interface ReplicatePrediction {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output: string | string[] | null;
  error: string | null;
}

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 180_000;
// SVD-XT — 25 frames, 1024x576, motion_bucket_id 127 = moderate motion.
const SVD_MODEL_VERSION =
  "stability-ai/stable-video-diffusion:3f0457e4619daac51203dedb472816fd4af51f3149fa7a9e0b5ffcf1b8172438";

async function pollPrediction(predictionId: string, token: string): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    const r = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) throw new Error(`replicate poll ${r.status}`);
    const j = (await r.json()) as ReplicatePrediction;
    if (j.status === "succeeded") {
      const url = Array.isArray(j.output) ? j.output[0] : j.output;
      if (!url) throw new Error("replicate succeeded but no output url");
      return url;
    }
    if (j.status === "failed" || j.status === "canceled") {
      throw new Error(`replicate ${j.status}: ${j.error ?? "unknown"}`);
    }
    await new Promise((res) => setTimeout(res, POLL_INTERVAL_MS));
  }
  throw new Error(`replicate poll timeout after ${POLL_TIMEOUT_MS}ms`);
}

/**
 * Generate a promotional video clip from a still image.
 *
 * Throws on Replicate failure — caller decides whether to fall back to
 * showing the static image only.
 */
export async function generatePromotionalVideo(input: {
  imageUrl: string;
  motionStrength?: number;     // 1-255, default 127 (moderate)
  fps?: number;                 // 6-25, default 7 (slower = smoother for product)
}): Promise<{ replicateUrl: string; durationSec: number; ms: number }> {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error("REPLICATE_API_TOKEN not set");

  const t0 = Date.now();
  const createRes = await fetch("https://api.replicate.com/v1/predictions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      version: SVD_MODEL_VERSION.split(":")[1],
      input: {
        input_image: input.imageUrl,
        sizing_strategy: "maintain_aspect_ratio",
        frames_per_second: input.fps ?? 7,
        motion_bucket_id: input.motionStrength ?? 127,
        cond_aug: 0.02,
      },
    }),
  });
  if (!createRes.ok) {
    const detail = await createRes.text().catch(() => "");
    throw new Error(`replicate create ${createRes.status}: ${detail.slice(0, 200)}`);
  }
  const created = (await createRes.json()) as { id: string };
  const replicateUrl = await pollPrediction(created.id, token);
  const ms = Date.now() - t0;
  // SVD-XT default = 25 frames / 7fps = ~3.57s
  const fps = input.fps ?? 7;
  const durationSec = Number((25 / fps).toFixed(2));
  return { replicateUrl, durationSec, ms };
}

/**
 * Mirror Replicate's temp video URL to Supabase Storage so it's
 * permanently servable from our domain (Replicate URLs expire ~24h).
 */
export async function persistVideoToStorage(
  workspaceId: string,
  replicateUrl: string,
): Promise<{ url: string; path: string }> {
  const res = await fetch(replicateUrl);
  if (!res.ok) throw new Error(`fetch replicate output ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());

  const svc = createServiceClient();
  const path = `${workspaceId}/challenge-videos/${Date.now()}.mp4`;
  const { error } = await svc.storage.from("mrai-content").upload(path, buf, {
    contentType: "video/mp4",
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) throw new Error(`storage upload: ${error.message}`);
  const { data: pub } = svc.storage.from("mrai-content").getPublicUrl(path);
  return { url: pub.publicUrl, path };
}

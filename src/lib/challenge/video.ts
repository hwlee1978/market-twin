import { createServiceClient } from "@/lib/supabase/server";

/**
 * 홍보영상 생성 — Replicate image-to-video.
 *
 * 모델: kwaivgi/kling-v1.6-pro (2025 출시, i2v 최상 품질).
 * 입력: 기존 product/lifestyle 이미지 + motion prompt (영상 의도 한국어).
 * 출력: 5초 또는 10초 MP4 (제품 detail 잘 보존, 자연스러운 카메라 워크).
 * 비용: ~$0.50 per 5초 video, ~$1.00 per 10초.
 * 시간: ~60-180초 (polling, Kling이 SVD보다 느리지만 품질 보상).
 *
 * 이전 모델 (stability-ai/stable-video-diffusion) 결과 품질 낮음 →
 * Kling으로 교체 (2026-05-31). 응모서 visual asset 품질이 평가에 영향.
 *
 * 저장: Replicate 출력 URL은 24h 후 만료 → Supabase Storage 영구 보존.
 */

interface ReplicatePrediction {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output: string | string[] | null;
  error: string | null;
}

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 300_000;  // 5분 — Kling이 SVD보다 느리므로 여유

// Kling v1.6 Pro on Replicate — model endpoint format (no version pin
// needed, Replicate routes to latest stable).
const KLING_MODEL_OWNER = "kwaivgi";
const KLING_MODEL_NAME = "kling-v1.6-pro";

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
 * Kling 기본 motion prompt — 제품 마케팅 영상의 보편적 카메라 워크
 * (살짝 줌인 + 부드러운 패닝). 사용자가 product/scene 정보 주면
 * specifics 첨가, 없으면 generic하게.
 */
function buildMotionPrompt(productHint?: string): string {
  const base =
    "Subtle camera push-in with gentle product reveal. Soft natural lighting, professional product showcase, cinematic quality. No abrupt movements, no text overlays, no people morphing.";
  if (!productHint) return base;
  return `${productHint}. ${base}`;
}

/**
 * Generate a promotional video clip from a still image.
 *
 * Throws on Replicate failure — caller decides whether to fall back to
 * showing the static image only.
 */
export async function generatePromotionalVideo(input: {
  imageUrl: string;
  motionPrompt?: string;        // 제품 motion 설명 (한국어 또는 영문)
  duration?: 5 | 10;             // 초 단위 (Kling 지원 옵션)
  aspectRatio?: "16:9" | "9:16" | "1:1";
}): Promise<{ replicateUrl: string; durationSec: number; ms: number }> {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error("REPLICATE_API_TOKEN not set");

  const duration = input.duration ?? 5;
  const aspectRatio = input.aspectRatio ?? "16:9";
  const prompt = buildMotionPrompt(input.motionPrompt);

  const t0 = Date.now();
  // Use model endpoint format — Replicate auto-routes to latest version.
  const createRes = await fetch(
    `https://api.replicate.com/v1/models/${KLING_MODEL_OWNER}/${KLING_MODEL_NAME}/predictions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
        Prefer: "wait=0",
      },
      body: JSON.stringify({
        input: {
          prompt,
          start_image: input.imageUrl,
          duration,
          aspect_ratio: aspectRatio,
          // cfg_scale: 높을수록 prompt + 입력 이미지에 강하게 매여 frame-by-frame
          // 재해석으로 인한 텍스트/로고 morph가 줄어듦. 0.5 = 자유로움 (글자
          // 일그러짐 다발), 0.8 = 원본 형태 보존 우선. 응모 데모에서 실제
          // 제품 packshot 업로드 시 텍스트가 hallucinated되는 문제 해결.
          cfg_scale: 0.8,
          negative_prompt:
            "text deformation, character morphing, letterform distortion, " +
              "garbled text, illegible writing, smeared letters, fake brand names, " +
              "watermarks, logos morphing, people morphing, blurry, low quality, distorted, jittery",
        },
      }),
    },
  );
  if (!createRes.ok) {
    const detail = await createRes.text().catch(() => "");
    throw new Error(`replicate create ${createRes.status}: ${detail.slice(0, 300)}`);
  }
  const created = (await createRes.json()) as { id: string };
  const replicateUrl = await pollPrediction(created.id, token);
  const ms = Date.now() - t0;
  return { replicateUrl, durationSec: duration, ms };
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

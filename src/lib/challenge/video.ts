import { createServiceClient } from "@/lib/supabase/server";
import { getLLMProvider } from "@/lib/llm";

/**
 * 홍보영상 생성 — 3-tier 옵션.
 *
 * 모델: kwaivgi/kling-v1.6-pro (2025 출시, i2v 최상 품질).
 * 입력: 기존 product/lifestyle 이미지 + motion prompt (영상 의도 한국어).
 *
 * Tier A — 단일 클립 (smart motion prompt + aspect/duration 선택)
 *   비용 ~$0.50 (5초) / ~$1.00 (10초), 시간 2-4분
 *
 * Tier B — 3-scene 스토리보드 (제품 리빌 → 사용 시나리오 → 클로즈업)
 *   비용 ~$1.50 (3 × 5초 병렬), 시간 3-5분
 *
 * Tier C — Tier B + OpenAI TTS 한국어/영어 보이스오버 + BGM hook
 *   비용 ~$2.00+ (3 video + TTS), 시간 5분+
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
 * Smart motion prompt — Claude Haiku로 제품 특성에 맞는 motion 설명
 * 자동 생성. generic "camera push-in"이 아닌 카테고리 적합 카메라 워크.
 * (예: 화장품 → "용기 회전 → 펌프 노즐 클로즈업", 신발 → "측면 패닝 →
 *  바닥창 로우 앵글", 식품 → "포장 클로즈업 → 내용물 reveal")
 *
 * Tier A·B·C 공통 진입점. 비용 ~$0.001-0.003 (Haiku, ~500 토큰).
 */
export async function generateSmartMotionPrompt(input: {
  productName?: string;
  productCategory?: string;
  productDescription?: string;
  sceneHint?: "reveal" | "scenario" | "closeup" | "default";
}): Promise<string> {
  try {
    const provider = getLLMProvider({ provider: "anthropic", model: "claude-haiku-4-5-20251001" });
    const scenePresets: Record<string, string> = {
      reveal: "Scene 1: Product reveal — slow camera approach with elegant lighting transition",
      scenario: "Scene 2: Lifestyle/usage scenario — product in natural use environment",
      closeup: "Scene 3: Detail closeup — macro shot highlighting texture/material/key feature",
      default: "Marketing showcase — single elegant camera move",
    };
    const sceneInstr = scenePresets[input.sceneHint ?? "default"];

    const res = await provider.generate({
      system:
        "You are a video director generating concise i2v motion prompts for Kling v1.6 Pro. " +
        "Output a SINGLE English prompt (1-2 sentences, max 200 chars) describing camera movement, " +
        "lighting, and product behavior. NO text overlay instructions. NO people morphing. " +
        "Match camera style to product category (cosmetics: bottle rotation + macro pump; " +
        "footwear: side panning + low-angle sole; food: package closeup + content reveal; " +
        "electronics: glow + interface highlights; etc.).",
      prompt: `Product: ${input.productName ?? "(unnamed)"}\nCategory: ${input.productCategory ?? "(unspecified)"}\nDescription: ${input.productDescription ?? "(none)"}\nIntent: ${sceneInstr}\n\nOutput the motion prompt only (no JSON, no preamble).`,
      temperature: 0.4,
      maxTokens: 300,
    });
    const text = (res.text ?? "").trim().replace(/^["']|["']$/g, "");
    if (text.length < 20) {
      return buildMotionPrompt(input.productName);
    }
    return text;
  } catch (e) {
    console.warn(`[smart-motion-prompt] fallback to default: ${e instanceof Error ? e.message : e}`);
    return buildMotionPrompt(input.productName);
  }
}

/**
 * OpenAI TTS — 한국어/영어 보이스오버 생성. Tier C 전용.
 * 모델: gpt-4o-mini-tts (2024 출시, multilingual).
 * 비용: $0.015 per 1K char (~30초 보이스오버 = ~150자 = $0.002).
 * 반환: MP3 buffer.
 */
export async function generateVoiceover(input: {
  text: string;
  voice?: "alloy" | "echo" | "nova" | "onyx" | "shimmer";
  locale?: "ko" | "en";
}): Promise<{ buffer: Buffer; ms: number; costUsd: number }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set");
  if (!input.text || input.text.length < 5) throw new Error("text too short");
  if (input.text.length > 500) throw new Error("text too long (max 500 chars)");

  const t0 = Date.now();
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "tts-1",
      voice: input.voice ?? "nova",
      input: input.text,
      response_format: "mp3",
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`OpenAI TTS ${res.status}: ${detail.slice(0, 200)}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const charCount = input.text.length;
  const costUsd = (charCount / 1000) * 0.015;
  return { buffer: buf, ms: Date.now() - t0, costUsd: Number(costUsd.toFixed(4)) };
}

export async function persistAudioToStorage(
  workspaceId: string,
  buffer: Buffer,
): Promise<{ url: string; path: string }> {
  const svc = createServiceClient();
  const path = `${workspaceId}/challenge-voiceovers/${Date.now()}.mp3`;
  const { error } = await svc.storage.from("mrai-content").upload(path, buffer, {
    contentType: "audio/mpeg",
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) throw new Error(`audio storage upload: ${error.message}`);
  const { data: pub } = svc.storage.from("mrai-content").getPublicUrl(path);
  return { url: pub.publicUrl, path };
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

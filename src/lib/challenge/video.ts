import { createServiceClient } from "@/lib/supabase/server";
import { getLLMProvider } from "@/lib/llm";

/**
 * 홍보영상 생성 — Seedance 2.0 단일 모델.
 *
 * 모델: bytedance/seedance-2.0 (Replicate, ByteDance Volcengine 라이선스).
 *   - 4K · 8초 default · multimodal (이미지·텍스트·오디오·참조 입력)
 *   - 1 Pro 대비 cinematic motion / 디테일 보존 큰 폭 향상
 *
 * 입력: 제품 이미지 URL + motion prompt (한국어 또는 영문).
 *
 * UX: 사용자가 직접 motion prompt 입력. 입력 시 AI 가 3가지 prompt
 * 옵션 (A 럭셔리 / B 다이내믹 / C 글로벌) 자동 제안.
 *
 * 저장: Replicate 출력 URL 은 24h 후 만료 → Supabase Storage 영구 보존.
 */

interface ReplicatePrediction {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output: string | string[] | null;
  error: string | null;
}

export type ReplicateStatus = ReplicatePrediction["status"];

const SEEDANCE_2_OWNER = "bytedance";
const SEEDANCE_2_MODEL = "seedance-2.0";

const POLL_INTERVAL_MS = 3000;
// Seedance 2.0 4K 8초 영상은 5-8분 소요. Vercel maxDuration 800s 한도 안쪽.
const POLL_TIMEOUT_MS = 770_000;

async function pollPrediction(predictionId: string, token: string): Promise<string> {
  const start = Date.now();
  let lastStatus = "";
  let pollCount = 0;
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    const r = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) throw new Error(`replicate poll ${r.status}`);
    const j = (await r.json()) as ReplicatePrediction;
    pollCount++;
    if (j.status !== lastStatus) {
      console.log(
        `[seedance-2] ${predictionId.slice(0, 8)} status=${j.status} elapsed=${Math.round((Date.now() - start) / 1000)}s polls=${pollCount}`,
      );
      lastStatus = j.status;
    }
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
  throw new Error(
    `replicate poll timeout after ${Math.round(POLL_TIMEOUT_MS / 1000)}s (${pollCount} polls, last status: ${lastStatus})`,
  );
}

/**
 * Seedance 2.0 prediction 생성 후 즉시 반환 (polling 없음).
 * 클라이언트가 GET /api/challenge/video/status 로 polling.
 *
 * Seedance 2.0 schema:
 *   - image (URL or base64)
 *   - prompt (text)
 *   - duration (4 / 8 default / -1 intelligent)
 *   - aspect_ratio ("16:9" / "9:16" / "1:1" / "adaptive")
 *   - resolution ("480p" / "720p" / "1080p" — Replicate variant)
 *   - fps (24 default)
 *   - seed (optional)
 *
 * 429 retry-after 자동 재시도 (4회).
 */
export async function createSeedance2Prediction(
  input: {
    imageUrl: string;
    motionPrompt: string;
    duration?: number;
    aspectRatio?: "16:9" | "9:16" | "1:1";
    resolution?: "480p" | "720p" | "1080p";
  },
  retries = 4,
): Promise<{ predictionId: string }> {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error("REPLICATE_API_TOKEN not set");

  const duration = input.duration ?? 8;
  const aspectRatio = input.aspectRatio ?? "16:9";
  const resolution = input.resolution ?? "1080p";

  console.log(
    `[seedance-2-create] duration=${duration}s aspect=${aspectRatio} resolution=${resolution} prompt_len=${input.motionPrompt.length} retries_left=${retries}`,
  );

  const res = await fetch(
    `https://api.replicate.com/v1/models/${SEEDANCE_2_OWNER}/${SEEDANCE_2_MODEL}/predictions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "content-type": "application/json",
        Prefer: "wait=0",
      },
      body: JSON.stringify({
        input: {
          image: input.imageUrl,
          prompt: input.motionPrompt,
          duration,
          aspect_ratio: aspectRatio,
          resolution,
          fps: 24,
        },
      }),
    },
  );

  if (res.status === 429 && retries > 0) {
    const bodyText = await res.text().catch(() => "");
    let retryAfter = 12;
    try {
      const body = JSON.parse(bodyText) as { retry_after?: number };
      if (typeof body.retry_after === "number") retryAfter = body.retry_after + 2;
    } catch {
      const hdr = res.headers.get("retry-after");
      if (hdr) retryAfter = Number(hdr) || 12;
    }
    console.log(`[seedance-2-create] 429 throttled — waiting ${retryAfter}s before retry (${retries} left)`);
    await new Promise((r) => setTimeout(r, retryAfter * 1000));
    return createSeedance2Prediction(input, retries - 1);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`seedance-2 create ${res.status}: ${detail.slice(0, 300)}`);
  }
  const j = (await res.json()) as { id: string };
  return { predictionId: j.id };
}

/**
 * 특정 prediction의 현재 상태 + (완료 시) Replicate URL 반환.
 * polling 없이 단발 조회. 모든 Replicate prediction 에 공통 적용.
 */
export async function getReplicatePredictionStatus(predictionId: string): Promise<{
  status: ReplicateStatus;
  outputUrl: string | null;
  error: string | null;
}> {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error("REPLICATE_API_TOKEN not set");

  const res = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`replicate poll ${res.status}`);
  const j = (await res.json()) as ReplicatePrediction;
  const url = j.status === "succeeded"
    ? (Array.isArray(j.output) ? j.output[0] : j.output)
    : null;
  return { status: j.status, outputUrl: url ?? null, error: j.error ?? null };
}

// Backward-compat alias — 기존 status route 가 호출하는 이름.
export const getKlingPredictionStatus = getReplicatePredictionStatus;

/**
 * 시너지 영상 생성용 promotional video (legacy — Kling polling 동기 호출).
 * 새 코드는 createSeedance2Prediction + client polling 사용.
 * legacy import (e.g. 옛 PR 코드) 보호용으로만 유지.
 */
export async function generatePromotionalVideo(input: {
  imageUrl: string;
  motionPrompt?: string;
  duration?: 5 | 10;
  aspectRatio?: "16:9" | "9:16" | "1:1";
}): Promise<{ replicateUrl: string; durationSec: number; ms: number }> {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error("REPLICATE_API_TOKEN not set");
  const duration = input.duration ?? 5;
  const t0 = Date.now();
  const { predictionId } = await createSeedance2Prediction({
    imageUrl: input.imageUrl,
    motionPrompt: input.motionPrompt ?? "Cinematic product showcase, premium quality, hyperreal, 4K.",
    duration: duration === 10 ? 10 : 8,
    aspectRatio: input.aspectRatio ?? "16:9",
  });
  const replicateUrl = await pollPrediction(predictionId, token);
  return { replicateUrl, durationSec: duration, ms: Date.now() - t0 };
}

/**
 * 영상 prompt 3가지 옵션 자동 제안.
 *
 * 입력: 제품 정보 + (선택) 이미지 URL.
 * 출력: A (럭셔리 오프닝) / B (다이내믹 회전) / C (글로벌 포용성) 3개 옵션.
 *
 * 비용 ~$0.005-0.01 (Claude Haiku). 사용자가 이미지 업로드 후 클릭하면
 * 호출됨. 결과는 그대로 motion_prompt 필드에 복사하여 사용.
 */
export async function generateVideoPromptOptions(input: {
  productName?: string;
  productCategory?: string;
  productDescription?: string;
  imageUrl?: string;
}): Promise<{
  optionA: { title: string; description: string; prompt: string };
  optionB: { title: string; description: string; prompt: string };
  optionC: { title: string; description: string; prompt: string };
}> {
  const provider = getLLMProvider({ provider: "anthropic", model: "claude-haiku-4-5-20251001" });

  const systemPrompt = `당신은 럭셔리 commercial video director 입니다.
제품 정보를 보고 Seedance 2.0 i2v 모델에 입력할 motion prompt 3가지 옵션을 한국어로 생성합니다.

⚠️ 각 옵션은 다음 톤 가이드를 엄격히 따릅니다 (Apple/Dyson/Burberry 광고 수준 cinematic).

[옵션 A — 럭셔리 오프닝 (안전·추천)]
- 시네마틱 매크로 돌리인 샷
- 제품의 핵심 부분 (뚜껑·로고·디테일) 슬로 reveal
- 골든 림 라이트 / 광택 표면 반사
- 럭셔리 에디토리얼 뷰티 광고 톤, 하이퍼리얼, 얕은 피사계 심도
- 8초, 4K

[옵션 B — 다이내믹 회전 (SNS·숏폼용)]
- 360도 부드러운 오빗 / 회전 카메라
- 슬로모션 디테일 효과 (물방울·입자·반사)
- 강렬한 컬러 팔레트
- TikTok·Reels 스타일 활기찬 톤, 하이퍼리얼
- 8초, 4K

[옵션 C — 글로벌 포용성 (수출 바우처·정부 사업 톤)]
- 천천히 트래킹하는 와이드 샷
- 다양한 사용·시나리오 swatch 흐름
- 중앙에서 제품 부드럽게 떠오름·열림
- 부드러운 데이라이트, 클린·미니멀 에디토리얼
- 프리미엄 글로벌 광고 무드, 하이퍼리얼
- 8초, 4K

⚠️ 출력 형식 (JSON only):
{
  "optionA": { "title": "럭셔리 오프닝", "description": "1-line 한국어 요약 (~30자)", "prompt": "2-3문장 한국어 prompt (제품명·소재·컬러·카메라·라이팅·무드 포함, 끝에 '하이퍼리얼, 8초, 4K' 명시)" },
  "optionB": { "title": "다이내믹 회전", "description": "...", "prompt": "..." },
  "optionC": { "title": "글로벌 포용성", "description": "...", "prompt": "..." }
}

⚠️ 제약:
- 한국어로만 출력 (prompt 도 한국어 — Seedance 2.0 한국어 prompt 지원)
- 제품의 핵심 식별 정보 (브랜드명·컬러·소재) 반드시 포함
- "정적 회전", "단순 zoom" 같은 보수적 표현 금지`;

  const res = await provider.generate({
    system: systemPrompt,
    prompt: `# 제품 정보
- 제품명: ${input.productName ?? "(미지정)"}
- 카테고리: ${input.productCategory ?? "(미지정)"}
- 설명: ${input.productDescription ?? "(없음)"}
- 이미지 URL: ${input.imageUrl ?? "(미업로드)"}

위 정보로 옵션 A/B/C 3가지 motion prompt 를 JSON 으로 출력.`,
    temperature: 0.7,
    maxTokens: 2000,
    jsonSchema: {
      type: "object",
      required: ["optionA", "optionB", "optionC"],
      properties: {
        optionA: {
          type: "object",
          required: ["title", "description", "prompt"],
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            prompt: { type: "string" },
          },
        },
        optionB: {
          type: "object",
          required: ["title", "description", "prompt"],
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            prompt: { type: "string" },
          },
        },
        optionC: {
          type: "object",
          required: ["title", "description", "prompt"],
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            prompt: { type: "string" },
          },
        },
      },
    },
  });

  const raw = (res.json ?? {}) as {
    optionA?: { title?: string; description?: string; prompt?: string };
    optionB?: { title?: string; description?: string; prompt?: string };
    optionC?: { title?: string; description?: string; prompt?: string };
  };

  const fallback = (label: string) => ({
    title: label,
    description: "AI prompt 생성 실패 — 직접 작성하세요",
    prompt: `${input.productName ?? "제품"}의 cinematic 광고 영상. 하이퍼리얼, 8초, 4K.`,
  });

  return {
    optionA: {
      title: raw.optionA?.title ?? "럭셔리 오프닝",
      description: raw.optionA?.description ?? "",
      prompt: raw.optionA?.prompt ?? fallback("럭셔리 오프닝").prompt,
    },
    optionB: {
      title: raw.optionB?.title ?? "다이내믹 회전",
      description: raw.optionB?.description ?? "",
      prompt: raw.optionB?.prompt ?? fallback("다이내믹 회전").prompt,
    },
    optionC: {
      title: raw.optionC?.title ?? "글로벌 포용성",
      description: raw.optionC?.description ?? "",
      prompt: raw.optionC?.prompt ?? fallback("글로벌 포용성").prompt,
    },
  };
}

/**
 * OpenAI TTS — 한국어/영어 보이스오버. Tier C / 영상 결합 사용.
 * gpt-4o-mini-tts, voice=nova (한국어 자연스러움 양호).
 * 비용 ~$0.015 per 1K char (~30초 보이스오버 = ~150자 = ~$0.002).
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
 * Replicate 출력 URL 은 24h 후 만료. 영상을 Supabase Storage로 즉시 mirror.
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

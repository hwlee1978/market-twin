import { NextResponse } from "next/server";
import { z } from "zod";
import { getChallengeWorkspaceId } from "@/lib/challenge/context";
import {
  createSeedance2Prediction,
  generateVideoPromptOptions,
  generateVoiceover,
  persistAudioToStorage,
} from "@/lib/challenge/video";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
// Seedance 2.0 prediction create (~5s) + TTS sync (~10s) + DB insert.
// Polling 은 클라이언트가 GET /status 로 분리.
export const maxDuration = 60;

const RequestSchema = z.object({
  image_url: z.string().url(),
  /** 사용자가 직접 작성한 motion prompt. 비어있으면 server 가 자동 제안 A 사용. */
  motion_prompt: z.string().max(2000).optional(),
  /** Seedance 2.0 지원 (4 / 8 default / 10). */
  duration: z.union([z.literal(4), z.literal(5), z.literal(8), z.literal(10)]).optional(),
  aspect_ratio: z.enum(["16:9", "9:16", "1:1"]).optional(),
  resolution: z.enum(["480p", "720p", "1080p"]).optional(),
  /** Tier C 보이스오버 (선택) — 영상과 동시 생성, 클라이언트에서 합성. */
  voiceover_text: z.string().max(500).optional(),
  voiceover_locale: z.enum(["ko", "en"]).optional(),
  voiceover_voice: z.enum(["alloy", "echo", "nova", "onyx", "shimmer"]).optional(),
  /** 제품 정보 — motion_prompt 미입력 시 자동 제안에 사용 */
  product_name: z.string().max(200).optional(),
  product_category: z.string().max(100).optional(),
  product_description: z.string().max(1000).optional(),
});

type PredictionRecord = {
  prediction_id: string;
  scene: "single";
  motion_prompt: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  video_url?: string | null;
};

/**
 * POST /api/challenge/video
 *
 * Seedance 2.0 단일 모델 영상 생성. Job + polling 패턴 — POST 는
 * prediction 즉시 생성 후 job_id 반환, 클라이언트는 GET /status 로 polling.
 *
 * motion_prompt 우선순위:
 *   1. 사용자 입력 motion_prompt
 *   2. 미입력 시 generateVideoPromptOptions().optionA.prompt (안전 default)
 */
export async function POST(req: Request) {
  try {
    return await handlePOST(req);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "internal_error";
    console.error("[challenge/video] top-level:", msg);
    return NextResponse.json({ error: "internal_error", detail: msg }, { status: 500 });
  }
}

async function handlePOST(req: Request) {
  const workspaceId = await getChallengeWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", detail: JSON.stringify(parsed.error.flatten()) },
      { status: 400 },
    );
  }

  const duration = parsed.data.duration ?? 8;
  const aspect = parsed.data.aspect_ratio ?? "16:9";
  const resolution = parsed.data.resolution ?? "1080p";
  const svc = createServiceClient();

  // motion_prompt 결정 — 사용자 입력 우선, 미입력 시 AI 제안 A 사용
  let motionPrompt = parsed.data.motion_prompt?.trim();
  if (!motionPrompt) {
    try {
      const suggested = await generateVideoPromptOptions({
        productName: parsed.data.product_name,
        productCategory: parsed.data.product_category,
        productDescription: parsed.data.product_description,
        imageUrl: parsed.data.image_url,
      });
      motionPrompt = suggested.optionA.prompt;
      console.log(
        `[challenge/video] motion_prompt 미입력 → optionA 자동 사용 (${motionPrompt.length}자)`,
      );
    } catch (e) {
      console.warn(`[challenge/video] auto-prompt failed: ${e instanceof Error ? e.message : e}`);
      motionPrompt = `${parsed.data.product_name ?? "제품"}의 시네마틱 광고 영상. 하이퍼리얼, ${duration}초, 4K.`;
    }
  }

  console.log(
    `[challenge/video] CREATE seedance-2.0 duration=${duration}s aspect=${aspect} resolution=${resolution} ws=${workspaceId.slice(0, 8)}`,
  );

  // Seedance 2.0 prediction 생성 (polling 없음, 즉시 반환)
  const r = await createSeedance2Prediction({
    imageUrl: parsed.data.image_url,
    motionPrompt,
    duration,
    aspectRatio: aspect,
    resolution,
  });

  const predictions: PredictionRecord[] = [
    {
      prediction_id: r.predictionId,
      scene: "single",
      motion_prompt: motionPrompt,
      status: "starting",
    },
  ];

  // Tier C — TTS 보이스오버 (선택, sync 생성)
  let voiceoverUrl: string | null = null;
  let voiceoverCostUsd = 0;
  if (parsed.data.voiceover_text) {
    try {
      const vo = await generateVoiceover({
        text: parsed.data.voiceover_text,
        voice: parsed.data.voiceover_voice ?? "nova",
        locale: parsed.data.voiceover_locale ?? "ko",
      });
      const audio = await persistAudioToStorage(workspaceId, vo.buffer);
      voiceoverUrl = audio.url;
      voiceoverCostUsd = vo.costUsd;
    } catch (e) {
      console.warn(`[challenge/video] voiceover failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  // Job DB row 생성 (tier='A' 고정, 단일 클립)
  const { data: job, error } = await svc
    .from("ch_video_jobs")
    .insert({
      workspace_id: workspaceId,
      tier: "A",
      duration,
      aspect_ratio: aspect,
      image_url: parsed.data.image_url,
      product_name: parsed.data.product_name,
      product_category: parsed.data.product_category,
      predictions: predictions as unknown as Record<string, unknown>[],
      voiceover_url: voiceoverUrl,
      voiceover_cost_usd: voiceoverCostUsd > 0 ? voiceoverCostUsd : null,
      status: "running",
    })
    .select("id, created_at")
    .single();
  if (error || !job) {
    return NextResponse.json(
      { error: "db_error", detail: error?.message ?? "insert failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    job_id: job.id,
    model: "seedance-2.0",
    duration,
    aspect_ratio: aspect,
    resolution,
    predictions,
    voiceover_url: voiceoverUrl,
    status: "running",
    created_at: job.created_at,
    motion_prompt: motionPrompt,
  });
}

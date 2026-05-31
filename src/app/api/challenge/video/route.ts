import { NextResponse } from "next/server";
import { z } from "zod";
import { getChallengeWorkspaceId } from "@/lib/challenge/context";
import {
  createKlingPrediction,
  createSeedancePrediction,
  generateSmartMotionPrompt,
  generateVoiceover,
  persistAudioToStorage,
  type VideoModelChoice,
} from "@/lib/challenge/video";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
// Tier B/C 는 sequential 생성 (429 회피, 11s 간격 × 3 = ~45s).
// + TTS ~5s + 기타 → 120s 여유 있게.
export const maxDuration = 120;

const RequestSchema = z.object({
  image_url: z.string().url(),
  duration: z.union([z.literal(5), z.literal(10)]).optional(),
  aspect_ratio: z.enum(["16:9", "9:16", "1:1"]).optional(),
  tier: z.enum(["A", "B", "C"]).optional(),
  /** 영상 생성 모델 선택 (default: kling-stable, 비교 테스트용) */
  model: z.enum(["kling-stable", "kling-dynamic", "seedance-pro"]).optional(),
  motion_prompt: z.string().max(500).optional(),
  voiceover_text: z.string().max(500).optional(),
  voiceover_locale: z.enum(["ko", "en"]).optional(),
  voiceover_voice: z.enum(["alloy", "echo", "nova", "onyx", "shimmer"]).optional(),
  product_name: z.string().max(200).optional(),
  product_category: z.string().max(100).optional(),
  product_description: z.string().max(1000).optional(),
});

type PredictionRecord = {
  prediction_id: string;
  scene: "single" | "reveal" | "scenario" | "closeup";
  motion_prompt: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  video_url?: string | null;
};

/**
 * POST /api/challenge/video
 *
 * Job 기반 비동기 영상 생성. Replicate prediction 만 즉시 생성하고
 * job_id 반환. 클라이언트는 GET /status?job_id=… 로 polling.
 * Edge proxy idle timeout (6-7분짜리 단일 요청 끊김) 회피.
 *
 * Tier C 의 TTS 보이스오버는 sync 생성 (~5-10s) — 즉시 voiceover_url
 * 반환. 영상은 백그라운드에서 Replicate가 처리.
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

  const tier = parsed.data.tier ?? "A";
  const duration = parsed.data.duration ?? 5;
  const aspect = parsed.data.aspect_ratio ?? "16:9";
  const model: VideoModelChoice = parsed.data.model ?? "kling-stable";
  const svc = createServiceClient();

  console.log(
    `[challenge/video] CREATE tier=${tier} duration=${duration} aspect=${aspect} model=${model} ws=${workspaceId.slice(0, 8)}`,
  );

  // Model dispatcher — Kling stable/dynamic 또는 Seedance.
  // smart prompt 도 cinematic mode 사용 여부 결정 (dynamic + seedance 는 cinematic).
  const useCinematic = model !== "kling-stable";
  const callCreate = async (motionPrompt: string) => {
    if (model === "seedance-pro") {
      return createSeedancePrediction({
        imageUrl: parsed.data.image_url,
        motionPrompt,
        duration,
        aspectRatio: aspect,
      });
    }
    return createKlingPrediction({
      imageUrl: parsed.data.image_url,
      motionPrompt,
      duration,
      aspectRatio: aspect,
      dynamic: model === "kling-dynamic",
    });
  };

  // 1. Replicate predictions 생성 (Tier B/C 는 sequential)
  let predictions: PredictionRecord[] = [];
  if (tier === "A") {
    const motion =
      parsed.data.motion_prompt ||
      (await generateSmartMotionPrompt({
        productName: parsed.data.product_name,
        productCategory: parsed.data.product_category,
        productDescription: parsed.data.product_description,
        sceneHint: "default",
        cinematic: useCinematic,
      }));
    const r = await callCreate(motion);
    predictions = [
      { prediction_id: r.predictionId, scene: "single", motion_prompt: motion, status: "starting" },
    ];
  } else {
    const scenes: Array<"reveal" | "scenario" | "closeup"> = ["reveal", "scenario", "closeup"];
    // Smart prompts 는 Anthropic 호출이라 parallel OK
    const motions = await Promise.all(
      scenes.map((s) =>
        generateSmartMotionPrompt({
          productName: parsed.data.product_name,
          productCategory: parsed.data.product_category,
          productDescription: parsed.data.product_description,
          sceneHint: s,
          cinematic: useCinematic,
        }),
      ),
    );
    // Replicate prediction 은 sequential — 계정 credit < $5 시 6 req/min +
    // burst 1 throttle. parallel 보내면 첫번째만 통과하고 나머지 429.
    // 11초 간격으로 sequential 호출하면 retry 없이 한 번에 통과.
    predictions = [];
    for (let i = 0; i < scenes.length; i++) {
      if (i > 0) await new Promise((r) => setTimeout(r, 11_000));
      const r = await callCreate(motions[i]);
      predictions.push({
        prediction_id: r.predictionId,
        scene: scenes[i],
        motion_prompt: motions[i],
        status: "starting",
      });
    }
  }

  // 2. Tier C TTS 보이스오버 — sync 생성 (10s 안쪽이라 POST 안에서 처리)
  let voiceoverUrl: string | null = null;
  let voiceoverCostUsd = 0;
  if (tier === "C" && parsed.data.voiceover_text) {
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

  // 3. Job DB row 생성 → job_id 반환
  const { data: job, error } = await svc
    .from("ch_video_jobs")
    .insert({
      workspace_id: workspaceId,
      tier,
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
    tier,
    duration,
    aspect_ratio: aspect,
    model,
    predictions,
    voiceover_url: voiceoverUrl,
    status: "running",
    created_at: job.created_at,
  });
}

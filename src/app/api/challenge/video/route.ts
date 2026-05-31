import { NextResponse } from "next/server";
import { z } from "zod";
import { getChallengeWorkspaceId } from "@/lib/challenge/context";
import {
  generatePromotionalVideo,
  generateSmartMotionPrompt,
  generateVoiceover,
  persistAudioToStorage,
  persistVideoToStorage,
} from "@/lib/challenge/video";

export const dynamic = "force-dynamic";
// Vercel Pro 한도 800s 활용. Tier C (3 × 10초 영상 + TTS) 까지 안전.
export const maxDuration = 800;

const RequestSchema = z.object({
  image_url: z.string().url(),
  duration: z.union([z.literal(5), z.literal(10)]).optional(),
  aspect_ratio: z.enum(["16:9", "9:16", "1:1"]).optional(),
  /**
   * Tier:
   *  A — 단일 클립 + smart motion prompt (default, ~$0.50-1.00, 2-4분)
   *  B — 3-scene 스토리보드 병렬 (~$1.50, 3-5분)
   *  C — Tier B + 한국어/영어 TTS 보이스오버 (~$2.00+, 5분+)
   */
  tier: z.enum(["A", "B", "C"]).optional(),
  /** Tier A: 사용자가 직접 모션 프롬프트 작성 (없으면 smart 자동) */
  motion_prompt: z.string().max(500).optional(),
  /** Tier C 보이스오버 텍스트 (없으면 미생성) */
  voiceover_text: z.string().max(500).optional(),
  voiceover_locale: z.enum(["ko", "en"]).optional(),
  voiceover_voice: z.enum(["alloy", "echo", "nova", "onyx", "shimmer"]).optional(),
  /** smart prompt 생성용 컨텍스트 */
  product_name: z.string().max(200).optional(),
  product_category: z.string().max(100).optional(),
  product_description: z.string().max(1000).optional(),
});

type GeneratedClip = {
  scene: "single" | "reveal" | "scenario" | "closeup";
  video_url: string;
  motion_prompt: string;
  duration_sec: number;
  ms: number;
};

/**
 * POST /api/challenge/video
 *
 * 3-tier 홍보영상 생성:
 *   A — 단일 클립 + smart motion prompt
 *   B — 3-scene 스토리보드 (reveal / scenario / closeup) 병렬
 *   C — Tier B + OpenAI TTS 보이스오버
 *
 * Supabase Storage에 모든 결과 영구 저장.
 */
export async function POST(req: Request) {
  try {
    return await handlePOST(req);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "internal_error";
    console.error("[challenge/video] top-level error:", msg);
    return NextResponse.json(
      { error: "internal_error", detail: msg },
      { status: 500 },
    );
  }
}

async function handlePOST(req: Request) {
  const workspaceId = await getChallengeWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json(
      { error: "unauthorized", detail: "Sign in or set CHALLENGE_DEMO_WORKSPACE_ID" },
      { status: 401 },
    );
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

  console.log(
    `[challenge/video] tier=${tier} duration=${duration} aspect=${aspect} image_url_len=${parsed.data.image_url.length} workspaceId=${workspaceId.slice(0, 8)}`,
  );

  try {
    let clips: GeneratedClip[] = [];
    let voCostUsd = 0;
    let voUrl: string | null = null;
    let voMs = 0;

    if (tier === "A") {
      // 단일 클립 — 사용자가 motion_prompt 안 주면 smart 자동 생성
      const motion =
        parsed.data.motion_prompt ||
        (await generateSmartMotionPrompt({
          productName: parsed.data.product_name,
          productCategory: parsed.data.product_category,
          productDescription: parsed.data.product_description,
          sceneHint: "default",
        }));
      const r = await generatePromotionalVideo({
        imageUrl: parsed.data.image_url,
        motionPrompt: motion,
        duration,
        aspectRatio: aspect,
      });
      const persisted = await persistVideoToStorage(workspaceId, r.replicateUrl);
      clips.push({
        scene: "single",
        video_url: persisted.url,
        motion_prompt: motion,
        duration_sec: r.durationSec,
        ms: r.ms,
      });
    } else {
      // Tier B / C — 3-scene 병렬
      const scenes: Array<"reveal" | "scenario" | "closeup"> = ["reveal", "scenario", "closeup"];
      const motions = await Promise.all(
        scenes.map((s) =>
          generateSmartMotionPrompt({
            productName: parsed.data.product_name,
            productCategory: parsed.data.product_category,
            productDescription: parsed.data.product_description,
            sceneHint: s,
          }),
        ),
      );
      const results = await Promise.all(
        scenes.map((scene, i) =>
          generatePromotionalVideo({
            imageUrl: parsed.data.image_url,
            motionPrompt: motions[i],
            duration,
            aspectRatio: aspect,
          })
            .then(async (r) => {
              const p = await persistVideoToStorage(workspaceId, r.replicateUrl);
              return {
                scene,
                video_url: p.url,
                motion_prompt: motions[i],
                duration_sec: r.durationSec,
                ms: r.ms,
              } as GeneratedClip;
            })
            .catch((e) => {
              console.warn(`[challenge/video] scene ${scene} failed: ${e instanceof Error ? e.message : e}`);
              return null;
            }),
        ),
      );
      clips = results.filter((c): c is GeneratedClip => c !== null);

      // Tier C — TTS 보이스오버 생성
      if (tier === "C" && parsed.data.voiceover_text) {
        try {
          const vo = await generateVoiceover({
            text: parsed.data.voiceover_text,
            voice: parsed.data.voiceover_voice ?? "nova",
            locale: parsed.data.voiceover_locale ?? "ko",
          });
          const audio = await persistAudioToStorage(workspaceId, vo.buffer);
          voUrl = audio.url;
          voCostUsd = vo.costUsd;
          voMs = vo.ms;
        } catch (e) {
          console.warn(`[challenge/video] voiceover failed: ${e instanceof Error ? e.message : e}`);
        }
      }
    }

    const videoCostUsd = clips.length * (duration === 10 ? 1.0 : 0.5);
    const totalCostUsd = Number((videoCostUsd + voCostUsd).toFixed(4));
    const totalMs = clips.reduce((acc, c) => Math.max(acc, c.ms), 0) + voMs;

    return NextResponse.json({
      tier,
      clips,
      voiceover_url: voUrl,
      cost_usd: totalCostUsd,
      generation_ms: totalMs,
      // 단일 클립 backward compat (기존 호출자용)
      video_url: clips[0]?.video_url ?? null,
      duration_sec: duration,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "video generation failed";
    const stack = e instanceof Error ? e.stack?.split("\n").slice(0, 5).join(" | ") : "";
    console.error("[challenge/video] handler error:", msg, stack);
    return NextResponse.json(
      { error: "video_failed", detail: msg },
      { status: 500 },
    );
  }
}

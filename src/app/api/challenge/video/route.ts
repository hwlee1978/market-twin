import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import {
  generatePromotionalVideo,
  persistVideoToStorage,
} from "@/lib/challenge/video";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const RequestSchema = z.object({
  image_url: z.string().url(),
  motion_prompt: z.string().max(500).optional(),
  duration: z.union([z.literal(5), z.literal(10)]).optional(),
  aspect_ratio: z.enum(["16:9", "9:16", "1:1"]).optional(),
});

/**
 * POST /api/challenge/video
 *
 * 입력 이미지를 받아 Replicate Kling v1.6 Pro로 5-10초 홍보영상 생성,
 * Supabase Storage에 영구 저장 후 public URL 반환. 챌린지 Task 2 ③.
 *
 * 비용: ~$0.50 per 5초, ~$1.00 per 10초. 시간: 60-180초.
 */
export async function POST(req: Request) {
  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const duration = parsed.data.duration ?? 5;
    const replicateResult = await generatePromotionalVideo({
      imageUrl: parsed.data.image_url,
      motionPrompt: parsed.data.motion_prompt,
      duration,
      aspectRatio: parsed.data.aspect_ratio,
    });
    const persisted = await persistVideoToStorage(
      ctx.workspaceId,
      replicateResult.replicateUrl,
    );
    return NextResponse.json({
      video_url: persisted.url,
      duration_sec: replicateResult.durationSec,
      generation_ms: replicateResult.ms,
      cost_usd: duration === 10 ? 1.0 : 0.5,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "video generation failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

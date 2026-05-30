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
  motion_strength: z.number().int().min(1).max(255).optional(),
  fps: z.number().int().min(6).max(25).optional(),
});

/**
 * POST /api/challenge/video
 *
 * 입력 이미지를 받아 Replicate SVD로 3-4초 홍보영상 생성, Supabase
 * Storage에 영구 저장 후 public URL 반환. 챌린지 Task 2 ③ 직접 구현.
 *
 * 비용: ~$0.20 per video. 시간: 30-90초.
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
    const replicateResult = await generatePromotionalVideo({
      imageUrl: parsed.data.image_url,
      motionStrength: parsed.data.motion_strength,
      fps: parsed.data.fps,
    });
    const persisted = await persistVideoToStorage(
      ctx.workspaceId,
      replicateResult.replicateUrl,
    );
    return NextResponse.json({
      video_url: persisted.url,
      duration_sec: replicateResult.durationSec,
      generation_ms: replicateResult.ms,
      cost_usd: 0.2,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "video generation failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

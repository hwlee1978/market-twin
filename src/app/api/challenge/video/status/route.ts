import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getKlingPredictionStatus,
  persistVideoToStorage,
} from "@/lib/challenge/video";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const QuerySchema = z.object({
  job_id: z.string().uuid(),
});

type PredictionRecord = {
  prediction_id: string;
  scene: "single" | "reveal" | "scenario" | "closeup";
  motion_prompt: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  video_url?: string | null;
};

/**
 * GET /api/challenge/video/status?job_id=…
 *
 * 클라이언트가 5초마다 polling. 각 prediction 의 현재 상태 조회 후
 * 새로 완료된 영상은 Replicate URL → Supabase Storage 영구 저장 후
 * 영상 URL 갱신. 모두 완료되면 status='succeeded' / 일부 실패는
 * 'partial'.
 */
export async function GET(req: Request) {
  try {
    return await handleGET(req);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "internal_error";
    console.error("[challenge/video/status] top-level:", msg);
    return NextResponse.json({ error: "internal_error", detail: msg }, { status: 500 });
  }
}

async function handleGET(req: Request) {
  const url = new URL(req.url);
  const parsed = QuerySchema.safeParse({ job_id: url.searchParams.get("job_id") });
  if (!parsed.success) {
    return NextResponse.json({ error: "bad_request", detail: "job_id required" }, { status: 400 });
  }

  const svc = createServiceClient();
  const { data: job, error } = await svc
    .from("ch_video_jobs")
    .select("*")
    .eq("id", parsed.data.job_id)
    .single();
  if (error || !job) {
    return NextResponse.json({ error: "not_found", detail: error?.message ?? "" }, { status: 404 });
  }

  // 이미 완료된 job은 DB 상태 그대로 반환 (Replicate 재호출 안 함)
  if (job.status === "succeeded" || job.status === "failed") {
    return NextResponse.json({
      job_id: job.id,
      tier: job.tier,
      duration: job.duration,
      aspect_ratio: job.aspect_ratio,
      status: job.status,
      predictions: job.predictions,
      voiceover_url: job.voiceover_url,
      total_cost_usd: job.total_cost_usd,
      completed_at: job.completed_at,
      cached: true,
    });
  }

  // 진행 중 — 각 prediction 상태 Replicate에서 조회 + 새로 완료된 건 Storage 저장
  const predictions = job.predictions as PredictionRecord[];
  const updated: PredictionRecord[] = await Promise.all(
    predictions.map(async (p) => {
      // 이미 완료된 건 그대로 (video_url 있음)
      if (p.status === "succeeded" && p.video_url) return p;
      if (p.status === "failed" || p.status === "canceled") return p;
      try {
        const st = await getKlingPredictionStatus(p.prediction_id);
        if (st.status === "succeeded" && st.outputUrl) {
          // Replicate URL은 24h 후 만료 → 즉시 Supabase Storage 영구 저장
          try {
            const persisted = await persistVideoToStorage(job.workspace_id, st.outputUrl);
            return { ...p, status: st.status, video_url: persisted.url };
          } catch (persistErr) {
            console.warn(
              `[challenge/video/status] persist failed for ${p.prediction_id}: ${persistErr instanceof Error ? persistErr.message : persistErr}`,
            );
            // 영구 저장 실패해도 Replicate URL은 일시적으로 사용 가능
            return { ...p, status: st.status, video_url: st.outputUrl };
          }
        }
        return { ...p, status: st.status, video_url: p.video_url ?? null };
      } catch (e) {
        console.warn(
          `[challenge/video/status] poll ${p.prediction_id} failed: ${e instanceof Error ? e.message : e}`,
        );
        return p;
      }
    }),
  );

  // 전체 상태 결정
  const allDone = updated.every(
    (p) => p.status === "succeeded" || p.status === "failed" || p.status === "canceled",
  );
  const anySucceeded = updated.some((p) => p.status === "succeeded");
  const anyFailed = updated.some((p) => p.status === "failed" || p.status === "canceled");
  let newStatus: "running" | "succeeded" | "failed" | "partial" = "running";
  if (allDone) {
    if (anySucceeded && anyFailed) newStatus = "partial";
    else if (anySucceeded) newStatus = "succeeded";
    else newStatus = "failed";
  }

  // DB 업데이트 (predictions + status)
  const succeededCount = updated.filter((p) => p.status === "succeeded").length;
  const totalCost = succeededCount * (job.duration === 10 ? 1.0 : 0.5) + (job.voiceover_cost_usd ?? 0);
  await svc
    .from("ch_video_jobs")
    .update({
      predictions: updated as unknown as Record<string, unknown>[],
      status: newStatus,
      total_cost_usd: Number(totalCost.toFixed(4)),
      completed_at: allDone ? new Date().toISOString() : null,
    })
    .eq("id", job.id);

  return NextResponse.json({
    job_id: job.id,
    tier: job.tier,
    duration: job.duration,
    aspect_ratio: job.aspect_ratio,
    status: newStatus,
    predictions: updated,
    voiceover_url: job.voiceover_url,
    total_cost_usd: Number(totalCost.toFixed(4)),
    completed_at: allDone ? new Date().toISOString() : null,
    cached: false,
  });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import {
  recommend,
  persistRecommendation,
  findReproducibleRun,
  hashInput,
  type RecommendInput,
} from "@/lib/challenge/recommend";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const RequestSchema = z.object({
  company: z.object({
    name: z.string().max(200).optional(),
    industry: z.string().max(200).optional(),
    region: z.string().max(100).optional(),
    revenue_band: z.string().max(100).optional(),
    employee_band: z.string().max(100).optional(),
  }),
  products: z
    .array(
      z.object({
        name: z.string().max(200),
        category: z.string().max(100).optional(),
        description: z.string().max(1000).optional(),
      }),
    )
    .max(20)
    .optional(),
  intent: z.enum(["domestic", "export", "both"]).optional(),
  goal: z.string().max(500).optional(),
  /** 평가용 — train/test/holdout split */
  dataset_split: z.enum(["train", "test", "holdout", "prod"]).optional(),
  /** Top-K (default 5) */
  top_k: z.number().int().min(1).max(20).optional(),
  /**
   * 재현성 검증 모드. true면 동일 input_hash로 이미 실행된 결과가 있으면
   * 새로 LLM 호출 없이 그대로 반환 (LLM 비용 절감 + 재현성 보장).
   */
  use_cache: z.boolean().optional(),
});

/**
 * POST /api/challenge/recommend
 *
 * 적합판로 추천 — 입력 기업 정보로 판판대로 + 수출바우처 프로그램
 * 중 Top-K 매칭. 결과는 ch_recommendations에 영구 저장.
 *
 * 판정기준 충족:
 *   - 예측 정확도: input_hash로 evaluation set 격리
 *   - 재현성: temperature=0 + input_hash 동일 시 same output 보장
 *
 * dataset_split:
 *   - 'train' / 'test' / 'holdout' — 평가 시 분리
 *   - 'prod' (default) — 사용자 실제 사용
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

  const input: RecommendInput = {
    company: parsed.data.company,
    products: parsed.data.products,
    intent: parsed.data.intent,
    goal: parsed.data.goal,
  };

  // Reproducibility cache lookup.
  if (parsed.data.use_cache !== false) {
    const cached = await findReproducibleRun(hashInput(input));
    if (cached) {
      return NextResponse.json({
        recommendations: cached.recommendations,
        cached: true,
        cached_at: cached.generated_at,
        input_hash: hashInput(input),
      });
    }
  }

  const result = await recommend(input, {
    topK: parsed.data.top_k,
    datasetSplit: parsed.data.dataset_split,
  });

  // Persist for audit + reproducibility cache.
  try {
    await persistRecommendation(ctx.workspaceId, input, result, {
      datasetSplit: parsed.data.dataset_split,
    });
  } catch (e) {
    console.error("[challenge/recommend] persist failed:", e);
  }

  return NextResponse.json({
    recommendations: result.recommendations,
    input_hash: result.input_hash,
    stage1_candidates: result.stage1_candidates,
    generation_ms: result.generation_ms,
    cost_usd: result.cost_usd,
    cached: false,
  });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { getChallengeWorkspaceId } from "@/lib/challenge/context";
import { generateVideoPromptOptions } from "@/lib/challenge/video";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const RequestSchema = z.object({
  product_name: z.string().max(200).optional(),
  product_category: z.string().max(100).optional(),
  product_description: z.string().max(2000).optional(),
  image_url: z.string().url().optional(),
});

/**
 * POST /api/challenge/video/prompts
 *
 * 제품 정보 + 이미지 URL 입력 → Seedance 2.0 motion prompt 3가지 옵션:
 *   A — 럭셔리 오프닝 (안전·추천)
 *   B — 다이내믹 회전 (SNS·숏폼용)
 *   C — 글로벌 포용성 (수출 바우처 톤)
 *
 * 사용자가 옵션 중 선택해서 motion prompt 필드에 복사 → 영상 생성.
 * 비용 ~$0.003 (Haiku 1회 호출).
 */
export async function POST(req: Request) {
  try {
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

    const options = await generateVideoPromptOptions({
      productName: parsed.data.product_name,
      productCategory: parsed.data.product_category,
      productDescription: parsed.data.product_description,
      imageUrl: parsed.data.image_url,
    });

    return NextResponse.json(options);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "internal_error";
    console.error("[challenge/video/prompts] error:", msg);
    return NextResponse.json({ error: "prompts_failed", detail: msg }, { status: 500 });
  }
}

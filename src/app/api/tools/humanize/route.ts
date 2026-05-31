import { NextResponse } from "next/server";
import { z } from "zod";
import { humanizeKorean } from "@/lib/humanize";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/tools/humanize
 *
 * AI 한국어 글 → 사람 글 윤문 (im-not-ai Fast Path 이식).
 * 공개 endpoint — 인증 없이 누구나 사용 가능 (테스트 목적).
 */
const RequestSchema = z.object({
  text: z.string().min(20).max(8000),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const result = await humanizeKorean(parsed.data.text);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "humanize failed";
    console.error("[api/tools/humanize] error:", msg);
    return NextResponse.json({ error: "humanize_failed", detail: msg }, { status: 500 });
  }
}

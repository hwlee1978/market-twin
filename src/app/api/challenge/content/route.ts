import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import {
  generateMarketReport,
  generateMultilingualSpec,
} from "@/lib/challenge/content";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

/**
 * POST /api/challenge/content
 *
 * 추천 결과 기반 마케팅 콘텐츠 생성. 시장분석 리포트 + 다국어 상품
 * 기술서를 병렬 생성. 두 출력은 클라이언트가 즉시 표시 + PDF/DOCX
 * export 가능.
 *
 * 챌린지 Task 2 ①② 직접 충족 (③④ 영상·상세페이지는 Phase D).
 */
const RequestSchema = z.object({
  company: z.object({
    name: z.string().max(200).optional(),
    industry: z.string().max(200).optional(),
    region: z.string().max(100).optional(),
    revenue_band: z.string().max(100).optional(),
    employee_band: z.string().max(100).optional(),
  }),
  product: z
    .object({
      name: z.string().max(200),
      category: z.string().max(100).optional(),
      description: z.string().max(1000).optional(),
    })
    .optional(),
  goal: z.string().max(500).optional(),
  recommendations: z
    .array(
      z.object({
        program_id: z.string(),
        program_table: z.enum(["ch_pp_programs", "ch_voucher_programs"]),
        program_name: z.string(),
        type: z.enum(["domestic", "export"]),
        similarity_score: z.number(),
        llm_rank: z.number(),
        llm_score: z.number(),
        reason: z.string(),
        warnings: z.array(z.string()).optional(),
      }),
    )
    .max(10),
  target_markets: z.array(z.string()).max(10).optional(),
  /** 생성할 산출물 선택 — 비용 절감 */
  generate: z.object({
    report: z.boolean().default(true),
    spec: z.boolean().default(true),
  }).optional(),
});

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

  const wantReport = parsed.data.generate?.report ?? true;
  const wantSpec = parsed.data.generate?.spec ?? true;

  const [reportRes, specRes] = await Promise.allSettled([
    wantReport
      ? generateMarketReport({
          company: parsed.data.company,
          products: parsed.data.product ? [parsed.data.product] : undefined,
          goal: parsed.data.goal,
          recommendations: parsed.data.recommendations,
        })
      : Promise.resolve(null),
    wantSpec && parsed.data.product
      ? generateMultilingualSpec({
          product: parsed.data.product,
          company: parsed.data.company,
          targetMarkets: parsed.data.target_markets,
        })
      : Promise.resolve(null),
  ]);

  // Diagnostic — log shape so Vercel reveals when LLM returned empty fields
  // (silent fail without proper JSON shape).
  const reportSummary =
    reportRes.status === "fulfilled" && reportRes.value
      ? `executive=${(reportRes.value as { executive_summary?: string }).executive_summary?.length ?? 0}ch programs=${(reportRes.value as { matched_programs?: unknown[] }).matched_programs?.length ?? 0} signals=${(reportRes.value as { market_signals?: unknown[] }).market_signals?.length ?? 0}`
      : `${reportRes.status === "rejected" ? `rejected: ${String(reportRes.reason).slice(0, 200)}` : "skipped"}`;
  const specSummary =
    specRes.status === "fulfilled" && specRes.value
      ? `locales=${Object.keys((specRes.value as { by_locale?: object }).by_locale ?? {}).length}`
      : `${specRes.status === "rejected" ? `rejected: ${String(specRes.reason).slice(0, 200)}` : "skipped"}`;
  console.log(`[challenge/content] report → ${reportSummary} | spec → ${specSummary}`);

  return NextResponse.json({
    report:
      reportRes.status === "fulfilled" ? reportRes.value : { error: String(reportRes.reason) },
    spec: specRes.status === "fulfilled" ? specRes.value : { error: String(specRes.reason) },
  });
}

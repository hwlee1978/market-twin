import { NextResponse } from "next/server";
import { z } from "zod";
import { getChallengeWorkspaceId } from "@/lib/challenge/context";
import {
  generateMarketReport,
  generateMultilingualSpec,
  type MarketReport,
  type MultilingualSpec,
} from "@/lib/challenge/content";
import {
  buildPublicDataGrounding,
  inferCategory,
  inferTargetCountry,
} from "@/lib/challenge/anchors";
import { humanizeKorean } from "@/lib/humanize";

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
      { error: "bad_request", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const wantReport = parsed.data.generate?.report ?? true;
  const wantSpec = parsed.data.generate?.spec ?? true;

  // 공공데이터 grounding — Hofstede/WB/KOTRA/Comtrade 4종 anchor 병렬 fetch.
  // 타겟국 추론 실패 시 (예: 내수 전용 매칭) skip — best-effort.
  let grounding: Awaited<ReturnType<typeof buildPublicDataGrounding>> | undefined;
  if (wantReport) {
    const targetCountry = inferTargetCountry(parsed.data.goal, parsed.data.recommendations);
    const category = inferCategory(parsed.data.product);
    if (targetCountry) {
      try {
        grounding = await buildPublicDataGrounding(targetCountry, category);
        console.log(
          `[challenge/content] grounding ${targetCountry}/${category} ` +
            `hofstede=${grounding.hofstede ? "✓" : "✗"} ` +
            `wb=${grounding.worldBank ? "✓" : "✗"} ` +
            `kotra=${grounding.kotra?.categoryMatched.length ?? 0} ` +
            `comtrade=${grounding.comtrade?.flows.length ?? 0}y ` +
            `errors=${grounding.errors.length}`,
        );
      } catch (e) {
        console.warn(`[challenge/content] grounding failed: ${e instanceof Error ? e.message : e}`);
      }
    } else {
      console.log("[challenge/content] grounding skipped — 타겟국 추론 실패 (내수 only?)");
    }
  }

  const [reportRes, specRes] = await Promise.allSettled([
    wantReport
      ? generateMarketReport({
          company: parsed.data.company,
          products: parsed.data.product ? [parsed.data.product] : undefined,
          goal: parsed.data.goal,
          recommendations: parsed.data.recommendations,
          grounding,
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

  const finalReport =
    reportRes.status === "fulfilled" && reportRes.value ? (reportRes.value as MarketReport) : null;
  const finalSpec =
    specRes.status === "fulfilled" && specRes.value ? (specRes.value as MultilingualSpec) : null;

  // 자동 윤문 — 가장 AI smell 강한 두 section을 humanizeKorean로 후처리.
  // best-effort: 실패 시 원본 그대로 응답 (사용자가 결과 못 받는 일 없도록).
  // 비용: +$0.034 × 2 = ~$0.07. 응모 데모에서 변별력이 비용 정당화.
  if (finalReport && typeof finalReport.executive_summary === "string" && finalReport.executive_summary.length >= 20) {
    try {
      const h = await humanizeKorean(finalReport.executive_summary);
      finalReport.executive_summary = h.humanized;
      (finalReport as MarketReport & { humanize_meta?: unknown }).humanize_meta = {
        target: "executive_summary",
        grade: h.grade,
        detected_count: h.detected.length,
        change_rate: h.change_rate,
      };
      console.log(
        `[challenge/content] humanize report.executive_summary → grade=${h.grade} detected=${h.detected.length}`,
      );
    } catch (e) {
      console.warn(`[challenge/content] humanize report failed: ${e instanceof Error ? e.message : e}`);
    }
  }
  if (finalSpec?.by_locale?.ko?.body && finalSpec.by_locale.ko.body.length >= 20) {
    try {
      const h = await humanizeKorean(finalSpec.by_locale.ko.body);
      finalSpec.by_locale.ko.body = h.humanized;
      (finalSpec as MultilingualSpec & { humanize_meta?: unknown }).humanize_meta = {
        target: "spec.ko.body",
        grade: h.grade,
        detected_count: h.detected.length,
        change_rate: h.change_rate,
      };
      console.log(
        `[challenge/content] humanize spec.ko.body → grade=${h.grade} detected=${h.detected.length}`,
      );
    } catch (e) {
      console.warn(`[challenge/content] humanize spec failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  return NextResponse.json({
    report: finalReport ?? { error: reportRes.status === "rejected" ? String(reportRes.reason) : "skipped" },
    spec: finalSpec ?? { error: specRes.status === "rejected" ? String(specRes.reason) : "skipped" },
  });
}

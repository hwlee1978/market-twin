import { createHash } from "node:crypto";
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
import { createServiceClient } from "@/lib/supabase/server";

/**
 * 입력을 정규화한 후 SHA-256. ch_content_results.input_hash로 영구 저장
 * → 동일 입력 재요청 시 캐시 hit. URL ?hash=… permalink 키.
 */
function hashContentInput(input: {
  company: Record<string, unknown> | undefined;
  product: Record<string, unknown> | undefined;
  goal: string | undefined;
  recommendations: Array<{ program_id: string }>;
  target_markets?: string[];
}): string {
  const normalized = {
    company: input.company ?? null,
    product: input.product ?? null,
    goal: (input.goal ?? "").trim().toLowerCase(),
    recommendations: input.recommendations.map((r) => r.program_id).sort(),
    target_markets: (input.target_markets ?? []).map((m) => m.toLowerCase()).sort(),
  };
  return createHash("sha256").update(JSON.stringify(normalized), "utf8").digest("hex");
}

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
  /** UI 사용 입력 (영구 저장용, LLM 생성에는 미사용) */
  price_krw: z.number().int().nonnegative().optional(),
  image_url: z.string().max(2000).optional(),
  /** 캐시 사용 — 동일 input_hash 있으면 LLM 호출 없이 즉시 반환 */
  use_cache: z.boolean().optional(),
});

/**
 * GET /api/challenge/content?hash={input_hash}
 *
 * 영구 저장된 콘텐츠 결과 조회. URL permalink로 직접 공유 가능.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const hash = url.searchParams.get("hash");
  if (!hash || !/^[a-f0-9]{64}$/.test(hash)) {
    return NextResponse.json({ error: "bad_hash" }, { status: 400 });
  }
  const svc = createServiceClient();
  const { data, error } = await svc
    .from("ch_content_results")
    .select("input_hash, input_company, input_product, input_goal, input_price_krw, input_image_url, report, spec, generated_at")
    .eq("input_hash", hash)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: "db_error", detail: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({
    hash: data.input_hash,
    input: {
      company: data.input_company,
      product: data.input_product,
      goal: data.input_goal,
      price_krw: data.input_price_krw,
      image_url: data.input_image_url,
    },
    report: data.report,
    spec: data.spec,
    generated_at: data.generated_at,
    cached: true,
  });
}

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

  // 입력 해시 계산 + 캐시 조회 (use_cache !== false, default true)
  const inputHash = hashContentInput({
    company: parsed.data.company,
    product: parsed.data.product,
    goal: parsed.data.goal,
    recommendations: parsed.data.recommendations,
    target_markets: parsed.data.target_markets,
  });

  const svc = createServiceClient();
  if (parsed.data.use_cache !== false) {
    const { data: cached } = await svc
      .from("ch_content_results")
      .select("report, spec, generated_at")
      .eq("input_hash", inputHash)
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (cached && cached.report) {
      console.log(`[challenge/content] cache HIT hash=${inputHash.slice(0, 12)}…`);
      return NextResponse.json({
        hash: inputHash,
        report: cached.report,
        spec: cached.spec,
        generated_at: cached.generated_at,
        cached: true,
      });
    }
  }

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

  // 영구 저장 — best effort. 실패해도 응답엔 영향 없음.
  if (finalReport || finalSpec) {
    try {
      const costTotal =
        (finalReport?.cost_usd ?? 0) + (finalSpec?.cost_usd ?? 0);
      const msTotal =
        (finalReport?.generation_ms ?? 0) + (finalSpec?.generation_ms ?? 0);
      await svc.from("ch_content_results").insert({
        workspace_id: workspaceId,
        input_hash: inputHash,
        input_company: parsed.data.company as unknown as Record<string, unknown>,
        input_product: parsed.data.product as unknown as Record<string, unknown>,
        input_goal: parsed.data.goal,
        input_price_krw: parsed.data.price_krw,
        input_image_url: parsed.data.image_url,
        report: finalReport as unknown as Record<string, unknown>,
        spec: finalSpec as unknown as Record<string, unknown>,
        cost_usd_total: costTotal,
        generation_ms_total: msTotal,
      });
      console.log(`[challenge/content] persisted hash=${inputHash.slice(0, 12)}… cost=$${costTotal.toFixed(4)}`);
    } catch (e) {
      console.warn(`[challenge/content] persist failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  return NextResponse.json({
    hash: inputHash,
    report: finalReport ?? { error: reportRes.status === "rejected" ? String(reportRes.reason) : "skipped" },
    spec: finalSpec ?? { error: specRes.status === "rejected" ? String(specRes.reason) : "skipped" },
    cached: false,
  });
}

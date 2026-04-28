import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { buildReportPdf } from "@/lib/report/pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LABELS_BY_LOCALE: Record<string, Parameters<typeof buildReportPdf>[1]> = {
  ko: {
    title: "AI Market Twin 출시 시뮬레이션 리포트",
    executiveSummary: "핵심 요약",
    keyMetrics: "핵심 지표",
    countryRanking: "국가 랭킹",
    pricingRecommendation: "가격 추천",
    personaInsights: "페르소나 인사이트",
    risks: "리스크",
    actionPlan: "액션 플랜",
    successScore: "성공 확률",
    bestCountry: "추천 진출국",
    bestSegment: "최적 타겟",
    bestPrice: "추천 가격",
    riskLevel: "리스크",
    dataSources: "참고 데이터 출처",
  },
  en: {
    title: "AI Market Twin — Launch Simulation Report",
    executiveSummary: "Executive Summary",
    keyMetrics: "Key Metrics",
    countryRanking: "Country Ranking",
    pricingRecommendation: "Pricing Recommendation",
    personaInsights: "Persona Insights",
    risks: "Risks",
    actionPlan: "Action Plan",
    successScore: "Success Score",
    bestCountry: "Best Country",
    bestSegment: "Best Segment",
    bestPrice: "Best Price",
    riskLevel: "Risk Level",
    dataSources: "Data sources",
  },
};

export async function GET(
  req: Request,
  ctx: { params: Promise<{ simulationId: string }> },
) {
  const { simulationId } = await ctx.params;
  const url = new URL(req.url);
  const locale = url.searchParams.get("locale") === "en" ? "en" : "ko";

  const wsCtx = await getOrCreatePrimaryWorkspace();
  if (!wsCtx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = await createClient();
  const { data: sim, error: simErr } = await supabase
    .from("simulations")
    .select("id, project_id, projects(product_name)")
    .eq("id", simulationId)
    .eq("workspace_id", wsCtx.workspaceId)
    .single();
  if (simErr || !sim) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { data: result } = await supabase
    .from("simulation_results")
    .select("*")
    .eq("simulation_id", simulationId)
    .single();
  if (!result) return NextResponse.json({ error: "result not ready" }, { status: 409 });

  const productName = Array.isArray(sim.projects)
    ? (sim.projects[0] as { product_name?: string })?.product_name ?? ""
    : (sim.projects as { product_name?: string } | null)?.product_name ?? "";

  // _sources is added on persistence by the runner — extract before passing to schema-typed view
  const overviewRaw = (result.overview ?? {}) as Record<string, unknown>;
  const sources: string[] = Array.isArray(overviewRaw._sources)
    ? (overviewRaw._sources as string[])
    : [];
  const { _sources, ...overviewClean } = overviewRaw;

  const buffer = await buildReportPdf(
    {
      overview: overviewClean as never,
      countries: result.countries ?? [],
      personas: result.personas ?? [],
      pricing: result.pricing,
      creative: result.creative ?? [],
      risks: result.risks ?? [],
      recommendations: result.recommendations,
    },
    LABELS_BY_LOCALE[locale],
    productName,
    sources,
  );

  // Track download (fire-and-forget)
  void supabase
    .from("reports")
    .insert({
      simulation_id: simulationId,
      workspace_id: wsCtx.workspaceId,
      format: "pdf",
      created_by: wsCtx.userId,
      download_count: 1,
    });

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="market-twin-${simulationId.slice(0, 8)}.pdf"`,
    },
  });
}

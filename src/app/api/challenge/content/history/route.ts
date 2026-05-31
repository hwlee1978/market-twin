import { NextResponse } from "next/server";
import { getChallengeWorkspaceId } from "@/lib/challenge/context";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/challenge/content/history?limit=20
 *
 * 워크스페이스의 최근 콘텐츠 생성물 목록. 각 항목 click → /sme-strategy/content?hash=…
 * 로 이동해 동일 결과 재열람 가능.
 */
export async function GET(req: Request) {
  const workspaceId = await getChallengeWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "20", 10) || 20, 1), 100);

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("ch_content_results")
    .select(
      "input_hash, input_company, input_product, input_goal, generated_at, cost_usd_total, report, spec",
    )
    .eq("workspace_id", workspaceId)
    .order("generated_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: "db_error", detail: error.message }, { status: 500 });
  }

  // 가벼운 응답으로 변환 — report/spec 전문은 보내지 않고 메타만.
  type Row = {
    input_hash: string;
    input_company: unknown;
    input_product: unknown;
    input_goal: string | null;
    generated_at: string;
    cost_usd_total: number | null;
    report: unknown;
    spec: unknown;
  };
  const items = ((data ?? []) as Row[]).map((r) => {
    const report = (r.report ?? {}) as {
      executive_summary?: string;
      humanize_meta?: { grade?: string; detected_count?: number };
      public_data_grounding?: { targetCountry?: string; category?: string };
    };
    const spec = (r.spec ?? {}) as {
      humanize_meta?: { grade?: string; detected_count?: number };
    };
    const company = (r.input_company ?? {}) as { name?: string; industry?: string };
    const product = (r.input_product ?? {}) as { name?: string; category?: string };
    return {
      hash: r.input_hash as string,
      generated_at: r.generated_at as string,
      cost_usd: r.cost_usd_total as number | null,
      company_name: company.name ?? null,
      industry: company.industry ?? null,
      product_name: product.name ?? null,
      product_category: product.category ?? null,
      goal: (r.input_goal as string | null) ?? null,
      target_country: report.public_data_grounding?.targetCountry ?? null,
      anchor_category: report.public_data_grounding?.category ?? null,
      exec_preview: (report.executive_summary ?? "").slice(0, 140),
      report_grade: report.humanize_meta?.grade ?? null,
      spec_grade: spec.humanize_meta?.grade ?? null,
    };
  });

  return NextResponse.json({ items, count: items.length });
}

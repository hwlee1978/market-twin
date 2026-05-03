import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { buildEnsemblePdf } from "@/lib/report/ensemble-pdf";
import type { EnsembleAggregate } from "@/lib/simulation/ensemble";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/ensembles/:id/pdf?locale=ko
 *
 * Renders the ensemble aggregate as a 2-page A4 PDF (cover +
 * recommendation distribution + segment picks + score statistics +
 * variance assessment). Returns 409 if the ensemble hasn't completed
 * yet — caller should wait for status to flip.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const locale = (url.searchParams.get("locale") ?? "ko") === "en" ? "en" : "ko";

  const wsCtx = await getOrCreatePrimaryWorkspace();
  if (!wsCtx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = await createClient();
  const { data: ensemble, error } = await supabase
    .from("ensembles")
    .select(
      "id, status, tier, parallel_sims, per_sim_personas, llm_providers, aggregate_result, completed_at, project_id",
    )
    .eq("id", id)
    .eq("workspace_id", wsCtx.workspaceId)
    .single();
  if (error || !ensemble) {
    return NextResponse.json({ error: "ensemble not found" }, { status: 404 });
  }
  if (ensemble.status !== "completed" || !ensemble.aggregate_result) {
    return NextResponse.json(
      { error: "ensemble not ready", status: ensemble.status },
      { status: 409 },
    );
  }

  // Pull project context for the project-info / executive-summary
  // pages. Same row the dashboard uses; kept out of the ensembles
  // select so we don't widen that row's footprint everywhere.
  const { data: project } = await supabase
    .from("projects")
    .select(
      "name, product_name, category, description, base_price_cents, currency, objective, originating_country, candidate_countries",
    )
    .eq("id", ensemble.project_id)
    .single();
  const productName = project?.product_name ?? "Untitled product";

  const buffer = await buildEnsemblePdf({
    aggregate: ensemble.aggregate_result as EnsembleAggregate,
    productName,
    tier: ensemble.tier as
      | "hypothesis"
      | "decision"
      | "decision_plus"
      | "deep"
      | "deep_pro",
    parallelSims: ensemble.parallel_sims,
    perSimPersonas: ensemble.per_sim_personas,
    llmProviders: ensemble.llm_providers ?? ["anthropic"],
    locale,
    generatedAt: ensemble.completed_at ? new Date(ensemble.completed_at) : new Date(),
    ensembleId: ensemble.id,
    project: project ?? null,
  });

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="market-twin-ensemble-${ensemble.id.slice(0, 8)}.pdf"`,
    },
  });
}

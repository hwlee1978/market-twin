import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { buildEnsemblePdf } from "@/lib/report/ensemble-pdf";
import type { EnsembleAggregate } from "@/lib/simulation/ensemble";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// PDF render fetches webfonts from jsDelivr and runs react-pdf over a
// 5,000-persona deep-tier aggregate; the default 10s default Vercel
// function budget is tight. Bumped to 300s (Pro Fluid) so cold-start
// font fetches + heavy renders have headroom. Local build is ~3-8s.
export const maxDuration = 300;

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
  // variant switch — "executive" delivers a 2-3 page decision-deck PDF;
  // "detailed" (default) delivers the full analyst-grade report with
  // every drilldown page. Default to detailed so existing share/save
  // flows keep producing the comprehensive report.
  const variantRaw = url.searchParams.get("variant") ?? "detailed";
  const variant: "executive" | "detailed" =
    variantRaw === "executive" ? "executive" : "detailed";

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
      "name, product_name, category, description, base_price_cents, currency, objective, originating_country, candidate_countries, asset_urls, asset_descriptions",
    )
    .eq("id", ensemble.project_id)
    .single();
  const productName = project?.product_name ?? "Untitled product";

  // Wrap the build so the client sees a real error message instead of
  // a 500 with no body. The wrapper logs to Sentry (auto-capture) and
  // surfaces a short error code + message in the JSON response that
  // the dashboard's catch can display.
  let buffer: Buffer;
  try {
    buffer = await buildEnsemblePdf({
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
      variant,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error(
      `[ensemble-pdf] build failed for ${id} (tier=${ensemble.tier}, variant=${variant}):`,
      message,
      stack,
    );
    return NextResponse.json(
      {
        error: "pdf_build_failed",
        message,
        ensembleId: id,
        tier: ensemble.tier,
        variant,
      },
      { status: 500 },
    );
  }

  // Filename suffix tells the user which variant they downloaded so
  // saved copies on disk don't get confused.
  const variantSuffix = variant === "executive" ? "exec" : "detail";

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="market-twin-${variantSuffix}-${ensemble.id.slice(0, 8)}.pdf"`,
    },
  });
}

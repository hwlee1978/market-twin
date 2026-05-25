import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { buildSecondaryRisks } from "@/lib/simulation/secondary-risks";
import { withLLMContext } from "@/lib/llm-context";
import type { EnsembleAggregate } from "@/lib/simulation/ensemble";
import type { MarketProfile, ProjectInput } from "@/lib/simulation/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/ensembles/:id/secondary-risks?country=XX
 *
 * Generates MergedRisk-shaped entries for a Top-2 secondary country
 * (severity/factor/description/surfacedInSims/personaCategory) and
 * persists to aggregate_result.additionalRisks[XX]. The RisksTab UI
 * renders them with the same card layout as the primary mergedRisks.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const country = (url.searchParams.get("country") ?? "").toUpperCase().slice(0, 2);
  if (!country) {
    return NextResponse.json({ error: "country query param required" }, { status: 400 });
  }

  const wsCtx = await getOrCreatePrimaryWorkspace();
  if (!wsCtx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = await createClient();
  const { data: ensemble, error } = await supabase
    .from("ensembles")
    .select("id, project_id, status, aggregate_result, workspace_id")
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

  const aggregate = ensemble.aggregate_result as EnsembleAggregate;
  if (
    aggregate.recommendation?.country &&
    aggregate.recommendation.country.toUpperCase() === country
  ) {
    return NextResponse.json(
      { error: "winner country — use primary mergedRisks instead" },
      { status: 400 },
    );
  }

  const { data: project } = await supabase
    .from("projects")
    .select(
      "name, product_name, category, description, base_price_cents, currency, objective, originating_country, candidate_countries, competitor_urls, asset_descriptions, asset_urls",
    )
    .eq("id", ensemble.project_id)
    .single();
  if (!project) {
    return NextResponse.json({ error: "project not found" }, { status: 404 });
  }

  const projectInput: ProjectInput = {
    productName: project.product_name,
    category: project.category ?? "other",
    description: project.description ?? "",
    basePriceCents: project.base_price_cents ?? 0,
    currency: project.currency ?? "USD",
    objective: project.objective as ProjectInput["objective"],
    originatingCountry: project.originating_country ?? "KR",
    candidateCountries: project.candidate_countries ?? [],
    competitorUrls: project.competitor_urls ?? [],
    assetDescriptions: project.asset_descriptions ?? [],
    assetUrls: project.asset_urls ?? [],
  };

  const additionalProfiles = (aggregate as unknown as {
    additionalMarketProfiles?: Record<string, MarketProfile>;
  }).additionalMarketProfiles;
  const secondaryProfile = additionalProfiles?.[country];

  const sampleText =
    (aggregate.narrative?.executiveSummary ?? "") +
    (aggregate.recommendation?.country ?? "");
  const locale: "ko" | "en" = /[ㄱ-힝]/.test(sampleText) ? "ko" : "en";

  const result = await withLLMContext(
    {
      workspaceId: wsCtx.workspaceId,
      stageLabel: "secondary-risks",
      ensembleId: id,
    },
    () =>
      buildSecondaryRisks({
        input: projectInput,
        aggregate,
        country,
        secondaryProfile: secondaryProfile ?? undefined,
        locale,
      }),
  );
  if (!result.risks) {
    return NextResponse.json(
      { error: result.error ?? "generation failed" },
      { status: 502 },
    );
  }

  const admin = createServiceClient();
  const existing =
    (aggregate as unknown as { additionalRisks?: Record<string, unknown> })
      .additionalRisks ?? {};
  const updatedAggregate = {
    ...aggregate,
    additionalRisks: {
      ...existing,
      [country]: result.risks,
    },
  };
  const { error: updateErr } = await admin
    .from("ensembles")
    .update({ aggregate_result: updatedAggregate })
    .eq("id", id);
  if (updateErr) {
    return NextResponse.json(
      { error: `failed to persist: ${updateErr.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    country,
    risks: result.risks,
    costEstimateUsd: result.costEstimateUsd,
    grounded: Boolean(secondaryProfile),
  });
}

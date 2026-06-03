import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { buildSecondaryPricing } from "@/lib/simulation/secondary-pricing";
import { withLLMContext } from "@/lib/llm-context";
import type { EnsembleAggregate } from "@/lib/simulation/ensemble";
import type { MarketProfile, ProjectInput } from "@/lib/simulation/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/ensembles/:id/secondary-pricing?country=XX
 *
 * Generates a parallel pricing analysis for a Top-2 secondary country
 * — recommended price, conversion curve, margin estimate — and
 * persists into aggregate_result.additionalPricing[XX]. The PricingTab
 * + PDF read from there to render a full secondary pricing block
 * alongside the primary winner's pricing analysis.
 *
 * Single Sonnet pass (~$0.10) — far cheaper than re-running the full
 * ensemble pricing pipeline (6 sims × ~$0.50).
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
      { error: "winner country — primary pricing already covers this" },
      { status: 400 },
    );
  }

  const { data: project } = await supabase
    .from("projects")
    .select(
      "name, product_name, category, description, base_price_cents, currency, objective, originating_country, candidate_countries, competitor_urls, asset_descriptions, asset_urls, founder_background, channel_priority, kol_relationships",
    )
    .eq("id", ensemble.project_id)
    .single();
  if (!project) {
    return NextResponse.json({ error: "project not found" }, { status: 404 });
  }

  const founderBg = (project as { founder_background?: string | null }).founder_background ?? null;
  const channelPriority = (project as { channel_priority?: string | null }).channel_priority ?? null;
  const kolRel = (project as { kol_relationships?: string | null }).kol_relationships ?? null;
  const brandStrategy =
    founderBg || channelPriority || kolRel
      ? {
          ...(founderBg ? { founderBackground: founderBg } : {}),
          ...(channelPriority
            ? { channelPriority: channelPriority as NonNullable<ProjectInput["brandStrategy"]>["channelPriority"] }
            : {}),
          ...(kolRel ? { kolRelationships: kolRel } : {}),
        }
      : undefined;

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
    ...(brandStrategy ? { brandStrategy } : {}),
  };

  // Pull the secondary's market profile from the sibling map so the
  // generator has competitor benchmarks + cultural notes + regulatory
  // context to ground pricing. When missing we still run, just with
  // persona signal alone (worse quality).
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
      stageLabel: "secondary-pricing",
      ensembleId: id,
    },
    () =>
      buildSecondaryPricing({
        input: projectInput,
        aggregate,
        country,
        secondaryProfile: secondaryProfile ?? undefined,
        locale,
      }),
  );
  if (!result.pricing) {
    return NextResponse.json(
      { error: result.error ?? "generation failed" },
      { status: 502 },
    );
  }

  const admin = createServiceClient();
  const existingAdditional =
    (aggregate as unknown as { additionalPricing?: Record<string, unknown> })
      .additionalPricing ?? {};
  const updatedAggregate = {
    ...aggregate,
    additionalPricing: {
      ...existingAdditional,
      [country]: result.pricing,
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
    pricing: result.pricing,
    costEstimateUsd: result.costEstimateUsd,
    grounded: Boolean(secondaryProfile),
  });
}

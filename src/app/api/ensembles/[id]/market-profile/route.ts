import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { buildMarketProfile } from "@/lib/simulation/market-profile";
import { withLLMContext } from "@/lib/llm-context";
import type { EnsembleAggregate } from "@/lib/simulation/ensemble";
import type { ProjectInput } from "@/lib/simulation/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/ensembles/:id/market-profile
 *
 * Backfill the recommended-country market profile on an existing
 * ensemble. Useful for ensembles that completed before the market-
 * profile stage was wired into the runner — running this endpoint
 * generates the profile via a single LLM call and persists it to
 * aggregate_result.marketProfile.
 *
 * Idempotent-ish: if marketProfile already exists, regenerates and
 * overwrites. Workspace-membership scoped so users can only enrich
 * their own ensembles.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  // Optional ?country=XX override — when provided we build a market
  // profile for that secondary candidate and persist it to
  // aggregate_result.additionalMarketProfiles[XX] (keyed by country code)
  // rather than overwriting the primary marketProfile.
  const url = new URL(req.url);
  const countryOverride = (url.searchParams.get("country") ?? "").toUpperCase().slice(0, 2) || null;
  const wsCtx = await getOrCreatePrimaryWorkspace();
  if (!wsCtx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = await createClient();
  const { data: ensemble, error } = await supabase
    .from("ensembles")
    .select(
      "id, project_id, status, aggregate_result, workspace_id",
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

  // Pull the project context — same shape buildMarketProfile expects
  // as ProjectInput. We could re-derive from the ensemble snapshots
  // but a single project query is cheaper and more explicit.
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

  const aggregate = ensemble.aggregate_result as EnsembleAggregate;
  // Heuristic locale: if recommendation/narrative text is mostly Hangul,
  // run in Korean. Cheap detection without storing a separate field.
  const sampleText = (aggregate.narrative?.executiveSummary ?? "") +
    (aggregate.recommendation?.country ?? "");
  const locale: "ko" | "en" = /[ㄱ-힝]/.test(sampleText) ? "ko" : "en";

  const result = await withLLMContext(
    {
      workspaceId: wsCtx.workspaceId,
      stageLabel: countryOverride ? "market-profile-secondary" : "market-profile",
      ensembleId: id,
    },
    () =>
      buildMarketProfile({
        input: projectInput,
        aggregate,
        locale,
        countryOverride: countryOverride ?? undefined,
      }),
  );
  if (!result.profile) {
    return NextResponse.json(
      { error: result.error ?? "market profile generation failed" },
      { status: 502 },
    );
  }

  // Persist. Primary path overwrites aggregate.marketProfile. Secondary
  // path (countryOverride present + different from winner) drops into a
  // sibling map so the primary stays intact and the UI can show both.
  const admin = createServiceClient();
  const winnerCountry = aggregate.recommendation?.country;
  const isSecondary =
    countryOverride && winnerCountry && countryOverride !== winnerCountry;
  const updatedAggregate = isSecondary
    ? {
        ...aggregate,
        additionalMarketProfiles: {
          ...((aggregate as unknown as { additionalMarketProfiles?: Record<string, unknown> })
            .additionalMarketProfiles ?? {}),
          [countryOverride!]: result.profile,
        },
      }
    : { ...aggregate, marketProfile: result.profile };
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

  return NextResponse.json({ ok: true, marketProfile: result.profile });
}

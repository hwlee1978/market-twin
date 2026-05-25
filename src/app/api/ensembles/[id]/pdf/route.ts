import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { buildEnsemblePdf } from "@/lib/report/ensemble-pdf";
import { buildValidationPdf } from "@/lib/report/validation-pdf";
import { generateValidationContent } from "@/lib/report/validation-content";
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
  // variant switch:
  //   "executive"  — 2-3 page decision-deck PDF
  //   "detailed"   — full analyst-grade report (default)
  //   "validation" — McKinsey/BCG-style cross-validation report
  const variantRaw = url.searchParams.get("variant") ?? "detailed";
  const variant: "executive" | "detailed" | "validation" =
    variantRaw === "executive"
      ? "executive"
      : variantRaw === "validation"
        ? "validation"
        : "detailed";

  const wsCtx = await getOrCreatePrimaryWorkspace();
  if (!wsCtx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = await createClient();
  const { data: ensemble, error } = await supabase
    .from("ensembles")
    .select(
      "id, status, tier, parallel_sims, per_sim_personas, llm_providers, aggregate_result, completed_at, created_at, project_id",
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
    if (variant === "validation") {
      const aggregate = ensemble.aggregate_result as EnsembleAggregate;
      const candidateCountries = project?.candidate_countries ?? [];
      const durationMinutes =
        ensemble.created_at && ensemble.completed_at
          ? Math.round(
              (new Date(ensemble.completed_at).getTime() -
                new Date(ensemble.created_at).getTime()) /
                60000,
            )
          : undefined;
      const validationData = await generateValidationContent(
        aggregate,
        {
          productName,
          category: project?.category ?? null,
          description: project?.description ?? null,
          basePriceCents: project?.base_price_cents ?? null,
          currency: project?.currency ?? null,
          originatingCountry: project?.originating_country ?? null,
          candidateCountries,
        },
        {
          ensembleId: ensemble.id,
          tier: ensemble.tier,
          locale,
          llmProviders: ensemble.llm_providers ?? ["anthropic"],
          durationMinutes,
        },
      );
      if (!validationData) {
        return NextResponse.json(
          {
            error: "validation_content_failed",
            message:
              "Cross-validation content generator did not return data (LLM call failed or missing API key).",
            ensembleId: id,
          },
          { status: 502 },
        );
      }

      // Inject Top-2 secondary analysis if (a) it's a tie case AND
      // (b) the user already backfilled additionalMarketProfiles /
      // Actions / Risks on the dashboard. No extra LLM call here —
      // we just reshape the persisted aggregate into the
      // ValidationReportData.secondaryAnalysis schema.
      const secondaryCountry =
        validationData.simResult.displayMode === "top2"
          ? validationData.simResult.secondary?.country
          : undefined;
      if (secondaryCountry) {
        type SecondaryPricingShape = {
          recommendedPriceCents: number;
          recommendedPriceP25: number;
          recommendedPriceP75: number;
          marginEstimate: string;
          marginEstimatePct?: number;
          curveRevenueMaxCents?: number | null;
          rationale: string;
          curve: Array<{ priceCents: number; meanConversionProbability: number; sampleCount: number }>;
        };
        const aggExtra = aggregate as unknown as {
          additionalMarketProfiles?: Record<string, EnsembleAggregate["marketProfile"]>;
          additionalActions?: Record<
            string,
            Array<{ action: string; impact?: number; effort?: number; actionCategory?: string }>
          >;
          additionalRisks?: Record<
            string,
            Array<{
              factor: string;
              description: string;
              severity: "low" | "medium" | "high";
              personaCategory?: string;
            }>
          >;
          additionalPricing?: Record<string, SecondaryPricingShape>;
        };
        const mp = aggExtra.additionalMarketProfiles?.[secondaryCountry] ?? null;
        const actions = aggExtra.additionalActions?.[secondaryCountry] ?? [];
        const risks = aggExtra.additionalRisks?.[secondaryCountry] ?? [];
        const secondaryPricing = aggExtra.additionalPricing?.[secondaryCountry] ?? null;
        if (mp || actions.length || risks.length || secondaryPricing) {
          validationData.secondaryAnalysis = {
            country: secondaryCountry,
            marketProfile: mp
              ? {
                  tam: mp.marketSize?.estimateUsd,
                  growth: mp.marketSize?.growthTrend,
                  segment: mp.marketSize?.addressableSegment,
                  competitors: (mp.competitors ?? []).map((c) => ({
                    name: c.name,
                    threatLevel: c.threatLevel,
                    brandContext: c.brandContext,
                  })),
                  channels: (mp.channels?.primary ?? []).map((c) => ({
                    name: c.name,
                    rationale: c.rationale,
                  })),
                  regulatory: {
                    barriers: (mp.regulatory?.barriers ?? []).map((b) => ({
                      name: b.name,
                      severity: b.severity,
                      description: b.description,
                    })),
                    requirements: mp.regulatory?.requirements ?? [],
                    timeToCompliance: mp.regulatory?.timeToCompliance,
                  },
                  culturalNotes: {
                    valuesAlignment: mp.culturalNotes?.valuesAlignment,
                    purchaseBehavior: mp.culturalNotes?.purchaseBehavior,
                    languageNotes: mp.culturalNotes?.languageNotes,
                    seasonality: mp.culturalNotes?.seasonality,
                  },
                  pricingBenchmarks: {
                    entry: mp.pricingBenchmarks?.entryLevel,
                    mid: mp.pricingBenchmarks?.mid,
                    premium: mp.pricingBenchmarks?.premium,
                    yourPosition: mp.pricingBenchmarks?.yourPosition,
                  },
                  gtm: {
                    keyMessage: mp.goToMarketStrategy?.keyMessage,
                    primaryAudience: mp.goToMarketStrategy?.primaryAudience,
                    differentiators: mp.goToMarketStrategy?.differentiators ?? [],
                    risks: mp.goToMarketStrategy?.risks ?? [],
                  },
                }
              : undefined,
            actions: actions.map((a) => ({
              action: a.action,
              impact: a.impact,
              effort: a.effort,
              actionCategory: a.actionCategory,
            })),
            risks: risks.map((r) => ({
              factor: r.factor,
              description: r.description,
              severity: r.severity,
              personaCategory: r.personaCategory,
            })),
            pricing: secondaryPricing ?? undefined,
          };
        }
      }

      buffer = await buildValidationPdf(validationData);
    } else {
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
    }
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
  const variantSuffix =
    variant === "executive" ? "exec" : variant === "validation" ? "validation" : "detail";

  return new NextResponse(buffer as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="market-twin-${variantSuffix}-${ensemble.id.slice(0, 8)}.pdf"`,
    },
  });
}

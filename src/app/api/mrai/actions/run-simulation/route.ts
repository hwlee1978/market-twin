import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { resolveCompetitors } from "@/lib/simulation/competitor-resolver";

export const dynamic = "force-dynamic";
// Project creation + competitor resolver runs synchronously; the
// run-ensemble fetch we kick off internally fires-and-forgets so this
// route returns within the standard limit.
export const maxDuration = 60;

const Body = z.object({
  name: z.string().min(1).max(120),
  productName: z.string().min(1).max(120),
  category: z.string().min(2).max(40),
  description: z.string().min(10).max(2000),
  basePrice: z.string().regex(/^\d+(\.\d+)?$/),
  currency: z.string().min(3).max(4),
  objective: z.enum(["awareness", "conversion", "retention", "expansion"]),
  originatingCountry: z.string().length(2),
  countries: z.array(z.string().length(2)).min(1).max(8),
  competitorNames: z.array(z.string().max(80)).max(8),
  /** Creative concept descriptions, one per array entry. */
  assetDescriptions: z.array(z.string().max(600)).max(6).default([]),
  /** Optional image URLs (Supabase Storage or external). */
  assetUrls: z.array(z.string().url()).max(6).default([]),
  tier: z.enum([
    "hypothesis",
    "decision",
    "decision_plus",
    "deep",
    "deep_pro",
  ]),
  locale: z.enum(["ko", "en"]).default("ko"),
});

/**
 * POST /api/mrai/actions/run-simulation
 *
 * Chat-side simulation trigger. Takes the (possibly user-edited) draft
 * from a SimulationProposalCard, creates the project, then kicks off
 * the ensemble. Returns projectId + ensembleId so the card can pivot
 * into a "running" state with links to the results page.
 *
 * Stays inside the workspace caller already belongs to — same RLS path
 * as the wizard's /api/projects route.
 */
export async function POST(req: Request) {
  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (ctx.status !== "active") {
    return NextResponse.json({ error: `workspace_${ctx.status}` }, { status: 403 });
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const input = parsed.data;

  // Cents conversion — wizard sends cents already, we accept a plain
  // number string and convert. Floor to integer so KRW input doesn't
  // introduce sub-won rows.
  const basePriceCents = Math.floor(parseFloat(input.basePrice) * 100);

  // Competitor resolution (LLM resolver) — same flow as the wizard so
  // the project lands with consistently shaped competitor data.
  let resolved: Array<{ name: string; url: string }> = [];
  try {
    resolved = await resolveCompetitors({
      productName: input.productName,
      category: input.category,
      description: input.description,
      candidateCountries: input.countries,
      userNames: input.competitorNames,
      userUrls: [],
      locale: input.locale,
    });
  } catch (e) {
    console.warn("[mrai/actions/run-simulation] competitor resolver failed", e);
    resolved = input.competitorNames.map((name) => ({ name, url: "" }));
  }
  const derivedCompetitorUrls = Array.from(
    new Set(
      resolved
        .map((c) => c.url)
        .filter((u) => u && /^https?:\/\//.test(u)),
    ),
  );

  const supabase = await createClient();
  const { data: project, error: projErr } = await supabase
    .from("projects")
    .insert({
      workspace_id: ctx.workspaceId,
      created_by: ctx.userId,
      name: input.name,
      product_name: input.productName,
      category: input.category,
      description: input.description,
      base_price_cents: basePriceCents,
      currency: input.currency,
      objective: input.objective,
      originating_country: input.originatingCountry,
      candidate_countries: input.countries,
      competitor_urls: derivedCompetitorUrls,
      competitor_names_user: input.competitorNames,
      competitors_resolved: resolved,
      asset_descriptions: input.assetDescriptions,
      asset_urls: input.assetUrls,
      status: "ready",
    })
    .select("id")
    .single();
  if (projErr || !project) {
    return NextResponse.json(
      { error: "project_create_failed", detail: projErr?.message },
      { status: 500 },
    );
  }
  const projectId = project.id as string;

  // Kick off run-ensemble. We POST to our own route so plan/quota/billing
  // gates run unchanged — duplicating that logic here would be fragile.
  // The route is fire-and-forget from the user's POV (returns ensembleId
  // immediately and runs the work in after-callback or Cloud Run).
  const origin = new URL(req.url).origin;
  let ensembleId: string | null = null;
  try {
    const cookieHeader = req.headers.get("cookie") ?? "";
    const runRes = await fetch(`${origin}/api/projects/${projectId}/run-ensemble`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: cookieHeader,
      },
      body: JSON.stringify({
        tier: input.tier,
        locale: input.locale,
      }),
    });
    const runJson = await runRes.json().catch(() => ({}));
    if (!runRes.ok) {
      // Project was created but ensemble didn't start. Surface both so
      // the user can retry from the project page without re-entering
      // the wizard.
      return NextResponse.json(
        {
          error: "ensemble_start_failed",
          projectId,
          detail: runJson.error ?? runJson.detail ?? `status ${runRes.status}`,
        },
        { status: 500 },
      );
    }
    ensembleId = (runJson.ensembleId as string) ?? null;
  } catch (e) {
    return NextResponse.json(
      {
        error: "ensemble_start_failed",
        projectId,
        detail: e instanceof Error ? e.message : "fetch_error",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    projectId,
    ensembleId,
    tier: input.tier,
  });
}

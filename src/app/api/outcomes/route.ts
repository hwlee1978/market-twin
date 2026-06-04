/**
 * POST /api/outcomes
 *
 * Submit a launch outcome for a project. Powers the outcome-feedback
 * corpus that drives production accuracy KPI + calibration loop.
 *
 * Snapshot the project's latest ensemble recommendation at submit time
 * so the comparison baseline doesn't drift if the user re-runs sims.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";

const SubmitSchema = z.object({
  projectId: z.string().uuid(),
  launchStatus: z.enum(["planning", "launched", "pivoted", "abandoned"]),
  // ISO-2 country code; required when launch_status reflects an actual launch
  launchCountry: z.string().length(2).optional().nullable(),
  launchDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD")
    .optional()
    .nullable(),
  notes: z.string().max(2000).optional().nullable(),
  launchedViaChannels: z.array(z.string()).default([]),
  outcomeMetrics: z.record(z.string(), z.unknown()).optional().nullable(),
});

export async function POST(req: Request) {
  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = SubmitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const input = parsed.data;

  // Sanity: launched/pivoted requires a country
  if (
    (input.launchStatus === "launched" || input.launchStatus === "pivoted") &&
    !input.launchCountry
  ) {
    return NextResponse.json(
      {
        error: "country_required",
        detail: "launchCountry required when launchStatus is 'launched' or 'pivoted'",
      },
      { status: 400 },
    );
  }

  const supabase = await createClient();

  // Project must belong to the user's workspace
  const { data: project } = await supabase
    .from("projects")
    .select("id, workspace_id")
    .eq("id", input.projectId)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();
  if (!project) {
    return NextResponse.json({ error: "project_not_found" }, { status: 404 });
  }

  // Snapshot the latest completed ensemble's recommendation for this
  // project — the comparison baseline. If no completed ensemble exists,
  // recommendation_* fields stay null (planning-only outcome).
  const admin = createServiceClient();
  const { data: latestEnsemble } = await admin
    .from("ensembles")
    .select("id, aggregate_result, status, completed_at")
    .eq("project_id", input.projectId)
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const aggregate = latestEnsemble?.aggregate_result as
    | { recommendation?: { country?: string; confidence?: string } }
    | null;
  const recommendationCountry =
    aggregate?.recommendation?.country?.toUpperCase() ?? null;
  const rawConfidence = aggregate?.recommendation?.confidence;
  const recommendationConfidence =
    rawConfidence && ["STRONG", "MODERATE", "WEAK"].includes(rawConfidence)
      ? rawConfidence
      : null;

  const { data: created, error: insertErr } = await admin
    .from("outcome_feedback")
    .insert({
      workspace_id: ctx.workspaceId,
      project_id: input.projectId,
      submitted_by: ctx.userId,
      launch_status: input.launchStatus,
      launch_country: input.launchCountry?.toUpperCase() ?? null,
      launch_date: input.launchDate ?? null,
      notes: input.notes ?? null,
      launched_via_channels: input.launchedViaChannels,
      outcome_metrics: input.outcomeMetrics ?? null,
      recommendation_country: recommendationCountry,
      recommendation_confidence: recommendationConfidence,
      recommendation_ensemble_id: latestEnsemble?.id ?? null,
    })
    .select("id, matched_recommendation")
    .single();

  if (insertErr || !created) {
    return NextResponse.json(
      { error: "insert_failed", detail: insertErr?.message ?? null },
      { status: 500 },
    );
  }

  return NextResponse.json({
    outcomeId: created.id,
    matchedRecommendation: created.matched_recommendation,
    recommendationCountry,
    recommendationConfidence,
  });
}

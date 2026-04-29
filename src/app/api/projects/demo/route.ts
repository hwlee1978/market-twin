import { NextResponse, after } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import {
  SAMPLE_PERSONA_COUNT,
  SAMPLE_PROJECT_NAME,
  getSampleProjectInput,
  getSampleProjectRecord,
} from "@/lib/demo/sampleProject";
import { runSimulation } from "@/lib/simulation/runner";

// Same budget as the manual run path — Vercel kills serverless functions
// past 300s. The 50-persona demo finishes well inside that.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * POST /api/projects/demo
 *
 * One-click onboarding: creates a fully-populated sample project and
 * kicks off a smaller simulation (50 personas / 3 countries) so a new
 * user can see real results within a few minutes without filling the
 * 6-step wizard. Re-running this just creates another demo project —
 * we intentionally don't dedup so the user can compare runs.
 *
 * Returns: { projectId, simulationId } so the client can redirect
 * straight to the in-progress results page.
 */
export async function POST() {
  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (ctx.status !== "active") {
    return NextResponse.json(
      { error: `workspace_${ctx.status}` },
      { status: 403 },
    );
  }

  const sample = getSampleProjectRecord();
  const supabase = await createClient();
  const { data: project, error: projectErr } = await supabase
    .from("projects")
    .insert({
      workspace_id: ctx.workspaceId,
      created_by: ctx.userId,
      name: SAMPLE_PROJECT_NAME,
      product_name: sample.productName,
      category: sample.category,
      description: sample.description,
      base_price_cents: sample.basePriceCents,
      currency: sample.currency,
      objective: sample.objective,
      candidate_countries: [...sample.candidateCountries],
      competitor_urls: [],
      status: "running",
    })
    .select("id, workspace_id")
    .single();
  if (projectErr || !project) {
    return NextResponse.json(
      { error: projectErr?.message ?? "failed to create demo project" },
      { status: 500 },
    );
  }

  const admin = createServiceClient();
  const { data: sim, error: simErr } = await admin
    .from("simulations")
    .insert({
      project_id: project.id,
      workspace_id: project.workspace_id,
      status: "pending",
      persona_count: SAMPLE_PERSONA_COUNT,
      current_stage: "validating",
    })
    .select("id")
    .single();
  if (simErr || !sim) {
    return NextResponse.json(
      { error: simErr?.message ?? "failed to create demo simulation" },
      { status: 500 },
    );
  }

  const projectInput = getSampleProjectInput();

  // Identical lifecycle to /api/simulations/[id]/run — schedule the actual
  // pipeline AFTER the response leaves so the client gets a snappy redirect
  // and the runner has the full maxDuration budget to finish.
  after(async () => {
    try {
      await runSimulation({
        simulationId: sim.id,
        projectInput,
        personaCount: SAMPLE_PERSONA_COUNT,
        locale: "ko",
      });
    } catch (err) {
      console.error("[demo] simulation failed", err);
      await admin
        .from("simulations")
        .update({
          status: "failed",
          error_message: err instanceof Error ? err.message : String(err),
        })
        .eq("id", sim.id);
    }
  });

  return NextResponse.json({ projectId: project.id, simulationId: sim.id });
}

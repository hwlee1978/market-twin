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

// Same budget as the manual run path — see /api/simulations/:id/run/route.ts
// for the Pro + Fluid Compute = 800s rationale. The 50-persona demo finishes
// well inside even the basic 300s tier; 800s just matches the rest of the
// pipeline so admin/retry flows behave identically.
export const maxDuration = 800;
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
/**
 * Demo creations allowed per workspace per UTC day. Each demo runs a
 * real 50-persona simulation costing $1-2 of LLM, so an uncapped
 * authenticated endpoint is a six-figure-bill exposure if any user
 * scripts it. 3/day bounds worst-case spend per user, and the demo sim
 * now runs on Haiku (see runSimulation call below) so the per-run cost is
 * roughly 10x lower than the Sonnet default.
 */
const DEMO_DAILY_CAP = 3;

export async function POST() {
  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (ctx.status !== "active") {
    return NextResponse.json(
      { error: `workspace_${ctx.status}` },
      { status: 403 },
    );
  }

  const supabase = await createClient();

  // Per-workspace daily rate limit on demo creation. Demo projects all
  // share SAMPLE_PROJECT_NAME, so counting by name + workspace + today
  // is a stable proxy without a separate counters table.
  const dayStartIso = new Date(new Date().setUTCHours(0, 0, 0, 0)).toISOString();
  const { count: todayCount, error: countErr } = await supabase
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", ctx.workspaceId)
    .eq("name", SAMPLE_PROJECT_NAME)
    .gte("created_at", dayStartIso);
  if (countErr) {
    console.error("[demo] daily count failed", countErr.message);
  } else if ((todayCount ?? 0) >= DEMO_DAILY_CAP) {
    return NextResponse.json(
      {
        error: "demo_daily_cap_reached",
        detail: `Demo limit ${DEMO_DAILY_CAP} reached for today — create a real project via the wizard instead.`,
      },
      { status: 429 },
    );
  }

  const sample = getSampleProjectRecord();
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
      originating_country: sample.originatingCountry,
      candidate_countries: [...sample.candidateCountries],
      competitor_urls: [],
      asset_descriptions: [...sample.assetDescriptions],
      asset_urls: [...sample.assetUrls],
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
        // 데모는 가입 유도용 맛보기 — voice 품질보다 비용·속도가 우선이라
        // 전 stage를 Haiku로. 기본 라우팅(persona/synthesis=Sonnet) 대비
        // 1회 비용 약 10배↓. hypothesis 무료 티어와 동일한 논리.
        provider: "anthropic",
        model: "claude-haiku-4-5-20251001",
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

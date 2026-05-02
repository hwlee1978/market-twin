import { NextResponse, after } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { runSimulation } from "@/lib/simulation/runner";
import type { ProjectInput } from "@/lib/simulation/schemas";

// Same lifecycle budget as the original /run endpoint. Pro + Fluid Compute
// caps at 800s — see /run/route.ts for the rationale.
export const maxDuration = 800;
export const dynamic = "force-dynamic";

/**
 * POST /api/simulations/:id/retry
 *
 * User-facing retry for a (typically failed) simulation. Spawns a new
 * simulation row from the same project as the source, leaving the original
 * intact as a historical record. Caller must own the workspace.
 *
 * Mirrors /api/admin/simulations/:id/retry but gates on workspace ownership
 * instead of admin role — the failed-state UI calls this so users don't
 * have to manually re-traverse the wizard after a transient LLM failure.
 */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const wsCtx = await getOrCreatePrimaryWorkspace();
  if (!wsCtx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (wsCtx.status !== "active") {
    return NextResponse.json(
      { error: `workspace_${wsCtx.status}` },
      { status: 403 },
    );
  }

  const { id } = await ctx.params;
  const admin = createServiceClient();

  // Workspace filter on the source sim is the ownership check — a user can
  // only retry their own workspace's simulations.
  const { data: source, error: srcErr } = await admin
    .from("simulations")
    .select("id, persona_count, project_id, workspace_id, projects(*)")
    .eq("id", id)
    .eq("workspace_id", wsCtx.workspaceId)
    .single();
  if (srcErr || !source) {
    return NextResponse.json({ error: "source simulation not found" }, { status: 404 });
  }
  const project = Array.isArray(source.projects) ? source.projects[0] : source.projects;
  if (!project) {
    return NextResponse.json({ error: "source project missing" }, { status: 404 });
  }

  const { data: newSim, error: insertErr } = await admin
    .from("simulations")
    .insert({
      project_id: project.id,
      workspace_id: project.workspace_id,
      status: "pending",
      persona_count: source.persona_count ?? 200,
      current_stage: "validating",
    })
    .select("id")
    .single();
  if (insertErr || !newSim) {
    return NextResponse.json({ error: insertErr?.message ?? "insert failed" }, { status: 500 });
  }

  await admin.from("projects").update({ status: "running" }).eq("id", project.id);

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

  after(async () => {
    try {
      await runSimulation({
        simulationId: newSim.id,
        projectInput,
        personaCount: source.persona_count ?? 200,
        locale: "ko",
      });
    } catch (err) {
      console.error("[user retry] simulation failed", err);
      await admin
        .from("simulations")
        .update({
          status: "failed",
          current_stage: "failed",
          error_message: err instanceof Error ? err.message : String(err),
        })
        .eq("id", newSim.id);
    }
  });

  return NextResponse.json({ simulationId: newSim.id });
}

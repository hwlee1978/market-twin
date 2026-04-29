import { NextResponse, after } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { ADMIN_PERMISSIONS, getAdminContext, recordAuditLog } from "@/lib/admin";
import { runSimulation } from "@/lib/simulation/runner";
import type { ProjectInput } from "@/lib/simulation/schemas";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/simulations/:id/retry
 * Spawns a NEW simulation row from the same project as the given (typically
 * failed) simulation. Old sim is left intact as a historical record.
 */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const adminCtx = await getAdminContext();
  if (!adminCtx) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!ADMIN_PERMISSIONS.retrySimulation(adminCtx.role)) {
    return NextResponse.json({ error: "insufficient_role" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const admin = createServiceClient();

  // Load the source simulation + its project so we can build a fresh ProjectInput.
  const { data: source, error: srcErr } = await admin
    .from("simulations")
    .select("id, persona_count, project_id, workspace_id, projects(*)")
    .eq("id", id)
    .single();
  if (srcErr || !source) {
    return NextResponse.json({ error: "source simulation not found" }, { status: 404 });
  }
  const project = Array.isArray(source.projects) ? source.projects[0] : source.projects;
  if (!project) {
    return NextResponse.json({ error: "source project missing" }, { status: 404 });
  }

  // Insert a new simulation row pointing at the same project.
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
    candidateCountries: project.candidate_countries ?? [],
    competitorUrls: project.competitor_urls ?? [],
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
      console.error("[admin retry] simulation failed", err);
      await admin
        .from("simulations")
        .update({
          status: "failed",
          current_stage: "failed",
          error_message: err instanceof Error ? err.message : String(err),
        })
        .eq("id", newSim.id);
    }
    await recordAuditLog({
      actorId: adminCtx.userId,
      workspaceId: source.workspace_id,
      action: "simulation.retry",
      resourceType: "simulation",
      resourceId: newSim.id,
      metadata: { sourceSimulationId: source.id },
    });
  });

  return NextResponse.json({ ok: true, simulationId: newSim.id });
}

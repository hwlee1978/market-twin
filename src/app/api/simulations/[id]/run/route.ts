import { NextResponse, after } from "next/server";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { runSimulation } from "@/lib/simulation/runner";
import type { ProjectInput } from "@/lib/simulation/schemas";

// Vercel function timeout — 300s on Pro, 60s default on Hobby.
// Keep persona counts modest in v0.1 so simulations complete inside this budget.
export const maxDuration = 300;
export const dynamic = "force-dynamic";

const RunSchema = z.object({
  personaCount: z.number().int().min(10).max(2000).default(200),
  provider: z.enum(["anthropic", "openai", "gemini"]).optional(),
  model: z.string().optional(),
  locale: z.enum(["ko", "en"]).default("ko"),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await ctx.params;
  const wsCtx = await getOrCreatePrimaryWorkspace();
  if (!wsCtx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (wsCtx.status !== "active") {
    return NextResponse.json(
      { error: `workspace_${wsCtx.status}` },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const parsed = RunSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: project, error: projectErr } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .eq("workspace_id", wsCtx.workspaceId)
    .single();
  if (projectErr || !project) {
    return NextResponse.json({ error: "project not found" }, { status: 404 });
  }

  // Create the simulation row up front so the client can poll.
  const admin = createServiceClient();
  const { data: sim, error: simErr } = await admin
    .from("simulations")
    .insert({
      project_id: project.id,
      workspace_id: project.workspace_id,
      status: "pending",
      persona_count: parsed.data.personaCount,
      current_stage: "validating",
    })
    .select("id")
    .single();
  if (simErr || !sim) {
    return NextResponse.json({ error: simErr?.message ?? "failed to create simulation" }, { status: 500 });
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

  // Schedule the simulation to run AFTER the HTTP response is sent.
  // Plain `void runSimulation(...)` works in `next dev` because the long-lived
  // dev server keeps executing pending promises, but on Vercel the serverless
  // function is killed the moment the response goes out — and the simulation
  // never actually starts. `after()` from next/server explicitly tells the
  // runtime to keep the function alive (up to maxDuration) for background
  // continuation work, which is exactly the lifecycle we need here.
  after(async () => {
    try {
      await runSimulation({
        simulationId: sim.id,
        projectInput,
        personaCount: parsed.data.personaCount,
        provider: parsed.data.provider,
        model: parsed.data.model,
        locale: parsed.data.locale,
      });
    } catch (err) {
      console.error("[run/route] simulation failed", err);
      // The runner's own try/catch should have already set status=failed,
      // but persist a fallback failure marker just in case it threw before that.
      await admin
        .from("simulations")
        .update({
          status: "failed",
          current_stage: "failed",
          error_message: err instanceof Error ? err.message : String(err),
        })
        .eq("id", sim.id);
    }
  });

  return NextResponse.json({ simulationId: sim.id });
}

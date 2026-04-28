import { NextResponse } from "next/server";
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

  // Fire-and-await: we run inside this request because Vercel functions
  // do not survive past the response. For longer jobs, swap to Inngest/QStash.
  // We respond first by NOT awaiting, but we DO need to keep the function alive.
  // Solution: run synchronously and return when complete. Client shows progress
  // by polling /status (the runner updates current_stage as it goes).
  // To avoid blocking the HTTP response on the full run, kick it off and return
  // — Next.js runtime will continue executing inside maxDuration.
  void runSimulation({
    simulationId: sim.id,
    projectInput,
    personaCount: parsed.data.personaCount,
    provider: parsed.data.provider,
    model: parsed.data.model,
    locale: parsed.data.locale,
  }).catch((err) => {
    console.error("simulation failed", err);
  });

  return NextResponse.json({ simulationId: sim.id });
}

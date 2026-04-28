import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ simulationId: string }> },
) {
  const { simulationId } = await ctx.params;
  const wsCtx = await getOrCreatePrimaryWorkspace();
  if (!wsCtx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = await createClient();
  const { data: sim, error: simErr } = await supabase
    .from("simulations")
    .select("id, status, project_id, workspace_id")
    .eq("id", simulationId)
    .eq("workspace_id", wsCtx.workspaceId)
    .single();
  if (simErr || !sim) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { data: result } = await supabase
    .from("simulation_results")
    .select("*")
    .eq("simulation_id", simulationId)
    .maybeSingle();

  return NextResponse.json({ simulation: sim, result });
}

import { NextResponse } from "next/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/mrai/content-drafts/[id]/simulations
 *
 * Lists past simulation runs for this draft, newest first. The UI
 * card reads the latest row to render rates + top quotes; older rows
 * are kept so users can compare runs over time.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const wsCtx = await getOrCreatePrimaryWorkspace();
  if (!wsCtx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mrai_content_simulations")
    .select(
      "id, persona_sample_size, sample_market, like_rate, click_rate, share_rate, save_rate, comment_rate, reaction_distribution, top_positive_quotes, top_objection_quotes, segment_breakdown, llm_cost_usd, created_at",
    )
    .eq("content_draft_id", id)
    .eq("workspace_id", wsCtx.workspaceId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ simulations: data ?? [] });
}

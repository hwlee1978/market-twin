import { NextResponse } from "next/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { runCrawlSource } from "@/lib/mrai/crawl/runner";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/mrai/crawl-sources/[id]/fetch
 *
 * Manually trigger a fetch + diff + memory emission for one crawl
 * source. Used by the "지금 fetch" button on the panel. Returns
 * status + how many new memories were created.
 */
export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const wsCtx = await getOrCreatePrimaryWorkspace();
  if (!wsCtx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Verify ownership before the privileged runner kicks off
  const supabase = await createClient();
  const { data: src } = await supabase
    .from("mrai_crawl_sources")
    .select("id")
    .eq("id", id)
    .eq("workspace_id", wsCtx.workspaceId)
    .maybeSingle();
  if (!src) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const result = await runCrawlSource(id);
  return NextResponse.json(result);
}

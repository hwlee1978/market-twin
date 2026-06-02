import { NextResponse } from "next/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { loadLatestBriefing } from "@/lib/mrai/daily-briefing";

export const dynamic = "force-dynamic";

/**
 * GET /api/mrai/briefings/latest
 * Returns the most recent briefing for the workspace, or null. Used by
 * the client when it wants to refresh the panel after generating one.
 */
export async function GET() {
  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (ctx.status !== "active") {
    return NextResponse.json({ error: `workspace_${ctx.status}` }, { status: 403 });
  }
  const briefing = await loadLatestBriefing(ctx.workspaceId);
  return NextResponse.json({ briefing });
}

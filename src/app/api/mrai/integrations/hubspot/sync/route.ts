import { NextResponse } from "next/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { syncHubSpotForWorkspace } from "@/lib/mrai/integrations/hubspot";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/mrai/integrations/hubspot/sync
 *
 * Manual sync trigger. Fetches recent deals via the HubSpot CRM v3
 * Search API, LLM-summarizes the rollup, and stores it as a
 * mrai_signals row so the next briefing/chat picks it up.
 */
export async function POST() {
  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (ctx.status !== "active") {
    return NextResponse.json({ error: `workspace_${ctx.status}` }, { status: 403 });
  }

  try {
    const result = await syncHubSpotForWorkspace(ctx.workspaceId);
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "internal_error";
    console.error("[mrai/hubspot/sync]", msg, e);
    return NextResponse.json({ error: "sync_failed", detail: msg }, { status: 500 });
  }
}

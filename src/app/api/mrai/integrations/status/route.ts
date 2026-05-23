import { NextResponse } from "next/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/mrai/integrations/status
 * Lists the workspace's connected integrations + the most recent signal
 * per source. Single round-trip so the UI panel renders in one paint.
 */
export async function GET() {
  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (ctx.status !== "active") {
    return NextResponse.json({ error: `workspace_${ctx.status}` }, { status: 403 });
  }

  const supabase = createServiceClient();
  const [integResp, signalResp] = await Promise.all([
    supabase
      .from("mrai_integrations")
      .select("provider, account_label, connected_at, updated_at")
      .eq("workspace_id", ctx.workspaceId),
    supabase
      .from("mrai_signals")
      .select("source, summary, fetched_at")
      .eq("workspace_id", ctx.workspaceId)
      .order("fetched_at", { ascending: false }),
  ]);

  if (integResp.error) {
    return NextResponse.json({ error: "load_failed", detail: integResp.error.message }, { status: 500 });
  }

  const integrations = (integResp.data ?? []) as Array<{
    provider: string;
    account_label: string | null;
    connected_at: string;
    updated_at: string;
  }>;
  const signals = (signalResp.data ?? []) as Array<{
    source: string;
    summary: string;
    fetched_at: string;
  }>;

  // One signal per source — newest wins.
  const latestSignal: Record<string, { summary: string; fetched_at: string }> = {};
  for (const s of signals) {
    if (!latestSignal[s.source]) {
      latestSignal[s.source] = { summary: s.summary, fetched_at: s.fetched_at };
    }
  }

  return NextResponse.json({ integrations, latestSignal });
}

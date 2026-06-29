import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { generateBriefing } from "@/lib/mrai/daily-briefing";
import type { Locale } from "@/lib/mrai/types";
import { withLLMContext } from "@/lib/llm-context";
import { MRAI_CRON_ENABLED } from "@/lib/mrai/config/enabled";
import { assertCronAuth } from "@/lib/auth/cron-gate";

export const dynamic = "force-dynamic";
export const maxDuration = 800;

/**
 * GET /api/mrai/briefings/cron
 *
 * Daily sweep: generate a fresh briefing for every workspace that has
 * at least one saved memory (= has been using Mr. AI). Workspaces with
 * no memory get skipped — a briefing with zero context is just noise.
 *
 * Scheduled via vercel.json @ 23:00 UTC = 08:00 KST. CRON_SECRET-gated
 * so a browser hit can't trigger a wave of LLM bills.
 *
 * Concurrency: workspaces processed sequentially. We could parallelize
 * but Anthropic rate-limits are workspace-shared and a stampede of 50
 * parallel LLM calls is more likely to 429 than 50 serial ones over
 * ~5 minutes. Swap to limited-concurrency (p-limit) when we have >100
 * active workspaces.
 *
 * Failure mode: per-workspace errors are caught and logged so one bad
 * workspace doesn't poison the rest of the sweep. Response returns
 * per-workspace status for cron-monitor dashboards.
 */
export async function GET(req: Request) {
  const gate = assertCronAuth(req);
  if (gate) return gate;

  // Both market-twin (MRAI=false, prod MarketTwin) and market-twin-mrai
  // (MRAI=true, Mr.AI beta) deploy the same vercel.json — meaning the
  // cron fires from BOTH projects each day, generating two briefings
  // ~13s apart for every workspace. Gate at the cron handler so only
  // the Mr.AI deployment actually runs the sweep.
  if (!MRAI_CRON_ENABLED) {
    return NextResponse.json({ skipped: "mrai_not_enabled_on_this_deployment" });
  }

  const admin = createServiceClient();

  // Pull workspaces that have at least one mrai_memory. distinct on
  // workspace_id without a CTE — Supabase JS only supports simple selects,
  // so we fetch IDs then de-dupe client-side. For 10² workspaces this is
  // fine; for 10⁴+ we'd move to a Postgres function.
  const { data: memRows, error: memErr } = await admin
    .from("mrai_memories")
    .select("workspace_id")
    .limit(10000);
  if (memErr) {
    return NextResponse.json({ error: "load_workspaces", detail: memErr.message }, { status: 500 });
  }

  const workspaceIds = Array.from(
    new Set(((memRows ?? []) as Array<{ workspace_id: string }>).map((r) => r.workspace_id)),
  );

  if (workspaceIds.length === 0) {
    return NextResponse.json({ swept: 0, results: [] });
  }

  // Fetch owners (we need a userId to attribute the briefing to). One
  // round-trip for all workspaces, then we map.
  const { data: ownerRows, error: ownerErr } = await admin
    .from("workspace_members")
    .select("workspace_id, user_id, role")
    .in("workspace_id", workspaceIds)
    .eq("role", "owner");
  if (ownerErr) {
    return NextResponse.json({ error: "load_owners", detail: ownerErr.message }, { status: 500 });
  }

  const ownerByWs = new Map<string, string>();
  for (const r of (ownerRows ?? []) as Array<{ workspace_id: string; user_id: string }>) {
    if (!ownerByWs.has(r.workspace_id)) ownerByWs.set(r.workspace_id, r.user_id);
  }

  // Default to Korean since the current user base is KR-first. When we
  // store per-workspace locale preferences we'll read that here instead.
  const locale: Locale = "ko";

  const results: Array<{
    workspaceId: string;
    status: "ok" | "skipped_no_owner" | "failed";
    briefingId?: string;
    error?: string;
  }> = [];

  for (const wsId of workspaceIds) {
    const ownerId = ownerByWs.get(wsId);
    if (!ownerId) {
      results.push({ workspaceId: wsId, status: "skipped_no_owner" });
      continue;
    }
    try {
      const b = await withLLMContext(
        { workspaceId: wsId, stageLabel: "mrai-briefing-cron" },
        () =>
          generateBriefing({
            workspaceId: wsId,
            userId: ownerId,
            locale,
            // Cron MUST await dispatch — Vercel reaps the function
            // right after this response, killing fire-and-forget
            // promises. Le Mouton 5/25 + 5/26 cron briefings were
            // generated but never reached Slack/Email because the
            // default fire-and-forget path got terminated. Adds
            // ~1-3s per workspace; cron timeout is 800s so well
            // within budget.
            dispatch: "await",
          }),
      );
      results.push({ workspaceId: wsId, status: "ok", briefingId: b.id });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "internal_error";
      console.error("[mrai/briefings/cron] workspace failed", wsId, msg);
      results.push({ workspaceId: wsId, status: "failed", error: msg });
    }
  }

  const ok = results.filter((r) => r.status === "ok").length;
  const failed = results.filter((r) => r.status === "failed").length;
  const skipped = results.filter((r) => r.status === "skipped_no_owner").length;
  return NextResponse.json({
    swept: workspaceIds.length,
    ok,
    failed,
    skipped,
    results,
  });
}

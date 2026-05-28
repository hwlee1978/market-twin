import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { runCrawlSource } from "@/lib/mrai/crawl/runner";
import { MRAI_ENABLED } from "@/lib/mrai/enabled";
import { assertCronAuth } from "@/lib/auth/cron-gate";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

/**
 * GET /api/mrai/crawl/cron
 *
 * Daily sweep of every enabled crawl source whose
 * last_fetched_at < now() - fetch_interval_hours. Sequential to keep
 * LLM token spikes bounded; with N=100 sources it's ~10-20 min.
 *
 * Scheduled at 02:30 KST (= 17:30 UTC) — runs after the publication
 * engagement-tick cron (02:00 KST) so fresh memories from website
 * changes can feed into next day's briefing.
 */
export async function GET(req: Request) {
  const gate = assertCronAuth(req);
  if (gate) return gate;

  // Skip on non-Mr.AI deployments (prevents double-fire between the
  // market-twin prod and market-twin-mrai beta Vercel projects).
  if (!MRAI_ENABLED) {
    return NextResponse.json({ skipped: "mrai_not_enabled_on_this_deployment" });
  }

  const svc = createServiceClient();
  // Pull every enabled source — filtering by interval happens client-side
  // because Postgres expr-on-row interval math is awkward via PostgREST.
  const { data: rows, error } = await svc
    .from("mrai_crawl_sources")
    .select("id, source_type, label, fetch_interval_hours, last_fetched_at")
    .eq("enabled", true);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const now = Date.now();
  const due = ((rows ?? []) as Array<{
    id: string;
    source_type: string;
    label: string | null;
    fetch_interval_hours: number;
    last_fetched_at: string | null;
  }>).filter((r) => {
    if (!r.last_fetched_at) return true;
    const elapsedMs = now - new Date(r.last_fetched_at).getTime();
    return elapsedMs >= r.fetch_interval_hours * 3_600_000;
  });

  const results: Array<{
    id: string;
    label: string | null;
    source_type: string;
    status: string;
    memories_added: number;
    error?: string;
  }> = [];

  for (const r of due) {
    const res = await runCrawlSource(r.id);
    results.push({
      id: r.id,
      label: r.label,
      source_type: r.source_type,
      status: res.status,
      memories_added: res.memories_added,
      error: res.error,
    });
  }

  const ok = results.filter((r) => r.status === "ok").length;
  const nc = results.filter((r) => r.status === "no_change").length;
  const failed = results.filter((r) => r.status === "failed").length;
  const memoriesAdded = results.reduce((s, r) => s + r.memories_added, 0);

  return NextResponse.json({
    swept: due.length,
    skipped: (rows?.length ?? 0) - due.length,
    ok,
    no_change: nc,
    failed,
    memories_added: memoriesAdded,
    results,
  });
}

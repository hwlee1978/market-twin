import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/admin/zombie-cleanup
 *
 * Sweeps stale "running" simulations whose Vercel function definitely
 * died. Vercel function maxDuration is 800s (≈13min), so any sim with
 * status='running' AND started_at older than 20 minutes is a zombie:
 * the row will never flip on its own because the runner process is
 * gone.
 *
 * Mark them as 'failed' with a clear error_message so the user sees
 * "[zombie] runtime aborted" in the dashboard instead of an indefinite
 * spinner. Also bumps any owning ensemble row from 'running' to 'failed'
 * if all its sims are now in terminal states.
 *
 * Auth: CRON_SECRET header. Vercel Cron runs this every 30 min — we
 * don't want users hitting this manually because a stale-but-still-
 * alive sim could get killed by a misclock.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const admin = createServiceClient();
  // 20-minute threshold = Vercel maxDuration (800s) + 7-min slack
  // for clock skew, log flush, post-success DB writes, etc.
  const cutoff = new Date(Date.now() - 20 * 60 * 1000).toISOString();

  const { data: zombies, error: queryErr } = await admin
    .from("simulations")
    .select("id, ensemble_id, started_at, current_stage")
    .eq("status", "running")
    .lt("started_at", cutoff);

  if (queryErr) {
    console.error("[zombie-cleanup] query failed:", queryErr.message);
    return NextResponse.json({ error: "db_query_failed" }, { status: 500 });
  }

  type ZombieRow = {
    id: string;
    ensemble_id: string | null;
    started_at: string | null;
    current_stage: string | null;
  };
  const zombieRows = (zombies ?? []) as ZombieRow[];
  const simIds = zombieRows.map((s) => s.id);
  if (simIds.length === 0) {
    return NextResponse.json({ cleaned: 0, ensemblesFinalized: 0 });
  }

  // Mark every zombie as failed with a clear sentinel message.
  await admin
    .from("simulations")
    .update({
      status: "failed",
      current_stage: "failed",
      error_message: "[zombie-cleanup] Vercel function timed out (>20 min); marked failed by cron.",
    })
    .in("id", simIds);

  // Finalize ensembles whose remaining sims are all terminal now.
  const ensembleIds = Array.from(
    new Set(
      zombieRows.map((s) => s.ensemble_id).filter((v): v is string => !!v),
    ),
  );

  let ensemblesFinalized = 0;
  let ensemblesFinalizedAsFailed = 0;
  for (const eid of ensembleIds) {
    const { count: stillRunning } = await admin
      .from("simulations")
      .select("id", { count: "exact", head: true })
      .eq("ensemble_id", eid)
      .eq("status", "running");
    if ((stillRunning ?? 0) > 0) continue;

    const { count: completed } = await admin
      .from("simulations")
      .select("id", { count: "exact", head: true })
      .eq("ensemble_id", eid)
      .eq("status", "completed");

    // Check whether aggregation actually ran. The orchestrator's final
    // update writes status="completed" + aggregate_result atomically, so
    // if aggregate_result is null AND we got here via zombie-cleanup, the
    // orchestrator died between sim completion and aggregation. Marking
    // such an ensemble "completed" with no aggregate produces a broken
    // user-facing state (PDF / dashboard reads aggregate_result and
    // renders nothing). Mark "failed" instead with a clear sentinel so
    // the operator can re-trigger aggregation via reaggregate-ensembles.ts
    // (which reuses the cached sim results — no re-spawn cost).
    const { data: ensRow } = await admin
      .from("ensembles")
      .select("aggregate_result")
      .eq("id", eid)
      .single();
    const hasAggregate = ensRow?.aggregate_result != null;

    let finalStatus: "completed" | "failed";
    let finalMessage: string | null;
    if (hasAggregate) {
      // Orchestrator wrote aggregate but somehow didn't flip status —
      // unusual but recoverable as-is.
      finalStatus = "completed";
      finalMessage = null;
    } else if ((completed ?? 0) > 0) {
      // Sims completed but aggregation never ran. Operator action required.
      finalStatus = "failed";
      finalMessage = `[zombie-cleanup] Orchestrator died mid-run after ${completed} sim(s) completed but before aggregation. Re-run \`scripts/reaggregate-ensembles.ts ${eid}\` to recover the cached sim outputs without re-spawning, then UPDATE status='completed' manually.`;
      ensemblesFinalizedAsFailed++;
    } else {
      finalStatus = "failed";
      finalMessage = "[zombie-cleanup] All sims timed out before completion.";
    }

    await admin
      .from("ensembles")
      .update({
        status: finalStatus,
        completed_at: new Date().toISOString(),
        error_message: finalMessage,
      })
      .eq("id", eid)
      .eq("status", "running");
    ensemblesFinalized++;
  }

  // Lightweight ops alert. Console-level so Vercel logs surface it
  // without a dependency on Sentry — matches the pattern used by the
  // rest of the runner. Add structured payload so a log-monitor rule
  // can match on event=zombie_cleanup.
  console.warn(
    JSON.stringify({
      event: "zombie_cleanup",
      cleaned: simIds.length,
      ensembles_finalized: ensemblesFinalized,
      ensembles_finalized_as_failed: ensemblesFinalizedAsFailed,
      sim_ids: simIds,
    }),
  );

  return NextResponse.json({
    cleaned: simIds.length,
    ensemblesFinalized,
    ensemblesFinalizedAsFailed,
  });
}

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { MRAI_ENABLED } from "@/lib/mrai/config/enabled";
import { assertCronAuth } from "@/lib/auth/cron-gate";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * GET /api/mrai/content-drafts/auto-publish-cron
 *
 * Phase 1b.2 — auto-publish at scheduled_at.
 *
 * For every draft whose scheduled_at has passed AND for which no
 * publication has been created since that scheduled_at, fire the
 * publish step (insert a row into mrai_content_publications).
 *
 * Idempotent — re-running won't double-publish because we check the
 * "published since scheduled_at" condition. Doesn't clear scheduled_at
 * so the calendar can keep showing historical schedule entries.
 *
 * Triggered by Vercel cron every 10 minutes (vercel.json).
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
  const nowIso = new Date().toISOString();

  type DueDraft = {
    id: string;
    workspace_id: string;
    marketing_channel_id: string | null;
    scheduled_at: string;
    variant_label: string;
    campaign_label: string | null;
  };
  // Drafts that are due. Cap at 200 per tick so the function fits in
  // the maxDuration even on a backlog.
  const { data, error: dErr } = await svc
    .from("mrai_content_drafts")
    .select(
      "id, workspace_id, marketing_channel_id, scheduled_at, variant_label, campaign_label",
    )
    .lte("scheduled_at", nowIso)
    .not("scheduled_at", "is", null)
    .not("marketing_channel_id", "is", null)
    .order("scheduled_at", { ascending: true })
    .limit(200);
  const due = (data ?? []) as DueDraft[];
  if (dErr) {
    return NextResponse.json({ error: dErr.message }, { status: 500 });
  }
  if (due.length === 0) {
    return NextResponse.json({ ran: 0, published: 0 });
  }

  // For each due draft, check whether a publication already exists
  // since its scheduled_at — if so, skip. We do this batch to avoid
  // N+1 queries.
  const draftIds = due.map((d) => d.id);
  const { data: pubs, error: pErr } = await svc
    .from("mrai_content_publications")
    .select("content_draft_id, published_at")
    .in("content_draft_id", draftIds)
    .order("published_at", { ascending: false });
  if (pErr) {
    return NextResponse.json({ error: pErr.message }, { status: 500 });
  }
  const lastPubAt = new Map<string, string>();
  for (const p of pubs ?? []) {
    const k = p.content_draft_id as string;
    if (!lastPubAt.has(k)) lastPubAt.set(k, p.published_at as string);
  }

  type Result = {
    draft_id: string;
    status: "published" | "skipped" | "failed";
    reason?: string;
    publication_id?: string;
  };
  const results: Result[] = [];

  for (const d of due) {
    const last = lastPubAt.get(d.id);
    if (last && last >= (d.scheduled_at as string)) {
      results.push({ draft_id: d.id, status: "skipped", reason: "already_published_since_scheduled_at" });
      continue;
    }
    try {
      const { data: pub, error: insErr } = await svc
        .from("mrai_content_publications")
        .insert({
          workspace_id: d.workspace_id,
          content_draft_id: d.id,
          marketing_channel_id: d.marketing_channel_id,
          // Use the scheduled_at as published_at so the timeline reflects
          // the intended moment, not when the cron happened to run.
          published_at: d.scheduled_at,
          metrics_history: [],
          total_views: 0,
          total_likes: 0,
          total_comments: 0,
          total_shares: 0,
          total_saves: 0,
          total_impressions: 0,
          status: "published",
        })
        .select("id")
        .single();
      if (insErr || !pub) {
        results.push({
          draft_id: d.id,
          status: "failed",
          reason: insErr?.message ?? "insert_failed",
        });
        continue;
      }
      results.push({
        draft_id: d.id,
        status: "published",
        publication_id: pub.id as string,
      });
    } catch (e) {
      results.push({
        draft_id: d.id,
        status: "failed",
        reason: e instanceof Error ? e.message : "unknown",
      });
    }
  }

  const counts = {
    total: results.length,
    published: results.filter((r) => r.status === "published").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    failed: results.filter((r) => r.status === "failed").length,
  };
  console.log(`[auto-publish-cron] ${nowIso} → ${JSON.stringify(counts)}`);
  return NextResponse.json({ ran: results.length, ...counts, results });
}

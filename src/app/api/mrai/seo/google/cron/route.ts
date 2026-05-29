import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { syncGSCForWorkspace } from "@/lib/mrai/seo/gsc-sync";
import { syncGA4ForWorkspace } from "@/lib/mrai/seo/ga4-sync";
import { MRAI_ENABLED } from "@/lib/mrai/enabled";
import { assertCronAuth } from "@/lib/auth/cron-gate";

export const dynamic = "force-dynamic";
export const maxDuration = 800;

/**
 * GET /api/mrai/seo/google/cron
 *
 * Daily sweep: for every workspace connected to Google, refresh GSC +
 * GA4 metrics over the last 28 days. Scheduled via vercel.json @ 18:00
 * UTC = 03:00 KST — runs after the briefing cron so the briefing for
 * the next morning includes fresh SEO data.
 *
 * Workspaces processed sequentially. Quota: GSC 1200 req/min, GA4 50
 * req/sec — serial is fine for <500 workspaces.
 */
export async function GET(req: Request) {
  const gate = assertCronAuth(req);
  if (gate) return gate;
  if (!MRAI_ENABLED) {
    return NextResponse.json({ skipped: "mrai_not_enabled_on_this_deployment" });
  }

  const admin = createServiceClient();
  const { data: rows, error } = await admin
    .from("mrai_google_oauth")
    .select("workspace_id, google_email")
    .order("last_used_at", { ascending: true, nullsFirst: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const workspaces = (rows ?? []) as Array<{ workspace_id: string; google_email: string }>;
  if (workspaces.length === 0) {
    return NextResponse.json({ ran: 0, results: [] });
  }

  const results: Array<{
    workspace_id: string;
    email: string;
    gsc_rows: number;
    ga4_rows: number;
    error?: string;
  }> = [];
  for (const w of workspaces) {
    try {
      const [gsc, ga4] = await Promise.allSettled([
        syncGSCForWorkspace(w.workspace_id),
        syncGA4ForWorkspace(w.workspace_id),
      ]);
      const gscRows =
        gsc.status === "fulfilled"
          ? gsc.value.reduce((s, r) => s + r.rows_synced, 0)
          : 0;
      const ga4Rows =
        ga4.status === "fulfilled"
          ? ga4.value.reduce((s, r) => s + r.rows_synced, 0)
          : 0;
      const errMsg =
        gsc.status === "rejected"
          ? String(gsc.reason).slice(0, 200)
          : ga4.status === "rejected"
            ? String(ga4.reason).slice(0, 200)
            : undefined;
      results.push({
        workspace_id: w.workspace_id,
        email: w.google_email,
        gsc_rows: gscRows,
        ga4_rows: ga4Rows,
        error: errMsg,
      });
    } catch (e) {
      results.push({
        workspace_id: w.workspace_id,
        email: w.google_email,
        gsc_rows: 0,
        ga4_rows: 0,
        error: e instanceof Error ? e.message.slice(0, 200) : "unknown",
      });
    }
  }

  return NextResponse.json({ ran: results.length, results });
}

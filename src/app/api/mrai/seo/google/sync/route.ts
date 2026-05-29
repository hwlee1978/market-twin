import { NextResponse } from "next/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { syncGSCForWorkspace } from "@/lib/mrai/seo/gsc-sync";
import { syncGA4ForWorkspace } from "@/lib/mrai/seo/ga4-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/mrai/seo/google/sync
 *
 * Manual sync trigger from the UI button. Runs GSC + GA4 in parallel for
 * the caller's workspace, returns per-property row counts + any errors.
 * Daily cron at /api/mrai/seo/google/cron runs the same logic across all
 * connected workspaces.
 */
export async function POST() {
  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [gsc, ga4] = await Promise.allSettled([
    syncGSCForWorkspace(ctx.workspaceId),
    syncGA4ForWorkspace(ctx.workspaceId),
  ]);

  return NextResponse.json({
    gsc: gsc.status === "fulfilled" ? gsc.value : { error: String(gsc.reason) },
    ga4: ga4.status === "fulfilled" ? ga4.value : { error: String(ga4.reason) },
    synced_at: new Date().toISOString(),
  });
}

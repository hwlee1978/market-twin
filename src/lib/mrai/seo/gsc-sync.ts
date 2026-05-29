import { google } from "googleapis";
import { createServiceClient } from "@/lib/supabase/server";
import { getAuthenticatedClient } from "./google-oauth";

/**
 * Google Search Console (GSC) daily sync. For each registered SEO
 * property with a non-null gsc_property:
 *   1. Pull the last 28 days of (query × page) rows via Webmasters API.
 *   2. Upsert into mrai_gsc_daily.
 *   3. Update mrai_google_oauth.last_gsc_sync.
 *
 * Webmasters API quota: 1200 req/min per project, more than enough.
 * Each property = 1 request per day-range (we ask for the full window).
 *
 * Note on dimensions: we use query + page only. Adding country/device
 * multiplies row count 10x+ with little extra signal for v0.1 dashboards.
 */

interface SyncResult {
  property_id: string;
  property_url: string;
  rows_synced: number;
  error?: string;
}

const WINDOW_DAYS = 28;
const ROWS_PER_PROPERTY = 1000;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function syncGSCForWorkspace(workspaceId: string): Promise<SyncResult[]> {
  const auth = await getAuthenticatedClient(workspaceId);
  const wm = google.webmasters({ version: "v3", auth });
  const svc = createServiceClient();

  const { data: properties, error } = await svc
    .from("mrai_seo_properties")
    .select("id, property_url, gsc_property")
    .eq("workspace_id", workspaceId)
    .not("gsc_property", "is", null);
  if (error) throw new Error(`load properties: ${error.message}`);

  const props = (properties ?? []) as Array<{
    id: string;
    property_url: string;
    gsc_property: string;
  }>;
  if (props.length === 0) return [];

  const end = new Date();
  const start = new Date(end.getTime() - WINDOW_DAYS * 86_400_000);
  const startDate = isoDate(start);
  const endDate = isoDate(end);

  const results: SyncResult[] = [];
  for (const p of props) {
    try {
      const resp = await wm.searchanalytics.query({
        siteUrl: p.gsc_property,
        requestBody: {
          startDate,
          endDate,
          dimensions: ["date", "query", "page"],
          rowLimit: ROWS_PER_PROPERTY,
          dataState: "all",
        },
      });
      const rows = resp.data.rows ?? [];

      // Upsert each row. We delete existing rows in window first to
      // handle GSC backfills (their data finalizes 2-3 days late).
      await svc
        .from("mrai_gsc_daily")
        .delete()
        .eq("seo_property_id", p.id)
        .gte("date", startDate)
        .lte("date", endDate);

      const toInsert = rows
        .filter((r) => r.keys && r.keys.length >= 3)
        .map((r) => ({
          workspace_id: workspaceId,
          seo_property_id: p.id,
          date: r.keys![0],
          query: r.keys![1] ?? "",
          page: r.keys![2] ?? "",
          clicks: r.clicks ?? 0,
          impressions: r.impressions ?? 0,
          ctr: r.ctr ?? 0,
          avg_position: r.position ?? 0,
        }));

      if (toInsert.length > 0) {
        // Chunk to stay under PG row-binding limits.
        const CHUNK = 500;
        for (let i = 0; i < toInsert.length; i += CHUNK) {
          const { error: insErr } = await svc
            .from("mrai_gsc_daily")
            .insert(toInsert.slice(i, i + CHUNK));
          if (insErr) throw new Error(insErr.message);
        }
      }

      results.push({
        property_id: p.id,
        property_url: p.property_url,
        rows_synced: toInsert.length,
      });
    } catch (e) {
      results.push({
        property_id: p.id,
        property_url: p.property_url,
        rows_synced: 0,
        error: e instanceof Error ? e.message : "unknown",
      });
    }
  }

  await svc
    .from("mrai_google_oauth")
    .update({
      last_gsc_sync: new Date().toISOString(),
      last_used_at: new Date().toISOString(),
      last_error: results.find((r) => r.error)?.error ?? null,
      last_error_at: results.find((r) => r.error) ? new Date().toISOString() : null,
    })
    .eq("workspace_id", workspaceId);

  return results;
}

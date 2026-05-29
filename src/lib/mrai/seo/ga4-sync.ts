import { google } from "googleapis";
import { createServiceClient } from "@/lib/supabase/server";
import { getAuthenticatedClient } from "./google-oauth";

/**
 * Google Analytics 4 (GA4) daily sync. For each registered SEO property
 * with a non-null ga4_property_id:
 *   1. Pull last 28 days of (date × source × medium) rollup via Data API.
 *   2. Upsert into mrai_ga4_daily.
 *   3. Update mrai_google_oauth.last_ga4_sync.
 *
 * ga4_property_id format = numeric "GA4 property ID" (eg "123456789"),
 * NOT the measurement ID ("G-XXXX"). The Data API only accepts the
 * property ID, prefixed with "properties/".
 */

interface SyncResult {
  property_id: string;
  property_url: string;
  rows_synced: number;
  error?: string;
}

const WINDOW_DAYS = 28;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function syncGA4ForWorkspace(workspaceId: string): Promise<SyncResult[]> {
  const auth = await getAuthenticatedClient(workspaceId);
  const data = google.analyticsdata({ version: "v1beta", auth });
  const svc = createServiceClient();

  const { data: properties, error } = await svc
    .from("mrai_seo_properties")
    .select("id, property_url, ga4_property_id")
    .eq("workspace_id", workspaceId)
    .not("ga4_property_id", "is", null);
  if (error) throw new Error(`load properties: ${error.message}`);

  const props = (properties ?? []) as Array<{
    id: string;
    property_url: string;
    ga4_property_id: string;
  }>;
  if (props.length === 0) return [];

  const end = new Date();
  const start = new Date(end.getTime() - WINDOW_DAYS * 86_400_000);
  const startDate = isoDate(start);
  const endDate = isoDate(end);

  const results: SyncResult[] = [];
  for (const p of props) {
    try {
      const resp = await data.properties.runReport({
        property: `properties/${p.ga4_property_id}`,
        requestBody: {
          dateRanges: [{ startDate, endDate }],
          dimensions: [
            { name: "date" },
            { name: "sessionSource" },
            { name: "sessionMedium" },
          ],
          metrics: [
            { name: "sessions" },
            { name: "totalUsers" },
            { name: "engagedSessions" },
            { name: "conversions" },
            { name: "bounceRate" },
            { name: "averageSessionDuration" },
          ],
          limit: "10000",
        },
      });
      const rows = resp.data.rows ?? [];

      await svc
        .from("mrai_ga4_daily")
        .delete()
        .eq("seo_property_id", p.id)
        .gte("date", startDate)
        .lte("date", endDate);

      const toInsert = rows
        .filter((r) => r.dimensionValues && r.dimensionValues.length >= 3)
        .map((r) => {
          const dims = r.dimensionValues!;
          const mets = r.metricValues ?? [];
          // GA4 date dim returns YYYYMMDD without dashes — convert.
          const rawDate = dims[0]?.value ?? "";
          const date =
            rawDate.length === 8
              ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
              : rawDate;
          return {
            workspace_id: workspaceId,
            seo_property_id: p.id,
            date,
            source: dims[1]?.value ?? "",
            medium: dims[2]?.value ?? "",
            sessions: parseInt(mets[0]?.value ?? "0", 10),
            users: parseInt(mets[1]?.value ?? "0", 10),
            engaged_sessions: parseInt(mets[2]?.value ?? "0", 10),
            conversions: parseInt(mets[3]?.value ?? "0", 10),
            bounce_rate: parseFloat(mets[4]?.value ?? "0"),
            avg_session_seconds: parseFloat(mets[5]?.value ?? "0"),
          };
        });

      if (toInsert.length > 0) {
        const CHUNK = 500;
        for (let i = 0; i < toInsert.length; i += CHUNK) {
          const { error: insErr } = await svc
            .from("mrai_ga4_daily")
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
      last_ga4_sync: new Date().toISOString(),
      last_used_at: new Date().toISOString(),
      last_error: results.find((r) => r.error)?.error ?? null,
      last_error_at: results.find((r) => r.error) ? new Date().toISOString() : null,
    })
    .eq("workspace_id", workspaceId);

  return results;
}

import { NextResponse } from "next/server";
import { requireSuperAdmin, SuperAdminAuthError } from "@/lib/auth/super-admin";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/challenge-data
 *
 * Super-admin only. Returns row counts + sample rows for each ch_*
 * reference table so the operator can verify ingestion + spot-check
 * data quality without leaving the dashboard.
 *
 * Used by /admin/challenge-data page (Phase A.3 of challenge sprint).
 */
export async function GET() {
  try {
    await requireSuperAdmin();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof SuperAdminAuthError ? e.code : "unauthorized" },
      { status: 401 },
    );
  }

  const svc = createServiceClient();
  const tables = [
    "ch_pp_programs",
    "ch_pp_companies",
    "ch_pp_products",
    "ch_voucher_programs",
    "ch_voucher_exports",
    "ch_recommendations",
    "ch_ab_battles",
  ] as const;

  const results: Array<{
    table: string;
    count: number;
    sample: Record<string, unknown>[];
    years?: Array<{ year: number; n: number }>;
    error?: string;
  }> = [];

  for (const t of tables) {
    try {
      const { count } = await svc.from(t).select("*", { count: "exact", head: true });
      const { data: sample } = await svc.from(t).select("*").limit(5);
      const row: (typeof results)[number] = {
        table: t,
        count: count ?? 0,
        sample: (sample ?? []) as Record<string, unknown>[],
      };
      // For tables with source_year, surface year distribution.
      if (t === "ch_pp_programs" || t === "ch_voucher_programs") {
        const { data: years } = await svc
          .from(t)
          .select("source_year")
          .not("source_year", "is", null);
        const map = new Map<number, number>();
        for (const r of (years ?? []) as Array<{ source_year: number }>) {
          map.set(r.source_year, (map.get(r.source_year) ?? 0) + 1);
        }
        row.years = Array.from(map.entries())
          .map(([year, n]) => ({ year, n }))
          .sort((a, b) => b.year - a.year);
      }
      results.push(row);
    } catch (e) {
      results.push({
        table: t,
        count: 0,
        sample: [],
        error: e instanceof Error ? e.message : "unknown",
      });
    }
  }

  return NextResponse.json({ tables: results });
}

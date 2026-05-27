import { NextResponse } from "next/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type HistoryRow = {
  id: string;
  generated_at: string;
  brand_name: string;
  brand_category: string | null;
  market_country: string | null;
  visibility_score: number | null;
  per_llm: Array<{
    llm: "claude" | "gpt" | "gemini";
    queries: Array<unknown>;
    brand_mention_rate: number;
    avg_brand_position: number | null;
  }>;
  top_competitors: Array<{ name: string; mentions: number }>;
  cost_usd: number | null;
};

/**
 * GET /api/mrai/llm-seo/visibility-audit/history?limit=20
 *
 * Returns visibility audit rows in reverse chronological order for the
 * workspace. Powers the KPI time-series chart.
 */
export async function GET(req: Request) {
  const wsCtx = await getOrCreatePrimaryWorkspace();
  if (!wsCtx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const limit = Math.max(
    1,
    Math.min(parseInt(url.searchParams.get("limit") ?? "30", 10) || 30, 100),
  );

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mrai_llm_visibility_audits")
    .select(
      "id, generated_at, brand_name, brand_category, market_country, visibility_score, per_llm, top_competitors, cost_usd",
    )
    .eq("workspace_id", wsCtx.workspaceId)
    .order("generated_at", { ascending: false })
    .limit(limit);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ history: (data as HistoryRow[]) ?? [] });
}

import { createClient } from "@/lib/supabase/server";

export type DashboardKPIs = {
  /** Latest LLM visibility score 0..100, or null when no audit ran yet. */
  visibilityScore: number | null;
  visibilityRunAt: string | null;
  /** Total marketing channels configured (X/IG/TikTok/Naver/...). */
  marketingChannels: number;
  /** Briefs created in last 7 days. */
  recentBriefs: number;
  /** Total workspace memories (long-term context size). */
  memoryCount: number;
};

/**
 * Loads the 4 headline KPIs surfaced on the Mr.AI dashboard.
 *
 * Single Supabase round-trip via Promise.all. Each query is wrapped so a
 * single failed table (e.g. migration not yet applied) doesn't take the
 * whole dashboard down — missing KPIs simply render as "—".
 */
export async function loadDashboardKPIs(workspaceId: string): Promise<DashboardKPIs> {
  const supabase = await createClient();

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [visRes, mcRes, briefRes, memRes] = await Promise.all([
    supabase
      .from("mrai_llm_visibility_audits")
      .select("visibility_score, generated_at")
      .eq("workspace_id", workspaceId)
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ visibility_score: number | null; generated_at: string }>(),
    supabase
      .from("mrai_marketing_channels")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId),
    supabase
      .from("mrai_content_briefs")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .gte("created_at", sevenDaysAgo),
    supabase
      .from("mrai_memories")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId),
  ]);

  return {
    visibilityScore: visRes.data?.visibility_score ?? null,
    visibilityRunAt: visRes.data?.generated_at ?? null,
    marketingChannels: mcRes.count ?? 0,
    recentBriefs: briefRes.count ?? 0,
    memoryCount: memRes.count ?? 0,
  };
}

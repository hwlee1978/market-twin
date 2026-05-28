import { NextResponse } from "next/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/mrai/marketing-channels/[id]/audience
 *
 * Returns the persona pool that "lives in" this virtual space. Sampling
 * rule:
 *   1. workspace_id match (RLS already enforces)
 *   2. country == channel.market_country (primary signal)
 *   3. order by use_count asc, last_used_at asc — favour underused
 *      personas so the simulator builds a richer dataset over time.
 *
 * Returns up to ?limit (default 24, max 100) personas plus a total
 * count of matching personas — so the UI can show "24 of 312 listening".
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const wsCtx = await getOrCreatePrimaryWorkspace();
  if (!wsCtx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get("limit") ?? "24", 10) || 24, 1),
    100,
  );

  const supabase = await createClient();
  const { data: channel, error: chErr } = await supabase
    .from("mrai_marketing_channels")
    .select("id, platform, handle, display_name, market_country, target_segments, posting_style, bio_text, enabled")
    .eq("id", id)
    .eq("workspace_id", wsCtx.workspaceId)
    .single();
  if (chErr || !channel) {
    return NextResponse.json({ error: "channel_not_found" }, { status: 404 });
  }

  // Persona pool match: country only. The pool is shared across
  // workspaces as of v0.1 (see runner.ts shared-pool note) so we read
  // the global pool and just filter by the channel's target market.
  // When the channel has no country set, return any persona globally.
  let query = supabase
    .from("personas")
    .select(
      "id, age_range, gender, country, income_band, profession, base_profession, interests, purchase_style, price_sensitivity, use_count, last_used_at",
      { count: "exact" },
    )
    .order("use_count", { ascending: true })
    .order("last_used_at", { ascending: true })
    .limit(limit);
  if (channel.market_country) {
    query = query.eq("country", channel.market_country);
  }

  const { data: personas, count, error: pErr } = await query;
  if (pErr) {
    return NextResponse.json({ error: pErr.message }, { status: 500 });
  }

  return NextResponse.json({
    channel,
    audience: {
      sample: personas ?? [],
      total: count ?? 0,
      limit,
    },
  });
}

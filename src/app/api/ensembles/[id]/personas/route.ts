import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

/**
 * GET /api/ensembles/:id/personas?page=0&perPage=50&country=US&minIntent=70
 *
 * Pulls every persona row from every sim under this ensemble, flattened
 * into one paginated list. Up to ~10K personas on deep_pro tier — we
 * filter / paginate server-side so the client never receives the full
 * 4MB+ payload.
 *
 * Pagination is page-based (page=0 is first 50). Filters are optional:
 *   country=US           — exact ISO match (case-insensitive)
 *   minIntent=70         — keep personas with purchaseIntent >= N
 *   maxIntent=34         — keep personas with purchaseIntent <= N
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const wsCtx = await getOrCreatePrimaryWorkspace();
  if (!wsCtx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const page = Math.max(0, Number(url.searchParams.get("page") ?? 0));
  const perPage = Math.min(200, Math.max(10, Number(url.searchParams.get("perPage") ?? 50)));
  const country = url.searchParams.get("country")?.toUpperCase() || null;
  const minIntent = url.searchParams.get("minIntent");
  const maxIntent = url.searchParams.get("maxIntent");

  const supabase = await createClient();

  // Workspace ownership check on the ensemble row.
  const { data: ensemble, error: ensErr } = await supabase
    .from("ensembles")
    .select("id, workspace_id")
    .eq("id", id)
    .eq("workspace_id", wsCtx.workspaceId)
    .single();
  if (ensErr || !ensemble) {
    return NextResponse.json({ error: "ensemble not found" }, { status: 404 });
  }

  // Pull all sim rows + their personas. We could push pagination into the
  // SQL with jsonb_array_elements, but personas-per-sim is bounded (200)
  // and the join is small enough that filtering in Node is simpler and
  // doesn't hit the JSONB query planner edge cases.
  type SimRow = {
    id: string;
    ensemble_index: number | null;
    simulation_results:
      | { personas?: unknown }
      | { personas?: unknown }[]
      | null;
  };
  const { data: rawRows } = await supabase
    .from("simulations")
    .select(
      `id, ensemble_index, simulation_results ( personas )`,
    )
    .eq("ensemble_id", id)
    .eq("status", "completed");
  const rows = (rawRows ?? []) as unknown as SimRow[];

  type PersonaRow = {
    simIndex: number;
    name?: string;
    ageRange?: string;
    gender?: string;
    country: string;
    profession?: string;
    incomeBand?: string;
    purchaseIntent: number;
    voice?: string;
    trustFactors?: string[];
    objections?: string[];
  };
  const all: PersonaRow[] = [];
  for (const r of rows) {
    const result = Array.isArray(r.simulation_results)
      ? r.simulation_results[0]
      : r.simulation_results;
    const personas = (result?.personas ?? []) as Array<Record<string, unknown>>;
    for (const p of personas) {
      const intent = p.purchaseIntent;
      const c = p.country;
      if (typeof intent !== "number" || typeof c !== "string") continue;
      all.push({
        simIndex: r.ensemble_index ?? 0,
        name: typeof p.name === "string" ? p.name : undefined,
        ageRange: typeof p.ageRange === "string" ? p.ageRange : undefined,
        gender: typeof p.gender === "string" ? p.gender : undefined,
        country: c.toUpperCase(),
        profession: typeof p.profession === "string" ? p.profession : undefined,
        incomeBand: typeof p.incomeBand === "string" ? p.incomeBand : undefined,
        purchaseIntent: intent,
        voice: typeof p.voice === "string" ? p.voice : undefined,
        trustFactors: Array.isArray(p.trustFactors)
          ? (p.trustFactors as unknown[]).filter((x): x is string => typeof x === "string")
          : undefined,
        objections: Array.isArray(p.objections)
          ? (p.objections as unknown[]).filter((x): x is string => typeof x === "string")
          : undefined,
      });
    }
  }

  // Apply filters.
  let filtered = all;
  if (country) filtered = filtered.filter((p) => p.country === country);
  if (minIntent !== null) {
    const n = Number(minIntent);
    if (Number.isFinite(n)) filtered = filtered.filter((p) => p.purchaseIntent >= n);
  }
  if (maxIntent !== null) {
    const n = Number(maxIntent);
    if (Number.isFinite(n)) filtered = filtered.filter((p) => p.purchaseIntent <= n);
  }

  // Sort by intent desc by default — most actionable rows surface first.
  filtered.sort((a, b) => b.purchaseIntent - a.purchaseIntent);

  const total = filtered.length;
  const start = page * perPage;
  const slice = filtered.slice(start, start + perPage);

  return NextResponse.json({
    page,
    perPage,
    total,
    pageCount: Math.max(1, Math.ceil(total / perPage)),
    personas: slice,
  });
}

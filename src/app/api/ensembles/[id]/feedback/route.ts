import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Beta micro-survey on the ensemble results screen.
 *
 * GET  → the current user's existing feedback for this ensemble (or null)
 * POST → upsert { rating 1-5, comment? } keyed on (ensemble_id, user).
 *
 * RLS on beta_result_feedback restricts rows to the user's workspace; the
 * POST resolves workspace_id from the ensemble itself so the client can't
 * spoof it.
 */

const FeedbackSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(500).optional(),
});

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const wsCtx = await getOrCreatePrimaryWorkspace();
  if (!wsCtx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("beta_result_feedback")
    .select("rating, comment")
    .eq("ensemble_id", id)
    .eq("submitted_by", user.id)
    .maybeSingle();

  return NextResponse.json({ feedback: data ?? null });
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const wsCtx = await getOrCreatePrimaryWorkspace();
  if (!wsCtx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = FeedbackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Resolve workspace_id from the ensemble (RLS already scopes ensembles
  // to the user's workspace, so a missing row = not yours / not found).
  const { data: ens } = await supabase
    .from("ensembles")
    .select("id, workspace_id")
    .eq("id", id)
    .maybeSingle();
  if (!ens) {
    return NextResponse.json({ error: "ensemble_not_found" }, { status: 404 });
  }

  const { error } = await supabase.from("beta_result_feedback").upsert(
    {
      workspace_id: ens.workspace_id,
      ensemble_id: id,
      submitted_by: user.id,
      rating: parsed.data.rating,
      comment: parsed.data.comment ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "ensemble_id,submitted_by" },
  );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

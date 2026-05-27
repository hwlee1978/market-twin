import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/mrai/content-drafts/[id]/schedule
 *
 * Body: { scheduled_at: ISO string | null }
 *   - ISO string → queue this draft to that moment
 *   - null       → clear the schedule
 *
 * Pure planning operation. The auto-publish cron (deferred to
 * Phase 1b.2) will react to non-null scheduled_at values; for now
 * this just lets the calendar UI show planned content.
 */
const InputSchema = z.object({
  scheduled_at: z.string().datetime().nullable(),
});

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const wsCtx = await getOrCreatePrimaryWorkspace();
  if (!wsCtx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = InputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Verify the draft belongs to this workspace via RLS-aware read
  const supabase = await createClient();
  const { data: draft, error: dErr } = await supabase
    .from("mrai_content_drafts")
    .select("id, workspace_id")
    .eq("id", id)
    .single<{ id: string; workspace_id: string }>();
  if (dErr || !draft) {
    return NextResponse.json({ error: "draft_not_found" }, { status: 404 });
  }

  const svc = createServiceClient();
  const { data: updated, error: uErr } = await svc
    .from("mrai_content_drafts")
    .update({ scheduled_at: parsed.data.scheduled_at })
    .eq("id", id)
    .eq("workspace_id", draft.workspace_id)
    .select("id, scheduled_at")
    .single();
  if (uErr) {
    return NextResponse.json({ error: uErr.message }, { status: 500 });
  }
  return NextResponse.json({ draft: updated });
}

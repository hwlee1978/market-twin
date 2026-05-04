import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

/**
 * GET  /api/me/onboarding
 * POST /api/me/onboarding/first-result-seen (handled here via body { event })
 *
 * Tracks one-shot onboarding events for the current workspace member.
 * Right now there's only `firstResultSeen` — null means the welcome
 * modal hasn't been dismissed; once set, the modal never fires again.
 *
 * Stored on workspace_members so each collaborator gets their own
 * onboarding state when they join an existing workspace.
 */
export async function GET() {
  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workspace_members")
    .select("first_result_seen_at")
    .eq("workspace_id", ctx.workspaceId)
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    firstResultSeenAt: data?.first_result_seen_at ?? null,
  });
}

export async function POST(req: Request) {
  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { event?: string } | null;
  if (body?.event !== "firstResultSeen") {
    return NextResponse.json({ error: "unknown event" }, { status: 400 });
  }

  const supabase = await createClient();
  // Only set if currently null — we never want to overwrite an earlier
  // dismissal timestamp because then the modal would fire again on a
  // future first-result load (which would be wrong if the user actually
  // just dismissed it twice in the same session).
  const { data: existing } = await supabase
    .from("workspace_members")
    .select("first_result_seen_at")
    .eq("workspace_id", ctx.workspaceId)
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (existing?.first_result_seen_at) {
    return NextResponse.json({ ok: true, alreadySet: true });
  }

  const { error } = await supabase
    .from("workspace_members")
    .update({ first_result_seen_at: new Date().toISOString() })
    .eq("workspace_id", ctx.workspaceId)
    .eq("user_id", ctx.userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

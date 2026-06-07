import { NextResponse } from "next/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const ALLOWED = new Set(["hubspot", "linkedin", "x"]);

/**
 * DELETE /api/mrai/integrations/{provider}/disconnect
 *
 * Drops the OAuth row and clears the matching signal. We don't revoke
 * the token on the provider side (HubSpot doesn't expose a tidy
 * revoke-by-app endpoint that's worth the extra moving part); the
 * user can revoke from their HubSpot account settings if they want
 * defense-in-depth.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider } = await params;
  if (!ALLOWED.has(provider)) {
    return NextResponse.json({ error: "bad_provider" }, { status: 400 });
  }

  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (ctx.status !== "active") {
    return NextResponse.json({ error: `workspace_${ctx.status}` }, { status: 403 });
  }

  const supabase = createServiceClient();
  const { error: iErr } = await supabase
    .from("mrai_integrations")
    .delete()
    .eq("workspace_id", ctx.workspaceId)
    .eq("provider", provider);
  if (iErr) {
    return NextResponse.json({ error: "disconnect_failed", detail: iErr.message }, { status: 500 });
  }
  await supabase
    .from("mrai_signals")
    .delete()
    .eq("workspace_id", ctx.workspaceId)
    .eq("source", provider);

  return NextResponse.json({ ok: true });
}

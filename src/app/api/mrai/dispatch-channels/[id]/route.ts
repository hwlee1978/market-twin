import { NextResponse } from "next/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { createServiceClient } from "@/lib/supabase/server";
import { dispatchToChannel, type ChannelRow } from "@/lib/mrai/dispatch-channels";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/mrai/channels/{id} — remove channel
 * POST   /api/mrai/channels/{id} — send a test message to the channel
 */

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (ctx.status !== "active") return NextResponse.json({ error: `workspace_${ctx.status}` }, { status: 403 });

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("mrai_channels")
    .delete()
    .eq("id", id)
    .eq("workspace_id", ctx.workspaceId);
  if (error) {
    return NextResponse.json({ error: "delete_failed", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (ctx.status !== "active") return NextResponse.json({ error: `workspace_${ctx.status}` }, { status: 403 });

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("mrai_channels")
    .select("id, workspace_id, channel_type, name, config, enabled, send_briefing")
    .eq("id", id)
    .eq("workspace_id", ctx.workspaceId)
    .maybeSingle();
  if (error || !data) {
    return NextResponse.json({ error: "channel_not_found" }, { status: 404 });
  }

  const result = await dispatchToChannel({
    channel: data as ChannelRow,
    payload: {
      title: "Mr. AI test message",
      body: "This is a test from Mr. AI. If you see this, the channel is wired correctly. 🎉\n\nYou'll receive your daily briefing here automatically.",
    },
    sourceType: "test",
  });

  if (!result.ok) {
    return NextResponse.json({ error: "test_failed", detail: result.error }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}

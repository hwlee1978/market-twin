import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { createServiceClient } from "@/lib/supabase/server";
import { listChannels, listRecentDispatches } from "@/lib/mrai/dispatch-channels";

export const dynamic = "force-dynamic";

/**
 * GET  /api/mrai/channels — list channels + last 20 dispatches
 * POST /api/mrai/channels — create channel
 */

const PostSchema = z.object({
  channelType: z.enum(["slack_webhook", "email", "generic_webhook"]),
  name: z.string().min(1).max(80),
  config: z.record(z.string(), z.unknown()),
  sendBriefing: z.boolean().optional(),
});

export async function GET() {
  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (ctx.status !== "active") return NextResponse.json({ error: `workspace_${ctx.status}` }, { status: 403 });

  const [channels, dispatches] = await Promise.all([
    listChannels(ctx.workspaceId),
    listRecentDispatches(ctx.workspaceId),
  ]);
  return NextResponse.json({ channels, dispatches });
}

export async function POST(req: Request) {
  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (ctx.status !== "active") return NextResponse.json({ error: `workspace_${ctx.status}` }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "bad_request", detail: parsed.error.flatten() }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("mrai_channels")
    .insert({
      workspace_id: ctx.workspaceId,
      created_by: ctx.userId,
      channel_type: parsed.data.channelType,
      name: parsed.data.name,
      config: parsed.data.config,
      send_briefing: parsed.data.sendBriefing ?? true,
    })
    .select("id, workspace_id, channel_type, name, config, enabled, send_briefing")
    .single();
  if (error || !data) {
    return NextResponse.json({ error: "create_failed", detail: error?.message }, { status: 500 });
  }
  return NextResponse.json({ channel: data });
}

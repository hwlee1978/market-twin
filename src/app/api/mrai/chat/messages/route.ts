import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { loadConversationMessages } from "@/lib/mrai/chat";

export const dynamic = "force-dynamic";

/**
 * GET /api/mrai/chat/messages?id=<uuid>
 * Returns the full turn list for a conversation so the client can
 * re-hydrate the chat pane when the user clicks an old thread.
 */

const Params = z.object({ id: z.string().uuid() });

export async function GET(req: Request) {
  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (ctx.status !== "active") {
    return NextResponse.json({ error: `workspace_${ctx.status}` }, { status: 403 });
  }

  const url = new URL(req.url);
  const parsed = Params.safeParse({ id: url.searchParams.get("id") });
  if (!parsed.success) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const turns = await loadConversationMessages(ctx.workspaceId, parsed.data.id);
  return NextResponse.json({ turns });
}

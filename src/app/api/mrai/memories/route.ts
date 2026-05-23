import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { createServiceClient } from "@/lib/supabase/server";
import { loadWorkspaceMemories } from "@/lib/mrai/memory";

export const dynamic = "force-dynamic";

/**
 * GET /api/mrai/memories — list workspace memories (newest first).
 * DELETE /api/mrai/memories?id=<uuid> — forget a specific memory.
 *
 * "Forget" is hard delete in v0 — keeps the prompt clean. If we later
 * need audit history we add a deleted_at column instead of restoring.
 */

const DeleteParams = z.object({ id: z.string().uuid() });

export async function GET() {
  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (ctx.status !== "active") {
    return NextResponse.json({ error: `workspace_${ctx.status}` }, { status: 403 });
  }
  const memories = await loadWorkspaceMemories(ctx.workspaceId);
  return NextResponse.json({ memories });
}

export async function DELETE(req: Request) {
  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (ctx.status !== "active") {
    return NextResponse.json({ error: `workspace_${ctx.status}` }, { status: 403 });
  }

  const url = new URL(req.url);
  const parsed = DeleteParams.safeParse({ id: url.searchParams.get("id") });
  if (!parsed.success) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("mrai_memories")
    .delete()
    .eq("id", parsed.data.id)
    .eq("workspace_id", ctx.workspaceId);
  if (error) {
    return NextResponse.json({ error: "delete_failed", detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

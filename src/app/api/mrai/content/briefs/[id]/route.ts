import { NextResponse } from "next/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { getBrief, deleteBrief, regenerateStrategy } from "@/lib/mrai/content/briefs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET    /api/mrai/content/briefs/{id}            — single brief
 * DELETE /api/mrai/content/briefs/{id}            — remove
 * POST   /api/mrai/content/briefs/{id}/regenerate — re-run strategist
 *   (POST without a body acts as the regenerate trigger — keeps surface small)
 */

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (ctx.status !== "active") return NextResponse.json({ error: `workspace_${ctx.status}` }, { status: 403 });

  const brief = await getBrief({ workspaceId: ctx.workspaceId, briefId: id });
  if (!brief) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ brief });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (ctx.status !== "active") return NextResponse.json({ error: `workspace_${ctx.status}` }, { status: 403 });

  try {
    await deleteBrief({ workspaceId: ctx.workspaceId, briefId: id });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "internal_error";
    return NextResponse.json({ error: "delete_failed", detail: msg }, { status: 500 });
  }
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (ctx.status !== "active") return NextResponse.json({ error: `workspace_${ctx.status}` }, { status: 403 });

  try {
    const brief = await regenerateStrategy({ workspaceId: ctx.workspaceId, briefId: id });
    return NextResponse.json({ brief });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "internal_error";
    console.error("[mrai/content/briefs/[id] POST]", msg);
    return NextResponse.json({ error: "regenerate_failed", detail: msg }, { status: 500 });
  }
}

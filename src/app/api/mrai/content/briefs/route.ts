import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { createAndPlanBrief, listBriefs } from "@/lib/mrai/content/briefs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET  /api/mrai/content/briefs — list all briefs (newest first)
 * POST /api/mrai/content/briefs — create + run strategist synchronously
 */

const PostSchema = z.object({
  topic: z.string().min(3).max(500),
  goal: z.string().max(200).optional(),
  targetAudience: z.string().max(200).optional(),
  formats: z.array(z.string().max(40)).max(8).optional(),
  tone: z.string().max(100).optional(),
  locale: z.enum(["ko", "en"]).default("ko"),
});

export async function GET() {
  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (ctx.status !== "active") {
    return NextResponse.json({ error: `workspace_${ctx.status}` }, { status: 403 });
  }
  const briefs = await listBriefs(ctx.workspaceId);
  return NextResponse.json({ briefs });
}

export async function POST(req: Request) {
  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (ctx.status !== "active") {
    return NextResponse.json({ error: `workspace_${ctx.status}` }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "bad_request", detail: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const brief = await createAndPlanBrief({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      topic: parsed.data.topic,
      goal: parsed.data.goal,
      targetAudience: parsed.data.targetAudience,
      formats: parsed.data.formats,
      tone: parsed.data.tone,
      locale: parsed.data.locale,
    });
    return NextResponse.json({ brief });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "internal_error";
    console.error("[mrai/content/briefs POST]", msg);
    return NextResponse.json({ error: "plan_failed", detail: msg }, { status: 500 });
  }
}

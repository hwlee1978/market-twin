import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import {
  saveFeedback,
  clearFeedback,
  loadFeedbackFor,
  aggregateRecentFeedback,
  type FeedbackKind,
  type FeedbackTargetType,
} from "@/lib/mrai/feedback";

export const dynamic = "force-dynamic";

/**
 * POST /api/mrai/feedback
 *   { targetType, targetId, kind: "useful" | "not_useful" | "acted" | "dismiss" | null }
 *   kind=null clears the row.
 *
 * GET /api/mrai/feedback?targetType=...&ids=a,b,c
 *   Returns { current: { [targetId]: kind }, aggregate: FeedbackAggregate }
 */

const KIND_VALUES = ["useful", "not_useful", "acted", "dismiss"] as const;
const TARGET_VALUES = ["briefing", "chat_message"] as const;

const PostSchema = z.object({
  targetType: z.enum(TARGET_VALUES),
  targetId: z.string().uuid(),
  kind: z.enum(KIND_VALUES).nullable(),
  note: z.string().max(500).optional(),
});

export async function POST(req: Request) {
  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (ctx.status !== "active") return NextResponse.json({ error: `workspace_${ctx.status}` }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "bad_request", detail: parsed.error.flatten() }, { status: 400 });
  }

  try {
    if (parsed.data.kind === null) {
      await clearFeedback({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        targetType: parsed.data.targetType as FeedbackTargetType,
        targetId: parsed.data.targetId,
      });
    } else {
      await saveFeedback({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        targetType: parsed.data.targetType as FeedbackTargetType,
        targetId: parsed.data.targetId,
        kind: parsed.data.kind as FeedbackKind,
        note: parsed.data.note,
      });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "internal_error";
    return NextResponse.json({ error: "save_failed", detail: msg }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (ctx.status !== "active") return NextResponse.json({ error: `workspace_${ctx.status}` }, { status: 403 });

  const url = new URL(req.url);
  const targetType = url.searchParams.get("targetType") ?? "";
  const idsParam = url.searchParams.get("ids") ?? "";
  const ids = idsParam.split(",").map((s) => s.trim()).filter((s) => /^[0-9a-f-]{36}$/i.test(s));

  const current = TARGET_VALUES.includes(targetType as FeedbackTargetType) && ids.length > 0
    ? await loadFeedbackFor({
        workspaceId: ctx.workspaceId,
        userId: ctx.userId,
        targetType: targetType as FeedbackTargetType,
        targetIds: ids,
      })
    : new Map();

  const aggregate = await aggregateRecentFeedback(ctx.workspaceId);

  return NextResponse.json({
    current: Object.fromEntries(current),
    aggregate,
  });
}

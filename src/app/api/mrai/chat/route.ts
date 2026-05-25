import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { runMrAIChat } from "@/lib/mrai/chat";
import { withLLMContext } from "@/lib/llm-context";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/mrai/chat — Mr. AI persistent-memory chat.
 *
 * Body: { conversationId?: string | null, message: string }
 * Returns: { conversationId, assistantMessage, newMemories }
 *
 * Stateless w.r.t. the conversation cursor: client just sends the
 * message + optional thread id. Server loads history from DB so the
 * client doesn't have to ferry it around.
 */

const RequestSchema = z.object({
  conversationId: z.string().uuid().nullable().optional(),
  message: z.string().min(1).max(4000),
  locale: z.enum(["ko", "en"]).optional(),
});

export async function POST(req: Request) {
  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (ctx.status !== "active") {
    return NextResponse.json({ error: `workspace_${ctx.status}` }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const result = await withLLMContext(
      {
        workspaceId: ctx.workspaceId,
        stageLabel: "mrai-chat",
        conversationId: parsed.data.conversationId ?? undefined,
      },
      () =>
        runMrAIChat({
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          conversationId: parsed.data.conversationId ?? null,
          userMessage: parsed.data.message,
          locale: parsed.data.locale,
        }),
    );
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "internal_error";
    console.error("[mrai/chat]", msg, e);
    return NextResponse.json({ error: "chat_failed", detail: msg }, { status: 500 });
  }
}

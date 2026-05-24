import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { saveMemories } from "@/lib/mrai/memory";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({
  memories: z
    .array(
      z.object({
        kind: z.enum(["fact", "preference", "context", "decision"]),
        title: z.string().min(1).max(200),
        body: z.string().min(1).max(2000),
      }),
    )
    .min(1)
    .max(50),
  /** Optional message id this batch came from (e.g. the assistant turn
   *  that surfaced the PDF preview card). */
  sourceMessageId: z.string().uuid().nullable().optional(),
});

/**
 * POST /api/mrai/memories/bulk
 *
 * Persists a user-confirmed batch of memory items (typically the
 * MemoryPreviewCard checklist after a PDF extract). Reuses the same
 * saveMemories helper as the chat turn extraction path so embeddings
 * + RLS behave identically.
 */
export async function POST(req: Request) {
  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (ctx.status !== "active") {
    return NextResponse.json({ error: `workspace_${ctx.status}` }, { status: 403 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const raw = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    await saveMemories({
      workspaceId: ctx.workspaceId,
      userId: user.id,
      sourceMessageId: parsed.data.sourceMessageId ?? null,
      memories: parsed.data.memories,
    });
    return NextResponse.json({
      ok: true,
      saved: parsed.data.memories.length,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "internal_error";
    return NextResponse.json(
      { error: "save_failed", detail: msg },
      { status: 500 },
    );
  }
}

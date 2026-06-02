import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { generateBriefing, listBriefings } from "@/lib/mrai/daily-briefing";
import type { Locale } from "@/lib/mrai/types";
import { withLLMContext } from "@/lib/llm-context";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/mrai/briefings { locale: "ko" | "en" }
 *   Generates a fresh briefing in the requested language. Returns the
 *   new row. Persists to mrai_briefings.
 *
 * GET /api/mrai/briefings
 *   Lists briefing IDs + dates (no body) so the UI can build a history
 *   sidebar without paying the cost of N markdown bodies.
 */

const PostSchema = z.object({
  locale: z.enum(["ko", "en"]),
});

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
    const briefing = await withLLMContext(
      { workspaceId: ctx.workspaceId, stageLabel: "mrai-briefing" },
      () =>
        generateBriefing({
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          locale: parsed.data.locale as Locale,
        }),
    );
    return NextResponse.json({ briefing });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "internal_error";
    console.error("[mrai/briefings POST]", msg, e);
    return NextResponse.json({ error: "generate_failed", detail: msg }, { status: 500 });
  }
}

export async function GET() {
  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (ctx.status !== "active") {
    return NextResponse.json({ error: `workspace_${ctx.status}` }, { status: 403 });
  }
  const briefings = await listBriefings(ctx.workspaceId);
  return NextResponse.json({ briefings });
}

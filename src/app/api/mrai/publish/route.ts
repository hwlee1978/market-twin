import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { getLinkedInAccess, publishToLinkedIn } from "@/lib/mrai/integrations/linkedin";
import { getXAccess, publishToX } from "@/lib/mrai/integrations/x";

export const dynamic = "force-dynamic";

/**
 * POST /api/mrai/publish
 *
 * Publish a text post to LinkedIn or X on behalf of the connected
 * workspace account. Validates per-platform character limits before
 * calling out, then records every attempt (success/fail) in
 * mrai_publish_posts for audit + retry UX.
 */
const RequestSchema = z.object({
  provider: z.enum(["linkedin", "x"]),
  content: z.string().min(1).max(8000),
  contentDraftId: z.string().uuid().optional().nullable(),
});

const PLATFORM_LIMITS = {
  // LinkedIn ugcPosts.shareCommentary text cap.
  linkedin: 3000,
  // X / Twitter Basic plan tweet limit. Premium accounts can post more
  // but the API rejects >280 for non-verified.
  x: 280,
} as const;

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
  const { provider, content, contentDraftId } = parsed.data;

  // Hard-stop on platform char limits — better to refuse upfront than
  // record a failed post that costs nothing to prevent.
  if (content.length > PLATFORM_LIMITS[provider]) {
    return NextResponse.json(
      {
        error: "content_too_long",
        detail: `${provider} max ${PLATFORM_LIMITS[provider]} chars (got ${content.length})`,
      },
      { status: 400 },
    );
  }

  const admin = createServiceClient();

  // Pre-create the row in `pending` so we have a record even if the
  // upstream call hangs or the route crashes mid-flight.
  const { data: pending, error: pendingErr } = await admin
    .from("mrai_publish_posts")
    .insert({
      workspace_id: ctx.workspaceId,
      provider,
      content,
      content_draft_id: contentDraftId ?? null,
      status: "pending",
      triggered_by: ctx.userId,
    })
    .select("id")
    .single();
  if (pendingErr || !pending) {
    return NextResponse.json(
      { error: "record_failed", detail: pendingErr?.message ?? null },
      { status: 500 },
    );
  }
  const recordId = pending.id as string;

  try {
    let result: { postId: string; url: string };
    if (provider === "linkedin") {
      const access = await getLinkedInAccess(ctx.workspaceId);
      if (!access) {
        throw new Error("LinkedIn not connected (or token expired — reconnect required)");
      }
      result = await publishToLinkedIn({
        accessToken: access.accessToken,
        authorSub: access.accountId,
        text: content,
      });
    } else {
      const access = await getXAccess(ctx.workspaceId);
      if (!access) {
        throw new Error("X not connected (or refresh failed — reconnect required)");
      }
      result = await publishToX({
        accessToken: access.accessToken,
        text: content,
      });
    }

    await admin
      .from("mrai_publish_posts")
      .update({
        status: "sent",
        platform_post_id: result.postId,
        platform_url: result.url,
        sent_at: new Date().toISOString(),
      })
      .eq("id", recordId);

    return NextResponse.json({
      postId: recordId,
      platformPostId: result.postId,
      platformUrl: result.url,
    });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    await admin
      .from("mrai_publish_posts")
      .update({ status: "failed", error_message: detail })
      .eq("id", recordId);
    return NextResponse.json(
      { error: "publish_failed", detail },
      { status: 502 },
    );
  }
}

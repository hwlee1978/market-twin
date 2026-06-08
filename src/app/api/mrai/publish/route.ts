import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import {
  getLinkedInAccess,
  publishToLinkedIn,
  deleteFromLinkedIn,
} from "@/lib/mrai/integrations/linkedin";
import { getXAccess, publishToX, deleteFromX } from "@/lib/mrai/integrations/x";

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

/**
 * GET /api/mrai/publish?draftId=<uuid>
 *
 * List the live (status='sent') external posts. Scoped to the caller's
 * workspace. When draftId is given, only that draft's posts return —
 * drives the per-draft "발행됨 · 삭제" controls so they survive reloads.
 */
export async function GET(req: Request) {
  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const draftId = new URL(req.url).searchParams.get("draftId");
  const admin = createServiceClient();
  let query = admin
    .from("mrai_publish_posts")
    .select("id, provider, platform_url, platform_post_id, sent_at")
    .eq("workspace_id", ctx.workspaceId)
    .eq("status", "sent")
    .order("sent_at", { ascending: false });
  if (draftId) query = query.eq("content_draft_id", draftId);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ posts: data ?? [] });
}

const DeleteSchema = z.object({ postId: z.string().uuid() });

/**
 * DELETE /api/mrai/publish  { postId }
 *
 * Remove a previously published post from the platform (X tweet /
 * LinkedIn share) and mark the audit row status='deleted'. The history
 * row is kept (with deleted_at) rather than dropped.
 */
export async function DELETE(req: Request) {
  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = DeleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const admin = createServiceClient();
  const { data: postRow, error: findErr } = await admin
    .from("mrai_publish_posts")
    .select("id, provider, platform_post_id, status")
    .eq("id", parsed.data.postId)
    .eq("workspace_id", ctx.workspaceId)
    .single();
  if (findErr || !postRow) {
    return NextResponse.json({ error: "post_not_found" }, { status: 404 });
  }
  const post = postRow as {
    id: string;
    provider: "linkedin" | "x";
    platform_post_id: string | null;
    status: string;
  };
  if (post.status !== "sent" || !post.platform_post_id) {
    return NextResponse.json({ error: "not_a_live_post" }, { status: 400 });
  }

  try {
    if (post.provider === "x") {
      const access = await getXAccess(ctx.workspaceId);
      if (!access) {
        throw new Error("X not connected (or refresh failed — reconnect required)");
      }
      await deleteFromX({ accessToken: access.accessToken, tweetId: post.platform_post_id });
    } else {
      const access = await getLinkedInAccess(ctx.workspaceId);
      if (!access) {
        throw new Error("LinkedIn not connected (or token expired — reconnect required)");
      }
      await deleteFromLinkedIn({
        accessToken: access.accessToken,
        postUrn: post.platform_post_id,
      });
    }
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "delete_failed", detail }, { status: 502 });
  }

  await admin
    .from("mrai_publish_posts")
    .update({ status: "deleted", deleted_at: new Date().toISOString() })
    .eq("id", post.id);

  return NextResponse.json({ ok: true });
}

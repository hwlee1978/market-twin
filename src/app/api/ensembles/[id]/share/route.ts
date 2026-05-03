import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

const DEFAULT_TTL_DAYS = 30;
const MAX_TTL_DAYS = 365;

/**
 * POST /api/ensembles/:id/share
 * Body: { ttlDays?: number, regenerate?: boolean }
 *
 * Creates a shareable URL token for an ensemble. The token (32 bytes
 * URL-safe base64) goes on the ensembles row plus an expiry. Anyone
 * with the resulting /share/ensemble/<token> URL can view a read-only
 * version of the result until expiry, no auth required.
 *
 * If a token already exists and is valid, returns it as-is unless
 * `regenerate: true` is passed — useful when the owner wants to
 * invalidate an old link without revoking + re-creating.
 *
 * DELETE /api/ensembles/:id/share — revokes (clears the columns).
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const wsCtx = await getOrCreatePrimaryWorkspace();
  if (!wsCtx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const ttlDays = clampTtl(body?.ttlDays);
  const regenerate = body?.regenerate === true;

  const supabase = await createClient();
  const { data: existing, error: lookupErr } = await supabase
    .from("ensembles")
    .select("id, share_token, share_expires_at")
    .eq("id", id)
    .eq("workspace_id", wsCtx.workspaceId)
    .single();
  if (lookupErr || !existing) {
    return NextResponse.json({ error: "ensemble not found" }, { status: 404 });
  }

  // If a valid token exists and the caller didn't ask to regenerate,
  // just return it. Stable URLs across calls let the user copy → paste
  // multiple times without invalidating earlier shares.
  const stillValid =
    existing.share_token &&
    existing.share_expires_at &&
    new Date(existing.share_expires_at).getTime() > Date.now();
  if (stillValid && !regenerate) {
    return NextResponse.json({
      token: existing.share_token,
      expiresAt: existing.share_expires_at,
      regenerated: false,
    });
  }

  const token = generateToken();
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString();

  const admin = createServiceClient();
  const { error: updateErr } = await admin
    .from("ensembles")
    .update({ share_token: token, share_expires_at: expiresAt })
    .eq("id", id);
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ token, expiresAt, regenerated: !!existing.share_token });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const wsCtx = await getOrCreatePrimaryWorkspace();
  if (!wsCtx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // RLS via the user-bound client gates ownership on the read; the
  // write goes through service role.
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("ensembles")
    .select("id")
    .eq("id", id)
    .eq("workspace_id", wsCtx.workspaceId)
    .single();
  if (!existing) {
    return NextResponse.json({ error: "ensemble not found" }, { status: 404 });
  }

  const admin = createServiceClient();
  const { error: updateErr } = await admin
    .from("ensembles")
    .update({ share_token: null, share_expires_at: null })
    .eq("id", id);
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

function clampTtl(input: unknown): number {
  const n = Number(input);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_TTL_DAYS;
  return Math.min(Math.floor(n), MAX_TTL_DAYS);
}

/**
 * 32 bytes of cryptographic randomness, URL-safe base64. Equivalent
 * unguessable space to a typical session id; the consumer flow is
 * "owner pastes URL into chat" so brute force isn't a real risk
 * model, but using crypto.randomBytes costs nothing.
 */
function generateToken(): string {
  return randomBytes(32)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { googleAuthorizeUrl } from "@/lib/mrai/seo/google-oauth";

export const dynamic = "force-dynamic";

/**
 * GET /api/mrai/seo/google/start
 *
 * Generates a CSRF state, stashes it in an HttpOnly cookie, and redirects
 * the user to Google's consent screen. The callback route validates the
 * state matches what we set here.
 */
export async function GET() {
  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const state = randomBytes(16).toString("hex");
  const url = googleAuthorizeUrl(state);

  const res = NextResponse.redirect(url);
  res.cookies.set("google_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  res.cookies.set("google_oauth_ws", ctx.workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}

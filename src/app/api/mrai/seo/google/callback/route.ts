import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/server";
import { exchangeCodeForTokens } from "@/lib/mrai/seo/google-oauth";

export const dynamic = "force-dynamic";

/**
 * GET /api/mrai/seo/google/callback?code=...&state=...
 *
 * Google bounces here after consent. We validate CSRF state, exchange
 * the code for tokens, and upsert into mrai_google_oauth. Then redirect
 * back to /mr-ai/analytics with a status query so the panel can show
 * "Connected as foo@bar.com".
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const jar = await cookies();
  const expectedState = jar.get("google_oauth_state")?.value;
  const workspaceId = jar.get("google_oauth_ws")?.value;

  const base = process.env.APP_BASE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const fail = (reason: string) =>
    NextResponse.redirect(`${base}/mr-ai/analytics?google=error&reason=${encodeURIComponent(reason)}`);

  if (error) return fail(error);
  if (!code || !state || !expectedState || !workspaceId) return fail("missing_params");
  if (state !== expectedState) return fail("state_mismatch");

  try {
    const tokens = await exchangeCodeForTokens(code);
    const svc = createServiceClient();
    const { error: upsertErr } = await svc.from("mrai_google_oauth").upsert(
      {
        workspace_id: workspaceId,
        google_email: tokens.email,
        refresh_token: tokens.refreshToken,
        access_token: tokens.accessToken,
        expires_at: tokens.expiresAt.toISOString(),
        scopes: tokens.scopes,
        connected_at: new Date().toISOString(),
        last_error: null,
        last_error_at: null,
      },
      { onConflict: "workspace_id" },
    );
    if (upsertErr) throw new Error(upsertErr.message);
  } catch (e) {
    return fail(e instanceof Error ? e.message.slice(0, 100) : "exchange_failed");
  }

  const res = NextResponse.redirect(`${base}/mr-ai/analytics?google=connected`);
  res.cookies.delete("google_oauth_state");
  res.cookies.delete("google_oauth_ws");
  return res;
}

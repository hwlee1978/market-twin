import { google } from "googleapis";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Google OAuth — covers BOTH Search Console (webmasters.readonly) and
 * Analytics (analytics.readonly) in a single consent screen so the user
 * only signs in once for full SEO sync.
 *
 * Env required (Vercel + .env.local):
 *   GOOGLE_CLIENT_ID
 *   GOOGLE_CLIENT_SECRET
 *   APP_BASE_URL  (or NEXT_PUBLIC_SITE_URL) — public origin used in
 *                  redirect URI registered with Google Cloud Console.
 *
 * The redirect URI you register with Google must be:
 *   ${APP_BASE_URL}/api/mrai/seo/google/callback
 *
 * Read-only scopes — low blast radius (we never write to anyone's GSC
 * or GA4 property).
 */

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
];

function redirectUri(): string {
  const base =
    process.env.APP_BASE_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/api/mrai/seo/google/callback`;
}

function oauth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId) throw new Error("GOOGLE_CLIENT_ID not set");
  if (!clientSecret) throw new Error("GOOGLE_CLIENT_SECRET not set");
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri());
}

export function googleAuthorizeUrl(state: string): string {
  const client = oauth2Client();
  return client.generateAuthUrl({
    access_type: "offline",      // mandatory for refresh token
    prompt: "consent",            // ensures refresh_token is returned
    scope: GOOGLE_SCOPES,
    state,
  });
}

interface TokenExchangeResult {
  refreshToken: string;
  accessToken: string;
  expiresAt: Date;
  email: string;
  scopes: string[];
}

export async function exchangeCodeForTokens(code: string): Promise<TokenExchangeResult> {
  const client = oauth2Client();
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error(
      "Google returned no refresh_token. Revoke prior consent and retry with prompt=consent.",
    );
  }
  if (!tokens.access_token) throw new Error("no access_token in token response");

  // Fetch the user's email so we can show "connected as foo@bar.com".
  client.setCredentials(tokens);
  const userinfo = await google.oauth2({ version: "v2", auth: client }).userinfo.get();
  const email = userinfo.data.email ?? "";

  return {
    refreshToken: tokens.refresh_token,
    accessToken: tokens.access_token,
    expiresAt: new Date(tokens.expiry_date ?? Date.now() + 3500_000),
    email,
    scopes: (tokens.scope ?? "").split(" ").filter(Boolean),
  };
}

/**
 * Build an authenticated OAuth2 client for a workspace. Auto-refreshes
 * the access token when within 60s of expiry. The googleapis library
 * also auto-refreshes on 401, but we proactively refresh to avoid the
 * extra round-trip on every sync.
 */
export async function getAuthenticatedClient(workspaceId: string) {
  const svc = createServiceClient();
  const { data: row, error } = await svc
    .from("mrai_google_oauth")
    .select("refresh_token, access_token, expires_at")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) throw new Error(`load oauth: ${error.message}`);
  if (!row) throw new Error("Google not connected for this workspace");
  const data = row as {
    refresh_token: string;
    access_token: string | null;
    expires_at: string | null;
  };

  const client = oauth2Client();
  client.setCredentials({
    refresh_token: data.refresh_token,
    access_token: data.access_token ?? undefined,
    expiry_date: data.expires_at ? new Date(data.expires_at).getTime() : undefined,
  });

  const expiresAt = data.expires_at ? new Date(data.expires_at).getTime() : 0;
  if (expiresAt < Date.now() + 60_000) {
    const refreshed = await client.refreshAccessToken();
    const t = refreshed.credentials;
    if (t.access_token && t.expiry_date) {
      await svc
        .from("mrai_google_oauth")
        .update({
          access_token: t.access_token,
          expires_at: new Date(t.expiry_date).toISOString(),
        })
        .eq("workspace_id", workspaceId);
    }
  }
  return client;
}

export async function disconnectGoogle(workspaceId: string): Promise<void> {
  const svc = createServiceClient();
  await svc.from("mrai_google_oauth").delete().eq("workspace_id", workspaceId);
}

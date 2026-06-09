import { createServiceClient } from "@/lib/supabase/server";

/**
 * LinkedIn integration — OAuth 2.0 + share posting on the connected
 * user's personal profile.
 *
 * Env required (Vercel + .env.local):
 *   LINKEDIN_CLIENT_ID      — from LinkedIn Developer Portal
 *   LINKEDIN_CLIENT_SECRET  — same
 *   APP_BASE_URL            — public origin used to build redirect URI
 *
 * Redirect URI to register on LinkedIn:
 *   ${APP_BASE_URL}/api/mrai/integrations/linkedin/callback
 *
 * Scopes:
 *   - openid + profile + email — basic profile (3-legged OAuth UX)
 *   - w_member_social — post on behalf of the authenticated user
 *
 * LinkedIn Marketing Developer Platform approval is required for
 * `w_member_social` on production apps with multiple users. For
 * single-tenant dogfood / Mr.AI own profile use, default sandbox
 * works without explicit approval. Production multi-user posting
 * needs the MDP approval (2-4 weeks).
 *
 * Access tokens are long-lived (60 days) but LinkedIn does NOT issue
 * refresh tokens for this scope. When expired, we mark the integration
 * row stale and prompt the user to reconnect.
 */

export const LINKEDIN_SCOPES = ["openid", "profile", "email", "w_member_social"];

const AUTHORIZE_URL = "https://www.linkedin.com/oauth/v2/authorization";
const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
const USERINFO_URL = "https://api.linkedin.com/v2/userinfo";
const POST_URL = "https://api.linkedin.com/v2/ugcPosts";

export function linkedinRedirectUri(): string {
  const base =
    process.env.APP_BASE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/api/mrai/integrations/linkedin/callback`;
}

export function linkedinAuthorizeUrl(state: string): string {
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  if (!clientId) throw new Error("LINKEDIN_CLIENT_ID not set");
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", linkedinRedirectUri());
  url.searchParams.set("scope", LINKEDIN_SCOPES.join(" "));
  url.searchParams.set("state", state);
  return url.toString();
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  scope: string;
  token_type?: string;
  id_token?: string;
}

interface UserInfoResponse {
  sub: string;
  name?: string;
  email?: string;
  picture?: string;
}

export async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("LINKEDIN_CLIENT_ID/SECRET not set");

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: linkedinRedirectUri(),
    code,
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`linkedin token exchange ${res.status}: ${detail.slice(0, 300)}`);
  }
  return (await res.json()) as TokenResponse;
}

async function fetchUserInfo(accessToken: string): Promise<UserInfoResponse | null> {
  try {
    const res = await fetch(USERINFO_URL, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    return (await res.json()) as UserInfoResponse;
  } catch {
    return null;
  }
}

export async function storeLinkedInTokens(input: {
  workspaceId: string;
  userId: string;
  tokens: TokenResponse;
}): Promise<void> {
  const supabase = createServiceClient();
  const expiresAt = new Date(Date.now() + input.tokens.expires_in * 1000).toISOString();
  const meta = await fetchUserInfo(input.tokens.access_token);

  const row = {
    workspace_id: input.workspaceId,
    provider: "linkedin" as const,
    access_token: input.tokens.access_token,
    refresh_token: null, // LinkedIn doesn't issue refresh tokens for w_member_social
    expires_at: expiresAt,
    scope: input.tokens.scope,
    account_id: meta?.sub ?? null,
    account_label: meta?.name ?? meta?.email ?? null,
    connected_by: input.userId,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("mrai_integrations")
    .upsert(row, { onConflict: "workspace_id,provider,account_id" });
  if (error) throw new Error(`store linkedin tokens: ${error.message}`);
}

interface IntegrationRow {
  access_token: string;
  expires_at: string | null;
  account_id: string | null;
  account_label: string | null;
}

/**
 * Get a valid LinkedIn access token for the workspace. Returns null
 * when no connection exists OR the token has expired (reconnect
 * required — LinkedIn doesn't issue refresh tokens).
 */
export async function getLinkedInAccess(
  workspaceId: string,
): Promise<{ accessToken: string; accountId: string; accountLabel: string | null } | null> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("mrai_integrations")
    .select("access_token, expires_at, account_id, account_label")
    .eq("workspace_id", workspaceId)
    .eq("provider", "linkedin")
    .maybeSingle();
  const row = data as IntegrationRow | null;
  if (!row || !row.account_id) return null;
  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
    return null;
  }
  return {
    accessToken: row.access_token,
    accountId: row.account_id,
    accountLabel: row.account_label,
  };
}

/**
 * Publish a text post to LinkedIn on the connected user's personal
 * profile. Returns the post URN + the platform URL.
 *
 * LinkedIn ugcPosts API quirks:
 *   - text capped at 3000 chars (we enforce in DB CHECK at 8000 but
 *     LinkedIn rejects >3000 → caller should validate before)
 *   - Author is `urn:li:person:{sub}` from /v2/userinfo
 *   - lifecycleState must be PUBLISHED
 */
export async function publishToLinkedIn(args: {
  accessToken: string;
  authorSub: string;
  text: string;
}): Promise<{ postId: string; url: string }> {
  const author = `urn:li:person:${args.authorSub}`;
  const body = {
    author,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text: args.text.slice(0, 3000) },
        shareMediaCategory: "NONE",
      },
    },
    visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
  };

  const res = await fetch(POST_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${args.accessToken}`,
      "content-type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`linkedin publish ${res.status}: ${detail.slice(0, 400)}`);
  }
  const json = (await res.json()) as { id: string };
  // urn:li:share:1234567890 → https://www.linkedin.com/feed/update/urn:li:share:1234567890/
  const url = `https://www.linkedin.com/feed/update/${encodeURIComponent(json.id)}/`;
  return { postId: json.id, url };
}

/**
 * Delete a previously published ugcPost by its URN. LinkedIn returns
 * 204 No Content on success; a 404 means it's already gone (treated as
 * success for idempotent reconciliation).
 */
export async function deleteFromLinkedIn(args: {
  accessToken: string;
  postUrn: string;
}): Promise<void> {
  const res = await fetch(`${POST_URL}/${encodeURIComponent(args.postUrn)}`, {
    method: "DELETE",
    headers: {
      authorization: `Bearer ${args.accessToken}`,
      "X-Restli-Protocol-Version": "2.0.0",
    },
  });
  if (res.status === 404 || res.status === 204 || res.ok) return;
  const detail = await res.text().catch(() => "");
  throw new Error(`linkedin delete ${res.status}: ${detail.slice(0, 400)}`);
}

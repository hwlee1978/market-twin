import { createServiceClient } from "@/lib/supabase/server";
import { createHash, randomBytes } from "crypto";

/**
 * X (Twitter) integration — OAuth 2.0 with PKCE + tweet posting on
 * the connected account's behalf.
 *
 * Env required (Vercel + .env.local):
 *   X_CLIENT_ID            — from X Developer Portal
 *   X_CLIENT_SECRET        — from X Developer Portal (required for
 *                            confidential client; public client uses
 *                            PKCE only without secret)
 *   APP_BASE_URL           — public origin used to build redirect URI
 *
 * Redirect URI to register on X:
 *   ${APP_BASE_URL}/api/mrai/integrations/x/callback
 *
 * Scopes:
 *   - tweet.read tweet.write users.read offline.access media.write
 *   - media.write is required for attaching images to tweets (v2 media
 *     upload). Adding it means previously-connected accounts must
 *     RECONNECT to mint a token that carries the new scope.
 *
 * Subscription:
 *   - Basic plan ($100/mo) required for tweet write at the time of
 *     writing. Free tier allows only read.
 *
 * PKCE storage:
 *   - code_verifier is generated when /connect builds the authorize
 *     URL and must be sent along with the code in /callback. We stash
 *     it in a short-lived signed cookie (httpOnly, 10min TTL).
 */

export const X_SCOPES = [
  "tweet.read",
  "tweet.write",
  "users.read",
  "offline.access",
  "media.write",
];

// X migrated twitter.com → x.com. The OAuth *authorize* page must run
// on x.com: a user logged into x.com is seen as logged-out on
// twitter.com (separate cookie domain), so twitter.com/i/oauth2/authorize
// bounces into a blank /i/jf/onboarding/web/sso flow. API hosts on
// api.x.com (api.twitter.com still 200s but we stay consistent).
const AUTHORIZE_URL = "https://x.com/i/oauth2/authorize";
const TOKEN_URL = "https://api.x.com/2/oauth2/token";
const USERME_URL = "https://api.x.com/2/users/me";
const TWEET_URL = "https://api.x.com/2/tweets";
const MEDIA_UPLOAD_URL = "https://api.x.com/2/media/upload";

export function xRedirectUri(): string {
  const base =
    process.env.APP_BASE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/api/mrai/integrations/x/callback`;
}

/**
 * Generate a fresh PKCE code_verifier (43-128 chars URL-safe base64)
 * and its SHA-256 challenge. Caller must remember the verifier (cookie
 * or DB) to send to /callback.
 */
export function generatePkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const challenge = createHash("sha256")
    .update(verifier)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return { verifier, challenge };
}

export function xAuthorizeUrl(args: { state: string; challenge: string }): string {
  const clientId = process.env.X_CLIENT_ID;
  if (!clientId) throw new Error("X_CLIENT_ID not set");
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", xRedirectUri());
  url.searchParams.set("scope", X_SCOPES.join(" "));
  url.searchParams.set("state", args.state);
  url.searchParams.set("code_challenge", args.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

interface TokenResponse {
  token_type: string;
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
}

export async function exchangeCodeForTokens(args: {
  code: string;
  verifier: string;
}): Promise<TokenResponse> {
  const clientId = process.env.X_CLIENT_ID;
  const clientSecret = process.env.X_CLIENT_SECRET;
  if (!clientId) throw new Error("X_CLIENT_ID not set");

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: args.code,
    redirect_uri: xRedirectUri(),
    code_verifier: args.verifier,
    client_id: clientId,
  });

  const headers: Record<string, string> = {
    "content-type": "application/x-www-form-urlencoded",
  };
  // Confidential client — X uses HTTP basic auth when a secret is
  // present. Public client (no secret) skips this header.
  if (clientSecret) {
    headers.authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
  }

  const res = await fetch(TOKEN_URL, { method: "POST", headers, body: body.toString() });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`x token exchange ${res.status}: ${detail.slice(0, 300)}`);
  }
  return (await res.json()) as TokenResponse;
}

export async function refreshTokens(refreshToken: string): Promise<TokenResponse> {
  const clientId = process.env.X_CLIENT_ID;
  const clientSecret = process.env.X_CLIENT_SECRET;
  if (!clientId) throw new Error("X_CLIENT_ID not set");

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
  });
  const headers: Record<string, string> = {
    "content-type": "application/x-www-form-urlencoded",
  };
  if (clientSecret) {
    headers.authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
  }

  const res = await fetch(TOKEN_URL, { method: "POST", headers, body: body.toString() });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`x refresh ${res.status}: ${detail.slice(0, 300)}`);
  }
  return (await res.json()) as TokenResponse;
}

interface UserMeResponse {
  data?: { id: string; name?: string; username?: string };
}

async function fetchUserMe(accessToken: string): Promise<UserMeResponse | null> {
  try {
    const res = await fetch(USERME_URL, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    return (await res.json()) as UserMeResponse;
  } catch {
    return null;
  }
}

export async function storeXTokens(input: {
  workspaceId: string;
  userId: string;
  tokens: TokenResponse;
}): Promise<void> {
  const supabase = createServiceClient();
  const expiresAt = new Date(Date.now() + input.tokens.expires_in * 1000).toISOString();
  const meta = await fetchUserMe(input.tokens.access_token);

  const row = {
    workspace_id: input.workspaceId,
    provider: "x" as const,
    access_token: input.tokens.access_token,
    refresh_token: input.tokens.refresh_token ?? null,
    expires_at: expiresAt,
    scope: input.tokens.scope,
    account_id: meta?.data?.id ?? null,
    account_label: meta?.data?.username
      ? `@${meta.data.username}`
      : meta?.data?.name ?? null,
    connected_by: input.userId,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("mrai_integrations")
    .upsert(row, { onConflict: "workspace_id,provider,account_id" });
  if (error) throw new Error(`store x tokens: ${error.message}`);
}

interface IntegrationRow {
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
  account_id: string | null;
  account_label: string | null;
}

/**
 * List every connected X account for the workspace (for the publish
 * account picker + settings UI). Most-recently connected first.
 */
export async function listXAccounts(
  workspaceId: string,
): Promise<Array<{ accountId: string; accountLabel: string | null }>> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("mrai_integrations")
    .select("account_id, account_label")
    .eq("workspace_id", workspaceId)
    .eq("provider", "x")
    .not("account_id", "is", null)
    .order("updated_at", { ascending: false });
  return ((data ?? []) as Array<{ account_id: string; account_label: string | null }>).map(
    (r) => ({ accountId: r.account_id, accountLabel: r.account_label }),
  );
}

/**
 * Get a valid X access token, refreshing it 60s before expiry. With
 * multi-account support, `accountId` selects which connected account;
 * when omitted we fall back to the most-recently-connected one. Returns
 * null when no connection exists or refresh fails terminally (reconnect).
 */
export async function getXAccess(
  workspaceId: string,
  accountId?: string,
): Promise<{ accessToken: string; accountId: string; accountLabel: string | null } | null> {
  const supabase = createServiceClient();
  let query = supabase
    .from("mrai_integrations")
    .select("access_token, refresh_token, expires_at, account_id, account_label")
    .eq("workspace_id", workspaceId)
    .eq("provider", "x");
  if (accountId) query = query.eq("account_id", accountId);
  const { data } = await query.order("updated_at", { ascending: false }).limit(1);
  const row = (data?.[0] ?? null) as IntegrationRow | null;
  if (!row || !row.account_id) return null;

  const expMs = row.expires_at ? new Date(row.expires_at).getTime() : 0;
  if (expMs <= Date.now() + 60_000) {
    if (!row.refresh_token) return null;
    try {
      const fresh = await refreshTokens(row.refresh_token);
      // Scope the refresh write to THIS account so we don't clobber the
      // tokens of the workspace's other connected X accounts.
      await supabase
        .from("mrai_integrations")
        .update({
          access_token: fresh.access_token,
          refresh_token: fresh.refresh_token ?? row.refresh_token,
          expires_at: new Date(Date.now() + fresh.expires_in * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("workspace_id", workspaceId)
        .eq("provider", "x")
        .eq("account_id", row.account_id);
      return {
        accessToken: fresh.access_token,
        accountId: row.account_id,
        accountLabel: row.account_label,
      };
    } catch {
      return null;
    }
  }
  return {
    accessToken: row.access_token,
    accountId: row.account_id,
    accountLabel: row.account_label,
  };
}

/**
 * Post a tweet. Text limit ~280 chars on Basic plan; Premium allows
 * longer but X's API rejects >280 unless the account is verified.
 * We send as-is — the caller (publish API) validates length.
 */
export async function publishToX(args: {
  accessToken: string;
  text: string;
  /** Up to 4 media ids from uploadMediaToX(), attached as the tweet's images. */
  mediaIds?: string[];
}): Promise<{ postId: string; url: string }> {
  const payload: { text: string; media?: { media_ids: string[] } } = {
    text: args.text,
  };
  if (args.mediaIds && args.mediaIds.length > 0) {
    payload.media = { media_ids: args.mediaIds.slice(0, 4) };
  }
  const res = await fetch(TWEET_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${args.accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`x publish ${res.status}: ${detail.slice(0, 400)}`);
  }
  const json = (await res.json()) as { data?: { id: string } };
  const id = json.data?.id;
  if (!id) throw new Error("x publish: no tweet id returned");
  return {
    postId: id,
    url: `https://x.com/i/web/status/${id}`,
  };
}

/**
 * Upload one image to X (v2 media upload) and return its media id, ready
 * to attach via publishToX({ mediaIds }). Requires the media.write scope
 * — a token minted before that scope was added returns 403, signalling
 * the user must reconnect. X allows ≤4 images per tweet; the caller
 * enforces that.
 */
export async function uploadMediaToX(args: {
  accessToken: string;
  data: ArrayBuffer;
  mimeType: string;
}): Promise<string> {
  const ext = args.mimeType.includes("png")
    ? "png"
    : args.mimeType.includes("webp")
      ? "webp"
      : args.mimeType.includes("gif")
        ? "gif"
        : "jpg";
  const form = new FormData();
  form.append("media_category", "tweet_image");
  form.append(
    "media",
    new Blob([args.data], { type: args.mimeType }),
    `upload.${ext}`,
  );

  const res = await fetch(MEDIA_UPLOAD_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${args.accessToken}` },
    body: form,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`x media upload ${res.status}: ${detail.slice(0, 400)}`);
  }
  const json = (await res.json()) as {
    data?: { id?: string };
    media_id_string?: string;
  };
  const id = json.data?.id ?? json.media_id_string;
  if (!id) throw new Error("x media upload: no media id returned");
  return id;
}

/**
 * Delete a tweet by id on the connected account's behalf. Requires the
 * tweet.write scope (which we already request). A 404 means the tweet
 * is already gone — treated as success so the caller can reconcile its
 * record idempotently.
 */
export async function deleteFromX(args: {
  accessToken: string;
  tweetId: string;
}): Promise<void> {
  const res = await fetch(`${TWEET_URL}/${args.tweetId}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${args.accessToken}` },
  });
  if (res.status === 404) return; // already deleted upstream
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`x delete ${res.status}: ${detail.slice(0, 400)}`);
  }
  const json = (await res.json()) as { data?: { deleted?: boolean } };
  if (!json.data?.deleted) {
    throw new Error("x delete: platform reported not-deleted");
  }
}

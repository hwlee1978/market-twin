import { NextResponse } from "next/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { generatePkce, xAuthorizeUrl } from "@/lib/mrai/integrations/x";
import { randomBytes, createHmac } from "node:crypto";

export const dynamic = "force-dynamic";

/**
 * GET /api/mrai/integrations/x/connect
 *
 * X OAuth 2.0 with PKCE. Steps:
 *   1. Generate PKCE verifier + challenge
 *   2. Stash the verifier in an httpOnly cookie (TTL 10min)
 *   3. Sign a state (HMAC) for CSRF
 *   4. Redirect to X's authorize page
 *
 * Callback reads the verifier from the cookie + exchanges for tokens.
 */
function signState(workspaceId: string, nonce: string): string {
  const secret =
    process.env.CRON_SECRET ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "fallback-secret";
  const payload = `${workspaceId}.${nonce}`;
  const sig = createHmac("sha256", secret).update(payload).digest("hex").slice(0, 32);
  return `${payload}.${sig}`;
}

export function verifyXState(state: string): { workspaceId: string } | null {
  const parts = state.split(".");
  if (parts.length !== 3) return null;
  const [workspaceId, nonce, sig] = parts;
  const secret =
    process.env.CRON_SECRET ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "fallback-secret";
  const expected = createHmac("sha256", secret)
    .update(`${workspaceId}.${nonce}`)
    .digest("hex")
    .slice(0, 32);
  if (expected !== sig) return null;
  return { workspaceId };
}

export async function GET() {
  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (ctx.status !== "active") {
    return NextResponse.json({ error: `workspace_${ctx.status}` }, { status: 403 });
  }

  const nonce = randomBytes(12).toString("hex");
  const state = signState(ctx.workspaceId, nonce);
  const pkce = generatePkce();

  try {
    const authUrl = xAuthorizeUrl({ state, challenge: pkce.challenge });
    const res = NextResponse.redirect(authUrl);
    res.cookies.set("x_pkce_verifier", pkce.verifier, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    });
    return res;
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "config_missing", detail }, { status: 500 });
  }
}

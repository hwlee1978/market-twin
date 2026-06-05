import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { exchangeCodeForTokens, storeXTokens } from "@/lib/mrai/integrations/x";
import { verifyXState } from "../connect/route";

export const dynamic = "force-dynamic";

/**
 * GET /api/mrai/integrations/x/callback?code=...&state=...
 *
 * Reads PKCE verifier from the cookie set in /connect, verifies state,
 * exchanges code for tokens, persists. Clears the verifier cookie.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const back = (status: "ok" | "error", detail?: string) => {
    const target = new URL("/ko/mrai", url.origin);
    target.searchParams.set("x", status);
    if (detail) target.searchParams.set("detail", detail.slice(0, 200));
    const res = NextResponse.redirect(target);
    // Always clear the verifier cookie regardless of outcome.
    res.cookies.set("x_pkce_verifier", "", { maxAge: 0, path: "/" });
    return res;
  };

  if (error) return back("error", error);
  if (!code || !state) return back("error", "missing_code_or_state");

  const verified = verifyXState(state);
  if (!verified) return back("error", "invalid_state");

  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx || ctx.workspaceId !== verified.workspaceId) {
    return back("error", "workspace_mismatch");
  }

  const cookieStore = await cookies();
  const verifier = cookieStore.get("x_pkce_verifier")?.value;
  if (!verifier) return back("error", "pkce_verifier_missing");

  try {
    const tokens = await exchangeCodeForTokens({ code, verifier });
    await storeXTokens({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      tokens,
    });
    return back("ok");
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return back("error", detail);
  }
}

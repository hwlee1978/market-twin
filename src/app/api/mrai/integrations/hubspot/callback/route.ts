import { NextResponse } from "next/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { exchangeCodeForTokens, storeHubSpotTokens } from "@/lib/mrai/integrations/hubspot";
import { verifyState } from "../connect/route";

export const dynamic = "force-dynamic";

/**
 * GET /api/mrai/integrations/hubspot/callback?code=...&state=...
 *
 * HubSpot redirects here after the user grants consent. We:
 *   1. Verify the HMAC-signed state matches the user's workspace.
 *   2. Exchange the code for tokens.
 *   3. Store the tokens against the workspace.
 *   4. Bounce back to /mr-ai with a query flag so the UI can flash
 *      a success/error toast.
 */
export async function GET(req: Request) {
  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const redirectTo = (status: "ok" | "error", detail?: string) => {
    const dest = new URL("/ko/mr-ai", req.url);
    dest.searchParams.set("hubspot", status);
    if (detail) dest.searchParams.set("detail", detail.slice(0, 200));
    return NextResponse.redirect(dest);
  };

  if (error) return redirectTo("error", `provider:${error}`);
  if (!code || !state) return redirectTo("error", "missing_code_or_state");

  const verified = verifyState(state);
  if (!verified || verified.workspaceId !== ctx.workspaceId) {
    return redirectTo("error", "state_mismatch");
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    await storeHubSpotTokens({
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      tokens,
    });
    return redirectTo("ok");
  } catch (e) {
    const msg = e instanceof Error ? e.message : "exchange_failed";
    console.error("[mrai/hubspot/callback]", msg, e);
    return redirectTo("error", msg);
  }
}

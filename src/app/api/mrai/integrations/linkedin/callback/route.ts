import { NextResponse } from "next/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import {
  exchangeCodeForTokens,
  storeLinkedInTokens,
} from "@/lib/mrai/integrations/linkedin";
import { verifyLinkedInState } from "../connect/route";

export const dynamic = "force-dynamic";

/**
 * GET /api/mrai/integrations/linkedin/callback?code=...&state=...
 *
 * LinkedIn redirects here after the user authorizes. We verify state
 * (CSRF), exchange the code for tokens, persist, then bounce back to
 * the Mr.AI page with a success/error param.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const back = (status: "ok" | "error", detail?: string) => {
    const target = new URL("/ko/mrai", url.origin);
    target.searchParams.set("linkedin", status);
    if (detail) target.searchParams.set("detail", detail.slice(0, 200));
    return NextResponse.redirect(target);
  };

  if (error) return back("error", error);
  if (!code || !state) return back("error", "missing_code_or_state");

  const verified = verifyLinkedInState(state);
  if (!verified) return back("error", "invalid_state");

  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx || ctx.workspaceId !== verified.workspaceId) {
    return back("error", "workspace_mismatch");
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    await storeLinkedInTokens({
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

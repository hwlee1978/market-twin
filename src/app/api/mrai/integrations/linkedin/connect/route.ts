import { NextResponse } from "next/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { linkedinAuthorizeUrl } from "@/lib/mrai/integrations/linkedin";
import { randomBytes, createHmac } from "node:crypto";

export const dynamic = "force-dynamic";

/**
 * GET /api/mrai/integrations/linkedin/connect
 *
 * Kicks off LinkedIn OAuth 2.0. Mirrors HubSpot connect route — HMAC
 * signed state for CSRF.
 */
function signState(workspaceId: string, nonce: string): string {
  const secret =
    process.env.CRON_SECRET ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "fallback-secret";
  const payload = `${workspaceId}.${nonce}`;
  const sig = createHmac("sha256", secret).update(payload).digest("hex").slice(0, 32);
  return `${payload}.${sig}`;
}

export function verifyLinkedInState(state: string): { workspaceId: string } | null {
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
  try {
    return NextResponse.redirect(linkedinAuthorizeUrl(state));
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: "config_missing", detail }, { status: 500 });
  }
}

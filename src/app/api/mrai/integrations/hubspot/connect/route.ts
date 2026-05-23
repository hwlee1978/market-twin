import { NextResponse } from "next/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { hubspotAuthorizeUrl } from "@/lib/mrai/integrations/hubspot";
import { randomBytes, createHmac } from "node:crypto";

export const dynamic = "force-dynamic";

/**
 * GET /api/mrai/integrations/hubspot/connect
 *
 * Kicks off the HubSpot OAuth flow:
 *   1. Generate a CSRF-protected state token (HMAC of workspaceId+nonce)
 *   2. Redirect to HubSpot's authorize page
 *   3. Callback validates state, exchanges code for tokens, stores.
 *
 * We sign the state with CRON_SECRET (or a fallback) so the callback
 * can verify it without round-tripping through Supabase storage.
 */

function signState(workspaceId: string, nonce: string): string {
  const secret = process.env.CRON_SECRET ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "fallback-secret";
  const payload = `${workspaceId}.${nonce}`;
  const sig = createHmac("sha256", secret).update(payload).digest("hex").slice(0, 32);
  return `${payload}.${sig}`;
}

export function verifyState(state: string): { workspaceId: string } | null {
  const parts = state.split(".");
  if (parts.length !== 3) return null;
  const [workspaceId, nonce, sig] = parts;
  const secret = process.env.CRON_SECRET ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "fallback-secret";
  const expected = createHmac("sha256", secret).update(`${workspaceId}.${nonce}`).digest("hex").slice(0, 32);
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
    const url = hubspotAuthorizeUrl(state);
    return NextResponse.redirect(url);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "internal_error";
    return NextResponse.json({ error: "connect_failed", detail: msg }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import {
  getMyRoleInWorkspace,
  ACTIVE_WORKSPACE_COOKIE,
} from "@/lib/workspace";

export const dynamic = "force-dynamic";

const Body = z.object({
  workspaceId: z.string().uuid(),
});

/**
 * POST /api/workspaces/switch — set the active-workspace cookie.
 *
 * We verify membership before honoring the request so a forged id can't
 * grant access to a workspace the caller doesn't belong to (the RLS
 * policies would still block reads, but a stale cookie would cause the
 * app shell to keep flashing the wrong workspace name).
 */
export async function POST(req: Request) {
  const raw = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const role = await getMyRoleInWorkspace(parsed.data.workspaceId);
  if (!role) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const jar = await cookies();
  jar.set(ACTIVE_WORKSPACE_COOKIE, parsed.data.workspaceId, {
    path: "/",
    httpOnly: false,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });

  return NextResponse.json({ ok: true, workspaceId: parsed.data.workspaceId });
}

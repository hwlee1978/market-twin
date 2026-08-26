import { NextResponse } from "next/server";
import { z } from "zod";
import { acceptInvitation, getCurrentUser } from "@/lib/team";
import { ACTIVE_WORKSPACE_COOKIE } from "@/lib/workspace";

export const dynamic = "force-dynamic";

const Body = z.object({ token: z.string().trim().min(16).max(200) });

/**
 * POST /api/team/invitations/accept
 *
 * Requires a signed-in user. The token proves the invitation exists and the
 * email match proves it was meant for this person — forwarding the link to
 * someone else does not let them in.
 *
 * On success the active-workspace cookie is switched to the joined
 * workspace so the next navigation lands there rather than in the user's
 * own auto-created one.
 */
export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const res = await acceptInvitation({
    token: parsed.data.token,
    userId: me.id,
    userEmail: me.email,
  });

  if (!res.ok) {
    const status =
      res.error === "not_found"
        ? 404
        : res.error === "email_mismatch"
          ? 403
          : res.error === "seat_limit"
            ? 409
            : 410;
    return NextResponse.json({ error: res.error }, { status });
  }

  const out = NextResponse.json({ ok: true, ...res.result });
  out.cookies.set(ACTIVE_WORKSPACE_COOKIE, res.result.workspaceId, {
    path: "/",
    httpOnly: false,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
  });
  return out;
}

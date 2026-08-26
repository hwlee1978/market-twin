import { NextResponse } from "next/server";
import { z } from "zod";
import { getMyRoleInWorkspace, getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import {
  createInvitation,
  getCurrentUser,
  getSeatUsage,
  listInvitations,
  type Role,
} from "@/lib/team";
import { sendInviteEmail } from "@/lib/email/invite-notify";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const Body = z.object({
  email: z.string().trim().email().max(200),
  role: z.enum(["admin", "analyst", "viewer"]),
  locale: z.enum(["ko", "en"]).optional(),
});

/** GET /api/team/invitations — pending invitations for the active workspace. */
export async function GET() {
  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const [invitations, seats] = await Promise.all([
    listInvitations(ctx.workspaceId),
    getSeatUsage(ctx.workspaceId),
  ]);
  return NextResponse.json({ invitations, seats: serializeSeats(seats) });
}

/**
 * POST /api/team/invitations — invite someone to the active workspace.
 *
 * Owner/admin only. The seat check lives in createInvitation so that the
 * accept path and this path agree on what consumes a seat.
 */
export async function POST(req: Request) {
  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const role = await getMyRoleInWorkspace(ctx.workspaceId);
  if (role !== "owner" && role !== "admin") {
    return NextResponse.json({ error: "insufficient_role" }, { status: 403 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const created = await createInvitation({
    workspaceId: ctx.workspaceId,
    invitedBy: me.id,
    email: parsed.data.email,
    role: parsed.data.role as Role,
  });

  if (!created.ok) {
    const status = created.error === "seat_limit" ? 409 : 400;
    return NextResponse.json({ error: created.error }, { status });
  }

  const admin = createServiceClient();
  const { data: ws } = await admin
    .from("workspaces")
    .select("name")
    .eq("id", ctx.workspaceId)
    .single();

  const emailed = await sendInviteEmail({
    locale: parsed.data.locale ?? "ko",
    workspaceName: ws?.name ?? "Market Twin",
    inviterEmail: me.email,
    inviteeEmail: created.invite.email,
    role: parsed.data.role,
    token: created.invite.token,
    expiresAt: created.invite.expiresAt,
  });

  const seats = await getSeatUsage(ctx.workspaceId);
  return NextResponse.json({
    invitation: {
      id: created.invite.id,
      email: created.invite.email,
      role: created.invite.role,
      expiresAt: created.invite.expiresAt,
    },
    // Surfaced so the UI can tell the admin to share the link manually when
    // mail delivery is unavailable rather than silently appearing to work.
    emailed,
    seats: serializeSeats(seats),
  });
}

function serializeSeats(s: Awaited<ReturnType<typeof getSeatUsage>>) {
  return {
    used: s.used,
    limit: s.limit,
    unlimited: s.unlimited,
    remaining: s.unlimited ? null : s.remaining,
    planName: s.planName,
  };
}

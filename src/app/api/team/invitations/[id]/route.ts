import { NextResponse } from "next/server";
import { getMyRoleInWorkspace, getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { getSeatUsage, revokeInvitation } from "@/lib/team";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/team/invitations/:id — revoke a pending invitation.
 *
 * Scoped to the caller's active workspace, so an id from another workspace
 * simply doesn't match and returns not_found.
 */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const ws = await getOrCreatePrimaryWorkspace();
  if (!ws) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const role = await getMyRoleInWorkspace(ws.workspaceId);
  if (role !== "owner" && role !== "admin") {
    return NextResponse.json({ error: "insufficient_role" }, { status: 403 });
  }

  const ok = await revokeInvitation({
    workspaceId: ws.workspaceId,
    invitationId: id,
  });
  if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const seats = await getSeatUsage(ws.workspaceId);
  return NextResponse.json({
    ok: true,
    seats: {
      used: seats.used,
      limit: seats.limit,
      unlimited: seats.unlimited,
      remaining: seats.unlimited ? null : seats.remaining,
      planName: seats.planName,
    },
  });
}

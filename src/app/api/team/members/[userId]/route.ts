import { NextResponse } from "next/server";
import { z } from "zod";
import { getMyRoleInWorkspace, getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import {
  changeMemberRole,
  getCurrentUser,
  removeMember,
  type Role,
} from "@/lib/team";

export const dynamic = "force-dynamic";

const PatchBody = z.object({ role: z.enum(["owner", "admin", "analyst", "viewer"]) });

/**
 * PATCH /api/team/members/:userId — change a member's role.
 *
 * Owners may hand out any role including `owner` (ownership transfer);
 * admins may not create another owner, so they cannot escalate past
 * themselves. Demoting the last owner is refused by a database trigger,
 * which is the single source of truth for that rule.
 */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ userId: string }> },
) {
  const { userId } = await ctx.params;
  const ws = await getOrCreatePrimaryWorkspace();
  if (!ws) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const myRole = await getMyRoleInWorkspace(ws.workspaceId);
  if (myRole !== "owner" && myRole !== "admin") {
    return NextResponse.json({ error: "insufficient_role" }, { status: 403 });
  }

  const parsed = PatchBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (parsed.data.role === "owner" && myRole !== "owner") {
    return NextResponse.json({ error: "owner_only" }, { status: 403 });
  }

  const res = await changeMemberRole({
    workspaceId: ws.workspaceId,
    userId,
    role: parsed.data.role as Role,
  });
  if (!res.ok) {
    const status = res.error === "last_owner" ? 409 : 400;
    return NextResponse.json({ error: res.error }, { status });
  }
  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/team/members/:userId — remove a member, or leave the
 * workspace when removing yourself.
 */
export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ userId: string }> },
) {
  const { userId } = await ctx.params;
  const ws = await getOrCreatePrimaryWorkspace();
  if (!ws) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const myRole = await getMyRoleInWorkspace(ws.workspaceId);
  const isSelf = me.id === userId;
  if (!isSelf && myRole !== "owner" && myRole !== "admin") {
    return NextResponse.json({ error: "insufficient_role" }, { status: 403 });
  }

  const res = await removeMember({ workspaceId: ws.workspaceId, userId });
  if (!res.ok) {
    const status = res.error === "last_owner" ? 409 : 400;
    return NextResponse.json({ error: res.error }, { status });
  }
  return NextResponse.json({ ok: true, left: isSelf });
}

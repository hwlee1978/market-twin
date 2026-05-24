import { NextResponse } from "next/server";
import { getOrCreatePrimaryWorkspace, getMyRoleInWorkspace } from "@/lib/workspace";
import { resetOnboarding, getOnboardingState } from "@/lib/mrai/onboarding";

export const dynamic = "force-dynamic";

/**
 * POST /api/mrai/onboarding/reset
 *
 * Wipes onboarding-tied memories and clears the completed_at flag so the
 * interview restarts. Owner/admin only — viewers/analysts shouldn't be
 * able to nuke the workspace's seed memories.
 */
export async function POST() {
  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const role = await getMyRoleInWorkspace(ctx.workspaceId);
  if (role !== "owner" && role !== "admin") {
    return NextResponse.json({ error: "insufficient_role" }, { status: 403 });
  }

  await resetOnboarding(ctx.workspaceId);
  const state = await getOnboardingState(ctx.workspaceId);
  return NextResponse.json({ ok: true, state });
}

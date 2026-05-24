import { NextResponse } from "next/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { getOnboardingState } from "@/lib/mrai/onboarding";

export const dynamic = "force-dynamic";

/**
 * GET /api/mrai/onboarding/status — read interview progress.
 * Returns the full step catalog so the UI can render the progress
 * sidebar without a second round-trip.
 */
export async function GET() {
  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const state = await getOnboardingState(ctx.workspaceId);
  return NextResponse.json({ ...state, workspaceId: ctx.workspaceId });
}

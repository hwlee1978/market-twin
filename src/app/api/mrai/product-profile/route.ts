import { NextResponse } from "next/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { buildProductProfile, loadProductProfile } from "@/lib/mrai/content/product-profile";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET  /api/mrai/product-profile — return current profile (null if not built)
 * POST /api/mrai/product-profile — rebuild via Claude Vision (~$0.02-0.05)
 */
export async function GET() {
  const wsCtx = await getOrCreatePrimaryWorkspace();
  if (!wsCtx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const profile = await loadProductProfile(wsCtx.workspaceId);
  return NextResponse.json({ profile });
}

export async function POST() {
  const wsCtx = await getOrCreatePrimaryWorkspace();
  if (!wsCtx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const result = await buildProductProfile(wsCtx.workspaceId);
  if (!result.profile) {
    return NextResponse.json(
      { error: "build_failed", detail: result.error ?? "unknown" },
      { status: result.error === "no product assets uploaded" ? 400 : 500 },
    );
  }
  return NextResponse.json({ profile: result.profile });
}

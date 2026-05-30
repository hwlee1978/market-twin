import { NextResponse } from "next/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { getLeaderboard, type ContentType } from "@/lib/challenge/arena";

export const dynamic = "force-dynamic";

const VALID_TYPES: ContentType[] = [
  "market_analysis",
  "spec_ko",
  "spec_en",
  "spec_ja",
  "spec_zh_tw",
  "spec_zh_cn",
  "detail_page",
  "generic",
];

/**
 * GET /api/challenge/arena/leaderboard?content_type=...&scope=workspace
 *
 * Returns per-model win rates over all completed battles.
 * scope=workspace filters to the caller's workspace; default = all
 * battles (cross-workspace aggregate for honest comparison).
 */
export async function GET(req: Request) {
  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const contentType = url.searchParams.get("content_type") as ContentType | null;
  const scope = url.searchParams.get("scope");

  const filters: { contentType?: ContentType; workspaceId?: string } = {};
  if (contentType && VALID_TYPES.includes(contentType)) {
    filters.contentType = contentType;
  }
  if (scope === "workspace") {
    filters.workspaceId = ctx.workspaceId;
  }

  const board = await getLeaderboard(filters);
  return NextResponse.json({ leaderboard: board });
}

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import {
  createWorkspaceForCurrentUser,
  listMyWorkspaces,
  ACTIVE_WORKSPACE_COOKIE,
} from "@/lib/workspace";

export const dynamic = "force-dynamic";

const Body = z.object({
  name: z.string().trim().min(1).max(120),
  companyName: z.string().trim().max(120).optional(),
  industry: z.string().trim().max(80).optional(),
  country: z.string().trim().max(40).optional(),
  setActive: z.boolean().default(true),
});

/**
 * GET /api/workspaces — list workspaces the caller is a member of.
 */
export async function GET() {
  const items = await listMyWorkspaces();
  return NextResponse.json({ workspaces: items });
}

/**
 * POST /api/workspaces — create a new workspace; caller becomes owner.
 * Optionally sets the active-workspace cookie so the next page render
 * lands on the new workspace.
 */
export async function POST(req: Request) {
  const raw = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const result = await createWorkspaceForCurrentUser(parsed.data);
  if ("error" in result) {
    const status = result.error === "not_authenticated" ? 401 : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  if (parsed.data.setActive) {
    const jar = await cookies();
    jar.set(ACTIVE_WORKSPACE_COOKIE, result.workspaceId, {
      path: "/",
      httpOnly: false,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  return NextResponse.json({ workspaceId: result.workspaceId });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";
import { startBattle, voteBattle, type ContentType } from "@/lib/challenge/arena";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const CONTENT_TYPES: ContentType[] = [
  "market_analysis",
  "spec_ko",
  "spec_en",
  "spec_ja",
  "spec_zh_tw",
  "spec_zh_cn",
  "detail_page",
  "generic",
];

const StartSchema = z.object({
  prompt: z.string().min(5).max(4000),
  content_type: z.enum(CONTENT_TYPES as [ContentType, ...ContentType[]]),
});

/** POST — start a new blind battle (generates 2 candidate outputs). */
export async function POST(req: Request) {
  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = StartSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const result = await startBattle({
    workspaceId: ctx.workspaceId,
    prompt: parsed.data.prompt,
    contentType: parsed.data.content_type,
  });
  return NextResponse.json(result);
}

const VoteSchema = z.object({
  battle_id: z.string().uuid(),
  winner: z.enum(["A", "B", "tie"]),
});

/** PATCH — record vote + reveal model names. */
export async function PATCH(req: Request) {
  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = VoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const res = await voteBattle({
    battleId: parsed.data.battle_id,
    winner: parsed.data.winner,
    userId: user?.id ?? null,
  });
  return NextResponse.json(res);
}

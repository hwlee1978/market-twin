import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { updatePreset, deletePreset } from "@/lib/mrai/presets";

export const dynamic = "force-dynamic";

const PatchBody = z.object({
  name: z.string().min(1).max(80).optional(),
  isDefault: z.boolean().optional(),
  tone: z
    .enum([
      "professional",
      "conversational",
      "data_driven",
      "witty",
      "inspirational",
      "playful",
      "authoritative",
    ])
    .nullable()
    .optional(),
  voice: z.string().max(400).nullable().optional(),
  targetLength: z
    .enum([
      "twitter_280",
      "instagram_2200",
      "reddit_long",
      "blog_800",
      "blog_1500",
      "short",
      "medium",
      "long",
    ])
    .nullable()
    .optional(),
  language: z.enum(["ko", "en", "ja", "zh"]).optional(),
  hashtagStrategy: z.enum(["minimal", "topical", "aggressive", "none"]).nullable().optional(),
  doNotUse: z.string().max(2000).nullable().optional(),
  referenceExamples: z
    .array(z.object({ snippet: z.string().max(2000), whyGood: z.string().max(400).optional() }))
    .max(8)
    .nullable()
    .optional(),
});

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const wsCtx = await getOrCreatePrimaryWorkspace();
  if (!wsCtx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  const raw = await req.json().catch(() => ({}));
  const parsed = PatchBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const preset = await updatePreset(wsCtx.workspaceId, id, parsed.data);
    return NextResponse.json({ preset });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "update_failed" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const wsCtx = await getOrCreatePrimaryWorkspace();
  if (!wsCtx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  try {
    await deletePreset(wsCtx.workspaceId, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "delete_failed" },
      { status: 500 },
    );
  }
}

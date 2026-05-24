import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { listPresets, createPreset } from "@/lib/mrai/presets";

export const dynamic = "force-dynamic";

const PresetBody = z.object({
  name: z.string().min(1).max(80),
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

export async function GET() {
  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const presets = await listPresets(ctx.workspaceId);
  return NextResponse.json({ presets });
}

export async function POST(req: Request) {
  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const raw = await req.json().catch(() => ({}));
  const parsed = PresetBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const preset = await createPreset(ctx.workspaceId, parsed.data);
    return NextResponse.json({ preset });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "create_failed" },
      { status: 500 },
    );
  }
}

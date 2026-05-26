import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET  /api/mrai/marketing-channels — list workspace's marketing channels
 * POST /api/mrai/marketing-channels — create a new marketing channel
 *
 * Marketing channels = simulated brand accounts (X, Instagram, TikTok,
 * Naver, etc.) the workspace plans to publish content on. v0 is
 * simulation-only — no real OAuth/publishing. We store the platform +
 * handle + targeting metadata so the content reaction simulator can
 * sample appropriate personas per market/platform.
 */

const PLATFORMS = [
  "x_twitter",
  "instagram",
  "tiktok",
  "youtube",
  "threads",
  "naver_blog",
  "naver_smartstore",
  "kakao_channel",
  "facebook",
  "linkedin",
  "reddit",
  "other",
] as const;

const CreateSchema = z.object({
  platform: z.enum(PLATFORMS),
  handle: z.string().trim().min(1).max(80),
  displayName: z.string().trim().max(120).optional(),
  marketCountry: z.string().length(2).optional(),
  targetSegments: z.array(z.string().max(60)).max(12).optional(),
  postingStyle: z.string().max(500).optional(),
  bioText: z.string().max(500).optional(),
  brandAssets: z.record(z.string(), z.unknown()).optional(),
});

export async function GET() {
  const wsCtx = await getOrCreatePrimaryWorkspace();
  if (!wsCtx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mrai_marketing_channels")
    .select(
      "id, platform, handle, display_name, market_country, target_segments, posting_style, bio_text, brand_assets, enabled, created_at, updated_at",
    )
    .eq("workspace_id", wsCtx.workspaceId)
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ channels: data ?? [] });
}

export async function POST(req: Request) {
  const wsCtx = await getOrCreatePrimaryWorkspace();
  if (!wsCtx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("mrai_marketing_channels")
    .insert({
      workspace_id: wsCtx.workspaceId,
      platform: parsed.data.platform,
      handle: parsed.data.handle,
      display_name: parsed.data.displayName ?? null,
      market_country: parsed.data.marketCountry?.toUpperCase() ?? null,
      target_segments: parsed.data.targetSegments ?? [],
      posting_style: parsed.data.postingStyle ?? null,
      bio_text: parsed.data.bioText ?? null,
      brand_assets: parsed.data.brandAssets ?? {},
      created_by: user?.id ?? null,
    })
    .select(
      "id, platform, handle, display_name, market_country, target_segments, posting_style, bio_text, brand_assets, enabled, created_at, updated_at",
    )
    .single();
  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "insert_failed" },
      { status: 500 },
    );
  }
  return NextResponse.json({ channel: data });
}

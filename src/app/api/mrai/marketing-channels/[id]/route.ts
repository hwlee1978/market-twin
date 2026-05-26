import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const UpdateSchema = z.object({
  handle: z.string().trim().min(1).max(80).optional(),
  displayName: z.string().trim().max(120).nullable().optional(),
  marketCountry: z.string().length(2).nullable().optional(),
  targetSegments: z.array(z.string().max(60)).max(12).optional(),
  postingStyle: z.string().max(500).nullable().optional(),
  bioText: z.string().max(500).nullable().optional(),
  brandAssets: z.record(z.string(), z.unknown()).optional(),
  enabled: z.boolean().optional(),
});

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const wsCtx = await getOrCreatePrimaryWorkspace();
  if (!wsCtx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  type Patch = {
    handle?: string;
    display_name?: string | null;
    market_country?: string | null;
    target_segments?: string[];
    posting_style?: string | null;
    bio_text?: string | null;
    brand_assets?: Record<string, unknown>;
    enabled?: boolean;
  };
  const patch: Patch = {};
  if (parsed.data.handle !== undefined) patch.handle = parsed.data.handle;
  if (parsed.data.displayName !== undefined)
    patch.display_name = parsed.data.displayName;
  if (parsed.data.marketCountry !== undefined)
    patch.market_country = parsed.data.marketCountry?.toUpperCase() ?? null;
  if (parsed.data.targetSegments !== undefined)
    patch.target_segments = parsed.data.targetSegments;
  if (parsed.data.postingStyle !== undefined)
    patch.posting_style = parsed.data.postingStyle;
  if (parsed.data.bioText !== undefined) patch.bio_text = parsed.data.bioText;
  if (parsed.data.brandAssets !== undefined)
    patch.brand_assets = parsed.data.brandAssets;
  if (parsed.data.enabled !== undefined) patch.enabled = parsed.data.enabled;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mrai_marketing_channels")
    .update(patch)
    .eq("id", id)
    .eq("workspace_id", wsCtx.workspaceId)
    .select(
      "id, platform, handle, display_name, market_country, target_segments, posting_style, bio_text, brand_assets, enabled, created_at, updated_at",
    )
    .single();
  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "update_failed" },
      { status: 500 },
    );
  }
  return NextResponse.json({ channel: data });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const wsCtx = await getOrCreatePrimaryWorkspace();
  if (!wsCtx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = await createClient();
  const { error } = await supabase
    .from("mrai_marketing_channels")
    .delete()
    .eq("id", id)
    .eq("workspace_id", wsCtx.workspaceId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

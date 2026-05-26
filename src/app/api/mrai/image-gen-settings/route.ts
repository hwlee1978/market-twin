import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const DEFAULTS = {
  logo_position: "bottom-right" as const,
  logo_size_pct: 16,
  logo_padding_pct: 3.5,
  logo_opacity: 1.0,
  logo_with_backdrop: true,
  logo_composite_enabled: true,
  logo_placement_mode: "product_surface" as const,
  use_library_photo_as_base: true,
  prompt_strictness: "strict" as const,
  quality: "medium" as const,
  frame_counts: {},
};

const UpdateSchema = z.object({
  logo_position: z
    .enum(["top-left", "top-right", "bottom-left", "bottom-right", "center"])
    .optional(),
  logo_size_pct: z.number().min(3).max(40).optional(),
  logo_padding_pct: z.number().min(0).max(15).optional(),
  logo_opacity: z.number().min(0).max(1).optional(),
  logo_with_backdrop: z.boolean().optional(),
  logo_composite_enabled: z.boolean().optional(),
  logo_placement_mode: z.enum(["product_surface", "corner_watermark"]).optional(),
  use_library_photo_as_base: z.boolean().optional(),
  prompt_strictness: z.enum(["creative", "balanced", "strict"]).optional(),
  quality: z.enum(["low", "medium", "high"]).optional(),
  frame_counts: z.record(z.string(), z.number().int().min(1).max(7)).optional(),
});

export async function GET() {
  const wsCtx = await getOrCreatePrimaryWorkspace();
  if (!wsCtx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = await createClient();
  const { data } = await supabase
    .from("mrai_image_gen_settings")
    .select("*")
    .eq("workspace_id", wsCtx.workspaceId)
    .maybeSingle();
  if (!data) {
    // Auto-create with defaults — saves a separate POST
    const svc = createServiceClient();
    const { data: created, error } = await svc
      .from("mrai_image_gen_settings")
      .insert({ workspace_id: wsCtx.workspaceId, ...DEFAULTS })
      .select("*")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ settings: created });
  }
  return NextResponse.json({ settings: data });
}

export async function PATCH(req: Request) {
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

  const supabase = await createClient();
  // Upsert pattern — create with defaults + patch if missing.
  const { data: existing } = await supabase
    .from("mrai_image_gen_settings")
    .select("workspace_id")
    .eq("workspace_id", wsCtx.workspaceId)
    .maybeSingle();
  let result;
  if (!existing) {
    const svc = createServiceClient();
    const { data, error } = await svc
      .from("mrai_image_gen_settings")
      .insert({ workspace_id: wsCtx.workspaceId, ...DEFAULTS, ...parsed.data })
      .select("*")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    result = data;
  } else {
    const { data, error } = await supabase
      .from("mrai_image_gen_settings")
      .update(parsed.data)
      .eq("workspace_id", wsCtx.workspaceId)
      .select("*")
      .single();
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    result = data;
  }
  return NextResponse.json({ settings: result });
}

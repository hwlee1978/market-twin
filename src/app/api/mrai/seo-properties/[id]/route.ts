import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const UpdateSchema = z.object({
  label: z.string().trim().max(120).nullable().optional(),
  gscProperty: z.string().max(300).nullable().optional(),
  gscVerified: z.boolean().optional(),
  ga4PropertyId: z.string().max(80).nullable().optional(),
  ga4MeasurementId: z.string().max(40).nullable().optional(),
  naverSiteUrl: z.string().url().max(400).nullable().optional(),
  naverVerified: z.boolean().optional(),
  sitemapUrl: z.string().url().max(400).nullable().optional(),
  rssUrl: z.string().url().max(400).nullable().optional(),
  defaultMetaTitle: z.string().max(120).nullable().optional(),
  defaultMetaDescription: z.string().max(300).nullable().optional(),
  defaultOgImageUrl: z.string().url().max(400).nullable().optional(),
  defaultKeywords: z.array(z.string().max(60)).max(20).optional(),
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

  type Patch = Record<string, unknown>;
  const patch: Patch = {};
  const map: Record<string, string> = {
    label: "label",
    gscProperty: "gsc_property",
    gscVerified: "gsc_verified",
    ga4PropertyId: "ga4_property_id",
    ga4MeasurementId: "ga4_measurement_id",
    naverSiteUrl: "naver_site_url",
    naverVerified: "naver_verified",
    sitemapUrl: "sitemap_url",
    rssUrl: "rss_url",
    defaultMetaTitle: "default_meta_title",
    defaultMetaDescription: "default_meta_description",
    defaultOgImageUrl: "default_og_image_url",
    defaultKeywords: "default_keywords",
    enabled: "enabled",
  };
  for (const [k, dbCol] of Object.entries(map)) {
    const v = (parsed.data as Record<string, unknown>)[k];
    if (v !== undefined) patch[dbCol] = v;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mrai_seo_properties")
    .update(patch)
    .eq("id", id)
    .eq("workspace_id", wsCtx.workspaceId)
    .select("*")
    .single();
  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "update_failed" },
      { status: 500 },
    );
  }
  return NextResponse.json({ property: data });
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
    .from("mrai_seo_properties")
    .delete()
    .eq("id", id)
    .eq("workspace_id", wsCtx.workspaceId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

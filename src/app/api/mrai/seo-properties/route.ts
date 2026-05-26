import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET  /api/mrai/seo-properties  — list workspace's SEO properties
 * POST /api/mrai/seo-properties  — register a new property (website /
 *                                   smartstore / blog / landing)
 *
 * v0 stores property metadata + verification flags only. Real GSC /
 * GA4 / Naver Search Advisor OAuth flows come in a follow-up sprint.
 */

const CreateSchema = z.object({
  propertyUrl: z.string().url().max(400),
  propertyType: z
    .enum(["website", "smartstore", "blog", "landing", "other"])
    .default("website"),
  label: z.string().trim().max(120).optional(),
  // GSC / GA / Naver fields — optional at creation time, can be
  // filled in incrementally as the user verifies each integration.
  gscProperty: z.string().max(300).optional(),
  ga4PropertyId: z.string().max(80).optional(),
  ga4MeasurementId: z.string().max(40).optional(),
  naverSiteUrl: z.string().url().max(400).optional(),
  sitemapUrl: z.string().url().max(400).optional(),
  rssUrl: z.string().url().max(400).optional(),
  defaultMetaTitle: z.string().max(120).optional(),
  defaultMetaDescription: z.string().max(300).optional(),
  defaultOgImageUrl: z.string().url().max(400).optional(),
  defaultKeywords: z.array(z.string().max(60)).max(20).optional(),
});

export async function GET() {
  const wsCtx = await getOrCreatePrimaryWorkspace();
  if (!wsCtx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mrai_seo_properties")
    .select("*")
    .eq("workspace_id", wsCtx.workspaceId)
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ properties: data ?? [] });
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
    .from("mrai_seo_properties")
    .insert({
      workspace_id: wsCtx.workspaceId,
      property_url: parsed.data.propertyUrl,
      property_type: parsed.data.propertyType,
      label: parsed.data.label ?? null,
      gsc_property: parsed.data.gscProperty ?? null,
      ga4_property_id: parsed.data.ga4PropertyId ?? null,
      ga4_measurement_id: parsed.data.ga4MeasurementId ?? null,
      naver_site_url: parsed.data.naverSiteUrl ?? null,
      sitemap_url: parsed.data.sitemapUrl ?? null,
      rss_url: parsed.data.rssUrl ?? null,
      default_meta_title: parsed.data.defaultMetaTitle ?? null,
      default_meta_description: parsed.data.defaultMetaDescription ?? null,
      default_og_image_url: parsed.data.defaultOgImageUrl ?? null,
      default_keywords: parsed.data.defaultKeywords ?? [],
      created_by: user?.id ?? null,
    })
    .select("*")
    .single();
  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "insert_failed" },
      { status: 500 },
    );
  }
  return NextResponse.json({ property: data });
}

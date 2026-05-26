import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const SOURCE_TYPES = ["self_website", "news_rss", "competitor"] as const;

const CreateSchema = z.object({
  url: z.string().url().max(1000),
  source_type: z.enum(SOURCE_TYPES),
  label: z.string().trim().max(120).optional(),
  brand_filter: z.string().trim().max(120).optional(),
  fetch_interval_hours: z.number().int().min(1).max(720).optional(),
});

export async function GET() {
  const wsCtx = await getOrCreatePrimaryWorkspace();
  if (!wsCtx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mrai_crawl_sources")
    .select(
      "id, source_type, url, label, brand_filter, enabled, fetch_interval_hours, last_fetched_at, last_error, fail_count, memories_emitted, created_at",
    )
    .eq("workspace_id", wsCtx.workspaceId)
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ sources: data ?? [] });
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

  const svc = createServiceClient();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await svc
    .from("mrai_crawl_sources")
    .insert({
      workspace_id: wsCtx.workspaceId,
      url: parsed.data.url,
      source_type: parsed.data.source_type,
      label: parsed.data.label ?? null,
      brand_filter: parsed.data.brand_filter ?? null,
      fetch_interval_hours: parsed.data.fetch_interval_hours ?? 24,
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
  return NextResponse.json({ source: data });
}

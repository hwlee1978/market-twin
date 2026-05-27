import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { runLLMVisibilityAudit } from "@/lib/mrai/seo/llm-visibility-audit";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

const InputSchema = z.object({
  brand_name: z.string().trim().min(1).max(200),
  brand_category: z.string().trim().min(1).max(300),
  market_country: z.string().trim().length(2).nullable().optional(),
  marketing_channel_id: z.string().uuid().nullable().optional(),
  custom_queries: z.array(z.string().trim().min(3).max(300)).max(10).optional(),
  query_locale: z.enum(["ko", "en"]).optional(),
});

/**
 * GET  /api/mrai/llm-seo/visibility-audit
 *   → returns the latest cached audit for this workspace (most recent).
 *
 * POST /api/mrai/llm-seo/visibility-audit
 *   body: { brand_name, brand_category, market_country?, marketing_channel_id?,
 *           custom_queries?, query_locale? }
 *   → fires a fresh audit, persists, returns the result. ~$0.10 each.
 */
export async function GET() {
  const wsCtx = await getOrCreatePrimaryWorkspace();
  if (!wsCtx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mrai_llm_visibility_audits")
    .select("*")
    .eq("workspace_id", wsCtx.workspaceId)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ audit: data ?? null });
}

export async function POST(req: Request) {
  const wsCtx = await getOrCreatePrimaryWorkspace();
  if (!wsCtx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = InputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_request", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  let audit;
  try {
    audit = await runLLMVisibilityAudit({
      brandName: parsed.data.brand_name,
      brandCategory: parsed.data.brand_category,
      marketCountry: parsed.data.market_country ?? null,
      customQueries: parsed.data.custom_queries,
      queryLocale: parsed.data.query_locale,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "audit_failed" },
      { status: 500 },
    );
  }

  // Persist via service role
  const svc = createServiceClient();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: saved, error: sErr } = await svc
    .from("mrai_llm_visibility_audits")
    .insert({
      workspace_id: wsCtx.workspaceId,
      marketing_channel_id: parsed.data.marketing_channel_id ?? null,
      brand_name: parsed.data.brand_name,
      brand_category: parsed.data.brand_category,
      market_country: parsed.data.market_country ?? null,
      test_queries: audit.test_queries,
      visibility_score: audit.visibility_score,
      per_llm: audit.per_llm,
      top_competitors: audit.top_competitors,
      top_sources: audit.top_sources,
      llm_input_tokens: audit.llm_input_tokens,
      llm_output_tokens: audit.llm_output_tokens,
      cost_usd: audit.cost_usd,
      created_by: user?.id ?? null,
    })
    .select("*")
    .single();
  if (sErr) {
    // Persist failure shouldn't lose the audit result for the user
    return NextResponse.json({
      audit: { ...audit, persisted: false },
      warning: sErr.message,
    });
  }
  return NextResponse.json({ audit: saved });
}

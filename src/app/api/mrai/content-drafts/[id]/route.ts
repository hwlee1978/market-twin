import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const wsCtx = await getOrCreatePrimaryWorkspace();
  if (!wsCtx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = await createClient();
  const { error } = await supabase
    .from("mrai_content_drafts")
    .delete()
    .eq("id", id)
    .eq("workspace_id", wsCtx.workspaceId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

/**
 * PATCH /api/mrai/content-drafts/[id] — manual edit of an existing draft.
 *
 * Only the primary-language copy fields are exposed here. Translations
 * (seo_meta.translations.ko.*) stay frozen — users who want a fresh
 * translation can regenerate the draft. Image prompt is editable so a
 * follow-up re-render uses the corrected scene.
 */
const PatchBody = z.object({
  body_text: z.string().trim().min(1).max(5000).optional(),
  cta_text: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => (v === "" ? null : v)),
  hashtags: z.array(z.string().trim().max(60)).max(15).optional(),
  image_prompt: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((v) => (v === "" ? null : v)),
  seo_title: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((v) => (v === "" ? null : v)),
  seo_description: z
    .string()
    .trim()
    .max(300)
    .optional()
    .transform((v) => (v === "" ? null : v)),
  seo_keywords: z.array(z.string().trim().max(60)).max(10).optional(),
});

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const wsCtx = await getOrCreatePrimaryWorkspace();
  if (!wsCtx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const raw = await req.json().catch(() => ({}));
  const parsed = PatchBody.safeParse(raw);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `${i.path.join(".") || "input"}: ${i.message}`)
      .join("; ");
    return NextResponse.json(
      { error: "invalid_input", detail },
      { status: 400 },
    );
  }

  // Normalize hashtags — ensure each starts with '#'. Users editing
  // inline often paste them either with or without the prefix; we
  // canonicalize on write so display + downstream rendering stays clean.
  const patch: Record<string, unknown> = { ...parsed.data };
  if (Array.isArray(parsed.data.hashtags)) {
    patch.hashtags = parsed.data.hashtags
      .filter((h) => h.length > 0)
      .map((h) => (h.startsWith("#") ? h : `#${h}`));
  }
  if (Array.isArray(parsed.data.seo_keywords)) {
    patch.seo_keywords = parsed.data.seo_keywords.filter((k) => k.length > 0);
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mrai_content_drafts")
    .update(patch)
    .eq("id", id)
    .eq("workspace_id", wsCtx.workspaceId)
    .select("*")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ draft: data });
}

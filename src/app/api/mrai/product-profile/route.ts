import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { buildProductProfile, loadProductProfile } from "@/lib/mrai/content/product-profile";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET   /api/mrai/product-profile — return current profile (null if not built)
 * POST  /api/mrai/product-profile — rebuild via Claude Vision (~$0.02-0.05)
 * PATCH /api/mrai/product-profile — manual edit (category + description).
 *
 * The PATCH path exists so workspaces without product photos (SaaS,
 * digital services, IP/media) can still set the profile — primarily
 * `category`, since that gates which crawl-source presets surface in
 * their workspace.
 */
export async function GET() {
  const wsCtx = await getOrCreatePrimaryWorkspace();
  if (!wsCtx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const profile = await loadProductProfile(wsCtx.workspaceId);
  return NextResponse.json({ profile });
}

export async function POST() {
  const wsCtx = await getOrCreatePrimaryWorkspace();
  if (!wsCtx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const result = await buildProductProfile(wsCtx.workspaceId);
  if (!result.profile) {
    return NextResponse.json(
      { error: "build_failed", detail: result.error ?? "unknown" },
      { status: result.error === "no product assets uploaded" ? 400 : 500 },
    );
  }
  return NextResponse.json({ profile: result.profile });
}

const CATEGORY_ENUM = [
  "footwear",
  "apparel",
  "cosmetics",
  "skincare",
  "fragrance",
  "accessories",
  "jewelry",
  "electronics",
  "home_goods",
  "food_beverage",
  "health_supplements",
  "saas_digital",
  "ip_media",
  "other",
] as const;

const PatchBody = z.object({
  category: z.enum(CATEGORY_ENUM),
  description: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((v) => (v === "" ? undefined : v)),
});

export async function PATCH(req: Request) {
  const wsCtx = await getOrCreatePrimaryWorkspace();
  if (!wsCtx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const raw = await req.json().catch(() => ({}));
  const parsed = PatchBody.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues;
    const detail =
      issues
        .map((i) => `${i.path.join(".") || "input"}: ${i.message}`)
        .join("; ") || "invalid input";
    return NextResponse.json(
      { error: "invalid_input", detail },
      { status: 400 },
    );
  }

  // Upsert: a row may already exist (Vision build, prior manual edit) or
  // may not (first-time manual setup). Preserve every field other than
  // the two the user is editing.
  const admin = createServiceClient();
  const { data: existing } = await admin
    .from("mrai_workspace_product_profile")
    .select("workspace_id")
    .eq("workspace_id", wsCtx.workspaceId)
    .maybeSingle();

  if (existing) {
    const { error } = await admin
      .from("mrai_workspace_product_profile")
      .update({
        category: parsed.data.category,
        description: parsed.data.description ?? null,
      })
      .eq("workspace_id", wsCtx.workspaceId);
    if (error) {
      return NextResponse.json(
        { error: "update_failed", detail: error.message },
        { status: 500 },
      );
    }
  } else {
    const { error } = await admin
      .from("mrai_workspace_product_profile")
      .insert({
        workspace_id: wsCtx.workspaceId,
        category: parsed.data.category,
        description: parsed.data.description ?? null,
      });
    if (error) {
      return NextResponse.json(
        { error: "insert_failed", detail: error.message },
        { status: 500 },
      );
    }
  }

  const profile = await loadProductProfile(wsCtx.workspaceId);
  return NextResponse.json({ profile });
}

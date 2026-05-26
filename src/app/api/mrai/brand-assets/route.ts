import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB per file
const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

const META_TYPES = ["product", "lifestyle", "logo", "packaging", "pattern", "other"] as const;

const MetaSchema = z.object({
  asset_type: z.enum(META_TYPES).default("product"),
  label: z.string().trim().max(120).optional(),
  description: z.string().trim().max(500).optional(),
});

/**
 * GET /api/mrai/brand-assets
 *   → list workspace's brand assets (descending by created_at)
 *
 * POST /api/mrai/brand-assets   (multipart form-data)
 *   fields: file (image), asset_type, label?, description?
 *   → upload to Supabase Storage + insert mrai_brand_assets row
 *
 * The reference library powers gpt-image-1 EDIT calls so generated
 * imagery matches the real product (not generic Allbirds-likes).
 */
export async function GET() {
  const wsCtx = await getOrCreatePrimaryWorkspace();
  if (!wsCtx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mrai_brand_assets")
    .select(
      "id, asset_type, label, description, image_url, storage_path, width, height, file_size_bytes, mime_type, use_count, last_used_at, created_at",
    )
    .eq("workspace_id", wsCtx.workspaceId)
    .order("created_at", { ascending: false });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ assets: data ?? [] });
}

export async function POST(req: Request) {
  const wsCtx = await getOrCreatePrimaryWorkspace();
  if (!wsCtx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "expected_multipart" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "missing_file" }, { status: 400 });
  }
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json(
      { error: "unsupported_type", detail: `허용: ${ALLOWED.join(", ")}` },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "too_large", detail: `최대 ${Math.round(MAX_BYTES / 1024 / 1024)} MB` },
      { status: 400 },
    );
  }

  const metaRaw = {
    asset_type: form.get("asset_type") ?? undefined,
    label: form.get("label") ?? undefined,
    description: form.get("description") ?? undefined,
  };
  const parsed = MetaSchema.safeParse({
    asset_type: typeof metaRaw.asset_type === "string" ? metaRaw.asset_type : undefined,
    label: typeof metaRaw.label === "string" ? metaRaw.label : undefined,
    description: typeof metaRaw.description === "string" ? metaRaw.description : undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "bad_metadata", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Upload to storage via service client
  const svc = createServiceClient();
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const storagePath = `${wsCtx.workspaceId}/brand-assets/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await svc.storage
    .from("mrai-content")
    .upload(storagePath, buffer, {
      contentType: file.type,
      cacheControl: "31536000",
      upsert: false,
    });
  if (upErr) {
    return NextResponse.json(
      { error: "upload_failed", detail: upErr.message },
      { status: 500 },
    );
  }
  const { data: pub } = svc.storage.from("mrai-content").getPublicUrl(storagePath);

  // Insert metadata row
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: row, error: insErr } = await svc
    .from("mrai_brand_assets")
    .insert({
      workspace_id: wsCtx.workspaceId,
      asset_type: parsed.data.asset_type,
      label: parsed.data.label ?? null,
      description: parsed.data.description ?? null,
      image_url: pub.publicUrl,
      storage_path: storagePath,
      file_size_bytes: file.size,
      mime_type: file.type,
      created_by: user?.id ?? null,
    })
    .select("*")
    .single();
  if (insErr || !row) {
    // Best-effort cleanup of the uploaded blob
    await svc.storage.from("mrai-content").remove([storagePath]);
    return NextResponse.json(
      { error: "insert_failed", detail: insErr?.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ asset: row });
}

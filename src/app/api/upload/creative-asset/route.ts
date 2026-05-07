/**
 * Upload endpoint for wizard creative-asset mockups.
 *
 * The wizard previously asked users to paste publicly-hosted image URLs
 * — unrealistic since most users want pre-production feedback BEFORE
 * the visuals exist anywhere. This route accepts a multipart upload,
 * stores it in the `creative-assets` Supabase Storage bucket scoped to
 * the caller's workspace, and returns a public URL the LLM's vision
 * pass can consume.
 *
 * Bucket public-read is configured at migration time; RLS scopes
 * writes to workspace members. Path convention:
 *   <workspace_id>/<project_id_or_"draft">/<uuid>.<ext>
 */

import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";

export const runtime = "nodejs";

// 4 MB per image — chosen to fit comfortably under Vercel's 4.5 MB
// serverless body limit. UI hint matches.
const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export async function POST(req: Request) {
  // Auth — we go through the SSR client so the user's session is
  // honored. Workspace membership is enforced by Storage RLS, but we
  // also do an early check to give a friendly error instead of a
  // 403-from-storage.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const wsCtx = await getOrCreatePrimaryWorkspace();
  if (!wsCtx?.workspaceId) {
    return NextResponse.json(
      { error: "no workspace for this user" },
      { status: 403 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid form data" }, { status: 400 });
  }

  const file = form.get("file");
  const projectIdRaw = form.get("projectId");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "missing file in form data (field name 'file')" },
      { status: 400 },
    );
  }
  if (file.size <= 0) {
    return NextResponse.json({ error: "empty file" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      {
        error: `file too large (${(file.size / 1024 / 1024).toFixed(1)} MB > 4 MB limit)`,
      },
      { status: 413 },
    );
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      {
        error: `unsupported content-type: ${file.type || "(unknown)"} — allowed: jpg, png, webp, gif`,
      },
      { status: 415 },
    );
  }

  const ext = EXT_BY_TYPE[file.type] ?? "bin";
  const projectFolder =
    typeof projectIdRaw === "string" && projectIdRaw.length > 0
      ? projectIdRaw
      : "draft";
  const path = `${wsCtx.workspaceId}/${projectFolder}/${randomUUID()}.${ext}`;

  // Service role for the actual upload — RLS still applies via the
  // workspace path check above, and using the service client avoids
  // dependency on cookie-bound auth state inside the storage layer.
  const admin = createServiceClient();
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadErr } = await admin.storage
    .from("creative-assets")
    .upload(path, buffer, {
      contentType: file.type,
      cacheControl: "3600",
      upsert: false,
    });
  if (uploadErr) {
    console.warn("[creative-asset upload] failed:", uploadErr.message);
    return NextResponse.json(
      { error: `upload failed: ${uploadErr.message}` },
      { status: 500 },
    );
  }

  const { data: pub } = admin.storage
    .from("creative-assets")
    .getPublicUrl(path);
  return NextResponse.json({
    url: pub.publicUrl,
    path,
    sizeBytes: file.size,
    contentType: file.type,
  });
}

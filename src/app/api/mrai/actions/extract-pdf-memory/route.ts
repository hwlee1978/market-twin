import { NextResponse } from "next/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { extractMemoryFromPdf } from "@/lib/mrai/agents/pdf-memory-extractor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Anthropic accepts up to 32 MB PDF; we cap at 10 MB to stay
// comfortably within Vercel's 4.5 MB body limit (we'll need to bump
// to direct-to-storage for larger files later).
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * POST /api/mrai/actions/extract-pdf-memory
 *
 * multipart/form-data:
 *   file: PDF (≤10 MB)
 *   hint?: string (optional user hint about what this PDF is)
 *
 * Returns: { candidates: [...], costEstimateUsd, filename }
 * The chat UI surfaces these in a MemoryPreviewCard for user selection
 * before they hit /api/mrai/memories/bulk to persist.
 */
export async function POST(req: Request) {
  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (ctx.status !== "active") {
    return NextResponse.json({ error: `workspace_${ctx.status}` }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid_form" }, { status: 400 });
  }

  const file = form.get("file");
  const hint = form.get("hint");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "missing_file", detail: "form field 'file' required" },
      { status: 400 },
    );
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "empty_file" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      {
        error: "file_too_large",
        detail: `${(file.size / 1024 / 1024).toFixed(1)} MB > 10 MB limit`,
      },
      { status: 413 },
    );
  }
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json(
      {
        error: "unsupported_type",
        detail: `expected application/pdf, got ${file.type || "(unknown)"}`,
      },
      { status: 415 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const pdfBase64 = buffer.toString("base64");

  try {
    const result = await extractMemoryFromPdf({
      workspaceId: ctx.workspaceId,
      pdfBase64,
      filename: file.name,
      hint: typeof hint === "string" ? hint : undefined,
    });
    return NextResponse.json({
      ok: true,
      filename: file.name,
      sizeBytes: file.size,
      ...result,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "internal_error";
    console.error("[mrai/actions/extract-pdf-memory]", msg);
    return NextResponse.json(
      { error: "extract_failed", detail: msg },
      { status: 500 },
    );
  }
}

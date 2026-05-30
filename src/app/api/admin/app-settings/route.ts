import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdmin, SuperAdminAuthError } from "@/lib/auth/super-admin";
import { listAppSettings, setAppSetting } from "@/lib/app-settings";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET   /api/admin/app-settings           — list all key/value settings
 * PATCH /api/admin/app-settings  { key, value }  — flip one setting
 *
 * Super-admin-gated (SUPERADMIN_EMAILS env). Service-role write hits
 * app_settings directly; RLS is disabled on that table.
 */
export async function GET() {
  try {
    await requireSuperAdmin();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof SuperAdminAuthError ? e.code : "unauthorized" },
      { status: 401 },
    );
  }
  const rows = await listAppSettings();
  return NextResponse.json({ settings: rows });
}

const PatchSchema = z.object({
  key: z.string().min(1).max(100),
  value: z.unknown(),
});

export async function PATCH(req: Request) {
  let adminEmail: string;
  try {
    adminEmail = await requireSuperAdmin();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof SuperAdminAuthError ? e.code : "unauthorized" },
      { status: 401 },
    );
  }
  const body = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  await setAppSetting(parsed.data.key, parsed.data.value, user?.id ?? null);
  // Audit trail surfaces in app_settings.updated_by + updated_at.
  console.log(
    `[admin/app-settings] ${adminEmail} flipped ${parsed.data.key} = ${JSON.stringify(parsed.data.value)}`,
  );
  return NextResponse.json({ ok: true });
}

import { createServiceClient } from "@/lib/supabase/server";

/**
 * Runtime app settings store — reads from public.app_settings (key/value
 * JSONB). Replaces Vercel env vars for toggles that should flip without
 * redeploy. All callers MUST run on the server (RLS is disabled — only
 * accessible via service client).
 *
 * Falls back to the supplied default when the key is missing or the
 * DB call fails — never throws, so server pages render even when the
 * settings table is unreachable.
 */

export interface AppSettingRow {
  key: string;
  value: unknown;
  description: string | null;
  updated_at: string;
  updated_by: string | null;
}

export async function getAppSetting<T>(key: string, fallback: T): Promise<T> {
  try {
    const svc = createServiceClient();
    const { data, error } = await svc
      .from("app_settings")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    if (error || !data) return fallback;
    return (data.value as T) ?? fallback;
  } catch {
    return fallback;
  }
}

export async function listAppSettings(): Promise<AppSettingRow[]> {
  const svc = createServiceClient();
  const { data, error } = await svc
    .from("app_settings")
    .select("key, value, description, updated_at, updated_by")
    .order("key", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as AppSettingRow[];
}

export async function setAppSetting(
  key: string,
  value: unknown,
  updatedBy: string | null,
): Promise<void> {
  const svc = createServiceClient();
  const { error } = await svc
    .from("app_settings")
    .update({
      value,
      updated_at: new Date().toISOString(),
      updated_by: updatedBy,
    })
    .eq("key", key);
  if (error) throw new Error(error.message);
}

/**
 * Signup gate — single source of truth. Pages call this from server
 * code; client code that needs the value must call an API route since
 * RLS-disabled tables aren't reachable from the browser.
 *
 * Falls back to NEXT_PUBLIC_SIGNUP_ENABLED env when the DB row is
 * missing (smooth migration from env-flag era — once 0063 seed runs,
 * the DB row wins).
 */
export async function isSignupEnabled(): Promise<boolean> {
  const envFallback = process.env.NEXT_PUBLIC_SIGNUP_ENABLED === "true";
  const dbValue = await getAppSetting<boolean>("signup_enabled", envFallback);
  return dbValue === true;
}

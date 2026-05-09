/**
 * Standalone Supabase service-role client for code that runs OUTSIDE the
 * Next.js request lifecycle — in particular, the ensemble runner when
 * deployed as a Cloud Run worker. No `next/headers` import, no cookie
 * handling. Just the privileged service-role connection.
 *
 * Web code can also use this; the only thing it loses is automatic
 * cookie wiring. For request-scoped operations that need user auth,
 * web routes should keep using `apps/web/src/lib/supabase/server.ts`.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

export function createServiceClient(): SupabaseClient {
  // Reuse a single client across calls in the same process — the
  // service-role key never rotates per-request and a fresh client per
  // call adds JIT overhead.
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase service-role env vars missing: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required",
    );
  }
  cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}

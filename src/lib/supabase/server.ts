import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — ignore. Middleware refreshes the session.
          }
        },
      },
    },
  );
}

export function createServiceClient() {
  // For privileged server-only operations (never expose to client).
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy require keeps this out of the edge/client bundle
  const { createClient: createSupabaseClient } = require("@supabase/supabase-js");
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

/**
 * The signed-in user, fetched once per request.
 *
 * `auth.getUser()` is a network call — it validates the JWT against the
 * Auth server rather than trusting the cookie, which is the whole point
 * of using it over `getSession()`. But a single page view was making
 * that call four times: the proxy, getOrCreatePrimaryWorkspace,
 * listMyWorkspaces and getAdminContext each asked independently, and
 * only the first was memoised.
 *
 * React's `cache()` collapses every call inside one server render into
 * one. The proxy runs in a different phase and keeps its own.
 */
export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

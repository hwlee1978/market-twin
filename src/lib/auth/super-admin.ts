import { createClient } from "@/lib/supabase/server";

/**
 * Super-admin gate. Reads SUPERADMIN_EMAILS env (comma-separated) and
 * matches against the currently-authenticated Supabase user. Returns
 * the user's email when authorised, throws otherwise.
 *
 * No separate `super_admins` DB table — admin list lives in env so
 * the founding team can add/remove operators via Vercel env without
 * touching schema. Trade-off accepted in v0.1: list is tiny (≤5
 * operators), revocation requires a redeploy.
 *
 * Callers (the /admin/llm-usage page + any future admin route) await
 * this BEFORE rendering. Failure mode: page throws → Next.js renders
 * an error boundary. Cleaner than redirecting because there's no
 * legit "you're logged in but not admin" user to redirect — only the
 * 5 listed emails should ever see this page.
 */
export async function requireSuperAdmin(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    throw new SuperAdminAuthError("not_authenticated");
  }
  const raw = process.env.SUPERADMIN_EMAILS ?? "";
  const allowed = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length === 0) {
    throw new SuperAdminAuthError("no_admins_configured");
  }
  if (!allowed.includes(user.email.toLowerCase())) {
    throw new SuperAdminAuthError("not_super_admin");
  }
  return user.email;
}

/** Non-throwing variant — returns the email on success, null otherwise.
 *  Useful for conditional UI (e.g. sidebar link visibility). */
export async function getSuperAdminEmail(): Promise<string | null> {
  try {
    return await requireSuperAdmin();
  } catch {
    return null;
  }
}

export class SuperAdminAuthError extends Error {
  constructor(public code: "not_authenticated" | "no_admins_configured" | "not_super_admin") {
    super(code);
    this.name = "SuperAdminAuthError";
  }
}

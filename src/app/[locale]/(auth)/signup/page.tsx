import { SignupComingSoon } from "@/components/auth/SignupComingSoon";
import { SignupForm } from "@/components/auth/SignupForm";
import { isSignupEnabled } from "@/lib/app-settings";

export const dynamic = "force-dynamic";

/**
 * Signup is gated by app_settings.signup_enabled (DB row, flippable from
 * /admin/site-settings without redeploy). Falls back to legacy
 * NEXT_PUBLIC_SIGNUP_ENABLED env var when the DB row is missing.
 *
 *   true  → real signup form (SignupForm)
 *   false → coming-soon screen (SignupComingSoon)
 */
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ gated?: string }>;
}) {
  const enabled = await isSignupEnabled();
  const sp = await searchParams;
  return enabled ? (
    <SignupForm />
  ) : (
    <SignupComingSoon gatedReason={sp.gated} />
  );
}

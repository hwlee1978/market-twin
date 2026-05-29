import { SignupComingSoon } from "@/components/auth/SignupComingSoon";
import { SignupForm } from "@/components/auth/SignupForm";

/**
 * Signup is gated by NEXT_PUBLIC_SIGNUP_ENABLED.
 *
 *   "true"  → real signup form (SignupForm)
 *   anything else (or unset) → coming-soon screen (SignupComingSoon)
 *
 * To re-open signups: set NEXT_PUBLIC_SIGNUP_ENABLED=true in Vercel
 * env (Production / Preview / Development) and redeploy. No code
 * changes needed; both components stay in the tree so future tweaks
 * to either screen survive the toggle in both directions.
 *
 * NEXT_PUBLIC_ prefix is required because we want the flag to evaluate
 * during the page render — this page is a server component, but having
 * it in NEXT_PUBLIC also lets us check it client-side later if needed
 * (e.g. for hiding the marketing CTA).
 */
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ gated?: string }>;
}) {
  const enabled = process.env.NEXT_PUBLIC_SIGNUP_ENABLED === "true";
  const sp = await searchParams;
  return enabled ? (
    <SignupForm />
  ) : (
    <SignupComingSoon gatedReason={sp.gated} />
  );
}

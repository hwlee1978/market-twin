import { Resend } from "resend";

/**
 * Resend client. Lazy-initialised so a missing API key doesn't crash the
 * server bundle at import time — instead, the send call returns null and
 * the caller logs and moves on. Notifications are best-effort: a failure
 * to email must never roll back a successful simulation.
 */
let cached: Resend | null | undefined;

export function getResend(): Resend | null {
  if (cached !== undefined) return cached;
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    cached = null;
    return null;
  }
  cached = new Resend(key);
  return cached;
}

/**
 * From-address used in every outbound notification. Falls back to Resend's
 * onboarding sender when EMAIL_FROM isn't configured — useful in dev so
 * the first simulation completion still produces a real email without
 * domain setup. Production should set EMAIL_FROM to a verified domain.
 */
export function getFromAddress(): string {
  return (
    process.env.EMAIL_FROM ?? "AI Market Twin <onboarding@resend.dev>"
  );
}

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
 * From-address used in every outbound notification. Defaults to the
 * verified markettwin.ai sender so production mail is delivered without
 * extra env setup; override with EMAIL_FROM for a different verified
 * sender. (The old onboarding@resend.dev fallback only delivered to the
 * account owner — Resend rejects it for other recipients with a 403.)
 */
export function getFromAddress(): string {
  return (
    process.env.EMAIL_FROM ?? "AI Market Twin <noreply@markettwin.ai>"
  );
}

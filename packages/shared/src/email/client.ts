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

/** Where operational alerts go. */
export function getOpsRecipient(): string | null {
  const explicit = process.env.OPS_ALERT_EMAIL?.trim();
  if (explicit) return explicit;
  // Fall back to the first superadmin rather than a hardcoded address —
  // whoever administers the deployment is who should hear about it.
  const firstAdmin = process.env.SUPERADMIN_EMAILS?.split(",")[0]?.trim();
  return firstAdmin || null;
}

export interface SendResult {
  ok: boolean;
  id?: string;
  error?: string;
}

/**
 * Send, and actually find out whether it was sent.
 *
 * The Resend SDK does not throw on a 4xx — it resolves with
 * `{ data: null, error }`. Every call site in this codebase used to
 * `await` the send and discard the result, so a 403 for an unverified
 * sender or a 422 for a bad recipient produced no error, no log, and no
 * clue. Mail simply did not arrive.
 *
 * This wrapper turns both failure modes into one `SendResult` the caller
 * can act on. It still never throws: a notification must not roll back
 * the work it is reporting on.
 */
export async function sendEmail(
  payload: Parameters<Resend["emails"]["send"]>[0],
  context: string,
): Promise<SendResult> {
  const resend = getResend();
  if (!resend) {
    // Worth saying out loud. A deployment missing the key sends nothing
    // at all, and until now did so in complete silence.
    console.error(`[email] RESEND_API_KEY is not set — ${context} was not sent`);
    return { ok: false, error: "RESEND_API_KEY missing" };
  }
  try {
    const { data, error } = await resend.emails.send(payload);
    if (error) {
      console.error(`[email] ${context} rejected by Resend:`, error.name, error.message);
      return { ok: false, error: `${error.name}: ${error.message}` };
    }
    return { ok: true, id: data?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[email] ${context} threw:`, message);
    return { ok: false, error: message };
  }
}

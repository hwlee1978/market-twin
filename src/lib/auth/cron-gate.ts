import { NextResponse } from "next/server";

/**
 * Cron endpoint auth gate. Centralizes the "is this a legitimate cron
 * trigger?" check so we don't drift between 8 different inline copies
 * (the prior pattern silently opened the endpoint to the public
 * whenever CRON_SECRET was unset).
 *
 * Fail-closed in production: if VERCEL_ENV=production but CRON_SECRET
 * is missing, we return 503 instead of allowing the call through. A
 * misconfigured cron is preferable to an unauthenticated LLM-billing
 * endpoint sitting open on the public internet.
 *
 * Dev convenience: in non-production environments, if CRON_SECRET is
 * unset we let the call through so `next dev` users can hit cron
 * routes manually without env setup. Once CRON_SECRET *is* set, we
 * enforce it everywhere — local CRON_SECRET configured the same way
 * production is.
 *
 * Caller pattern:
 *
 *   const gate = assertCronAuth(req);
 *   if (gate) return gate;       // 401 or 503 already shaped
 *   // ... real cron body
 */
export function assertCronAuth(req: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  const isProd = process.env.VERCEL_ENV === "production";

  if (!secret) {
    if (isProd) {
      // Fail closed — better to break the cron than expose it.
      console.error(
        "[cron-gate] CRON_SECRET missing in production. Refusing the request to avoid an open LLM-billable endpoint.",
      );
      return NextResponse.json(
        { error: "cron_misconfigured", detail: "CRON_SECRET not set on this deployment" },
        { status: 503 },
      );
    }
    // Non-production with no secret: allow (dev convenience).
    return null;
  }

  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}

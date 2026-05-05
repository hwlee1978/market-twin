import { createServiceClient } from "@/lib/supabase/server";

/**
 * Trial-abuse detection. Run when a fresh workspace is being created
 * (i.e. just before granting the 1-sim free trial). Returns a verdict:
 *   - { grant: true }: legit signup, trial allowed
 *   - { grant: false, reason: ... }: looks abusive, downgrade to
 *     "card-on-file required" state (we still create the workspace,
 *     just with trial_sims_limit=0 so they can't run any sim until
 *     they upgrade)
 *
 * Defenses (sliding 7-day window unless noted):
 *   1) Same canonical email already has a workspace
 *   2) Same email-domain has spawned >5 trials in 24h (catches
 *      throwaway-domain providers that change the local part each
 *      time but reuse the same domain)
 *   3) Same IP has spawned >3 trials in 24h
 *
 * False-positive risks: corporate VPNs, university CGNAT. Tunable via
 * env (TRIAL_ABUSE_*) so we can ratchet on real signup data.
 */

interface AbuseContext {
  /** Raw email as the user typed it. */
  email: string;
  /** Best-effort client IP from headers. May be null. */
  ip: string | null;
}

interface AbuseVerdict {
  grant: boolean;
  reason?: "dup_canonical" | "domain_rate_limit" | "ip_rate_limit";
  emailCanonical: string;
  emailDomain: string;
}

const HOURS_24 = 24 * 60 * 60 * 1000;

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

const DOMAIN_HOURLY_CAP = envInt("TRIAL_ABUSE_DOMAIN_24H_MAX", 5);
const IP_HOURLY_CAP = envInt("TRIAL_ABUSE_IP_24H_MAX", 3);

/**
 * Canonicalise an email so "Foo.Bar+promo@Gmail.COM" and
 * "foobar@gmail.com" collide. Aggressive on Gmail-style providers
 * because they're the most common abuse vector; conservative on
 * others (just lowercase + trim).
 */
export function canonicalEmail(email: string): { canonical: string; domain: string } {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.lastIndexOf("@");
  if (at < 0) return { canonical: trimmed, domain: "" };
  const localRaw = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  // Strip plus-tag for everyone. Gmail-style normalisation also drops
  // dots — but that risks collapsing legitimately distinct accounts on
  // non-Gmail providers, so we only apply to googlemail / gmail.
  let local = localRaw.split("+")[0];
  if (domain === "gmail.com" || domain === "googlemail.com") {
    local = local.replace(/\./g, "");
  }
  return { canonical: `${local}@${domain}`, domain };
}

export async function checkTrialAbuse(ctx: AbuseContext): Promise<AbuseVerdict> {
  const { canonical, domain } = canonicalEmail(ctx.email);
  const admin = createServiceClient();
  const since = new Date(Date.now() - HOURS_24).toISOString();

  // 1) Same canonical email has a granted trial in our records.
  const { data: dupCanonical } = await admin
    .from("signup_attempts")
    .select("id")
    .eq("email_canonical", canonical)
    .eq("trial_granted", true)
    .limit(1);
  if ((dupCanonical?.length ?? 0) > 0) {
    return { grant: false, reason: "dup_canonical", emailCanonical: canonical, emailDomain: domain };
  }

  // 2) Domain rate limit — only enforce on common public providers
  // and our own bypass list. Corporate domains are typically below
  // the threshold organically, so we don't carve them out.
  const { data: domainAttempts } = await admin
    .from("signup_attempts")
    .select("id")
    .eq("email_domain", domain)
    .eq("trial_granted", true)
    .gte("created_at", since);
  if ((domainAttempts?.length ?? 0) >= DOMAIN_HOURLY_CAP) {
    return { grant: false, reason: "domain_rate_limit", emailCanonical: canonical, emailDomain: domain };
  }

  // 3) IP rate limit — best-effort, skip when IP unknown.
  if (ctx.ip) {
    const { data: ipAttempts } = await admin
      .from("signup_attempts")
      .select("id")
      .eq("ip_address", ctx.ip)
      .eq("trial_granted", true)
      .gte("created_at", since);
    if ((ipAttempts?.length ?? 0) >= IP_HOURLY_CAP) {
      return { grant: false, reason: "ip_rate_limit", emailCanonical: canonical, emailDomain: domain };
    }
  }

  return { grant: true, emailCanonical: canonical, emailDomain: domain };
}

export async function recordSignupAttempt(opts: {
  userId: string;
  workspaceId: string;
  emailRaw: string;
  emailCanonical: string;
  emailDomain: string;
  ip: string | null;
  trialGranted: boolean;
  denialReason?: string;
}): Promise<void> {
  const admin = createServiceClient();
  await admin.from("signup_attempts").insert({
    user_id: opts.userId,
    workspace_id: opts.workspaceId,
    email_raw: opts.emailRaw,
    email_canonical: opts.emailCanonical,
    email_domain: opts.emailDomain,
    ip_address: opts.ip,
    trial_granted: opts.trialGranted,
    denial_reason: opts.denialReason ?? null,
  });
}

/**
 * Extract the client IP from a Next request. Looks at typical proxy
 * headers (Vercel sets x-forwarded-for) and falls back to null. Trusts
 * the first hop in x-forwarded-for which is what Vercel guarantees;
 * spoofing requires hitting the origin directly.
 */
export function clientIp(headers: Headers): string | null {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip") ?? null;
}

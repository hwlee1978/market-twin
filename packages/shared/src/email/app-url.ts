/**
 * Canonical origin for links we put in outbound email.
 *
 * Three helpers used to resolve this independently, and all of them ended in
 * `process.env.VERCEL_URL?.replace(/^https?:\/\//, "https://")`. VERCEL_URL
 * carries no scheme (`my-app.vercel.app`), so that replace matched nothing
 * and the result was a scheme-less string — which a mail client reads as a
 * relative path, not a link. Any deployment without NEXT_PUBLIC_SITE_URL set
 * was emailing broken URLs.
 *
 * Order of preference:
 *   1. An explicitly configured origin (NEXT_PUBLIC_SITE_URL, then
 *      NEXT_PUBLIC_APP_URL) — normalised so a missing scheme or a trailing
 *      slash can't produce a broken link.
 *   2. On a Vercel *production* deployment, the canonical domain. The
 *      per-deployment VERCEL_URL must not win here: a seat invitation stays
 *      valid for 14 days, and auth cookies set on app.markettwin.ai don't
 *      apply to a deployment host, so the invitee would land signed-out.
 *   3. On a preview deployment, that deployment's own URL, which is what you
 *      want when testing a branch.
 *   4. The canonical domain.
 */
const CANONICAL = "https://app.markettwin.ai";

function normalize(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function appOrigin(): string {
  const explicit =
    normalize(process.env.NEXT_PUBLIC_SITE_URL) ??
    normalize(process.env.NEXT_PUBLIC_APP_URL);
  if (explicit) return explicit;

  if (process.env.VERCEL_ENV === "production") return CANONICAL;

  const deployment = normalize(process.env.VERCEL_URL);
  if (deployment) return deployment;

  return CANONICAL;
}

/**
 * Mr.AI feature flag — single source of truth.
 *
 * Background: MarketTwin (the original product validation tool) is
 * being prepared for production launch on markettwin.ai. Mr.AI (the
 * upgraded marketing-automation + LLM-SEO + chat layer) remains under
 * active development and ships on a separate beta domain.
 *
 * Decision (memory: product-split-terminology, 2026-05-27): same repo,
 * same Vercel project, two deployments distinguished by env flag.
 *
 * Set NEXT_PUBLIC_MRAI_ENABLED=true to force Mr.AI on for an entire
 * deployment (e.g. local dev). Leave unset or false on markettwin.ai.
 *
 * Host-based split (2026-06): markettwin.ai and mrai.markettwin.ai share
 * one deployment, so the build-time flag alone can't differ between them.
 * To show Mr.AI ONLY on the mrai.* subdomain while keeping markettwin.ai
 * as the beta (simulation-only) surface, prefer the host-aware helpers
 * below — they OR the build flag with a runtime host check.
 *
 * The NEXT_PUBLIC_ prefix keeps the flag inlined into the client bundle.
 */
export const MRAI_ENABLED = process.env.NEXT_PUBLIC_MRAI_ENABLED === "true";

/**
 * Is the request host the Mr.AI subdomain? Accepts either a server
 * `Host` header (e.g. "mrai.markettwin.ai:443") or a browser
 * `window.location.hostname`. Port and case are normalized.
 */
export function isMraiHost(host?: string | null): boolean {
  if (!host) return false;
  const hostname = host.split(":")[0].trim().toLowerCase();
  return hostname === "mrai" || hostname.startsWith("mrai.");
}

/**
 * Whether Mr.AI should be exposed for this request: the build flag is on
 * (forces it everywhere) OR the host is the mrai.* subdomain. Use this in
 * server components / layouts (pass the `Host` header) and in client
 * components (pass `window.location.hostname`).
 */
export function isMraiEnabledForHost(host?: string | null): boolean {
  return MRAI_ENABLED || isMraiHost(host);
}

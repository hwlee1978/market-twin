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
 * Server-side gate for Mr.AI background CRON jobs (crawl / briefings /
 * publications / content-drafts / seo).
 *
 * Decoupled from the NEXT_PUBLIC UI flag above. After the 2026-06
 * host-based consolidation there is a single Vercel deployment where
 * NEXT_PUBLIC_MRAI_ENABLED is OFF (so Mr.AI UI stays hidden on
 * markettwin.ai and shows only on mrai.*). But the crons still need to
 * run on that deployment — gating them on the UI flag silently disabled
 * every Mr.AI cron (the crawler stopped 2026-06-17). Set
 * MRAI_CRON_ENABLED=true on the deployment that should run the jobs.
 * OR-ed with the build flag so local dev (MRAI on) keeps working.
 */
export const MRAI_CRON_ENABLED =
  // trim+lowercase: Vercel 값 입력칸이 multi-line이라 "true\n"/" true "/"True"
  // 같이 들어와도 동작하게 관대하게 비교(정확 일치 강제 시 조용히 false).
  process.env.MRAI_CRON_ENABLED?.trim().toLowerCase() === "true" || MRAI_ENABLED;

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

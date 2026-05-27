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
 * Set NEXT_PUBLIC_MRAI_ENABLED=true on the beta/mrai deployment.
 * Leave unset or false on markettwin.ai.
 *
 * Use the constant in server components, layouts, route handlers, and
 * client-side gates. The NEXT_PUBLIC_ prefix is required for the value
 * to be inlined into the client bundle so the Mr.AI menu item can be
 * conditionally rendered without a server round-trip.
 */
export const MRAI_ENABLED = process.env.NEXT_PUBLIC_MRAI_ENABLED === "true";

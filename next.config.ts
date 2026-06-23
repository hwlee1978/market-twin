import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { withSentryConfig } from "@sentry/nextjs";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // ESLint runs as a separate `npm run lint` step (see eslint.config.mjs).
  // Next 16 (Turbopack) no longer runs ESLint during `next build`, and the
  // `eslint` config key was removed from NextConfig — so no build-time
  // ignore flag is needed (or even valid) here anymore.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
};

// Compose: Sentry wraps the next-intl-wrapped config. Sentry's wrapper
// hooks into the build to upload source maps (when SENTRY_AUTH_TOKEN is
// set) and rewrite client bundles so stack traces resolve to original
// TS files. No-ops cleanly when SENTRY_DSN is absent.
//
// Project slug is "javascript-nextjs" — Sentry's auto-generated slug
// when the Next.js project was first created via the wizard. Org slug
// is "market-twin" (visible at market-twin.sentry.io). Earlier attempts
// used "market-twin/market-twin" which Sentry CLI rejected with HTTP
// 400 ("One or more projects are invalid"), blocking the build.
export default withSentryConfig(withNextIntl(nextConfig), {
  org: "market-twin",
  project: "javascript-nextjs",
  silent: !process.env.CI,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  tunnelRoute: "/monitoring",
  // Tolerate any future upload glitches — runtime error reporting works
  // independently and a non-critical observability hiccup shouldn't take
  // down deploys.
  errorHandler: (err) => {
    console.warn("[sentry] source map upload failed; build continues:", err.message);
  },
});

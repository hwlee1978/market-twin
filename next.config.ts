import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { withSentryConfig } from "@sentry/nextjs";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
};

// Compose: Sentry wraps the next-intl-wrapped config. Sentry's wrapper
// hooks into the build to upload source maps (if SENTRY_AUTH_TOKEN is
// set) and rewrite client bundles so stack traces resolve to original
// TS files. No-ops cleanly when SENTRY_DSN is absent.
export default withSentryConfig(withNextIntl(nextConfig), {
  org: "market-twin",
  project: "market-twin",
  silent: !process.env.CI,
  // Source maps only upload when an auth token is present. Without it
  // Sentry still captures errors, just with minified stack traces — fine
  // for staging and any pre-token environment.
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Tunnel ad-blocker-vulnerable ingest calls through our own /monitoring
  // route — uBlock and similar block *.ingest.sentry.io otherwise.
  tunnelRoute: "/monitoring",
});

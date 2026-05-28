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
//
// errorHandler: source-map upload failure (wrong project slug, 401,
// network, etc.) MUST NOT fail the production build — runtime error
// reporting still works without uploaded maps, you just get minified
// stack traces. Build failure on a non-critical observability step
// blocks shipping the actual app, which is the wrong tradeoff.
export default withSentryConfig(withNextIntl(nextConfig), {
  org: "market-twin",
  project: "market-twin",
  silent: !process.env.CI,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  tunnelRoute: "/monitoring",
  errorHandler: (err) => {
    console.warn("[sentry] source map upload failed; build continues:", err.message);
  },
});

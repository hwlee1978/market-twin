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

// Compose: Sentry wraps the next-intl-wrapped config. Runtime error
// reporting hooks via instrumentation.ts / sentry.*.config.ts and works
// independently of build-time source-map upload.
//
// Source-map upload is currently DISABLED because the Sentry CLI
// rejected the "market-twin/market-twin" org/project pair with HTTP 400
// ("One or more projects are invalid") and that exit code propagates
// past withSentryConfig's errorHandler, taking the whole npm run build
// down with it. Once the actual project slug is confirmed in Sentry
// dashboard, restore authToken + sourcemaps.disable=false to re-enable.
// Until then, stack traces in Sentry will be minified — that's the
// acceptable tradeoff vs blocked deploys.
export default withSentryConfig(withNextIntl(nextConfig), {
  org: "market-twin",
  project: "market-twin",
  silent: !process.env.CI,
  // authToken intentionally omitted — see comment above.
  tunnelRoute: "/monitoring",
  sourcemaps: {
    disable: true,
  },
});

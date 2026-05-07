// Server-side Sentry init. Loaded by instrumentation.ts on Node runtime
// startup. DSN is intentionally read from a non-public env var — this
// file never ships to the browser, so we don't expose the ingest URL.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN;
const environment =
  process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development";

// Skip init in local development — `npm run dev` PDF/runtime errors
// were filling the Sentry feed and obscuring real production issues
// (e.g. a stale dev-server held an old italic-font code path that
// raised "Could not resolve font" only on localhost). Production +
// preview deployments still report normally.
if (dsn && environment !== "development") {
  Sentry.init({
    dsn,
    environment,
    // Tracing samples ~5% of server transactions. Bump if we ever need
    // to debug a specific perf regression — at v0.1 traffic this gives
    // enough signal without burning the 5K-event/month free tier.
    tracesSampleRate: 0.05,
    // Don't send personally identifying default fields. We attach our
    // own workspace_id / user_id via Sentry.setUser() at request time
    // when it's safe to correlate.
    sendDefaultPii: false,
  });
}

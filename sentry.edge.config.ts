// Edge-runtime Sentry init. Middleware and any route declared with
// `export const runtime = 'edge'` runs here — Vercel's V8 isolate, not
// Node. SDK exposes a slimmer surface; same DSN.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN;
const environment =
  process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development";

// Skip dev — see sentry.server.config.ts for the rationale.
if (dsn && environment !== "development") {
  Sentry.init({
    dsn,
    environment,
    tracesSampleRate: 0.05,
    sendDefaultPii: false,
  });
}

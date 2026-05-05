// Edge-runtime Sentry init. Middleware and any route declared with
// `export const runtime = 'edge'` runs here — Vercel's V8 isolate, not
// Node. SDK exposes a slimmer surface; same DSN.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    tracesSampleRate: 0.05,
    sendDefaultPii: false,
  });
}

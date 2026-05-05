// Client-side Sentry init. Next.js auto-loads this file on first render.
// DSN must be NEXT_PUBLIC_* so the bundler inlines it into the client
// chunk — Sentry's ingest endpoint is anyway public-facing (the DSN is
// rate-limited per project, not a secret).
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV ?? "development",
    tracesSampleRate: 0.05,
    // Session Replay disabled at v0.1 — eats event quota fast and we
    // don't have the bandwidth to actually review replays yet. Flip
    // on once we have a paying pilot and a reason to use it.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    sendDefaultPii: false,
  });
}

// Required by @sentry/nextjs to capture client-side navigation spans.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

// Next.js loads this file once per server runtime (nodejs / edge) at boot.
// We branch on NEXT_RUNTIME so each runtime only pulls the SDK variant it
// supports — the edge runtime can't load the full Node SDK and vice versa.
// Client-side Sentry init lives in `instrumentation-client.ts`.

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Re-export Sentry's request-error hook so server-side throws inside
// React Server Components and route handlers are forwarded to Sentry
// with full request context.
export { captureRequestError as onRequestError } from "@sentry/nextjs";

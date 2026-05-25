// Next.js loads this file once per server runtime (nodejs / edge) at boot.
// We branch on NEXT_RUNTIME so each runtime only pulls the SDK variant it
// supports — the edge runtime can't load the full Node SDK and vice versa.
// Client-side Sentry init lives in `instrumentation-client.ts`.

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
    // Register the LLM usage logger so every getLLMProvider() call
    // with usageContext.workspaceId writes to public.llm_usage_log.
    // Side-effect import only — the module wires setLLMUsageLogger
    // at top-level. Wraps in try/catch so any wiring failure (e.g.
    // missing service-role env locally) doesn't break the runtime.
    try {
      await import("./src/lib/llm-usage");
    } catch (err) {
      console.warn("[instrumentation] llm-usage logger init failed:", err);
    }
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Re-export Sentry's request-error hook so server-side throws inside
// React Server Components and route handlers are forwarded to Sentry
// with full request context.
export { captureRequestError as onRequestError } from "@sentry/nextjs";

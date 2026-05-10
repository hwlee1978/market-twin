/**
 * Market Twin ensemble worker.
 *
 * Runs as a Cloud Run Service (region: asia-northeast3 / Seoul). The web app
 * (Vercel) hands off ensemble execution here once a sim has been pre-flighted
 * — DB rows for the ensemble + sim slots already exist; the worker takes
 * over from "all sims pending" through aggregation and persistence.
 *
 * Why this exists: Vercel functions cap at 800s (Pro). Deep tier (25 sims) +
 * 10K-persona scaling pushes total runtime past that ceiling. Cloud Run
 * Service has 60min timeout and "always-allocated CPU" mode lets the
 * background work continue after the HTTP response is sent — a clean
 * fire-and-forget pattern that doesn't fight serverless lifecycle.
 *
 * Auth: shared Bearer token between Vercel and Cloud Run. Cloud Run service
 * is configured for ALLUSERS but the Authorization header gate makes the
 * Bearer token the actual access key (rotate via env var).
 */

import { Hono } from "hono";
import { serve } from "@hono/node-server";
import {
  loadOrchestrationContext,
  runEnsembleOrchestration,
} from "@/lib/simulation/orchestrator";

const PORT = Number(process.env.PORT ?? 8080);
const BEARER_TOKEN = process.env.WORKER_BEARER_TOKEN;

if (!BEARER_TOKEN) {
  console.error(
    "[worker] WORKER_BEARER_TOKEN env var missing — refusing to start. " +
      "Set the same value on the Vercel side under WORKER_BEARER_TOKEN.",
  );
  process.exit(1);
}

const app = new Hono();

/* ────────────────────────────────── auth middleware ─── */

app.use("/run-ensemble", async (c, next) => {
  const auth = c.req.header("authorization") ?? "";
  const expected = `Bearer ${BEARER_TOKEN}`;
  if (auth !== expected) {
    return c.json({ error: "unauthorized" }, 401);
  }
  await next();
});

/* ────────────────────────────────── routes ─── */

/**
 * Liveness probe. Cloud Run pings this to determine instance health.
 * Anything other than 200 marks the instance unhealthy and triggers
 * restart. Keep cheap — no DB/LLM calls here.
 */
app.get("/", (c) => {
  return c.json({
    service: "market-twin-worker",
    status: "ready",
    version: process.env.K_REVISION ?? "local",
    region: process.env.REGION ?? "unknown",
  });
});

app.get("/health", (c) => c.json({ ok: true }));

/**
 * Main ensemble entry. Body:
 *   {
 *     ensembleId: string,         // already created by Vercel
 *     projectInput: ProjectInput, // full project context
 *     locale: "ko" | "en",
 *     tier: "hypothesis" | "decision" | ... ,
 *     simRows: Array<{ id, index, provider }>, // sim slot rows pre-created
 *   }
 *
 * The handler kicks off background processing and returns 202 immediately so
 * the caller (Vercel route) can respond to the user without waiting for the
 * full ensemble to finish. Cloud Run's CPU stays allocated for the
 * background work because the service is deployed with `--no-cpu-throttling`.
 *
 * On failure: ensemble row is updated to status="failed" with error_message,
 * matching Vercel's existing behavior.
 */
app.post("/run-ensemble", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return c.json({ error: "invalid_body" }, 400);
  }
  const { ensembleId } = body as { ensembleId?: string };
  if (!ensembleId) {
    return c.json({ error: "missing_ensembleId" }, 400);
  }

  // Background execution: respond 202 immediately, run orchestration in
  // floating async. Cloud Run keeps the instance alive for in-flight work
  // even after the HTTP response is flushed (deployed with
  // --no-cpu-throttling). Errors caught + logged + DB-persisted so the
  // ensemble row never silently hangs.
  void runEnsembleBackground(body).catch((err) => {
    console.error(
      `[worker] ensemble ${ensembleId} background task crashed:`,
      err,
    );
  });

  return c.json({ accepted: true, ensembleId }, 202);
});

/* ────────────────────────────────── background runner ─── */

async function runEnsembleBackground(body: unknown): Promise<void> {
  const { ensembleId, notifyEmail } = body as {
    ensembleId: string;
    notifyEmail?: string | null;
  };
  console.log(`[worker] ensemble ${ensembleId} accepted — loading context`);

  // Cloud Run shuts down instances after ~15min of no incoming requests,
  // even with --no-cpu-throttling — that flag keeps CPU allocated but
  // doesn't stop the idle-instance reaper. Background work that doesn't
  // generate request traffic gets killed mid-orchestration. Self-ping
  // every 5min so Cloud Run sees an active service and keeps this
  // instance alive for the full ensemble lifetime. WORKER_SELF_URL must
  // be the public URL of THIS service; if unset we skip the keepalive
  // (e.g. local dev where idle scale-down doesn't apply).
  const selfUrl = process.env.WORKER_SELF_URL;
  let keepAlive: NodeJS.Timeout | null = null;
  if (selfUrl) {
    keepAlive = setInterval(() => {
      void fetch(`${selfUrl.replace(/\/$/, "")}/health`)
        .then(() => {
          // Quiet on success — every 5min would clutter logs.
        })
        .catch((err) => {
          console.warn(
            `[worker] keepalive ping failed for ensemble ${ensembleId}:`,
            err instanceof Error ? err.message : err,
          );
        });
    }, 5 * 60 * 1000);
  }

  try {
    const ctx = await loadOrchestrationContext({ ensembleId, notifyEmail });
    if (!ctx) {
      console.error(
        `[worker] ensemble ${ensembleId} not found or unrunnable — abandoning`,
      );
      return;
    }

    console.log(
      `[worker] ensemble ${ensembleId} starting orchestration — tier=${ctx.tier}, sims=${ctx.simRows.length}, project=${ctx.projectInput.productName}`,
    );
    await runEnsembleOrchestration(ctx);
    console.log(`[worker] ensemble ${ensembleId} orchestration complete`);
  } finally {
    if (keepAlive) clearInterval(keepAlive);
  }
}

/* ────────────────────────────────── boot ─── */

const server = serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(
    `[worker] market-twin worker listening on :${info.port} ` +
      `(region=${process.env.REGION ?? "local"}, revision=${process.env.K_REVISION ?? "dev"})`,
  );
});

// Graceful shutdown — Cloud Run sends SIGTERM 10s before terminating an
// instance (e.g. during deploy or scale-down). Stop accepting new requests
// and let in-flight ensembles finish; if they don't finish in 30s the
// instance gets force-killed but at least we tried. The supabase service
// client persists progress incrementally so a force-kill mid-stage just
// makes the next retry pick up where we left off.
function shutdown(signal: string) {
  console.log(`[worker] received ${signal}, draining in-flight requests`);
  server.close(() => {
    console.log("[worker] http server closed, exiting");
    process.exit(0);
  });
  setTimeout(() => {
    console.warn("[worker] graceful drain timed out, force-exiting");
    process.exit(1);
  }, 30_000);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

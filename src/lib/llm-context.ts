/**
 * AsyncLocalStorage-based ambient context for LLM usage logging.
 *
 * API route handlers wrap their work in `withLLMContext({ workspaceId,
 * stageLabel?, ensembleId?, ... }, async () => ...)`. Any nested
 * `getLLMProvider()` call inside that scope auto-resolves the
 * workspaceId via setLLMContextProvider() — no per-call threading.
 *
 * Why ALS instead of per-function workspaceId opts: 20+ agent
 * functions and call sites would each need a workspaceId param,
 * touching every route. ALS isolates the instrumentation to the
 * request boundary so future call sites get coverage for free.
 *
 * Trade-off: ALS context dies at the Vercel Function boundary. The
 * Cloud Run worker (separate process) sets context at its own entry
 * via the same withLLMContext helper.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { setLLMContextProvider } from "@/lib/llm";

export type LLMRequestContext = {
  workspaceId: string;
  /** Free-text stage label — falls back to getLLMProvider's opts.stage
   *  when not set. Use this to distinguish call kinds that don't fit
   *  the sim pipeline stages (e.g. "mrai-chat", "mrai-auto-seed",
   *  "secondary-actions", "narrative-merge"). */
  stageLabel?: string;
  ensembleId?: string;
  simulationId?: string;
  conversationId?: string;
};

const store = new AsyncLocalStorage<LLMRequestContext>();

export function withLLMContext<T>(
  ctx: LLMRequestContext,
  fn: () => Promise<T>,
): Promise<T> {
  return store.run(ctx, fn);
}

export function getLLMContext(): LLMRequestContext | null {
  return store.getStore() ?? null;
}

// Side-effect registration — once this module loads anywhere on the
// Next server, getLLMProvider sees the ambient context.
setLLMContextProvider(() => store.getStore() ?? null);

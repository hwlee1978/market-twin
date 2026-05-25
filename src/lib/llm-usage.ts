/**
 * Bridges the bundle-agnostic getLLMProvider() usage-logging hook
 * (packages/shared/src/llm) to the Next-side createServiceClient().
 * Imported once for side-effect from a server entrypoint so the
 * logger is registered before any LLM call fires.
 */
import { setLLMUsageLogger } from "@/lib/llm";
import { createServiceClient } from "@/lib/supabase/server";

setLLMUsageLogger(async (payload) => {
  const admin = createServiceClient();
  await admin.from("llm_usage_log").insert({
    workspace_id: payload.workspaceId,
    provider: payload.provider,
    model: payload.model,
    stage: payload.stage,
    input_tokens: payload.inputTokens,
    output_tokens: payload.outputTokens,
    cache_creation_input_tokens: payload.cacheCreationInputTokens ?? null,
    cache_read_input_tokens: payload.cacheReadInputTokens ?? null,
    cost_usd: payload.costUsd,
    context: {
      ensemble_id: payload.ensembleId ?? null,
      simulation_id: payload.simulationId ?? null,
      conversation_id: payload.conversationId ?? null,
    },
  });
});

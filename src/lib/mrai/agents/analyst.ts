import { createServiceClient } from "@/lib/supabase/server";
import { loadRelevantMemories, loadWorkspaceMemories, type MemoryRow } from "../memory";
import { findRelevantSubgraph, type EntityRow, type RelationRow } from "../kg";
import type { StrategistPlan } from "./strategist";

/**
 * L2 ANALYST — executes the L1 plan. Pure data assembly, no LLM call.
 *
 * Currently the heaviest evidence sources are:
 *   - workspace memories (pgvector semantic retrieval)
 *   - mrai_signals (HubSpot deal rollup, etc.)
 *   - mrai_messages (recent conversation history)
 *
 * Future analyst sources (just append to the evidence pack):
 *   - Market Twin sim engine call (decide-support module)
 *   - Calendar / inbox snapshots
 *   - Per-product KB lookup
 */

export interface AnalystEvidence {
  memories: MemoryRow[];
  signals: Array<{ source: string; summary: string; fetched_at: string }>;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  kg: {
    entities: EntityRow[];
    relations: Array<RelationRow & { src_name: string; dst_name: string }>;
  };
  notes: string[];
}

const HISTORY_TURNS = 20;

export async function runAnalyst(input: {
  workspaceId: string;
  conversationId: string | null;
  userMessage: string;
  plan: StrategistPlan;
}): Promise<{ evidence: AnalystEvidence; ms: number }> {
  const t0 = Date.now();
  const supabase = createServiceClient();
  const notes: string[] = [];

  // --- Memories ---
  let memories: MemoryRow[] = [];
  if (input.plan.memoryCount > 0) {
    if (input.plan.memoryQuery) {
      memories = await loadRelevantMemories({
        workspaceId: input.workspaceId,
        queryText: input.plan.memoryQuery,
        matchCount: input.plan.memoryCount,
      });
      notes.push(`semantic search "${input.plan.memoryQuery}" → ${memories.length} memories`);
    } else {
      // Plan didn't specify a query but did want memories → newest-N
      const all = await loadWorkspaceMemories(input.workspaceId);
      memories = all.slice(0, input.plan.memoryCount);
      notes.push(`newest-N → ${memories.length} memories`);
    }
  }

  // --- Signals (HubSpot etc) ---
  let signals: AnalystEvidence["signals"] = [];
  if (input.plan.includeSignals) {
    const { data } = await supabase
      .from("mrai_signals")
      .select("source, summary, fetched_at, valid_until")
      .eq("workspace_id", input.workspaceId)
      .order("fetched_at", { ascending: false });
    const nowMs = Date.now();
    signals = ((data ?? []) as Array<{
      source: string;
      summary: string;
      fetched_at: string;
      valid_until: string | null;
    }>)
      .filter((r) => !r.valid_until || new Date(r.valid_until).getTime() > nowMs)
      .map(({ source, summary, fetched_at }) => ({ source, summary, fetched_at }));
    notes.push(`signals (active) → ${signals.length}`);
  }

  // --- History ---
  let history: AnalystEvidence["history"] = [];
  if (input.plan.includeHistory && input.conversationId) {
    const { data } = await supabase
      .from("mrai_messages")
      .select("role, content, created_at")
      .eq("conversation_id", input.conversationId)
      .order("created_at", { ascending: false })
      .limit(HISTORY_TURNS);
    history = ((data ?? []) as Array<{ role: string; content: string }>)
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))
      .reverse();
    notes.push(`history → ${history.length} turns`);
  }

  // --- Knowledge Graph subgraph ---
  // Always probe — cheap (one DB query, substring match against entity
  // names). When workspace has no KG yet, returns empty cleanly.
  const kg = await findRelevantSubgraph({
    workspaceId: input.workspaceId,
    queryText: input.userMessage,
    maxEntities: 8,
  });
  if (kg.entities.length > 0) {
    notes.push(`kg → ${kg.entities.length} entities · ${kg.relations.length} relations`);
  }

  return {
    evidence: { memories, signals, history, kg, notes },
    ms: Date.now() - t0,
  };
}

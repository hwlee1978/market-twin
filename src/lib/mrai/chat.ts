import { createServiceClient } from "@/lib/supabase/server";
import {
  extractMemoriesFromTurn,
  loadRelevantMemories,
  saveMemories,
  type MemoryRow,
} from "./memory";
import { orchestrate, saveAgentTrace } from "./agents/orchestrate";
import { saveKgFromTurn } from "./kg";
import {
  proposeSimulation,
  type SimulationProposal,
} from "./agents/simulation-proposer";

/**
 * Orchestrates one round-trip with Mr. AI:
 *   1. Load (or create) the conversation row
 *   2. Load workspace memories + recent message history
 *   3. Build system prompt with memory prefix + persona
 *   4. Call LLM
 *   5. Persist user + assistant messages
 *   6. Fire-and-forget memory extraction on the new turn
 *
 * Returns the assistant text plus the conversation id so the client can
 * keep talking on the same thread without round-tripping a list query.
 *
 * Memory extraction failure is swallowed — the user got their answer,
 * we just don't grow the memory store this turn. Logged for debugging.
 */

export type ChatTurn = {
  role: "user" | "assistant";
  content: string;
  /** Optional structured actions attached to assistant messages. */
  actions?: ChatAction[];
};

export type ChatLocale = "ko" | "en";

export type ChatAction =
  | { type: "simulation_proposal"; payload: SimulationProposal };

/**
 * Cheap regex gate for "should we generate a simulation proposal?" Avoids
 * a Sonnet call on every chat turn. Matches both formal ("시뮬레이션 실행")
 * and casual ("시뮬 돌려줘") phrasings; English fallback for en locale.
 *
 * False-positives (user mentions "시뮬" without wanting to run one) cost
 * one extra ~$0.02 Sonnet call and a card the user can dismiss. False-
 * negatives lose the magic; bias toward false-positive.
 */
function looksLikeSimulationRequest(message: string): boolean {
  const m = message.toLowerCase();
  if (/시뮬|시뮬레이션|진출\s*검증|시장\s*검증|진출\s*분석|돌려\s*줘|돌려줘|run\s*sim|simulate/i.test(m)) {
    return true;
  }
  return false;
}

export interface AgentTraceSummary {
  mode: "full" | "simple";
  totalMs: number;
  l1?: { ms: number };
  l2?: {
    ms: number;
    memoryCount: number;
    signalCount: number;
    historyCount: number;
    entityCount: number;
    relationCount: number;
    notes: string[];
  };
  l3: { ms: number };
}

export async function runMrAIChat(input: {
  workspaceId: string;
  userId: string;
  conversationId: string | null;
  userMessage: string;
  locale?: ChatLocale;
}): Promise<{
  conversationId: string;
  assistantMessage: string;
  assistantMessageId: string;
  newMemories: number;
  actions: ChatAction[];
  trace: AgentTraceSummary;
}> {
  const supabase = createServiceClient();

  // 1. Conversation
  let convoId = input.conversationId;
  if (!convoId) {
    const { data, error } = await supabase
      .from("mrai_conversations")
      .insert({
        workspace_id: input.workspaceId,
        user_id: input.userId,
        title: input.userMessage.slice(0, 60),
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(`create conversation: ${error?.message}`);
    convoId = data.id as string;
  } else {
    // Ownership guard — the route also enforces RLS but defense in depth
    const { data: existing } = await supabase
      .from("mrai_conversations")
      .select("workspace_id")
      .eq("id", convoId)
      .maybeSingle();
    if (!existing || existing.workspace_id !== input.workspaceId) {
      throw new Error("conversation not found");
    }
  }

  // 2. Insert the user message first so it's part of the durable record
  // even if the LLM call fails on transient errors.
  const { data: userRow, error: userErr } = await supabase
    .from("mrai_messages")
    .insert({
      conversation_id: convoId,
      role: "user",
      content: input.userMessage,
    })
    .select("id")
    .single();
  if (userErr || !userRow) throw new Error(`save user msg: ${userErr?.message}`);

  // 3. Run the 3-Layer Agent orchestrator (Strategist → Analyst → Synthesizer).
  // It auto-bypasses to a single cheap LLM call for trivial greetings.
  const locale: ChatLocale = input.locale ?? "ko";
  const orchestrated = await orchestrate({
    workspaceId: input.workspaceId,
    conversationId: convoId,
    userMessage: input.userMessage,
    locale,
  });
  const assistantText = orchestrated.text;

  // We still need the post-extraction memory list (NOT the L2 evidence —
  // memory extraction wants the broader recent set to dedup properly).
  const memoriesForExtraction = orchestrated.evidence?.memories
    ?? (await loadRelevantMemories({
      workspaceId: input.workspaceId,
      queryText: input.userMessage,
      matchCount: 20,
    }));

  // 3.5 Action proposal — if the user is asking us to run a simulation,
  // generate a ready-to-edit input draft attached to the assistant
  // message. The chat UI renders it as a SimulationProposalCard.
  // Failure here doesn't break the response; we just skip the card.
  const actions: ChatAction[] = [];
  let finalAssistantText = assistantText;
  if (looksLikeSimulationRequest(input.userMessage)) {
    try {
      const proposal = await proposeSimulation({
        workspaceId: input.workspaceId,
        userMessage: input.userMessage,
        locale,
      });
      actions.push({ type: "simulation_proposal", payload: proposal });
      // Replace orchestrator text with a focused intro to the card —
      // 3-Layer Agent doesn't know about the proposer fork, so its
      // generic "what do you mean by 시뮬?" output would clash with
      // the card right beneath it. The rationale field already
      // explains the memory-grounded reasoning.
      finalAssistantText =
        locale === "en"
          ? `Prepared a simulation input draft from workspace memory. Review and edit the fields in the card below, then click **Start simulation**. Tier defaults to ${proposal.tier} (you can change it). Estimated wait: 15-25 minutes for Decision tier; you'll get Email + Slack notifications when it completes.`
          : `워크스페이스 메모리 기반으로 시뮬레이션 input을 준비했습니다. 아래 카드에서 검토·수정 후 **"시뮬 시작"** 버튼을 눌러주세요. 기본 Tier는 ${proposal.tier}이며 다른 옵션으로 변경 가능합니다. 완료까지 약 15-25분 소요되고, Email + Slack로 자동 알림 갑니다.`;
    } catch (e) {
      console.error("[mrai] simulation proposal failed", e);
    }
  }

  // 4. Save assistant message + agent trace
  const { data: asstRow, error: asstErr } = await supabase
    .from("mrai_messages")
    .insert({
      conversation_id: convoId,
      role: "assistant",
      content: finalAssistantText,
      input_tokens: orchestrated.usage.inputTokens,
      output_tokens: orchestrated.usage.outputTokens,
      actions: actions.length > 0 ? actions : null,
    })
    .select("id")
    .single();
  if (asstErr || !asstRow) throw new Error(`save assistant msg: ${asstErr?.message}`);

  await saveAgentTrace({
    workspaceId: input.workspaceId,
    conversationId: convoId,
    userMessageId: userRow.id as string,
    asstMessageId: asstRow.id as string,
    result: orchestrated,
  });

  // Bump conversation updated_at so the UI can sort threads
  await supabase
    .from("mrai_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", convoId);

  // 5. Memory extraction + KG extraction — run in parallel, both
  // best-effort. Neither blocks the user-facing response.
  let newMemoryCount = 0;
  const memoryTask = (async () => {
    try {
      const extracted = await extractMemoriesFromTurn({
        userMessage: input.userMessage,
        assistantReply: assistantText,
        existingMemories: memoriesForExtraction,
      });
      if (extracted.length > 0) {
        await saveMemories({
          workspaceId: input.workspaceId,
          userId: input.userId,
          sourceMessageId: asstRow.id as string,
          memories: extracted,
        });
        newMemoryCount = extracted.length;
      }
    } catch (e) {
      console.error("[mrai] memory extraction failed", e);
    }
  })();

  const kgTask = (async () => {
    try {
      await saveKgFromTurn({
        workspaceId: input.workspaceId,
        userMessage: input.userMessage,
        assistantReply: assistantText,
        sourceMemoryId: null, // KG isn't tied to a specific memory row
      });
    } catch (e) {
      console.error("[mrai] kg extraction failed", e);
    }
  })();

  await Promise.all([memoryTask, kgTask]);

  const traceSummary: AgentTraceSummary = {
    mode: orchestrated.mode,
    totalMs: orchestrated.totalMs,
    l1: orchestrated.trace.l1 ? { ms: orchestrated.trace.l1.ms } : undefined,
    l2: orchestrated.trace.l2
      ? {
          ms: orchestrated.trace.l2.ms,
          memoryCount: orchestrated.trace.l2.evidenceSummary.memoryCount,
          signalCount: orchestrated.trace.l2.evidenceSummary.signalCount,
          historyCount: orchestrated.trace.l2.evidenceSummary.historyCount,
          entityCount: orchestrated.trace.l2.evidenceSummary.entityCount,
          relationCount: orchestrated.trace.l2.evidenceSummary.relationCount,
          notes: orchestrated.trace.l2.evidenceSummary.notes,
        }
      : undefined,
    l3: { ms: orchestrated.trace.l3.ms },
  };

  return {
    conversationId: convoId,
    assistantMessage: finalAssistantText,
    assistantMessageId: asstRow.id as string,
    newMemories: newMemoryCount,
    actions,
    trace: traceSummary,
  };
}

export async function listConversations(workspaceId: string): Promise<
  Array<{ id: string; title: string | null; updated_at: string }>
> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("mrai_conversations")
    .select("id, title, updated_at")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(`list conversations: ${error.message}`);
  return (data ?? []) as Array<{ id: string; title: string | null; updated_at: string }>;
}

export async function loadConversationMessages(
  workspaceId: string,
  conversationId: string,
): Promise<ChatTurn[]> {
  const supabase = createServiceClient();
  const { data: conv } = await supabase
    .from("mrai_conversations")
    .select("workspace_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv || conv.workspace_id !== workspaceId) return [];

  const { data, error } = await supabase
    .from("mrai_messages")
    .select("role, content, actions")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`load messages: ${error.message}`);
  const rows = (data ?? []) as Array<{
    role: string;
    content: string;
    actions: ChatAction[] | null;
  }>;
  return rows
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
      actions: m.actions ?? undefined,
    }));
}

export async function summarizeMemoryCount(memories: MemoryRow[]): Promise<{
  total: number;
  byKind: Record<string, number>;
}> {
  const byKind: Record<string, number> = {};
  for (const m of memories) byKind[m.kind] = (byKind[m.kind] ?? 0) + 1;
  return { total: memories.length, byKind };
}

import { getLLMProvider } from "@/lib/llm";
import { createServiceClient } from "@/lib/supabase/server";
import {
  extractMemoriesFromTurn,
  formatMemoriesForPrompt,
  loadRelevantMemories,
  saveMemories,
  type MemoryRow,
} from "./memory";

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

const HISTORY_TURNS_INJECTED = 20;

export type ChatTurn = { role: "user" | "assistant"; content: string };

export type ChatLocale = "ko" | "en";

const MRAI_SYSTEM_PROMPT_KO = `당신은 Mr. AI — CEO를 위한 AI 비서입니다.

성격:
- 회계사처럼 정확하고, 컨설턴트처럼 간결합니다.
- 모호한 말 대신 숫자/사실/근거를 우선합니다.
- 의견을 물으면 트레이드오프를 먼저 말하고 권장안을 마지막에 줍니다.

답변 스타일:
- 한국어 (사용자가 영어로 묻지 않는 한).
- 짧게. 보통 3-6 문장. 표·리스트는 정말 필요할 때만.
- 모르는 건 "잘 모릅니다" 또는 "확인이 필요합니다"라고 답합니다. 추측 금지.
- CEO에게 보고하는 톤. "~인 것 같아요" 같은 흐릿한 표현 금지.

장기 기억:
- 아래 Persistent Memory 섹션에 이 워크스페이스에서 이전에 저장한 사실들이 있습니다.
- 매 답변에서 자연스럽게 활용하세요. "이전에 ~라고 하셨으니" 같은 명시적 인용은 자제.
- 새로 알게 된 중요 사실은 기억하겠다고 말할 필요 없음 — 시스템이 자동 추출.`;

const MRAI_SYSTEM_PROMPT_EN = `You are Mr. AI — an AI assistant for a CEO.

Personality:
- Precise like an accountant, concise like a consultant.
- Prefer numbers, facts, and citations over vague claims.
- When asked for an opinion, lead with trade-offs and end with the recommendation.

Style:
- English (unless the user writes to you in Korean).
- Short. Usually 3-6 sentences. Tables/lists only when truly needed.
- If you don't know, say "I don't know" or "needs verification". No guessing.
- CEO-reporting tone. Avoid hedging like "it seems" or "perhaps".

Persistent Memory:
- The Persistent Memory section below lists facts saved earlier in this workspace.
- Use them naturally. Don't say things like "as you mentioned before".
- No need to announce you'll remember new facts — the system extracts them automatically.`;

function systemPromptFor(locale: ChatLocale): string {
  return locale === "en" ? MRAI_SYSTEM_PROMPT_EN : MRAI_SYSTEM_PROMPT_KO;
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
  newMemories: number;
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

  // 2. Load context: memories (semantic retrieval keyed on the user's
  // message — see loadRelevantMemories for fallback chain) + recent
  // chronological history.
  const [memories, historyResp] = await Promise.all([
    loadRelevantMemories({
      workspaceId: input.workspaceId,
      queryText: input.userMessage,
      matchCount: 20,
    }),
    supabase
      .from("mrai_messages")
      .select("role, content")
      .eq("conversation_id", convoId)
      .order("created_at", { ascending: false })
      .limit(HISTORY_TURNS_INJECTED),
  ]);
  if (historyResp.error) throw new Error(`load history: ${historyResp.error.message}`);
  const history = ((historyResp.data ?? []) as ChatTurn[]).reverse();

  // 3. Insert the user message first so it's part of the durable record
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

  // 4. Build the system prompt: persona + memory block.
  const locale: ChatLocale = input.locale ?? "ko";
  const basePrompt = systemPromptFor(locale);
  const memoryBlock = formatMemoriesForPrompt(memories, locale);
  const system = memoryBlock ? `${basePrompt}\n\n${memoryBlock}` : basePrompt;

  // 5. Build the conversation prompt. History goes into a transcript that
  // the LLM sees as one prompt — we don't use multi-turn message format
  // because the shared LLM gateway is single-shot system+prompt only.
  const userLabel = locale === "en" ? "User" : "사용자";
  const transcript = history
    .map((t) => `${t.role === "user" ? userLabel : "Mr. AI"}: ${t.content}`)
    .join("\n\n");
  const prompt = transcript
    ? `${transcript}\n\n${userLabel}: ${input.userMessage}\n\nMr. AI:`
    : `${userLabel}: ${input.userMessage}\n\nMr. AI:`;

  const provider = getLLMProvider({ provider: "anthropic" });
  const res = await provider.generate({
    system,
    prompt,
    temperature: 0.4,
    maxTokens: 1500,
    cacheSystem: true,
  });
  const assistantText = (res.text ?? "").trim() || "(빈 응답)";

  // 6. Save assistant message
  const { data: asstRow, error: asstErr } = await supabase
    .from("mrai_messages")
    .insert({
      conversation_id: convoId,
      role: "assistant",
      content: assistantText,
      input_tokens: res.usage?.inputTokens ?? null,
      output_tokens: res.usage?.outputTokens ?? null,
    })
    .select("id")
    .single();
  if (asstErr || !asstRow) throw new Error(`save assistant msg: ${asstErr?.message}`);

  // Bump conversation updated_at so the UI can sort threads
  await supabase
    .from("mrai_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", convoId);

  // 7. Memory extraction — best effort, never block the response
  let newMemoryCount = 0;
  try {
    const extracted = await extractMemoriesFromTurn({
      userMessage: input.userMessage,
      assistantReply: assistantText,
      existingMemories: memories,
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

  return {
    conversationId: convoId,
    assistantMessage: assistantText,
    newMemories: newMemoryCount,
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
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`load messages: ${error.message}`);
  const rows = (data ?? []) as Array<{ role: string; content: string }>;
  return rows
    .filter((m): m is ChatTurn => m.role === "user" || m.role === "assistant");
}

export async function summarizeMemoryCount(memories: MemoryRow[]): Promise<{
  total: number;
  byKind: Record<string, number>;
}> {
  const byKind: Record<string, number> = {};
  for (const m of memories) byKind[m.kind] = (byKind[m.kind] ?? 0) + 1;
  return { total: memories.length, byKind };
}

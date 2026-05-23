import { getLLMProvider } from "@/lib/llm";
import { createServiceClient } from "@/lib/supabase/server";
import { embedTexts, embedSingle } from "./embedding";

/**
 * Mr. AI Persistent Memory — extraction + retrieval helpers.
 *
 * After each assistant reply, we run a small extraction pass that asks
 * an LLM "did anything in this last user turn deserve to be remembered
 * across sessions?" Anything it flags gets persisted to mrai_memories
 * and auto-injected into the system prompt on every future turn (until
 * the user explicitly forgets it).
 *
 * Design choices for W1-2:
 *   - All memories injected (no pgvector yet); cap at 50 to keep prompt small.
 *   - Extraction is fire-and-forget from the caller's perspective — failures
 *     don't break the conversation, just skip the memory write.
 *   - kinds are coarse (fact/preference/context/decision) so the UI sidebar
 *     can group them without a separate taxonomy layer.
 */

export type MemoryKind = "fact" | "preference" | "context" | "decision";

export interface MemoryRow {
  id: string;
  kind: MemoryKind;
  title: string;
  body: string;
  source_message_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExtractedMemory {
  kind: MemoryKind;
  title: string;
  body: string;
}

const MAX_MEMORIES_INJECTED = 50;

/**
 * Load up to MAX_MEMORIES_INJECTED memories for a workspace, newest first.
 * Returns the rows in a stable order so the LLM prompt stays cacheable
 * across turns (newest at the bottom = most likely to change = at end).
 */
export async function loadWorkspaceMemories(workspaceId: string): Promise<MemoryRow[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("mrai_memories")
    .select("id, kind, title, body, source_message_id, created_at, updated_at")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false })
    .limit(MAX_MEMORIES_INJECTED);
  if (error) throw new Error(`load memories: ${error.message}`);
  return (data ?? []) as MemoryRow[];
}

/**
 * Render memories as a system-prompt prefix block. Empty string when
 * the workspace has none yet (first-ever conversation).
 */
export function formatMemoriesForPrompt(
  memories: MemoryRow[],
  locale: "ko" | "en" = "ko",
): string {
  if (memories.length === 0) return "";
  const groups: Record<MemoryKind, MemoryRow[]> = {
    fact: [],
    preference: [],
    context: [],
    decision: [],
  };
  for (const m of memories) groups[m.kind].push(m);

  const LABELS_KO: Record<MemoryKind, string> = {
    fact: "회사·제품 사실 (Facts)",
    preference: "CEO 스타일·선호 (Preferences)",
    context: "현재 상황 (Context)",
    decision: "지난 결정 로그 (Decisions)",
  };
  const LABELS_EN: Record<MemoryKind, string> = {
    fact: "Company & product facts",
    preference: "CEO style & preferences",
    context: "Current context",
    decision: "Past decisions log",
  };
  const label = locale === "en" ? LABELS_EN : LABELS_KO;

  const sections = (Object.keys(groups) as MemoryKind[])
    .filter((k) => groups[k].length > 0)
    .map((k) => {
      const items = groups[k]
        .map((m) => `- [${m.title}] ${m.body}`)
        .join("\n");
      return `### ${label[k]}\n${items}`;
    });

  const header =
    locale === "en"
      ? "## What you already know (Persistent Memory)\nFacts saved earlier in this workspace. Use them naturally in your answer. If new information contradicts a memory, confirm with the user.\n\n"
      : "## 당신이 이미 알고 있는 사실 (Persistent Memory)\n이 워크스페이스에서 이전에 저장된 것들입니다. 답변할 때 자연스럽게 활용하세요. 모순되는 새 정보가 나오면 사용자에게 확인하세요.\n\n";

  return `${header}${sections.join("\n\n")}`;
}

/**
 * Ask an LLM to extract memorable facts from the most recent user turn.
 * Conservative: returns [] if nothing in the turn is durable enough to
 * be useful across sessions. We'd rather under-extract than pollute
 * the prompt with noise.
 */
export async function extractMemoriesFromTurn(input: {
  userMessage: string;
  assistantReply: string;
  existingMemories: MemoryRow[];
}): Promise<ExtractedMemory[]> {
  const { userMessage, assistantReply, existingMemories } = input;

  const existingSummary = existingMemories.length
    ? existingMemories
        .slice(0, 20)
        .map((m) => `- [${m.kind}] ${m.title}`)
        .join("\n")
    : "(아직 저장된 것 없음)";

  const provider = getLLMProvider({ provider: "anthropic" });
  const system = `당신은 AI 비서의 장기 기억을 관리하는 보조 시스템입니다. 사용자의 최근 발화에서 "다음 세션에서도 기억해야 가치 있는 사실"만 골라 JSON으로 반환합니다.

추출 기준:
- 회사/제품/팀에 대한 사실 (fact): "우리 회사는 X다", "제품 A의 가격은 B다"
- CEO의 선호·스타일 (preference): "보고서는 짧게 받고 싶다", "한국어로 답해줘"
- 현재 진행 상황 (context): "이번 주는 Y에 집중", "Z 마감일 임박"
- 결정 로그 (decision): "오늘 X를 하기로 결정함"

제외 기준 (절대 추출 금지):
- 일회성 질문/답변, 일반 지식, 인사
- 이미 저장된 사실의 동어 반복 (existingMemories 참고)
- 가설/의문 ("이걸 해야 할까?")
- AI 답변 자체의 내용 — 사용자가 명시적으로 동의/추가한 것만

각 항목 형식:
{ "kind": "fact"|"preference"|"context"|"decision",
  "title": "10자 내외 짧은 제목",
  "body": "1-2 문장. 미래의 AI가 읽고 바로 활용할 수 있는 명확한 평문." }

아무것도 추출할 게 없으면 빈 배열 [] 반환.`;

  const prompt = `## 이미 저장된 메모리 (중복 방지용)
${existingSummary}

## 사용자 최근 발화
"${userMessage}"

## AI의 답변 (맥락 참고용)
"${assistantReply}"

위 발화에서 추출할 메모리를 JSON 배열로 반환하세요. 형식:
{ "memories": [ { "kind": "...", "title": "...", "body": "..." } ] }`;

  const res = await provider.generate({
    system,
    prompt,
    temperature: 0.1,
    maxTokens: 800,
    cacheSystem: false,
    jsonSchema: {
      type: "object",
      properties: {
        memories: {
          type: "array",
          items: {
            type: "object",
            required: ["kind", "title", "body"],
            properties: {
              kind: { type: "string", enum: ["fact", "preference", "context", "decision"] },
              title: { type: "string", maxLength: 60 },
              body: { type: "string", maxLength: 500 },
            },
          },
        },
      },
      required: ["memories"],
    },
    expectedArrayKey: "memories",
  });

  const json = res.json as { memories?: ExtractedMemory[] } | undefined;
  const items = Array.isArray(json?.memories) ? json!.memories : [];
  // Defensive validation — LLM occasionally returns malformed entries
  return items.filter(
    (m): m is ExtractedMemory =>
      !!m &&
      typeof m.title === "string" &&
      typeof m.body === "string" &&
      ["fact", "preference", "context", "decision"].includes(m.kind),
  );
}

export async function saveMemories(input: {
  workspaceId: string;
  userId: string;
  sourceMessageId: string | null;
  memories: ExtractedMemory[];
}): Promise<void> {
  if (input.memories.length === 0) return;
  const supabase = createServiceClient();

  // Embed each memory with "title :: body" so retrieval can match either
  // angle. Best-effort: if embedding fails (rate limit, key missing) we
  // still save the row with a null embedding; backfill script can fill
  // it in later.
  const embedInputs = input.memories.map((m) => `${m.title} :: ${m.body}`);
  let embeddings: Array<number[] | null> = input.memories.map(() => null);
  try {
    const vecs = await embedTexts(embedInputs);
    embeddings = vecs;
  } catch (e) {
    console.error("[mrai] embed-on-save failed (storing with null embedding)", e);
  }

  const rows = input.memories.map((m, i) => ({
    workspace_id: input.workspaceId,
    created_by: input.userId,
    source_message_id: input.sourceMessageId,
    kind: m.kind,
    title: m.title.slice(0, 60),
    body: m.body.slice(0, 500),
    embedding: embeddings[i] ?? null,
  }));
  const { error } = await supabase.from("mrai_memories").insert(rows);
  if (error) throw new Error(`save memories: ${error.message}`);
}

/**
 * Semantic retrieval — embed the query text and ask Postgres for the
 * top-K most cosine-similar memories for this workspace.
 *
 * Fallback chain:
 *   - Empty query / embed failure / RPC failure → fall back to
 *     loadWorkspaceMemories (newest first, up to 50).
 *   - Workspace has < `fallbackThreshold` memories → also load all,
 *     since semantic retrieval gives diminishing returns at small N
 *     and we don't want to lose context just because cosine ranked
 *     something low.
 */
export async function loadRelevantMemories(input: {
  workspaceId: string;
  queryText: string;
  matchCount?: number;
  fallbackThreshold?: number;
}): Promise<MemoryRow[]> {
  const matchCount = input.matchCount ?? 20;
  const fallbackThreshold = input.fallbackThreshold ?? 12;

  const all = await loadWorkspaceMemories(input.workspaceId);
  if (all.length <= fallbackThreshold) return all;
  if (!input.queryText.trim()) return all.slice(0, matchCount);

  let queryEmbedding: number[];
  try {
    queryEmbedding = await embedSingle(input.queryText);
  } catch (e) {
    console.error("[mrai] query embed failed; using newest-N fallback", e);
    return all.slice(0, matchCount);
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("match_mrai_memories", {
    query_embedding: queryEmbedding,
    ws_id: input.workspaceId,
    match_count: matchCount,
  });
  if (error) {
    console.error("[mrai] match rpc failed; using newest-N fallback", error.message);
    return all.slice(0, matchCount);
  }

  const matched = (data ?? []) as MemoryRow[];
  // If the RPC found fewer than we asked for (e.g. lots of memories
  // without embeddings yet), top up from the all list with non-overlap.
  if (matched.length >= matchCount) return matched;
  const matchedIds = new Set(matched.map((m) => m.id));
  const topUp = all.filter((m) => !matchedIds.has(m.id)).slice(0, matchCount - matched.length);
  return [...matched, ...topUp];
}

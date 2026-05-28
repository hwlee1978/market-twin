import { getLLMProvider } from "@/lib/llm";
import { createServiceClient } from "@/lib/supabase/server";
import { loadWorkspaceMemories, type MemoryRow } from "./memory";
import { aggregateRecentFeedback, formatFeedbackForPrompt } from "./feedback";
import { dispatchToAllChannels } from "./channels";

interface SignalRow {
  source: string;
  summary: string;
  fetched_at: string;
}

async function loadActiveSignals(workspaceId: string): Promise<SignalRow[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("mrai_signals")
    .select("source, summary, fetched_at, valid_until")
    .eq("workspace_id", workspaceId)
    .order("fetched_at", { ascending: false });
  if (error) return [];
  const nowMs = Date.now();
  const rows = (data ?? []) as Array<SignalRow & { valid_until: string | null }>;
  return rows
    .filter((r) => !r.valid_until || new Date(r.valid_until).getTime() > nowMs)
    .map((r) => ({ source: r.source, summary: r.summary, fetched_at: r.fetched_at }));
}

/**
 * Mr. AI — Daily Briefing generator.
 *
 * Pulls workspace memories + the most recent ~3 conversations and asks
 * the LLM to compose a 3-section morning brief:
 *   1. 어제 요약 / Yesterday recap
 *   2. 오늘 챙길 것 / Today's focus
 *   3. 주의 신호·질문 / Signals & questions
 *
 * Output stored as markdown in the *source language* (the locale the user
 * was in when they generated it). The UI's locale switch only changes
 * labels, not historical briefing content — re-reads stay stable.
 */

export type Locale = "ko" | "en";

const RECENT_CONVERSATIONS = 3;
const RECENT_TURNS_PER_CONVERSATION = 8;

export interface BriefingRow {
  id: string;
  content_md: string;
  locale: Locale;
  source_memory_ids: string[];
  source_conversation_ids: string[];
  generated_at: string;
}

interface ConversationDigest {
  id: string;
  title: string | null;
  updatedAt: string;
  transcript: string;
}

async function loadRecentConversationDigests(workspaceId: string): Promise<ConversationDigest[]> {
  const supabase = createServiceClient();
  const { data: convs, error: cErr } = await supabase
    .from("mrai_conversations")
    .select("id, title, updated_at")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false })
    .limit(RECENT_CONVERSATIONS);
  if (cErr) throw new Error(`load convs: ${cErr.message}`);

  const rows = (convs ?? []) as Array<{ id: string; title: string | null; updated_at: string }>;
  if (rows.length === 0) return [];

  // One IN query to fetch all turns across the recent conversations, then group.
  const ids = rows.map((r) => r.id);
  const { data: msgs, error: mErr } = await supabase
    .from("mrai_messages")
    .select("conversation_id, role, content, created_at")
    .in("conversation_id", ids)
    .order("created_at", { ascending: false });
  if (mErr) throw new Error(`load msgs: ${mErr.message}`);

  const grouped = new Map<string, Array<{ role: string; content: string }>>();
  for (const m of (msgs ?? []) as Array<{ conversation_id: string; role: string; content: string }>) {
    const arr = grouped.get(m.conversation_id) ?? [];
    if (arr.length < RECENT_TURNS_PER_CONVERSATION) arr.push(m);
    grouped.set(m.conversation_id, arr);
  }

  return rows.map((r) => {
    const turns = (grouped.get(r.id) ?? []).slice().reverse();
    const transcript = turns
      .map((t) => `${t.role === "user" ? "User" : "Mr. AI"}: ${t.content}`)
      .join("\n");
    return { id: r.id, title: r.title, updatedAt: r.updated_at, transcript };
  });
}

function buildBriefingPrompt(input: {
  locale: Locale;
  workspaceName: string;
  memories: MemoryRow[];
  conversations: ConversationDigest[];
  signals: SignalRow[];
}): { system: string; prompt: string } {
  const { locale, workspaceName, memories, conversations, signals } = input;

  const memoryBlock = memories.length
    ? memories
        .map((m) => `- [${m.kind}] ${m.title} :: ${m.body}`)
        .join("\n")
    : locale === "ko"
    ? "(저장된 메모리 없음)"
    : "(no memories saved yet)";

  const convBlock = conversations.length
    ? conversations
        .map(
          (c, i) =>
            `### Conversation ${i + 1}: ${c.title ?? "(untitled)"}\n(updated ${c.updatedAt})\n${c.transcript || "(empty)"}`,
        )
        .join("\n\n")
    : locale === "ko"
    ? "(최근 대화 없음)"
    : "(no recent conversations)";

  const signalBlock = signals.length
    ? signals.map((s) => `- [${s.source}] ${s.summary}`).join("\n")
    : locale === "ko"
    ? "(연결된 외부 도구에서 받은 최신 신호 없음)"
    : "(no recent signals from connected tools)";

  if (locale === "ko") {
    return {
      system: `당신은 Mr. AI — CEO를 위한 AI 비서입니다. 매일 아침 짧은 브리핑을 생성합니다.

## 워크스페이스 정체성 (매우 중요)
이 워크스페이스의 **자사 브랜드는 "${workspaceName}"** 입니다.
- "${workspaceName}" 관련 메모리·뉴스·이벤트·캠페인은 **자사 정보**입니다. 절대 "경쟁사"로 분류하지 마세요.
- 자사 행보(예: 자사 광고, 자사 매장 오픈, 자사 신상품, 자사 IP)는 "오늘 챙길 것" 또는 "주의 신호"에서 본인 액션 관점으로 다루세요.
- 경쟁사는 메모리에서 자사 브랜드 외 다른 브랜드명으로 명시된 항목만 (워크스페이스 메모리에 등재된 실제 경쟁사 기준).

브리핑 구조 (반드시 이 3 섹션, 정확한 마크다운 헤더 사용):

## 어제 요약
최근 대화에서 나온 핵심 결정·질문·맥락을 3-5 bullet로. 평이한 요약이 아니라 "그래서 뭐였더라?"에 답하는 톤.

## 오늘 챙길 것
저장된 memories (특히 'context' kind) + 최근 결정을 근거로 오늘 실제 해야 할 일 3-5 bullet. 막연한 권유 금지 — "보고서 확인", "X에게 답변" 같은 구체 action.

## 주의 신호 · 질문
Mr. AI가 보기에 사용자가 놓쳤거나 다시 생각해볼 만한 점 2-3개. 질문 형식 OK.

규칙:
- 한국어. CEO에게 보고하는 톤 — 짧고 사실 위주.
- 모르면 "정보 부족"이라고 명시. 추측·일반론 금지.
- 메모리·대화에 없는 내용 만들지 말 것.
- "${workspaceName}"을 경쟁사·외부 브랜드로 절대 잘못 분류하지 말 것.`,
      prompt: `## Workspace memories (persistent facts)
${memoryBlock}

## Recent conversations (newest first)
${convBlock}

## External signals (synced from connected tools)
${signalBlock}

---

위 정보만 사용해 오늘의 브리핑을 작성하세요. 정확히 3개의 ## 헤더 (어제 요약 / 오늘 챙길 것 / 주의 신호 · 질문) 형식. External signals 섹션의 내용은 '오늘 챙길 것' 또는 '주의 신호 · 질문'에 자연스럽게 포함하세요.`,
    };
  }

  return {
    system: `You are Mr. AI — an AI assistant for a CEO. You generate a short morning briefing.

## Workspace identity (very important)
This workspace's **own brand is "${workspaceName}"**.
- Any memory / news / event / campaign mentioning "${workspaceName}" is **first-party information about our own brand**. Never classify it as a "competitor".
- First-party moves (our own ads, our own store openings, our own product launches, our own IP) belong in "Today's focus" or "Signals & questions" framed as our own action.
- Competitors are only those memories naming a brand OTHER than "${workspaceName}" (e.g. Allbirds, Veja, On).

Briefing structure (exactly these 3 sections, use exact markdown headers):

## Yesterday recap
3-5 bullets summarizing the key decisions / questions / context from recent conversations. Not a plain summary — answer "so what was the gist?"

## Today's focus
3-5 bullets of concrete things to do today, grounded in saved memories (especially 'context' kind) + recent decisions. No vague advice — concrete actions like "review report X", "reply to Y".

## Signals & questions
2-3 things the user might have missed or should reconsider. Questions are OK.

Rules:
- English. CEO-reporting tone — short, factual.
- If you don't know, say "insufficient information". No guessing or boilerplate.
- Don't invent facts not in the memories or conversations.
- Never misclassify "${workspaceName}" as a competitor or external brand.`,
    prompt: `## Workspace memories (persistent facts)
${memoryBlock}

## Recent conversations (newest first)
${convBlock}

## External signals (synced from connected tools)
${signalBlock}

---

Using only the information above, write today's briefing. Exactly three ## headers (Yesterday recap / Today's focus / Signals & questions). Fold the External signals content naturally into "Today's focus" or "Signals & questions".`,
  };
}

export async function generateBriefing(input: {
  workspaceId: string;
  userId: string;
  locale: Locale;
  /**
   * Channel dispatch mode. Default "fire-and-forget" returns the
   * briefing immediately and schedules dispatch on the event loop —
   * good UX for user-facing manual POSTs but unsafe in Vercel cron
   * where the function gets reaped right after response, killing
   * the background promise (this is what made 5/25 + 5/26 cron
   * briefings never reach Slack/Email on Le Mouton).
   *
   * "await" blocks until dispatch completes — adds ~1-3s but
   * guarantees delivery. Use from cron.
   *
   * "skip" returns the briefing without dispatching. Use when the
   * caller wants to control dispatch separately (or for tests).
   */
  dispatch?: "fire-and-forget" | "await" | "skip";
}): Promise<BriefingRow> {
  const supabase = createServiceClient();

  const [memories, conversations, signals, feedback, wsRow] = await Promise.all([
    loadWorkspaceMemories(input.workspaceId),
    loadRecentConversationDigests(input.workspaceId),
    loadActiveSignals(input.workspaceId),
    aggregateRecentFeedback(input.workspaceId),
    supabase
      .from("workspaces")
      .select("name")
      .eq("id", input.workspaceId)
      .maybeSingle(),
  ]);

  // Brand identity in the system prompt is the only thing stopping the
  // briefing LLM from labeling first-party news (e.g. our own RSS hits
  // filtered by brand name) as "competitor" news. Without it the model
  // has no way to tell which mentions are us vs them.
  const wsName = (wsRow.data as { name?: string } | null)?.name;
  const workspaceName = wsName?.trim() || (input.locale === "ko" ? "(이름 미지정)" : "(unnamed)");

  const { system, prompt: basePrompt } = buildBriefingPrompt({
    locale: input.locale,
    workspaceName,
    memories,
    conversations,
    signals,
  });

  const feedbackBlock = formatFeedbackForPrompt(feedback, input.locale);
  const prompt = feedbackBlock ? `${feedbackBlock}\n\n---\n\n${basePrompt}` : basePrompt;

  const provider = getLLMProvider({ provider: "anthropic" });
  const res = await provider.generate({
    system,
    prompt,
    temperature: 0.3,
    maxTokens: 1800,
    cacheSystem: false,
  });
  const text = (res.text ?? "").trim();
  if (!text) throw new Error("empty briefing response");

  const { data, error } = await supabase
    .from("mrai_briefings")
    .insert({
      workspace_id: input.workspaceId,
      generated_by: input.userId,
      content_md: text,
      locale: input.locale,
      source_memory_ids: memories.map((m) => m.id),
      source_conversation_ids: conversations.map((c) => c.id),
      input_tokens: res.usage?.inputTokens ?? null,
      output_tokens: res.usage?.outputTokens ?? null,
    })
    .select("id, content_md, locale, source_memory_ids, source_conversation_ids, generated_at")
    .single();
  if (error || !data) throw new Error(`save briefing: ${error?.message}`);

  // Auto-dispatch to channels with send_briefing=true. Dispatch
  // strategy controlled by input.dispatch (defaults to fire-and-forget
  // for legacy callers + manual user-facing POST). Per-channel
  // failures are logged to mrai_dispatches and never throw.
  const briefingId = data.id as string;
  const title = input.locale === "en"
    ? `Mr. AI Briefing · ${new Date().toLocaleDateString("en-US")}`
    : `Mr. AI 브리핑 · ${new Date().toLocaleDateString("ko-KR")}`;
  const dispatchMode = input.dispatch ?? "fire-and-forget";
  if (dispatchMode === "await") {
    try {
      await dispatchToAllChannels({
        workspaceId: input.workspaceId,
        event: "briefing",
        payload: { title, body: text },
        sourceId: briefingId,
      });
    } catch (e) {
      console.error("[mrai] briefing dispatch failed (await)", e);
    }
  } else if (dispatchMode === "fire-and-forget") {
    void (async () => {
      try {
        await dispatchToAllChannels({
          workspaceId: input.workspaceId,
          event: "briefing",
          payload: { title, body: text },
          sourceId: briefingId,
        });
      } catch (e) {
        console.error("[mrai] briefing dispatch failed (fire-and-forget)", e);
      }
    })();
  }
  // dispatchMode === "skip" — caller handles dispatch separately

  return {
    id: briefingId,
    content_md: data.content_md as string,
    locale: data.locale as Locale,
    source_memory_ids: (data.source_memory_ids as string[]) ?? [],
    source_conversation_ids: (data.source_conversation_ids as string[]) ?? [],
    generated_at: data.generated_at as string,
  };
}

export async function loadLatestBriefing(workspaceId: string): Promise<BriefingRow | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("mrai_briefings")
    .select("id, content_md, locale, source_memory_ids, source_conversation_ids, generated_at")
    .eq("workspace_id", workspaceId)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`load latest briefing: ${error.message}`);
  if (!data) return null;
  return {
    id: data.id as string,
    content_md: data.content_md as string,
    locale: data.locale as Locale,
    source_memory_ids: (data.source_memory_ids as string[]) ?? [],
    source_conversation_ids: (data.source_conversation_ids as string[]) ?? [],
    generated_at: data.generated_at as string,
  };
}

export async function listBriefings(
  workspaceId: string,
  limit = 30,
): Promise<Array<{ id: string; locale: Locale; generated_at: string }>> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("mrai_briefings")
    .select("id, locale, generated_at")
    .eq("workspace_id", workspaceId)
    .order("generated_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`list briefings: ${error.message}`);
  return (data ?? []) as Array<{ id: string; locale: Locale; generated_at: string }>;
}

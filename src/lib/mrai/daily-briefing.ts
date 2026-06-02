import { getLLMProvider } from "@/lib/llm";
import { createServiceClient } from "@/lib/supabase/server";
import { loadWorkspaceMemories, type MemoryRow } from "./memory";
import { aggregateRecentFeedback, formatFeedbackForPrompt } from "./feedback";
import { dispatchToAllChannels } from "./dispatch-channels";

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

import type { Locale } from "./types";
export type { Locale };

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

  // Inject today/yesterday ISO dates so the LLM can correctly bucket
  // multi-day inputs. Without this, "어제 요약" silently includes anything
  // from the last few weeks of memories.
  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);
  const yesterdayIso = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);

  const memoryBlock = memories.length
    ? memories
        .map((m) => `- (${m.created_at.slice(0, 10)}) [${m.kind}] ${m.title} :: ${m.body}`)
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
    ? signals.map((s) => `- (${s.fetched_at.slice(0, 10)}) [${s.source}] ${s.summary}`).join("\n")
    : locale === "ko"
    ? "(연결된 외부 도구에서 받은 최신 신호 없음)"
    : "(no recent signals from connected tools)";

  if (locale === "ko") {
    return {
      system: `당신은 Mr. AI — CEO를 위한 AI 비서입니다. 매일 아침 짧은 브리핑을 생성합니다.

## 날짜 컨텍스트 (절대 규칙)
- 오늘: ${todayIso}
- 어제: ${yesterdayIso}
- 모든 메모리·신호 bullet은 \`(YYYY-MM-DD)\` 형식으로 일자가 명시되어 있습니다. 이 날짜를 무시하지 말 것.
- "어제 요약" 섹션은 **반드시 ${yesterdayIso} 일자 항목만** 포함. 그 이전 날짜 항목은 "어제 요약"에 절대 넣지 말 것.
- ${yesterdayIso} 일자 항목이 없으면 "어제 요약" 섹션에 "어제는 기록된 활동이 없습니다."라고 명시. 억지로 옛날 항목 끌어오지 말 것.
- ${yesterdayIso} 외 항목 중 오늘 행동에 영향 주는 것은 "오늘 챙길 것"에 \`(N일 전)\` 표시와 함께 포함 가능.

## 워크스페이스 정체성 (매우 중요)
이 워크스페이스의 **자사 브랜드는 "${workspaceName}"** 입니다.
- "${workspaceName}" 관련 메모리·뉴스·이벤트·캠페인은 **자사 정보**입니다. 절대 "경쟁사"로 분류하지 마세요.
- 자사 행보(예: 자사 광고, 자사 매장 오픈, 자사 신상품, 자사 IP)는 "오늘 챙길 것" 또는 "주의 신호"에서 본인 액션 관점으로 다루세요.
- 경쟁사는 메모리에서 자사 브랜드 외 다른 브랜드명으로 명시된 항목만 (워크스페이스 메모리에 등재된 실제 경쟁사 기준).

브리핑 구조 (반드시 이 3 섹션, 정확한 마크다운 헤더 사용):

## 어제 요약
${yesterdayIso} 일자 메모리·대화·신호에서 일어난 핵심 결정·질문·맥락을 bullet 3-5개. **그 외 날짜 항목 절대 포함 금지.** 어제 항목이 없으면 "어제는 기록된 활동이 없습니다."로만 마무리.

## 오늘 챙길 것
저장된 memories (특히 'context' kind) + 최근 결정을 근거로 오늘(${todayIso}) 실제 해야 할 일 3-5 bullet. 막연한 권유 금지 — "보고서 확인", "X에게 답변" 같은 구체 action. 옛날 항목 인용 시 \`(N일 전)\` 표시.

## 주의 신호 · 질문
Mr. AI가 보기에 사용자가 놓쳤거나 다시 생각해볼 만한 점 2-3개. 질문 형식 OK.

규칙:
- 한국어. CEO에게 보고하는 톤 — 짧고 사실 위주.
- 모르면 "정보 부족"이라고 명시. 추측·일반론 금지.
- 메모리·대화에 없는 내용 만들지 말 것.
- "${workspaceName}"을 경쟁사·외부 브랜드로 절대 잘못 분류하지 말 것.`,
      prompt: `오늘 날짜: ${todayIso} / 어제 날짜: ${yesterdayIso}

## Workspace memories (persistent facts — 각 항목 앞에 (YYYY-MM-DD) 일자 표기)
${memoryBlock}

## Recent conversations (newest first)
${convBlock}

## External signals (synced from connected tools — 각 항목 앞에 (YYYY-MM-DD) 수신일 표기)
${signalBlock}

---

위 정보만 사용해 오늘(${todayIso}) 브리핑을 작성하세요. 정확히 3개의 ## 헤더 (어제 요약 / 오늘 챙길 것 / 주의 신호 · 질문) 형식.

⚠️ "어제 요약"에는 **반드시 ${yesterdayIso} 일자 항목만** 포함. 다른 날짜 항목을 "어제"로 분류하면 잘못된 브리핑. 어제 일자 항목이 없으면 "어제는 기록된 활동이 없습니다."로만 마무리.

External signals 섹션의 내용은 일자에 맞춰 '어제 요약' 또는 '오늘 챙길 것' / '주의 신호 · 질문'에 자연스럽게 포함하세요.`,
    };
  }

  return {
    system: `You are Mr. AI — an AI assistant for a CEO. You generate a short morning briefing.

## Date context (absolute rule)
- Today: ${todayIso}
- Yesterday: ${yesterdayIso}
- Every memory / signal bullet is prefixed with its \`(YYYY-MM-DD)\` date. Do not ignore these dates.
- The "Yesterday recap" section MUST include **only items dated ${yesterdayIso}**. Items from earlier dates do NOT belong in "Yesterday recap".
- If no items are dated ${yesterdayIso}, write "No recorded activity yesterday." in that section. Do not stretch older items to fill it.
- Items from other dates that affect today's action go in "Today's focus" with explicit \`(N days ago)\` label.

## Workspace identity (very important)
This workspace's **own brand is "${workspaceName}"**.
- Any memory / news / event / campaign mentioning "${workspaceName}" is **first-party information about our own brand**. Never classify it as a "competitor".
- First-party moves (our own ads, our own store openings, our own product launches, our own IP) belong in "Today's focus" or "Signals & questions" framed as our own action.
- Competitors are only those memories naming a brand OTHER than "${workspaceName}" (e.g. Allbirds, Veja, On).

Briefing structure (exactly these 3 sections, use exact markdown headers):

## Yesterday recap
3-5 bullets from items dated ${yesterdayIso} ONLY. **Do not include items from other dates.** If yesterday has no items, write "No recorded activity yesterday." and stop.

## Today's focus
3-5 bullets of concrete things to do today (${todayIso}), grounded in saved memories (especially 'context' kind) + recent decisions. No vague advice — concrete actions like "review report X", "reply to Y". Label older citations with \`(N days ago)\`.

## Signals & questions
2-3 things the user might have missed or should reconsider. Questions are OK.

Rules:
- English. CEO-reporting tone — short, factual.
- If you don't know, say "insufficient information". No guessing or boilerplate.
- Don't invent facts not in the memories or conversations.
- Never misclassify "${workspaceName}" as a competitor or external brand.`,
    prompt: `Today: ${todayIso} / Yesterday: ${yesterdayIso}

## Workspace memories (persistent facts — each line prefixed with (YYYY-MM-DD) date)
${memoryBlock}

## Recent conversations (newest first)
${convBlock}

## External signals (synced from connected tools — each line prefixed with (YYYY-MM-DD) fetch date)
${signalBlock}

---

Using only the information above, write today's (${todayIso}) briefing. Exactly three ## headers (Yesterday recap / Today's focus / Signals & questions).

⚠️ "Yesterday recap" MUST include only items dated ${yesterdayIso}. Including items from other dates is a wrong briefing. If yesterday has no items, write "No recorded activity yesterday." and stop that section.

Fold External signals content naturally into the date-appropriate section.`,
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

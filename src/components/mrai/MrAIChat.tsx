"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Brain, Loader2, Send, Trash2, MessageSquarePlus, Paperclip, FileText, X, MessagesSquare } from "lucide-react";
import { AgentTrace, type AgentTraceData } from "./AgentTrace";
import { FeedbackButtons } from "./FeedbackButtons";
import { SimulationProposalCard, type SimulationProposalPayload } from "./SimulationProposalCard";
import { ChannelRecommendationCard, type RecommendedChannelItem } from "./ChannelRecommendationCard";
import { MemoryPreviewCard, type MemoryCandidate } from "./MemoryPreviewCard";

type MemoryKind = "fact" | "preference" | "context" | "decision";

type Memory = {
  id: string;
  kind: MemoryKind;
  title: string;
  body: string;
  created_at: string;
};

type Conversation = {
  id: string;
  title: string | null;
  updated_at: string;
};

type ChatAction =
  | { type: "simulation_proposal"; payload: SimulationProposalPayload }
  | {
      type: "channel_recommendations";
      payload: {
        countries: string[];
        recommendations: RecommendedChannelItem[];
      };
    }
  | {
      type: "memory_preview";
      payload: {
        candidates: MemoryCandidate[];
        filename: string;
        costEstimateUsd: number;
      };
    };

type ChatTurn = {
  role: "user" | "assistant";
  content: string;
  trace?: AgentTraceData;
  messageId?: string;
  actions?: ChatAction[];
};

const KIND_TONE: Record<MemoryKind, string> = {
  fact: "bg-amber-50 text-amber-900 border-amber-200",
  preference: "bg-sky-50 text-sky-900 border-sky-200",
  context: "bg-emerald-50 text-emerald-900 border-emerald-200",
  decision: "bg-violet-50 text-violet-900 border-violet-200",
};

/** localStorage key for the last-active Mr.AI conversation. Persists
 *  across page navigations so leaving /mr-ai and coming back resumes
 *  the same thread instead of starting a fresh empty one. Falls back
 *  to most-recent conversation if the stored id is missing or stale. */
const ACTIVE_CONVO_STORAGE_KEY = "mrai-active-convo-id";

export function MrAIChat({
  initialMemories,
  initialConversations,
  locale,
}: {
  initialMemories: Memory[];
  initialConversations: Conversation[];
  locale: "ko" | "en";
}) {
  const tChat = useTranslations("mrai.chat");
  const tMem = useTranslations("mrai.memory");
  const kindLabel = useTranslations("mrai.memory.kind");

  const [memories, setMemories] = useState<Memory[]>(initialMemories);
  const [conversations, setConversations] = useState<Conversation[]>(initialConversations);
  const [activeConvoId, setActiveConvoIdRaw] = useState<string | null>(null);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastNewMemoryCount, setLastNewMemoryCount] = useState<number | null>(null);
  const [uploadingPdf, setUploadingPdf] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  // Wrap activeConvoId setter so every change persists to localStorage.
  // Lets the chat resume the same thread after navigating away and
  // coming back — without this, the component remounts with null and
  // the user sees an empty pane even though the conversation row is
  // still in the sidebar.
  const setActiveConvoId = (id: string | null) => {
    setActiveConvoIdRaw(id);
    if (typeof window === "undefined") return;
    try {
      if (id) window.localStorage.setItem(ACTIVE_CONVO_STORAGE_KEY, id);
      else window.localStorage.removeItem(ACTIVE_CONVO_STORAGE_KEY);
    } catch {
      // localStorage can throw in private mode / quota — silently
      // degrade to the "no resume" behaviour.
    }
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, loading]);

  // Auto-resume the last-active conversation on mount. Order of
  // preference: (1) localStorage stored id IF it still exists in the
  // conversations list, (2) most-recent conversation (top of list).
  // No-op when the workspace has zero conversations — empty state is
  // correct in that case.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (initialConversations.length === 0) return;
    let target: string | null = null;
    try {
      const stored = window.localStorage.getItem(ACTIVE_CONVO_STORAGE_KEY);
      if (stored && initialConversations.some((c) => c.id === stored)) {
        target = stored;
      }
    } catch {
      // ignore
    }
    if (!target) {
      target = initialConversations[0]?.id ?? null;
    }
    if (target) {
      void loadConversation(target);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount-only — re-running would interrupt active chats

  async function refreshMemories() {
    const res = await fetch("/api/mrai/memories", { cache: "no-store" });
    if (res.ok) {
      const { memories: m } = await res.json();
      setMemories(m as Memory[]);
    }
  }

  async function sendMessage(e?: React.FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    setError(null);
    setLoading(true);
    setLastNewMemoryCount(null);
    setInput("");

    setTurns((prev) => [...prev, { role: "user", content: text }]);

    try {
      const res = await fetch("/api/mrai/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          conversationId: activeConvoId,
          message: text,
          locale,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || err.error || "chat_failed");
      }
      const data = (await res.json()) as {
        conversationId: string;
        assistantMessage: string;
        assistantMessageId: string;
        newMemories: number;
        actions?: ChatAction[];
        trace?: AgentTraceData;
      };
      setActiveConvoId(data.conversationId);
      setTurns((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.assistantMessage,
          trace: data.trace,
          messageId: data.assistantMessageId,
          actions: data.actions,
        },
      ]);
      setLastNewMemoryCount(data.newMemories);

      if (data.newMemories > 0) {
        await refreshMemories();
      }

      if (!activeConvoId) {
        setConversations((prev) => [
          { id: data.conversationId, title: text.slice(0, 60), updated_at: new Date().toISOString() },
          ...prev,
        ]);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown error";
      setError(msg);
      setTurns((prev) => prev.slice(0, -1));
    } finally {
      setLoading(false);
    }
  }

  async function uploadPdf(file: File) {
    if (!file || uploadingPdf || loading) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("PDF 파일만 업로드 가능합니다");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("파일이 10MB를 초과합니다");
      return;
    }
    setError(null);
    setUploadingPdf(file.name);
    // Add a placeholder user turn so the upload is visible in the
    // conversation flow.
    setTurns((prev) => [
      ...prev,
      { role: "user", content: `📎 ${file.name} 업로드 중...` },
    ]);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/mrai/actions/extract-pdf-memory", {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(
          typeof json.detail === "string"
            ? json.detail
            : typeof json.error === "string"
            ? json.error
            : "extract_failed",
        );
      }
      const candidates = (json.candidates as MemoryCandidate[]) ?? [];
      // Replace placeholder user turn + add assistant turn with the
      // memory_preview action.
      setTurns((prev) => {
        const next = [...prev];
        next[next.length - 1] = { role: "user", content: `📎 ${file.name}` };
        const newCount = candidates.filter((c) => !c.duplicate).length;
        const dupCount = candidates.length - newCount;
        next.push({
          role: "assistant",
          content: `PDF에서 ${candidates.length}개 인사이트 후보를 찾았습니다 (신규 ${newCount}${dupCount > 0 ? ` · 중복 ${dupCount}` : ""}). 아래에서 메모리에 추가할 항목을 선택해주세요.`,
          actions: [
            {
              type: "memory_preview",
              payload: {
                candidates,
                filename: json.filename ?? file.name,
                costEstimateUsd: json.costEstimateUsd ?? 0,
              },
            },
          ],
        });
        return next;
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "업로드 실패";
      setError(msg);
      setTurns((prev) => prev.slice(0, -1));
    } finally {
      setUploadingPdf(null);
      if (pdfInputRef.current) pdfInputRef.current.value = "";
    }
  }

  async function deleteMemory(id: string) {
    if (!confirm(tMem("deleteConfirm"))) return;
    const res = await fetch(`/api/mrai/memories?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      setMemories((prev) => prev.filter((m) => m.id !== id));
    }
  }

  function newConversation() {
    setActiveConvoId(null);
    setTurns([]);
    setError(null);
    setLastNewMemoryCount(null);
  }

  async function loadConversation(id: string) {
    setActiveConvoId(id);
    setTurns([]);
    setLastNewMemoryCount(null);
    const res = await fetch(`/api/mrai/chat/messages?id=${id}`, { cache: "no-store" }).catch(
      () => null,
    );
    if (res && res.ok) {
      const data = (await res.json()) as { turns: ChatTurn[] };
      setTurns(data.turns);
    }
  }

  return (
    <div className="grid grid-cols-[200px_1fr_280px] gap-3 h-[calc(100vh-380px)] min-h-[480px]">
      {/* Threads sidebar */}
      <aside className="bg-white border border-slate-200 rounded-lg overflow-hidden flex flex-col">
        <div className="px-3 py-2.5 border-b border-slate-200 flex items-center gap-2">
          <MessagesSquare className="w-4 h-4 text-amber-600" />
          <span className="text-sm font-semibold text-slate-900">
            {locale === "ko" ? "대화" : "Threads"}
          </span>
          <span className="ml-auto text-[11px] text-slate-400">
            {conversations.length}
          </span>
        </div>
        <div className="p-2 border-b border-slate-100">
          <button
            onClick={newConversation}
            className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-md transition"
          >
            <MessageSquarePlus className="w-3.5 h-3.5" />
            {tChat("newConversation")}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <p className="px-4 py-6 text-xs text-slate-400">{tChat("noConversations")}</p>
          ) : (
            <ul className="py-1">
              {conversations.map((c) => {
                const active = activeConvoId === c.id;
                return (
                  <li key={c.id}>
                    <button
                      onClick={() => loadConversation(c.id)}
                      className={`w-full text-left pl-3 pr-2 py-2 text-sm truncate transition border-l-2 ${
                        active
                          ? "border-amber-500 bg-amber-50/70 text-amber-900 font-medium"
                          : "border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                      }`}
                      title={c.title ?? tChat("untitled")}
                    >
                      {c.title ?? tChat("untitled")}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>

      {/* Chat pane */}
      <section className="bg-white border border-slate-200 rounded-lg flex flex-col overflow-hidden">
        {(() => {
          const active = conversations.find((c) => c.id === activeConvoId);
          const title = active?.title ?? (locale === "ko" ? "새 대화" : "New conversation");
          return (
            <div className="px-4 py-2.5 border-b border-slate-200 bg-gradient-to-r from-amber-50/60 to-white flex items-center gap-2">
              <Brain className="w-4 h-4 text-amber-600" />
              <span className="text-sm font-semibold text-slate-900 truncate">{title}</span>
              <span className="ml-auto text-[11px] text-slate-400">
                {turns.length} {locale === "ko" ? "턴" : "turns"}
              </span>
            </div>
          );
        })()}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4">
          {turns.length === 0 ? (
            <EmptyChatHint
              title={tChat("emptyTitle")}
              hint={tChat("emptyHint")}
              exampleA={tChat("exampleA")}
              exampleB={tChat("exampleB")}
            />
          ) : (
            turns.map((t, i) => <TurnBubble key={i} turn={t} locale={locale} />)
          )}
          {loading && (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin" />
              {tChat("thinking")}
            </div>
          )}
          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {tChat("errorPrefix")}: {error}
            </div>
          )}
          {lastNewMemoryCount !== null && lastNewMemoryCount > 0 && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 inline-flex items-center gap-2">
              <Brain className="w-3.5 h-3.5" />
              {tChat("newMemoryToast", { count: lastNewMemoryCount })}
            </div>
          )}
        </div>
        <form
          onSubmit={sendMessage}
          className="border-t border-slate-200 p-3 bg-slate-50/40"
        >
          <input
            ref={pdfInputRef}
            type="file"
            accept="application/pdf,.pdf"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadPdf(f);
            }}
            className="hidden"
          />
          <div className="flex items-end gap-2 bg-white border border-slate-200 rounded-xl px-2 py-2 transition focus-within:border-amber-400 focus-within:ring-2 focus-within:ring-amber-100">
            <button
              type="button"
              onClick={() => pdfInputRef.current?.click()}
              disabled={loading || !!uploadingPdf}
              title="PDF 업로드 → 메모리 자동 추출"
              className="shrink-0 inline-flex items-center justify-center w-9 h-9 text-slate-400 hover:text-amber-600 hover:bg-amber-50 disabled:opacity-50 rounded-lg transition-colors"
            >
              {uploadingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
            </button>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder={
                uploadingPdf
                  ? `📎 ${uploadingPdf} 분석 중 (Claude PDF 추출, 20-40초)...`
                  : tChat("inputPlaceholder")
              }
              rows={2}
              disabled={loading || !!uploadingPdf}
              className="flex-1 resize-none text-sm bg-transparent border-0 px-1 py-1.5 focus:outline-none disabled:bg-transparent placeholder:text-slate-400"
            />
            <button
              type="submit"
              disabled={loading || !!uploadingPdf || !input.trim()}
              className="shrink-0 inline-flex items-center justify-center gap-1.5 px-3.5 h-9 text-sm font-medium text-white bg-amber-500 hover:bg-amber-600 disabled:bg-slate-200 disabled:text-slate-400 rounded-lg transition"
            >
              <Send className="w-3.5 h-3.5" />
              {tChat("send")}
            </button>
          </div>
        </form>
      </section>

      {/* Memory sidebar */}
      <aside className="bg-white border border-slate-200 rounded-lg overflow-hidden flex flex-col">
        <div className="p-3 border-b border-slate-200 flex items-center gap-2">
          <Brain className="w-4 h-4 text-amber-600" />
          <span className="text-sm font-semibold text-slate-900">{tMem("title")}</span>
          <span className="ml-auto text-xs text-slate-400">
            {memories.length}
            {tMem("countSuffix")}
          </span>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {memories.length === 0 ? (
            <p className="text-xs text-slate-400 px-1 py-4 leading-relaxed">{tMem("empty")}</p>
          ) : (
            memories.map((m) => (
              <MemoryCard
                key={m.id}
                memory={m}
                kindLabel={kindLabel(m.kind)}
                deleteTitle={tMem("deleteTitle")}
                onDelete={deleteMemory}
              />
            ))
          )}
        </div>
      </aside>
    </div>
  );
}

function TurnBubble({ turn, locale }: { turn: ChatTurn; locale: "ko" | "en" }) {
  const isUser = turn.role === "user";
  return (
    <div className={`flex flex-col ${isUser ? "items-end" : "items-start"} w-full`}>
      <div
        className={`max-w-[80%] rounded-lg px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? "bg-slate-900 text-white"
            : "bg-slate-50 text-slate-900 border border-slate-200"
        }`}
      >
        {turn.content}
      </div>
      {!isUser && turn.actions && turn.actions.length > 0 && (
        <div className="mt-2 w-full max-w-[95%]">
          {turn.actions.map((action, i) => {
            if (action.type === "simulation_proposal") {
              return (
                <SimulationProposalCard
                  key={i}
                  initial={action.payload}
                  locale={locale}
                />
              );
            }
            if (action.type === "channel_recommendations") {
              return (
                <ChannelRecommendationCard
                  key={i}
                  initial={action.payload.recommendations}
                  countries={action.payload.countries}
                />
              );
            }
            if (action.type === "memory_preview") {
              return (
                <MemoryPreviewCard
                  key={i}
                  candidates={action.payload.candidates}
                  filename={action.payload.filename}
                  costEstimateUsd={action.payload.costEstimateUsd}
                />
              );
            }
            return null;
          })}
        </div>
      )}
      {!isUser && (
        <div className="mt-1 px-1 flex items-center gap-3">
          {turn.trace && <AgentTrace trace={turn.trace} />}
          {turn.messageId && (
            <FeedbackButtons
              targetType="chat_message"
              targetId={turn.messageId}
              locale={locale}
              size="xs"
            />
          )}
        </div>
      )}
    </div>
  );
}

function MemoryCard({
  memory,
  kindLabel,
  deleteTitle,
  onDelete,
}: {
  memory: Memory;
  kindLabel: string;
  deleteTitle: string;
  onDelete: (id: string) => void;
}) {
  return (
    <div className={`border rounded-md p-2.5 text-xs ${KIND_TONE[memory.kind]}`}>
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex items-center gap-1.5">
          <span className="uppercase tracking-wider font-semibold text-[10px] opacity-70">
            {kindLabel}
          </span>
          <span className="font-semibold">{memory.title}</span>
        </div>
        <button
          onClick={() => onDelete(memory.id)}
          className="opacity-40 hover:opacity-100 transition-opacity"
          title={deleteTitle}
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
      <p className="leading-snug opacity-90">{memory.body}</p>
    </div>
  );
}

function EmptyChatHint({
  title,
  hint,
  exampleA,
  exampleB,
}: {
  title: string;
  hint: string;
  exampleA: string;
  exampleB: string;
}) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-6">
      <Brain className="w-12 h-12 text-amber-400 mb-4" />
      <h3 className="text-lg font-semibold text-slate-900 mb-2">{title}</h3>
      <p className="text-sm text-slate-500 max-w-md leading-relaxed">{hint}</p>
      <div className="mt-6 grid gap-2 text-xs text-slate-600 max-w-md">
        <code className="bg-slate-50 border border-slate-200 rounded px-3 py-2 text-left">
          {exampleA}
        </code>
        <code className="bg-slate-50 border border-slate-200 rounded px-3 py-2 text-left">
          {exampleB}
        </code>
      </div>
    </div>
  );
}

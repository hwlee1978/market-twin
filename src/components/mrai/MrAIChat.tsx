"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Brain, Loader2, Send, Trash2, MessageSquarePlus } from "lucide-react";
import { AgentTrace, type AgentTraceData } from "./AgentTrace";
import { FeedbackButtons } from "./FeedbackButtons";

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

type ChatTurn = { role: "user" | "assistant"; content: string; trace?: AgentTraceData; messageId?: string };

const KIND_TONE: Record<MemoryKind, string> = {
  fact: "bg-amber-50 text-amber-900 border-amber-200",
  preference: "bg-sky-50 text-sky-900 border-sky-200",
  context: "bg-emerald-50 text-emerald-900 border-emerald-200",
  decision: "bg-violet-50 text-violet-900 border-violet-200",
};

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
  const [activeConvoId, setActiveConvoId] = useState<string | null>(null);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastNewMemoryCount, setLastNewMemoryCount] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, loading]);

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
        trace?: AgentTraceData;
      };
      setActiveConvoId(data.conversationId);
      setTurns((prev) => [
        ...prev,
        { role: "assistant", content: data.assistantMessage, trace: data.trace, messageId: data.assistantMessageId },
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
    <div className="grid grid-cols-[240px_1fr_320px] gap-4 h-[calc(100vh-380px)] min-h-[480px]">
      {/* Threads sidebar */}
      <aside className="bg-white border border-slate-200 rounded-lg overflow-hidden flex flex-col">
        <div className="p-3 border-b border-slate-200">
          <button
            onClick={newConversation}
            className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md"
          >
            <MessageSquarePlus className="w-4 h-4" />
            {tChat("newConversation")}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <p className="px-4 py-6 text-xs text-slate-400">{tChat("noConversations")}</p>
          ) : (
            <ul className="py-1">
              {conversations.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => loadConversation(c.id)}
                    className={`w-full text-left px-3 py-2 text-sm truncate hover:bg-slate-50 ${
                      activeConvoId === c.id ? "bg-amber-50 text-amber-900" : "text-slate-700"
                    }`}
                    title={c.title ?? tChat("untitled")}
                  >
                    {c.title ?? tChat("untitled")}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      {/* Chat pane */}
      <section className="bg-white border border-slate-200 rounded-lg flex flex-col overflow-hidden">
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
          className="border-t border-slate-200 p-3 flex items-end gap-2"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder={tChat("inputPlaceholder")}
            rows={2}
            disabled={loading}
            className="flex-1 resize-none text-sm border border-slate-200 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:bg-slate-50"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-amber-500 hover:bg-amber-600 disabled:bg-slate-300 rounded-md"
          >
            <Send className="w-4 h-4" />
            {tChat("send")}
          </button>
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
    <div className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}>
      <div
        className={`max-w-[80%] rounded-lg px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? "bg-slate-900 text-white"
            : "bg-slate-50 text-slate-900 border border-slate-200"
        }`}
      >
        {turn.content}
      </div>
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

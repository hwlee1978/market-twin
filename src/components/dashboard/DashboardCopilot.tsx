"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, Send, X, Loader2 } from "lucide-react";

/**
 * Scoped market-entry copilot for the dashboard.
 *
 * Deliberately slim: it reuses the existing Mr.AI chat backend
 * (`POST /api/mrai/chat`) — same workspace memory + agentic answers —
 * but exposes ONLY a focused strategy Q&A drawer. It does NOT surface
 * the full Mr.AI marketing OS (conversation list, memory panel, PDF
 * ingest, content/channel/SEO tabs), which stays gated to the
 * mrai.markettwin.ai host. If we later want the whole suite here, we
 * flip `mraiEnabled` in AppShell instead.
 *
 * Grounding: we seed the welcome + suggested prompts with the user's
 * latest recommended market so the very first question lands in context.
 * The backend already answers from workspace memory (which accumulates
 * simulation outcomes), so answers stay tied to the user's own data.
 */

type Turn = { role: "user" | "assistant"; content: string };

const COPY = {
  ko: {
    launch: "AI 코파일럿",
    title: "AI 코파일럿",
    subtitle: "진출 전략, 데이터로 답해드려요",
    close: "닫기",
    placeholder: "진출 전략에 대해 무엇이든 물어보세요…",
    send: "보내기",
    thinking: "생각하는 중…",
    error: "답변을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.",
    welcome: (market: string | null) =>
      market
        ? `안녕하세요! 시장 진출 전략을 돕는 AI 코파일럿이에요. 최근 분석에서 추천된 **${market}** 시장을 포함해, 결과를 바탕으로 무엇이든 물어보세요.`
        : "안녕하세요! 시장 진출 전략을 돕는 AI 코파일럿이에요. 시뮬레이션 결과를 바탕으로 무엇이든 물어보세요.",
    suggest: (market: string | null) =>
      [
        market ? `${market} 진출의 가장 큰 리스크는?` : "내 결과에서 가장 큰 리스크는?",
        "다음에 뭘 해야 할까?",
        "추천 가격대의 근거가 뭐야?",
        market ? `${market} 경쟁사 대응 전략 알려줘` : "경쟁사 대응 전략 알려줘",
      ],
    contextChip: (market: string) => `기준 시장 · ${market}`,
  },
  en: {
    launch: "AI Copilot",
    title: "AI Copilot",
    subtitle: "Market-entry strategy, answered with data",
    close: "Close",
    placeholder: "Ask anything about your market-entry strategy…",
    send: "Send",
    thinking: "Thinking…",
    error: "Couldn't load a reply. Please try again in a moment.",
    welcome: (market: string | null) =>
      market
        ? `Hi! I'm your market-entry strategy copilot. Ask me anything grounded in your results — including your recommended market, **${market}**.`
        : "Hi! I'm your market-entry strategy copilot. Ask me anything grounded in your simulation results.",
    suggest: (market: string | null) =>
      [
        market ? `Biggest risk of entering ${market}?` : "What's the biggest risk in my results?",
        "What should I do next?",
        "Why is that the recommended price range?",
        market ? `How do I compete in ${market}?` : "How do I respond to competitors?",
      ],
    contextChip: (market: string) => `Context · ${market}`,
  },
} as const;

export function DashboardCopilot({
  locale,
  recommendedMarket = null,
  productName = null,
}: {
  locale: string;
  recommendedMarket?: string | null;
  productName?: string | null;
}) {
  const isKo = locale !== "en";
  const S = isKo ? COPY.ko : COPY.en;

  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, loading]);

  // Focus the input when the drawer opens; close on Escape.
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || loading) return;
    setError(null);
    setInput("");
    setTurns((prev) => [...prev, { role: "user", content: message }]);
    setLoading(true);
    try {
      const res = await fetch("/api/mrai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          conversationId,
          locale: isKo ? "ko" : "en",
        }),
      });
      const data = (await res.json().catch(() => null)) as
        | { conversationId?: string; assistantMessage?: string }
        | null;
      if (!res.ok || !data?.assistantMessage) {
        setError(S.error);
      } else {
        if (data.conversationId) setConversationId(data.conversationId);
        setTurns((prev) => [...prev, { role: "assistant", content: data.assistantMessage! }]);
      }
    } catch {
      setError(S.error);
    } finally {
      setLoading(false);
    }
  }

  const suggestions = S.suggest(recommendedMarket);
  const showIntro = turns.length === 0;

  return (
    <>
      {/* Floating launcher */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 rounded-full px-5 py-3.5 text-sm font-semibold text-white shadow-lg transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          style={{
            background: "linear-gradient(135deg,#4f46e5 0%,#1e4d8f 55%,#06b6d4 100%)",
            boxShadow: "0 12px 30px -10px rgba(30,77,143,.7)",
          }}
          aria-label={S.launch}
        >
          <Sparkles size={18} />
          {S.launch}
        </button>
      )}

      {/* Overlay + drawer */}
      {open && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={S.title}>
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-0 flex h-full w-full max-w-[440px] flex-col bg-white shadow-2xl motion-safe:animate-[copilotIn_.22s_ease-out]">
            <style>{`@keyframes copilotIn{from{transform:translateX(24px);opacity:.4}to{transform:translateX(0);opacity:1}}`}</style>

            {/* Header */}
            <div
              className="relative flex items-start justify-between gap-3 px-5 py-4 text-white"
              style={{ background: "linear-gradient(135deg,#0b2a5b 0%,#1e4d8f 60%,#06b6d4 130%)" }}
            >
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/15">
                  <Sparkles size={20} />
                </span>
                <div>
                  <div className="text-[15px] font-bold leading-tight">{S.title}</div>
                  <div className="mt-0.5 text-[12px] text-white/80">{S.subtitle}</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-white/80 hover:bg-white/15 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                aria-label={S.close}
              >
                <X size={18} />
              </button>
            </div>

            {(recommendedMarket || productName) && (
              <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50 px-5 py-2">
                {recommendedMarket && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-brand ring-1 ring-brand-100">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                    {S.contextChip(recommendedMarket)}
                  </span>
                )}
                {productName && (
                  <span className="inline-flex items-center rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 ring-1 ring-slate-200">
                    {productName}
                  </span>
                )}
              </div>
            )}

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
              {showIntro && (
                <>
                  <div className="rounded-2xl rounded-tl-sm bg-slate-100 px-4 py-3 text-sm leading-relaxed text-slate-700">
                    {renderBold(S.welcome(recommendedMarket))}
                  </div>
                  <div className="space-y-2">
                    {suggestions.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => send(q)}
                        className="block w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-left text-[13px] font-medium text-slate-700 transition-colors hover:border-accent hover:bg-accent-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {turns.map((turn, i) =>
                turn.role === "user" ? (
                  <div key={i} className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-brand px-4 py-2.5 text-sm leading-relaxed text-white">
                      {turn.content}
                    </div>
                  </div>
                ) : (
                  <div key={i} className="flex justify-start">
                    <div className="max-w-[90%] whitespace-pre-wrap rounded-2xl rounded-tl-sm bg-slate-100 px-4 py-3 text-sm leading-relaxed text-slate-800">
                      {renderBold(turn.content)}
                    </div>
                  </div>
                ),
              )}

              {loading && (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 size={15} className="animate-spin" />
                  {S.thinking}
                </div>
              )}
              {error && (
                <div className="rounded-xl border border-risk/30 bg-risk-soft px-3.5 py-2.5 text-[13px] text-risk">
                  {error}
                </div>
              )}
            </div>

            {/* Composer */}
            <div className="border-t border-slate-100 px-4 py-3">
              <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/30">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send(input);
                    }
                  }}
                  rows={1}
                  placeholder={S.placeholder}
                  className="max-h-28 flex-1 resize-none bg-transparent text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => send(input)}
                  disabled={!input.trim() || loading}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-white transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                  aria-label={S.send}
                >
                  <Send size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Minimal **bold** renderer for the welcome/assistant copy — the backend
 * returns light markdown emphasis around market names. We only handle
 * **bold** (no full markdown parser) to keep this dependency-free.
 */
function renderBold(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i} className="font-semibold text-slate-900">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

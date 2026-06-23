"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronRight, FileText, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";

type ContentStrategy = {
  pillar: string;
  keywords: string[];
  hook: string;
  sections: Array<{ h2: string; outline: string }>;
  cta: string;
  formatRecommendations: Record<string, string>;
  suggestedPublishWindow?: string;
  riskNotes?: string[];
};

type Brief = {
  id: string;
  topic: string;
  goal: string | null;
  target_audience: string | null;
  formats: string[] | null;
  tone: string | null;
  status: "planning" | "planned" | "generating" | "ready" | "published" | "archived";
  strategy: ContentStrategy | null;
  locale: "ko" | "en";
  updated_at: string;
};

const STATUS_BADGE: Record<Brief["status"], string> = {
  planning: "bg-amber-100 text-amber-800",
  planned: "bg-emerald-100 text-emerald-800",
  generating: "bg-sky-100 text-sky-800",
  ready: "bg-violet-100 text-violet-800",
  published: "bg-slate-200 text-slate-800",
  archived: "bg-slate-100 text-slate-500",
};

export function ContentPanel({ locale }: { locale: "ko" | "en" }) {
  const t = useTranslations("mrai.content");
  const tStrat = useTranslations("mrai.content.strategy");

  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [adding, setAdding] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    void loadBriefs();
  }, []);

  async function loadBriefs() {
    const res = await fetch("/api/mrai/content/briefs", { cache: "no-store" });
    if (!res.ok) return;
    const data = (await res.json()) as { briefs: Brief[] };
    setBriefs(data.briefs);
  }

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function regenerate(id: string) {
    setBusy(`regen-${id}`);
    try {
      const res = await fetch(`/api/mrai/content/briefs/${id}`, { method: "POST" });
      if (res.ok) await loadBriefs();
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    if (!confirm(t("removeConfirm"))) return;
    setBusy(`del-${id}`);
    const res = await fetch(`/api/mrai/content/briefs/${id}`, { method: "DELETE" });
    if (res.ok) {
      setBriefs((prev) => prev.filter((b) => b.id !== id));
      setExpanded((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
    setBusy(null);
  }

  return (
    <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <header className="flex items-center gap-3 px-5 py-3 border-b border-slate-200 bg-gradient-to-r from-rose-50 to-white">
        <FileText className="w-4 h-4 text-rose-600" />
        <div className="flex-1">
          <h2 className="text-sm font-semibold text-slate-900">{t("title")}</h2>
          <p className="text-xs text-slate-500 mt-0.5">{t("subtitle")}</p>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-md"
        >
          <Plus className="w-3 h-3" />
          {t("newBrief")}
        </button>
      </header>

      <div className="px-5 py-4 space-y-2">
        {adding && (
          <NewBriefForm
            locale={locale}
            onCancel={() => setAdding(false)}
            onSaved={async () => {
              setAdding(false);
              await loadBriefs();
            }}
          />
        )}

        {briefs.length === 0 && !adding ? (
          <p className="text-sm text-slate-500 leading-relaxed">{t("empty")}</p>
        ) : (
          briefs.map((b) => {
            const isOpen = expanded.has(b.id);
            return (
              <div key={b.id} className="border border-slate-200 rounded-md overflow-hidden">
                <button
                  onClick={() => toggle(b.id)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 text-left"
                >
                  {isOpen ? (
                    <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">{b.topic}</div>
                    {b.strategy?.pillar && (
                      <div className="text-[11px] text-slate-500 truncate mt-0.5">
                        {tStrat("pillar")}: {b.strategy.pillar}
                      </div>
                    )}
                  </div>
                  <span
                    className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded ${STATUS_BADGE[b.status]}`}
                  >
                    {b.status}
                  </span>
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 pt-1 border-t border-slate-100 bg-slate-50/30">
                    {b.status === "planning" ? (
                      <div className="text-sm text-slate-500 flex items-center gap-2 py-3">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {t("planning")}
                      </div>
                    ) : b.strategy ? (
                      <StrategyView strategy={b.strategy} tStrat={tStrat} />
                    ) : null}

                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-200">
                      <button
                        onClick={() => regenerate(b.id)}
                        disabled={busy === `regen-${b.id}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-700 border border-slate-200 hover:bg-white rounded"
                      >
                        {busy === `regen-${b.id}` ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <RefreshCw className="w-3 h-3" />
                        )}
                        {t("regenerate")}
                      </button>
                      <button
                        onClick={() => remove(b.id)}
                        disabled={busy === `del-${b.id}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
                      >
                        <Trash2 className="w-3 h-3" />
                        {t("remove")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

function StrategyView({
  strategy,
  tStrat,
}: {
  strategy: ContentStrategy;
  tStrat: (k: string) => string;
}) {
  return (
    <div className="space-y-3 text-sm pt-3">
      <Row label={tStrat("pillar")} value={strategy.pillar} />
      {strategy.hook && <Row label={tStrat("hook")} value={strategy.hook} />}
      {strategy.keywords?.length > 0 && (
        <div>
          <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-1">
            {tStrat("keywords")}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {strategy.keywords.map((k, i) => (
              <span
                key={i}
                className="text-[11px] px-2 py-0.5 bg-rose-100 text-rose-700 rounded"
              >
                {k}
              </span>
            ))}
          </div>
        </div>
      )}
      {strategy.sections?.length > 0 && (
        <div>
          <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-1">
            {tStrat("sections")}
          </div>
          <ol className="list-decimal pl-5 space-y-1">
            {strategy.sections.map((s, i) => (
              <li key={i}>
                <span className="font-medium">{s.h2}</span>
                <span className="text-slate-600"> — {s.outline}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      {strategy.cta && <Row label={tStrat("cta")} value={strategy.cta} />}
      {strategy.formatRecommendations && Object.keys(strategy.formatRecommendations).length > 0 && (
        <div>
          <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-1">
            {tStrat("formats")}
          </div>
          <ul className="space-y-1">
            {Object.entries(strategy.formatRecommendations).map(([k, v]) => (
              <li key={k} className="text-xs">
                <span className="font-mono text-rose-700">{k}</span>: {v}
              </li>
            ))}
          </ul>
        </div>
      )}
      {strategy.suggestedPublishWindow && (
        <Row label={tStrat("publishWindow")} value={strategy.suggestedPublishWindow} />
      )}
      {strategy.riskNotes && strategy.riskNotes.length > 0 && (
        <div>
          <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-1">
            {tStrat("risks")}
          </div>
          <ul className="space-y-1">
            {strategy.riskNotes.map((r, i) => (
              <li key={i} className="text-xs text-amber-700">
                ⚠ {r}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-0.5">{label}</div>
      <div className="text-slate-800">{value}</div>
    </div>
  );
}

function NewBriefForm({
  locale,
  onCancel,
  onSaved,
}: {
  locale: "ko" | "en";
  onCancel: () => void;
  onSaved: () => void;
}) {
  const tForm = useTranslations("mrai.content.form");
  const [topic, setTopic] = useState("");
  const [goal, setGoal] = useState("");
  const [audience, setAudience] = useState("");
  const [formats, setFormats] = useState<Set<string>>(new Set(["blog", "linkedin"]));
  const [tone, setTone] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const ALL_FORMATS = ["blog", "linkedin", "threads", "email", "twitter"];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/mrai/content/briefs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          topic,
          goal: goal || undefined,
          targetAudience: audience || undefined,
          formats: Array.from(formats),
          tone: tone || undefined,
          locale,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || err.error || "save_failed");
      }
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="border border-rose-200 bg-rose-50/30 rounded-md p-3 space-y-3">
      <input
        type="text"
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        placeholder={tForm("topicPlaceholder")}
        required
        className="w-full text-sm border border-slate-200 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-rose-300"
      />
      <input
        type="text"
        value={goal}
        onChange={(e) => setGoal(e.target.value)}
        placeholder={tForm("goalPlaceholder")}
        className="w-full text-sm border border-slate-200 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-rose-300"
      />
      <input
        type="text"
        value={audience}
        onChange={(e) => setAudience(e.target.value)}
        placeholder={tForm("audiencePlaceholder")}
        className="w-full text-sm border border-slate-200 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-rose-300"
      />
      <input
        type="text"
        value={tone}
        onChange={(e) => setTone(e.target.value)}
        placeholder={tForm("tonePlaceholder")}
        className="w-full text-sm border border-slate-200 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-rose-300"
      />
      <div>
        <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-1">
          {tForm("formats")}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {ALL_FORMATS.map((f) => {
            const on = formats.has(f);
            return (
              <button
                key={f}
                type="button"
                onClick={() => {
                  setFormats((prev) => {
                    const next = new Set(prev);
                    if (next.has(f)) next.delete(f);
                    else next.add(f);
                    return next;
                  });
                }}
                className={`text-xs px-2.5 py-1 rounded border ${
                  on
                    ? "bg-rose-600 text-white border-rose-600"
                    : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                }`}
              >
                {f}
              </button>
            );
          })}
        </div>
      </div>

      {err && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">{err}</div>
      )}

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded"
        >
          {tForm("cancel")}
        </button>
        <button
          type="submit"
          disabled={busy || !topic.trim()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 rounded"
        >
          {busy && <Loader2 className="w-3 h-3 animate-spin" />}
          {tForm("submit")}
        </button>
      </div>
    </form>
  );
}

"use client";

import { useMemo, useState } from "react";
import {
  FileText,
  Check,
  Loader2,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from "lucide-react";
import { clsx } from "clsx";

export type MemoryCandidate = {
  kind: "fact" | "preference" | "context" | "decision";
  title: string;
  body: string;
  rationale: string;
  duplicate?: boolean;
};

const KIND_LABEL: Record<MemoryCandidate["kind"], { ko: string; en: string; tone: string }> = {
  fact: { ko: "사실", en: "Fact", tone: "bg-amber-100 text-amber-800 border-amber-200" },
  preference: { ko: "선호", en: "Pref", tone: "bg-sky-100 text-sky-800 border-sky-200" },
  context: { ko: "컨텍스트", en: "Context", tone: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  decision: { ko: "결정", en: "Decision", tone: "bg-violet-100 text-violet-800 border-violet-200" },
};

export function MemoryPreviewCard({
  candidates: initial,
  filename,
  costEstimateUsd,
}: {
  candidates: MemoryCandidate[];
  filename: string;
  costEstimateUsd: number;
}) {
  // Pre-select non-duplicates. Duplicates start unchecked + visually
  // dimmed so users don't accidentally re-create existing memories.
  const initialSelected = useMemo(
    () =>
      new Set(
        initial
          .map((_, i) => i)
          .filter((i) => !initial[i].duplicate),
      ),
    [initial],
  );
  const [selected, setSelected] = useState<Set<number>>(initialSelected);
  const [expanded, setExpanded] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (i: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const selectAll = () => {
    setSelected(new Set(initial.map((_, i) => i)));
  };
  const selectNone = () => {
    setSelected(new Set());
  };

  const save = async () => {
    if (selected.size === 0) return;
    setSaving(true);
    setError(null);
    try {
      const memories = Array.from(selected)
        .sort((a, b) => a - b)
        .map((i) => ({
          kind: initial[i].kind,
          title: initial[i].title,
          body: initial[i].body,
        }));
      const res = await fetch("/api/mrai/memories/bulk", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ memories }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(typeof json.detail === "string" ? json.detail : "저장 실패");
        return;
      }
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setSaving(false);
    }
  };

  if (saved) {
    return (
      <section className="rounded-xl border-2 border-emerald-200 bg-emerald-50/40 p-4 mt-2 flex items-start gap-3">
        <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-emerald-600 text-white shrink-0">
          <Check size={16} />
        </span>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-emerald-900">
            {selected.size}개 메모리 저장됨 ({filename})
          </h3>
          <p className="text-xs text-emerald-700 mt-0.5">
            다음 Briefing·Chat·채널 추천부터 자동 반영됩니다.
          </p>
        </div>
      </section>
    );
  }

  const newCount = initial.filter((c) => !c.duplicate).length;
  const dupCount = initial.length - newCount;

  return (
    <section className="rounded-xl border-2 border-amber-200 bg-gradient-to-br from-amber-50/50 to-orange-50/40 p-4 mt-2">
      <header className="flex items-start gap-3 mb-3">
        <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-amber-600 text-white shrink-0">
          <FileText size={16} />
        </span>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-amber-900">
            PDF에서 메모리 후보 {initial.length}개 추출
          </h3>
          <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
            <span className="font-mono">{filename}</span> · 신규 {newCount}개
            {dupCount > 0 && ` · 중복 ${dupCount}개 (체크 해제됨)`}
            <span className="ml-2 text-[10px] text-amber-600">
              · cost ${costEstimateUsd.toFixed(3)}
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-amber-700 hover:text-amber-900 p-1"
        >
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </header>

      {expanded && (
        <>
          <div className="flex items-center gap-2 mb-2 text-[11px]">
            <button
              type="button"
              onClick={selectAll}
              className="text-amber-700 hover:text-amber-900 underline"
            >
              모두 선택
            </button>
            <span className="text-amber-300">·</span>
            <button
              type="button"
              onClick={selectNone}
              className="text-amber-700 hover:text-amber-900 underline"
            >
              모두 해제
            </button>
            <span className="text-amber-400 ml-auto">
              {selected.size} / {initial.length} 선택됨
            </span>
          </div>
          <div className="space-y-1.5 max-h-[420px] overflow-y-auto">
            {initial.map((c, i) => {
              const isSel = selected.has(i);
              const kindMeta = KIND_LABEL[c.kind];
              return (
                <div
                  key={i}
                  className={clsx(
                    "border rounded-md px-3 py-2.5 transition-colors",
                    isSel
                      ? "border-amber-400 bg-white"
                      : c.duplicate
                      ? "border-slate-200 bg-slate-50/60 opacity-60"
                      : "border-slate-200 bg-white hover:bg-amber-50/40",
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    <button
                      type="button"
                      onClick={() => toggle(i)}
                      className={clsx(
                        "shrink-0 w-5 h-5 rounded border-2 inline-flex items-center justify-center mt-0.5 transition-colors",
                        isSel
                          ? "bg-amber-500 border-amber-500 text-white"
                          : "border-slate-300 hover:border-amber-400 bg-white",
                      )}
                      aria-label={isSel ? "deselect" : "select"}
                    >
                      {isSel && <Check size={12} />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className={clsx(
                            "text-[10px] px-1.5 py-0.5 rounded border font-semibold uppercase tracking-wider",
                            kindMeta.tone,
                          )}
                        >
                          {kindMeta.ko}
                        </span>
                        <span className="text-sm font-semibold text-slate-900">
                          {c.title}
                        </span>
                        {c.duplicate && (
                          <span className="text-[9px] uppercase tracking-wider text-slate-500 bg-slate-200 px-1.5 py-0.5 rounded">
                            중복
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-700 mt-1 leading-relaxed whitespace-pre-wrap">
                        {c.body}
                      </p>
                      {c.rationale && (
                        <p className="text-[11px] text-amber-700 mt-1 italic flex items-start gap-1">
                          <Sparkles size={10} className="mt-0.5 shrink-0" />
                          {c.rationale}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <div className="mt-3 flex items-center justify-between">
        <span className="text-[11px] text-amber-700">
          저장 후 즉시 Briefing·Chat·채널 추천에 반영
        </span>
        <button
          type="button"
          onClick={save}
          disabled={saving || selected.size === 0}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-md"
        >
          {saving ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              저장 중...
            </>
          ) : (
            <>
              <Check size={14} />
              {selected.size}개 메모리에 추가
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="mt-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </div>
      )}
    </section>
  );
}

"use client";

import { useEffect, useState } from "react";
import {
  Globe,
  Newspaper,
  Swords,
  Plus,
  Trash2,
  RefreshCw,
  Loader2,
  X as CloseX,
  Power,
  Pencil,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

type Source = {
  id: string;
  source_type: "self_website" | "news_rss" | "competitor";
  url: string;
  label: string | null;
  brand_filter: string | null;
  enabled: boolean;
  fetch_interval_hours: number;
  last_fetched_at: string | null;
  last_error: string | null;
  fail_count: number;
  memories_emitted: number;
  created_at: string;
};

const TYPE_META: Record<Source["source_type"], { label: string; icon: typeof Globe; color: string }> = {
  self_website: { label: "자사 웹사이트", icon: Globe, color: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  news_rss: { label: "뉴스 RSS", icon: Newspaper, color: "text-sky-700 bg-sky-50 border-sky-200" },
  competitor: { label: "경쟁사", icon: Swords, color: "text-rose-700 bg-rose-50 border-rose-200" },
};

function fmtAgo(iso: string | null): string {
  if (!iso) return "한 번도 없음";
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "방금 전";
  if (mins < 60) return `${mins}분 전`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}시간 전`;
  return `${Math.floor(hrs / 24)}일 전`;
}

export function CrawlSourcesPanel() {
  const [sources, setSources] = useState<Source[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchingIds, setFetchingIds] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState(false);

  const load = async () => {
    setError(null);
    const res = await fetch("/api/mrai/crawl-sources", { cache: "no-store" });
    if (!res.ok) {
      setError("크롤 소스 목록을 불러올 수 없습니다");
      return;
    }
    const { sources: data } = (await res.json()) as { sources: Source[] };
    setSources(data);
  };

  useEffect(() => {
    void load();
  }, []);

  const remove = async (id: string) => {
    if (!confirm("이 크롤 소스를 삭제할까요? 이미 생성된 메모리는 유지됩니다.")) return;
    const res = await fetch(`/api/mrai/crawl-sources/${id}`, { method: "DELETE" });
    if (res.ok) setSources((prev) => prev?.filter((s) => s.id !== id) ?? null);
  };

  const toggle = async (id: string, enabled: boolean) => {
    const res = await fetch(`/api/mrai/crawl-sources/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    if (res.ok) {
      setSources((prev) => prev?.map((s) => (s.id === id ? { ...s, enabled } : s)) ?? null);
    }
  };

  const editUrl = async (s: Source) => {
    const next = prompt("새 URL 입력:", s.url);
    if (!next || next === s.url) return;
    const res = await fetch(`/api/mrai/crawl-sources/${s.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: next.trim() }),
    });
    const json = await res.json();
    if (!res.ok) {
      alert(`❌ ${json.detail ?? json.error ?? "수정 실패"}`);
      return;
    }
    setSources((prev) =>
      prev?.map((row) =>
        row.id === s.id
          ? {
              ...row,
              url: next.trim(),
              last_fetched_at: null,
              last_error: null,
              fail_count: 0,
            }
          : row,
      ) ?? null,
    );
  };

  const fetchNow = async (id: string) => {
    setFetchingIds((prev) => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/mrai/crawl-sources/${id}/fetch`, { method: "POST" });
      const json = await res.json();
      // Refresh source row from server
      await load();
      if (json.status === "ok") {
        alert(`✓ 새 메모리 ${json.memories_added}개 생성됨`);
      } else if (json.status === "no_change") {
        alert("변경 없음 — 이전 fetch 이후 새 콘텐츠가 없습니다");
      } else {
        alert(`❌ 실패: ${json.error ?? "알 수 없는 오류"}`);
      }
    } finally {
      setFetchingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const sourceCount = sources?.length ?? 0;
  const errorCount = sources?.filter((s) => s.fail_count > 2).length ?? 0;
  const totalMemories = sources?.reduce((s, x) => s + x.memories_emitted, 0) ?? 0;

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="flex-1 min-w-0 text-left flex items-start gap-2 hover:opacity-80"
        >
          <span className="shrink-0 mt-0.5 text-slate-400">
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </span>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2 flex-wrap">
              🕷 자동 크롤링 소스
              {sourceCount > 0 && (
                <span className="text-[10px] font-normal text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                  {sourceCount}개 등록 · 누적 메모리 {totalMemories}
                </span>
              )}
              {errorCount > 0 && (
                <span className="text-[10px] font-semibold text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded">
                  ⚠ {errorCount}개 오류
                </span>
              )}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              자사 웹사이트 / 뉴스 RSS / 경쟁사 페이지를 매일 02:30 KST에 자동 크롤링하여 새 메모리로 변환.
            </p>
          </div>
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(true);
            setCreating(true);
          }}
          className="shrink-0 inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-slate-900 text-white text-xs font-medium hover:bg-slate-800"
        >
          <Plus className="w-3.5 h-3.5" /> 소스 추가
        </button>
      </div>
      {expanded && (
      <div className="px-5 py-4">
        {error && <p className="text-xs text-red-600 mb-3">{error}</p>}
        {sources === null ? (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> 불러오는 중…
          </div>
        ) : sources.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-4">
            아직 등록된 크롤 소스가 없습니다.
            <br />
            <strong>추천 첫 시작</strong>: 자사 웹사이트(예: <code>https://lemouton.com</code>) + 네이버 뉴스 RSS (브랜드명 검색) + Allbirds/Veja 신상 페이지
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {sources.map((s) => {
              const meta = TYPE_META[s.source_type];
              const Icon = meta.icon;
              const isFetching = fetchingIds.has(s.id);
              return (
                <li key={s.id} className="py-3 flex items-start gap-3">
                  <span
                    className={`shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-lg border ${meta.color}`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-900 truncate">
                        {s.label || s.url}
                      </span>
                      <span
                        className={`text-[10px] uppercase tracking-wider border px-1.5 py-0.5 rounded ${meta.color}`}
                      >
                        {meta.label}
                      </span>
                      {!s.enabled && (
                        <span className="text-[10px] uppercase text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                          paused
                        </span>
                      )}
                      {s.fail_count > 2 && (
                        <span className="text-[10px] uppercase text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded">
                          ⚠ {s.fail_count}회 실패
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 truncate mt-0.5 flex items-center gap-1">
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:underline truncate"
                      >
                        {s.url}
                      </a>
                      <button
                        type="button"
                        onClick={() => editUrl(s)}
                        className="text-slate-400 hover:text-slate-700 shrink-0"
                        title="URL 수정"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    </div>
                    {s.brand_filter && (
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        🔍 필터: <code>{s.brand_filter}</code>
                      </div>
                    )}
                    <div className="text-[10px] text-slate-500 mt-1 flex gap-3 flex-wrap">
                      <span>마지막: {fmtAgo(s.last_fetched_at)}</span>
                      <span>주기: {s.fetch_interval_hours}h</span>
                      <span className="text-emerald-700">
                        +{s.memories_emitted} 메모리 누적
                      </span>
                    </div>
                    {s.last_error && (
                      <div className="text-[10px] text-red-600 mt-0.5 truncate">
                        ❌ {s.last_error}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => fetchNow(s.id)}
                      disabled={isFetching}
                      title="지금 fetch"
                      className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-200 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {isFetching ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3 h-3" />
                      )}
                      {isFetching ? "fetch…" : "지금"}
                    </button>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => toggle(s.id, !s.enabled)}
                        className="text-slate-400 hover:text-slate-700 p-1"
                        title={s.enabled ? "일시정지" : "활성화"}
                      >
                        <Power className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(s.id)}
                        className="text-slate-300 hover:text-red-600 p-1"
                        title="삭제"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      )}

      {creating && (
        <CreateModal
          onClose={() => setCreating(false)}
          onCreated={(s) => {
            setSources((prev) => [s, ...(prev ?? [])]);
            setCreating(false);
          }}
        />
      )}
    </div>
  );
}

type Preset = {
  id: string;
  group: string;
  icon: string;
  label: string;
  description: string;
  source_type: Source["source_type"];
  fetch_interval_hours: number;
  url: string;
  label_text: string;
  brand_filter: string | null;
  edit_hints: { query?: string; brand_filter?: string };
};

function CreateModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (s: Source) => void;
}) {
  const [tab, setTab] = useState<"preset" | "manual">("preset");
  const [presets, setPresets] = useState<Preset[] | null>(null);
  const [presetsLoading, setPresetsLoading] = useState(true);
  const [busyPreset, setBusyPreset] = useState<string | null>(null);

  const [sourceType, setSourceType] = useState<Source["source_type"]>("self_website");
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [hours, setHours] = useState(24);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Load presets when modal opens
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/mrai/crawl-sources/presets", {
          cache: "no-store",
        });
        if (!res.ok) {
          setPresets([]);
          return;
        }
        const json = (await res.json()) as { presets: Preset[] };
        setPresets(json.presets);
      } finally {
        setPresetsLoading(false);
      }
    })();
  }, []);

  const addPreset = async (p: Preset) => {
    if (!p.url) {
      setErr("자사 도메인이 SEO 등록 안 됨 — '직접 입력' 탭에서 URL 직접 입력하세요");
      return;
    }
    setBusyPreset(p.id);
    setErr(null);
    try {
      const res = await fetch("/api/mrai/crawl-sources", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source_type: p.source_type,
          url: p.url,
          label: p.label_text,
          brand_filter: p.brand_filter ?? undefined,
          fetch_interval_hours: p.fetch_interval_hours,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.detail ?? json.error ?? "생성 실패");
      onCreated(json.source as Source);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "생성 실패");
    } finally {
      setBusyPreset(null);
    }
  };

  const submit = async () => {
    if (!url.trim()) {
      setErr("URL을 입력하세요");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/mrai/crawl-sources", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source_type: sourceType,
          url: url.trim(),
          label: label.trim() || undefined,
          brand_filter: brandFilter.trim() || undefined,
          fetch_interval_hours: hours,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.detail ?? json.error ?? "생성 실패");
      onCreated(json.source as Source);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "생성 실패");
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4"
    >
      <div
        className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">새 크롤 소스</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <CloseX className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 pt-3 border-b border-slate-100 flex gap-4">
          <button
            type="button"
            onClick={() => setTab("preset")}
            className={`pb-2 text-sm font-medium border-b-2 ${
              tab === "preset"
                ? "border-slate-900 text-slate-900"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            ⚡ 프리셋 (원클릭)
          </button>
          <button
            type="button"
            onClick={() => setTab("manual")}
            className={`pb-2 text-sm font-medium border-b-2 ${
              tab === "manual"
                ? "border-slate-900 text-slate-900"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            ✏️ 직접 입력
          </button>
        </div>

        {tab === "preset" && (
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {presetsLoading ? (
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> 프리셋 로딩 중…
              </div>
            ) : !presets || presets.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-6">
                프리셋 로드 실패. "직접 입력" 탭으로 진행하세요.
              </p>
            ) : (
              <PresetList
                presets={presets}
                onAdd={addPreset}
                busyPreset={busyPreset}
              />
            )}
            {err && <p className="text-xs text-red-600 mt-3">{err}</p>}
          </div>
        )}

        {tab === "manual" && (
        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">유형</label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.entries(TYPE_META) as Array<[Source["source_type"], typeof TYPE_META[Source["source_type"]]]>).map(
                ([k, v]) => {
                  const Icon = v.icon;
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setSourceType(k)}
                      className={`flex flex-col items-center gap-1 border rounded-md py-2.5 text-xs ${
                        sourceType === k
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {v.label}
                    </button>
                  );
                },
              )}
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              URL <span className="text-red-500">*</span>
            </label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={
                sourceType === "self_website"
                  ? "https://lemouton.com"
                  : sourceType === "news_rss"
                    ? "https://news.google.com/rss/search?q=르무통&hl=ko"
                    : "https://www.on.com/en-us/shop/men"
              }
              className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 bg-white text-slate-900 placeholder:text-slate-400"
            />
            {sourceType === "news_rss" && (
              <p className="text-[10px] text-slate-500 mt-1">
                Google News RSS: <code>news.google.com/rss/search?q=BRAND&hl=ko</code> · Naver News는 검색 결과 URL 사용
              </p>
            )}
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              라벨 (선택)
            </label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={
                sourceType === "self_website"
                  ? "르무통 공식 사이트"
                  : sourceType === "news_rss"
                    ? "Google News: 르무통"
                    : "Allbirds 신상 컬렉션"
              }
              className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 bg-white text-slate-900 placeholder:text-slate-400"
            />
          </div>
          {sourceType === "news_rss" && (
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1">
                브랜드 필터 (선택)
              </label>
              <input
                value={brandFilter}
                onChange={(e) => setBrandFilter(e.target.value)}
                placeholder="르무통"
                className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 bg-white text-slate-900 placeholder:text-slate-400"
              />
              <p className="text-[10px] text-slate-500 mt-1">
                title/description에 이 키워드가 포함된 항목만 메모리로 저장
              </p>
            </div>
          )}
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              fetch 주기
            </label>
            <select
              value={hours}
              onChange={(e) => setHours(Number(e.target.value))}
              className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 bg-white text-slate-900"
            >
              <option value={6}>6시간마다</option>
              <option value={12}>12시간마다</option>
              <option value={24}>1일마다 (권장)</option>
              <option value={72}>3일마다</option>
              <option value={168}>1주마다</option>
            </select>
          </div>
          {err && <p className="text-xs text-red-600">{err}</p>}
        </div>
        )}

        {tab === "manual" && (
        <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="text-sm text-slate-600 hover:text-slate-900 disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="inline-flex items-center gap-1.5 bg-slate-900 text-white text-sm px-3 py-1.5 rounded-md hover:bg-slate-800 disabled:opacity-60"
          >
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {busy ? "생성 중…" : "추가"}
          </button>
        </div>
        )}
      </div>
    </div>
  );
}

function PresetList({
  presets,
  onAdd,
  busyPreset,
}: {
  presets: Preset[];
  onAdd: (p: Preset) => void;
  busyPreset: string | null;
}) {
  const groups: Record<string, Preset[]> = {};
  for (const p of presets) {
    (groups[p.group] ??= []).push(p);
  }
  return (
    <div className="space-y-5">
      {Object.entries(groups).map(([group, items]) => (
        <div key={group}>
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">
            {group}
          </div>
          <ul className="space-y-2">
            {items.map((p) => (
              <li
                key={p.id}
                className="rounded-lg border border-slate-200 hover:border-slate-300 px-3 py-2.5 flex items-start gap-3"
              >
                <span className="shrink-0 text-2xl">{p.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-900">{p.label}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{p.description}</div>
                  {p.url && (
                    <div className="text-[10px] text-slate-400 truncate mt-1 font-mono">
                      {p.url.length > 100 ? p.url.slice(0, 100) + "…" : p.url}
                    </div>
                  )}
                  {!p.url && (
                    <div className="text-[10px] text-amber-700 mt-1">
                      ⚠ 자사 도메인 미등록 — 브랜드 SEO 패널에서 사이트 추가 후 시도
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onAdd(p)}
                  disabled={!p.url || busyPreset === p.id}
                  className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-slate-900 text-white text-xs font-medium hover:bg-slate-800 disabled:opacity-40"
                >
                  {busyPreset === p.id ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    "+ 추가"
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

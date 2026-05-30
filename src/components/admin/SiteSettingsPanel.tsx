"use client";

import { useState } from "react";
import { Loader2, ToggleLeft, ToggleRight, AlertTriangle, Check } from "lucide-react";

type Setting = {
  key: string;
  value: unknown;
  description: string | null;
  updated_at: string;
  updated_by: string | null;
};

/**
 * Display labels for each setting key. New flags get a row here so
 * super-admins see human-readable copy instead of raw keys. Unmapped
 * keys still render with the key as title.
 */
const SETTING_META: Record<
  string,
  { title: string; description: string; warningOn?: string }
> = {
  signup_enabled: {
    title: "회원가입 공개",
    description:
      "off = /signup에서 'Coming Soon' 화면 + 대기자 mailto. on = 실제 SignupForm 노출, 누구나 가입 가능.",
    warningOn:
      "공개 시 무료 시드 이용 가능 — abuse rate-limit + LLM 비용 모니터링 필수.",
  },
};

export function SiteSettingsPanel({ initialSettings }: { initialSettings: Setting[] }) {
  const [settings, setSettings] = useState(initialSettings);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  async function flip(key: string, currentValue: unknown) {
    if (typeof currentValue !== "boolean") {
      setError(`${key}는 boolean이 아닙니다 (직접 편집 미지원)`);
      return;
    }
    const next = !currentValue;
    setBusy(key);
    setError(null);
    try {
      const res = await fetch("/api/admin/app-settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key, value: next }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? "flip 실패");
      }
      setSettings((prev) =>
        prev.map((s) =>
          s.key === key ? { ...s, value: next, updated_at: new Date().toISOString() } : s,
        ),
      );
      setToast(`${key} = ${next ? "on" : "off"} 적용됨`);
      setTimeout(() => setToast(null), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "flip 실패");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      {toast && (
        <div className="rounded-md bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-800 flex items-center gap-2">
          <Check className="w-3.5 h-3.5" />
          {toast}
        </div>
      )}
      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5" />
          {error}
        </div>
      )}

      {settings.length === 0 && (
        <p className="text-sm text-slate-500">설정 항목이 없습니다.</p>
      )}

      {settings.map((s) => {
        const meta = SETTING_META[s.key];
        const isBool = typeof s.value === "boolean";
        const on = s.value === true;
        return (
          <div
            key={s.key}
            className="rounded-xl border border-slate-200 bg-white px-5 py-4"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-slate-900">
                  {meta?.title ?? s.key}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  {meta?.description ?? s.description ?? "(설명 없음)"}
                </p>
                <div className="mt-2 text-[10px] text-slate-400">
                  키: <code className="text-slate-600">{s.key}</code>
                  {" · "}
                  현재 값: <code className="text-slate-600">{JSON.stringify(s.value)}</code>
                  {" · "}
                  마지막 변경: {new Date(s.updated_at).toLocaleString("ko-KR")}
                </div>
                {on && meta?.warningOn && (
                  <div className="mt-2 rounded-md bg-amber-50 border border-amber-200 px-2.5 py-1.5 text-[11px] text-amber-800 flex items-start gap-1.5">
                    <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                    {meta.warningOn}
                  </div>
                )}
              </div>
              {isBool ? (
                <button
                  type="button"
                  onClick={() => void flip(s.key, s.value)}
                  disabled={busy === s.key}
                  className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition ${
                    on
                      ? "bg-emerald-600 text-white hover:bg-emerald-700"
                      : "bg-slate-200 text-slate-700 hover:bg-slate-300"
                  } disabled:opacity-60`}
                >
                  {busy === s.key ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : on ? (
                    <ToggleRight className="w-4 h-4" />
                  ) : (
                    <ToggleLeft className="w-4 h-4" />
                  )}
                  {on ? "ON" : "OFF"}
                </button>
              ) : (
                <span className="shrink-0 text-xs text-slate-500">
                  (boolean 아님)
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Loader2, Settings as SettingsIcon, ChevronDown, ChevronRight } from "lucide-react";

type Settings = {
  logo_position: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center";
  logo_size_pct: number;
  logo_padding_pct: number;
  logo_opacity: number;
  logo_with_backdrop: boolean;
  logo_composite_enabled: boolean;
  logo_placement_mode: "product_surface" | "corner_watermark";
  use_library_photo_as_base: boolean;
  prompt_strictness: "creative" | "balanced" | "strict";
  quality: "low" | "medium" | "high";
};

const POSITIONS: Array<{ value: Settings["logo_position"]; label: string; emoji: string }> = [
  { value: "top-left", label: "좌상", emoji: "↖" },
  { value: "top-right", label: "우상", emoji: "↗" },
  { value: "center", label: "중앙", emoji: "·" },
  { value: "bottom-left", label: "좌하", emoji: "↙" },
  { value: "bottom-right", label: "우하 (권장)", emoji: "↘" },
];

const QUALITY_OPTIONS: Array<{ value: Settings["quality"]; label: string; cost: string }> = [
  { value: "low", label: "Low (빠름)", cost: "~$0.011/장" },
  { value: "medium", label: "Medium (권장)", cost: "~$0.042/장" },
  { value: "high", label: "High (정밀)", cost: "~$0.167/장" },
];

const STRICTNESS: Array<{ value: Settings["prompt_strictness"]; label: string; desc: string }> = [
  { value: "creative", label: "Creative", desc: "씬 다양성 ↑, 텍스트 환각 위험 ↑" },
  { value: "balanced", label: "Balanced", desc: "기본 균형" },
  { value: "strict", label: "Strict (권장)", desc: "텍스트 환각 차단 + 보수적 구도" },
];

export function ImageGenSettingsPanel() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const res = await fetch("/api/mrai/image-gen-settings", { cache: "no-store" });
    if (!res.ok) {
      setError("설정 로드 실패");
      return;
    }
    const { settings: data } = (await res.json()) as { settings: Settings };
    setSettings({
      ...data,
      logo_size_pct: Number(data.logo_size_pct),
      logo_padding_pct: Number(data.logo_padding_pct),
      logo_opacity: Number(data.logo_opacity),
    });
  };

  useEffect(() => {
    void load();
  }, []);

  const patch = async (partial: Partial<Settings>) => {
    if (!settings) return;
    const optimistic = { ...settings, ...partial };
    setSettings(optimistic);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/mrai/image-gen-settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(partial),
      });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.detail ?? j.error ?? "저장 실패");
      }
      const { settings: server } = (await res.json()) as { settings: Settings };
      setSettings({
        ...server,
        logo_size_pct: Number(server.logo_size_pct),
        logo_padding_pct: Number(server.logo_padding_pct),
        logo_opacity: Number(server.logo_opacity),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패");
      // Roll back optimistic
      void load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full px-5 py-4 flex items-start justify-between gap-3 hover:bg-slate-50/50 text-left"
      >
        <div className="flex items-start gap-2">
          <span className="shrink-0 mt-0.5 text-slate-400">
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </span>
          <div>
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <SettingsIcon className="w-4 h-4 text-indigo-600" />
              이미지 생성 설정
              {saving && <Loader2 className="w-3 h-3 animate-spin text-slate-400" />}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              로고 합성 위치 · 품질 티어 · 프롬프트 엄격도 — 모든 새 이미지 생성에 적용됨.
            </p>
          </div>
        </div>
        {settings && (
          <div className="shrink-0 text-[10px] text-slate-500 text-right hidden sm:block">
            {settings.use_library_photo_as_base ? "🎨 Touchup ON" : "텍스트→이미지"}
            <br />
            {settings.logo_composite_enabled
              ? settings.logo_placement_mode === "product_surface"
                ? "로고 🎯 제품 표면"
                : `로고 ${POSITIONS.find((p) => p.value === settings.logo_position)?.emoji} ${settings.logo_size_pct}%`
              : "로고 합성 OFF"}
            <br />
            품질 {settings.quality}
          </div>
        )}
      </button>

      {expanded && settings && (
        <div className="px-5 py-4 border-t border-slate-100 space-y-4">
          {error && <p className="text-xs text-red-600">{error}</p>}

          {/* Touchup mode — biggest fidelity lever */}
          <div className="rounded-md border border-violet-200 bg-violet-50/40 p-3">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.use_library_photo_as_base}
                onChange={(e) =>
                  patch({ use_library_photo_as_base: e.target.checked })
                }
                className="mt-1"
              />
              <div>
                <div className="text-sm font-semibold text-violet-900">
                  🎨 라이브러리 사진을 base로 사용 (Touchup 모드)
                </div>
                <p className="text-[10px] text-violet-700 mt-0.5 leading-snug">
                  <strong>ON (권장):</strong> 업로드된 실제 제품 사진을 그대로 base로 두고 배경/씬만 AI가 새로 생성. 제품 디자인/색상/세부가 100% 정확하게 유지됨 (gpt-image-1 mask edit).
                  <br />
                  <strong>OFF:</strong> 텍스트 + reference로부터 제품을 처음부터 그림 — 디자인이 실제와 다르게 drift할 수 있음.
                  <br />
                  ※ 라이프스타일 프레임(사람 등장)은 touchup 적용 안 됨 — 사람을 합성할 수 없으므로 기본 모드 사용.
                </p>
              </div>
            </label>
          </div>

          {/* Logo composite */}
          <div className="rounded-md border border-slate-200 p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold text-slate-900">로고 합성 (post-production)</div>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.logo_composite_enabled}
                  onChange={(e) => patch({ logo_composite_enabled: e.target.checked })}
                />
                <span className="text-slate-700">활성화</span>
              </label>
            </div>
            <p className="text-[10px] text-slate-500 mb-3">
              브랜드 자산 라이브러리에 업로드된 로고를 AI 이미지 위에 sharp로 합성. 환각 글자 없음.
            </p>
            {settings.logo_composite_enabled && (
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-slate-500 block mb-1">
                    배치 모드
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => patch({ logo_placement_mode: "product_surface" })}
                      className={`text-xs py-2 px-2 rounded border text-left ${
                        settings.logo_placement_mode === "product_surface"
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <div className="font-semibold">🎯 제품 표면 (권장)</div>
                      <div className="text-[10px] opacity-75 leading-snug mt-0.5">
                        Vision이 신발 텅/사이드 감지 → 정확 합성. +$0.005/장
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => patch({ logo_placement_mode: "corner_watermark" })}
                      className={`text-xs py-2 px-2 rounded border text-left ${
                        settings.logo_placement_mode === "corner_watermark"
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <div className="font-semibold">📌 코너 워터마크</div>
                      <div className="text-[10px] opacity-75 leading-snug mt-0.5">
                        고정 위치 (아래 선택). 무료, 100% 확정 위치.
                      </div>
                    </button>
                  </div>
                </div>
                {settings.logo_placement_mode === "corner_watermark" && (
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-slate-500 block mb-1">
                    워터마크 위치
                  </label>
                  <div className="grid grid-cols-5 gap-1.5">
                    {POSITIONS.map((p) => (
                      <button
                        key={p.value}
                        type="button"
                        onClick={() => patch({ logo_position: p.value })}
                        className={`text-[11px] py-1.5 rounded border ${
                          settings.logo_position === p.value
                            ? "border-slate-900 bg-slate-900 text-white"
                            : "border-slate-200 text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        {p.emoji} {p.label}
                      </button>
                    ))}
                  </div>
                </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <RangeInput
                    label="크기 (% 폭)"
                    value={settings.logo_size_pct}
                    min={3}
                    max={40}
                    step={0.5}
                    onChange={(v) => patch({ logo_size_pct: v })}
                  />
                  <RangeInput
                    label="여백 (% 폭)"
                    value={settings.logo_padding_pct}
                    min={0}
                    max={15}
                    step={0.5}
                    onChange={(v) => patch({ logo_padding_pct: v })}
                  />
                  <RangeInput
                    label="불투명도"
                    value={settings.logo_opacity}
                    min={0.3}
                    max={1}
                    step={0.05}
                    onChange={(v) => patch({ logo_opacity: v })}
                    display={(v) => `${Math.round(v * 100)}%`}
                  />
                  <div className="flex items-end">
                    <label className="flex items-center gap-2 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.logo_with_backdrop}
                        onChange={(e) => patch({ logo_with_backdrop: e.target.checked })}
                      />
                      <span className="text-slate-700">반투명 배경판 (가독성 ↑)</span>
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Quality */}
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              품질 (gpt-image-1)
            </label>
            <div className="grid grid-cols-3 gap-2">
              {QUALITY_OPTIONS.map((q) => (
                <button
                  key={q.value}
                  type="button"
                  onClick={() => patch({ quality: q.value })}
                  className={`text-xs py-2 rounded border ${
                    settings.quality === q.value
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <div className="font-semibold">{q.label}</div>
                  <div className="text-[10px] opacity-75">{q.cost}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Prompt strictness */}
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              프롬프트 엄격도
            </label>
            <div className="grid grid-cols-3 gap-2">
              {STRICTNESS.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => patch({ prompt_strictness: s.value })}
                  className={`text-xs py-2 rounded border ${
                    settings.prompt_strictness === s.value
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <div className="font-semibold">{s.label}</div>
                  <div className="text-[10px] opacity-75">{s.desc}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RangeInput({
  label,
  value,
  min,
  max,
  step,
  onChange,
  display,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  display?: (v: number) => string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <label className="text-[10px] uppercase tracking-wider text-slate-500">{label}</label>
        <span className="text-xs font-mono text-slate-900">
          {display ? display(value) : value}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
    </div>
  );
}

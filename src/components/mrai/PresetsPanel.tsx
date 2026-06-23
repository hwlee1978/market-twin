"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2, Save, Sliders, X, Star } from "lucide-react";
import { EmptyState } from "./EmptyState";

type Preset = {
  id: string;
  workspaceId: string;
  name: string;
  isDefault: boolean;
  tone: string | null;
  voice: string | null;
  targetLength: string | null;
  language: "ko" | "en" | "ja" | "zh";
  hashtagStrategy: string | null;
  doNotUse: string | null;
  referenceExamples: Array<{ snippet: string; whyGood?: string }> | null;
  createdAt: string;
  updatedAt: string;
};

const TONES = [
  { v: "professional", k: "전문적" },
  { v: "conversational", k: "친근한" },
  { v: "data_driven", k: "데이터 중심" },
  { v: "witty", k: "위트 있는" },
  { v: "inspirational", k: "영감적" },
  { v: "playful", k: "장난기 있는" },
  { v: "authoritative", k: "권위 있는" },
];

const LENGTHS = [
  { v: "twitter_280", k: "Twitter/X (280자)" },
  { v: "instagram_2200", k: "Instagram 캡션 (~2200자)" },
  { v: "reddit_long", k: "Reddit long-form (1000자+)" },
  { v: "blog_800", k: "블로그 short (800자)" },
  { v: "blog_1500", k: "블로그 long (1500자)" },
  { v: "short", k: "짧게" },
  { v: "medium", k: "보통" },
  { v: "long", k: "길게" },
];

const HASHTAGS = [
  { v: "none", k: "사용 안 함" },
  { v: "minimal", k: "최소 (1-2개)" },
  { v: "topical", k: "주제 관련 (3-5개)" },
  { v: "aggressive", k: "공격적 (8개+)" },
];

const LANGUAGES = [
  { v: "ko", k: "한국어" },
  { v: "en", k: "English" },
  { v: "ja", k: "日本語" },
  { v: "zh", k: "中文" },
];

export function PresetsPanel() {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Preset | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/mrai/content-presets", { cache: "no-store" });
    if (res.ok) {
      const json = await res.json();
      setPresets(json.presets as Preset[]);
    }
    setLoading(false);
  }

  async function remove(id: string) {
    if (!confirm("이 preset을 삭제할까요?")) return;
    const res = await fetch(`/api/mrai/content-presets/${id}`, { method: "DELETE" });
    if (res.ok) setPresets((p) => p.filter((x) => x.id !== id));
  }

  return (
    <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <header className="flex items-center gap-3 px-5 py-3 border-b border-slate-200 bg-gradient-to-r from-violet-50 to-white">
        <Sliders className="w-4 h-4 text-violet-600" />
        <div className="flex-1">
          <h2 className="text-sm font-semibold text-slate-900">콘텐츠 Preset</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            톤·보이스·길이·해시태그 전략을 미리 설정. 콘텐츠 자동 생성기가 이 preset을 따릅니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-violet-600 hover:bg-violet-700 rounded-md"
        >
          <Plus className="w-3 h-3" />
          새 preset
        </button>
      </header>
      <div className="px-5 py-4 space-y-2">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            로딩 중...
          </div>
        ) : presets.length === 0 && !creating ? (
          <EmptyState
            icon={Sliders}
            tone="violet"
            compact
            title="콘텐츠 Preset이 비어 있어요"
            description="톤·길이·해시태그 전략을 미리 정해두면 자동 생성기가 그대로 따릅니다. 예: '임원 톤 LinkedIn', '친근한 Instagram'."
          />
        ) : (
          presets.map((p) => (
            <div
              key={p.id}
              className="flex items-start gap-3 border border-slate-200 rounded-md px-3 py-2.5"
            >
              <span className="text-slate-400 mt-0.5">
                {p.isDefault ? <Star size={14} className="text-amber-500 fill-amber-500" /> : <Sliders size={14} />}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-slate-900">{p.name}</span>
                  {p.isDefault && (
                    <span className="text-[10px] uppercase tracking-wider text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                      Default
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                  {p.tone && <span>톤: {TONES.find((t) => t.v === p.tone)?.k ?? p.tone}</span>}
                  {p.targetLength && <span>길이: {LENGTHS.find((l) => l.v === p.targetLength)?.k ?? p.targetLength}</span>}
                  {p.hashtagStrategy && <span>해시태그: {HASHTAGS.find((h) => h.v === p.hashtagStrategy)?.k ?? p.hashtagStrategy}</span>}
                  <span>언어: {LANGUAGES.find((l) => l.v === p.language)?.k ?? p.language}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditing(p)}
                className="text-xs text-slate-600 hover:text-slate-900 px-2 py-1 rounded hover:bg-slate-100"
              >
                편집
              </button>
              <button
                type="button"
                onClick={() => remove(p.id)}
                className="inline-flex items-center justify-center w-7 h-7 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))
        )}
        {creating && (
          <PresetForm
            initial={null}
            onCancel={() => setCreating(false)}
            onSaved={async () => {
              setCreating(false);
              await load();
            }}
          />
        )}
        {editing && (
          <PresetForm
            initial={editing}
            onCancel={() => setEditing(null)}
            onSaved={async () => {
              setEditing(null);
              await load();
            }}
          />
        )}
      </div>
    </section>
  );
}

function PresetForm({
  initial,
  onCancel,
  onSaved,
}: {
  initial: Preset | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [isDefault, setIsDefault] = useState(initial?.isDefault ?? false);
  const [tone, setTone] = useState<string>(initial?.tone ?? "professional");
  const [voice, setVoice] = useState(initial?.voice ?? "");
  const [targetLength, setTargetLength] = useState<string>(initial?.targetLength ?? "medium");
  const [language, setLanguage] = useState<string>(initial?.language ?? "ko");
  const [hashtagStrategy, setHashtagStrategy] = useState<string>(initial?.hashtagStrategy ?? "topical");
  const [doNotUse, setDoNotUse] = useState(initial?.doNotUse ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const url = initial
        ? `/api/mrai/content-presets/${initial.id}`
        : "/api/mrai/content-presets";
      const res = await fetch(url, {
        method: initial ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          isDefault,
          tone,
          voice: voice.trim() || null,
          targetLength,
          language,
          hashtagStrategy,
          doNotUse: doNotUse.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(typeof json.error === "string" ? json.error : "저장 실패");
        return;
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "네트워크 오류");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={save}
      className="border border-violet-200 bg-violet-50/30 rounded-md p-3 space-y-2.5"
    >
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Preset 이름 (예: 임원 톤 LinkedIn)"
          required
          className="flex-1 text-sm text-slate-900 placeholder:text-slate-400 bg-white border border-slate-200 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-300"
        />
        <label className="inline-flex items-center gap-1 text-xs text-slate-600 px-2">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
          />
          기본값
        </label>
        <button
          type="button"
          onClick={onCancel}
          className="text-slate-400 hover:text-slate-700 p-1"
        >
          <X size={14} />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <Sel label="톤" value={tone} onChange={setTone} options={TONES} />
        <Sel label="길이" value={targetLength} onChange={setTargetLength} options={LENGTHS} />
        <Sel label="해시태그" value={hashtagStrategy} onChange={setHashtagStrategy} options={HASHTAGS} />
        <Sel label="언어" value={language} onChange={setLanguage} options={LANGUAGES} />
      </div>
      <input
        type="text"
        value={voice}
        onChange={(e) => setVoice(e.target.value)}
        placeholder="보이스 자유 텍스트 (예: 대표 인터뷰 톤, 제품 리뷰 시점 등)"
        className="w-full text-sm text-slate-900 placeholder:text-slate-400 bg-white border border-slate-200 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-300"
      />
      <textarea
        value={doNotUse}
        onChange={(e) => setDoNotUse(e.target.value)}
        placeholder="금지어/표현 (예: '저렴한', '대박' 같은 단어 X)"
        rows={2}
        className="w-full text-sm text-slate-900 placeholder:text-slate-400 bg-white border border-slate-200 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-300 resize-none"
      />
      {error && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded px-3 py-2">{error}</div>
      )}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded"
        >
          취소
        </button>
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50 rounded"
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
          저장
        </button>
      </div>
    </form>
  );
}

function Sel({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ v: string; k: string }>;
}) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wider text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full text-sm text-slate-900 bg-white border border-slate-200 rounded px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-300"
      >
        {options.map((o) => (
          <option key={o.v} value={o.v}>
            {o.k}
          </option>
        ))}
      </select>
    </label>
  );
}

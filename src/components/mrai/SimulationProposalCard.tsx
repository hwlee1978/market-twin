"use client";

import { useRef, useState } from "react";
import {
  Wand2,
  Loader2,
  Play,
  Pencil,
  Check,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Plus,
  X,
  Upload,
  Image as ImageIcon,
} from "lucide-react";
import { clsx } from "clsx";

export type SimulationTier =
  | "hypothesis"
  | "decision"
  | "decision_plus"
  | "deep"
  | "deep_pro";

export interface SimulationProposalPayload {
  name: string;
  productName: string;
  category: string;
  description: string;
  basePrice: string;
  currency: string;
  objective: "awareness" | "conversion" | "retention" | "expansion";
  originatingCountry: string;
  countries: string[];
  competitorNames: string[];
  /**
   * Creative concept descriptions auto-drafted by the simulation
   * proposer from workspace memory (product features, USP, persona).
   * Each line becomes one row in the wizard's assetDescriptions
   * array; users can edit / add / remove.
   */
  assetDescriptions: string[];
  /** Optional image URLs for creative assets — empty by default. */
  assetUrls: string[];
  tier: SimulationTier;
  rationale: string;
}

const CATEGORIES = [
  "beauty",
  "fashion",
  "food",
  "beverage",
  "alcohol",
  "health",
  "electronics",
  "appliances",
  "home",
  "pet",
  "saas",
  "ip",
  "other",
] as const;

const CATEGORY_LABEL: Record<string, string> = {
  beauty: "뷰티",
  fashion: "패션",
  food: "식음료",
  beverage: "음료",
  alcohol: "주류",
  health: "건강·웰빙",
  electronics: "가전·전자",
  appliances: "가전·전자",
  home: "리빙",
  pet: "반려동물",
  saas: "SaaS·소프트웨어",
  ip: "IP·콘텐츠",
  other: "기타",
};

const TIER_LABEL: Record<SimulationTier, { name: string; cost: string; time: string }> = {
  hypothesis: { name: "Hypothesis", cost: "$3-5", time: "8-12분" },
  decision: { name: "Decision", cost: "$25", time: "15-25분" },
  decision_plus: { name: "Consensus Plus", cost: "$45", time: "30-45분" },
  deep: { name: "Deep", cost: "$60", time: "45-70분" },
  deep_pro: { name: "Deep Pro", cost: "$90", time: "60-90분" },
};

const OBJECTIVE_LABEL: Record<string, string> = {
  awareness: "인지도",
  conversion: "전환",
  retention: "재구매",
  expansion: "신시장 확장",
};

type RunState =
  | { status: "draft" }
  | { status: "running" }
  | { status: "started"; projectId: string; ensembleId: string | null; tier: SimulationTier }
  | { status: "error"; message: string; projectId?: string };

export function SimulationProposalCard({
  initial,
  locale,
}: {
  initial: SimulationProposalPayload;
  locale: "ko" | "en";
}) {
  const [draft, setDraft] = useState<SimulationProposalPayload>(initial);
  const [expanded, setExpanded] = useState(true);
  const [runState, setRunState] = useState<RunState>({ status: "draft" });

  const updateField = <K extends keyof SimulationProposalPayload>(
    key: K,
    value: SimulationProposalPayload[K],
  ) => {
    setDraft((d) => ({ ...d, [key]: value }));
  };

  const start = async () => {
    setRunState({ status: "running" });
    try {
      const res = await fetch("/api/mrai/actions/run-simulation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...draft, locale }),
      });
      const json = await res.json();
      if (!res.ok) {
        setRunState({
          status: "error",
          message:
            typeof json.detail === "string"
              ? json.detail
              : typeof json.error === "string"
              ? json.error
              : "시뮬 시작에 실패했습니다.",
          projectId: json.projectId,
        });
        return;
      }
      setRunState({
        status: "started",
        projectId: json.projectId,
        ensembleId: json.ensembleId,
        tier: json.tier ?? draft.tier,
      });
    } catch (e) {
      setRunState({
        status: "error",
        message: e instanceof Error ? e.message : "네트워크 오류",
      });
    }
  };

  if (runState.status === "started") {
    return (
      <StartedCard
        state={runState}
        productName={draft.productName}
        countries={draft.countries}
        locale={locale}
      />
    );
  }

  const tierInfo = TIER_LABEL[draft.tier];

  return (
    <section className="rounded-xl border-2 border-violet-200 bg-gradient-to-br from-violet-50/40 to-fuchsia-50/40 p-4 mt-2">
      {/* Header */}
      <header className="flex items-start gap-3 mb-3">
        <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-violet-600 text-white shrink-0">
          <Wand2 size={16} />
        </span>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-violet-900">
            시뮬레이션 제안
          </h3>
          <p className="text-xs text-violet-700 mt-0.5 leading-relaxed">
            {draft.rationale}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-violet-600 hover:text-violet-900 p-1"
          aria-label={expanded ? "접기" : "펼치기"}
        >
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </header>

      {expanded && (
        <div className="space-y-2.5 bg-white rounded-lg p-3 border border-violet-100">
          <Row label="프로젝트명">
            <TextInput value={draft.name} onChange={(v) => updateField("name", v)} />
          </Row>
          <Row label="제품">
            <TextInput value={draft.productName} onChange={(v) => updateField("productName", v)} />
          </Row>
          <div className="grid grid-cols-2 gap-2.5">
            <Row label="카테고리">
              <select
                value={draft.category}
                onChange={(e) => updateField("category", e.target.value)}
                className="w-full text-sm text-slate-900 bg-white border border-slate-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-300"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABEL[c] ?? c}
                  </option>
                ))}
              </select>
            </Row>
            <Row label="목표">
              <select
                value={draft.objective}
                onChange={(e) =>
                  updateField("objective", e.target.value as SimulationProposalPayload["objective"])
                }
                className="w-full text-sm text-slate-900 bg-white border border-slate-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-300"
              >
                {Object.entries(OBJECTIVE_LABEL).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </Row>
          </div>
          <div className="grid grid-cols-[1fr_80px_60px] gap-2.5">
            <Row label="가격">
              <TextInput
                value={draft.basePrice}
                onChange={(v) => updateField("basePrice", v.replace(/[^0-9.]/g, ""))}
              />
            </Row>
            <Row label="통화">
              <TextInput
                value={draft.currency}
                onChange={(v) => updateField("currency", v.toUpperCase().slice(0, 4))}
              />
            </Row>
            <Row label="원산지">
              <TextInput
                value={draft.originatingCountry}
                onChange={(v) => updateField("originatingCountry", v.toUpperCase().slice(0, 2))}
              />
            </Row>
          </div>
          <Row label="설명">
            <textarea
              value={draft.description}
              onChange={(e) => updateField("description", e.target.value)}
              rows={3}
              className="w-full text-sm text-slate-900 placeholder:text-slate-400 bg-white border border-slate-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-300 resize-none"
            />
          </Row>
          <Row label="검토 시장 (ISO-2)">
            <ChipsEditor
              values={draft.countries}
              onChange={(v) => updateField("countries", v)}
              placeholder="JP"
              upperCase
              maxLen={2}
            />
          </Row>
          <Row label="경쟁사 (메모리에서 자동 추출)">
            <ChipsEditor
              values={draft.competitorNames}
              onChange={(v) => updateField("competitorNames", v)}
              placeholder="올버즈"
            />
          </Row>
          <Row label="크리에이티브 콘셉트 (Mr. AI 자동 생성 · 한 줄에 한 콘셉트)">
            <MultilineListEditor
              values={draft.assetDescriptions}
              onChange={(v) => updateField("assetDescriptions", v)}
              placeholder="장면 + 카피 + 호소 포인트를 한 단락으로 작성하면 시뮬이 더 정확합니다"
            />
          </Row>
          <Row label="크리에이티브 이미지 (선택 · 파일 업로드 또는 URL)">
            <ImageAssetEditor
              values={draft.assetUrls}
              onChange={(v) => updateField("assetUrls", v)}
            />
          </Row>
          <Row label="시뮬 Tier">
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(TIER_LABEL) as SimulationTier[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => updateField("tier", t)}
                  className={clsx(
                    "px-2.5 py-1 text-[11px] rounded-md border",
                    draft.tier === t
                      ? "bg-violet-600 text-white border-violet-600"
                      : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50",
                  )}
                >
                  {TIER_LABEL[t].name}
                </button>
              ))}
            </div>
          </Row>
        </div>
      )}

      {/* Footer */}
      <div className="mt-3 flex items-center justify-between">
        <span className="text-[11px] text-violet-700">
          {tierInfo.name} · 소요 시간 {tierInfo.time}
        </span>
        <button
          type="button"
          onClick={start}
          disabled={runState.status === "running" || draft.countries.length === 0}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-md"
        >
          {runState.status === "running" ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              시작 중...
            </>
          ) : (
            <>
              <Play size={14} />
              시뮬 시작
            </>
          )}
        </button>
      </div>

      {runState.status === "error" && (
        <div className="mt-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
          {runState.message}
          {runState.projectId && (
            <>
              {" "}
              <a
                href={`/${locale}/projects/${runState.projectId}`}
                className="underline font-medium"
              >
                프로젝트 페이지에서 다시 시도
              </a>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wider text-slate-500">
        {label}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function TextInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full text-sm text-slate-900 placeholder:text-slate-400 bg-white border border-slate-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-500"
    />
  );
}

function ChipsEditor({
  values,
  onChange,
  placeholder,
  upperCase = false,
  maxLen,
}: {
  values: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  upperCase?: boolean;
  maxLen?: number;
}) {
  const [adding, setAdding] = useState("");
  const commit = () => {
    let v = adding.trim();
    if (!v) return;
    if (upperCase) v = v.toUpperCase();
    if (maxLen) v = v.slice(0, maxLen);
    if (!values.includes(v)) onChange([...values, v]);
    setAdding("");
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {values.map((v, i) => (
        <span
          key={`${v}-${i}`}
          className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-violet-100 text-violet-800 rounded-md"
        >
          {v}
          <button
            type="button"
            onClick={() => onChange(values.filter((_, j) => j !== i))}
            className="text-violet-500 hover:text-red-600"
            aria-label={`remove ${v}`}
          >
            <X size={12} />
          </button>
        </span>
      ))}
      <span className="inline-flex items-center gap-1">
        <input
          type="text"
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commit();
            }
          }}
          placeholder={placeholder}
          className="w-20 text-xs text-slate-900 placeholder:text-slate-400 bg-white border border-dashed border-slate-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-violet-300"
        />
        {adding && (
          <button
            type="button"
            onClick={commit}
            className="text-violet-600 hover:text-violet-800"
            aria-label="add"
          >
            <Plus size={12} />
          </button>
        )}
      </span>
    </div>
  );
}

function MultilineListEditor({
  values,
  onChange,
  placeholder,
}: {
  values: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  // Stored internally as one string per textarea row so users can edit
  // multi-line concepts without losing newlines. Sync to props on every
  // change so the card payload stays current.
  const updateItem = (i: number, v: string) => {
    onChange(values.map((row, j) => (j === i ? v : row)));
  };
  const remove = (i: number) => {
    onChange(values.filter((_, j) => j !== i));
  };
  const add = () => {
    onChange([...values, ""]);
  };
  return (
    <div className="space-y-2">
      {values.length === 0 && (
        <p className="text-[11px] text-slate-400 italic">
          (메모리 정보 부족으로 자동 생성 안 됨 — 직접 추가 가능)
        </p>
      )}
      {values.map((v, i) => (
        <div key={i} className="flex items-start gap-1.5">
          <span className="shrink-0 w-5 h-5 inline-flex items-center justify-center text-[10px] font-bold text-violet-600 bg-violet-100 rounded-full mt-1">
            {i + 1}
          </span>
          <textarea
            value={v}
            onChange={(e) => updateItem(i, e.target.value)}
            placeholder={placeholder}
            rows={2}
            className="flex-1 text-xs text-slate-900 placeholder:text-slate-400 bg-white border border-slate-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-300 focus:border-violet-500 resize-y"
          />
          <button
            type="button"
            onClick={() => remove(i)}
            className="text-slate-400 hover:text-red-600 p-1 mt-1"
            aria-label={`remove concept ${i + 1}`}
          >
            <X size={12} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="inline-flex items-center gap-1 text-[11px] text-violet-600 hover:text-violet-800 hover:bg-violet-50 px-2 py-1 rounded"
      >
        <Plus size={12} />
        콘셉트 추가
      </button>
    </div>
  );
}

function ImageAssetEditor({
  values,
  onChange,
}: {
  values: string[];
  onChange: (v: string[]) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [urlDraft, setUrlDraft] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addUrl = () => {
    const v = urlDraft.trim();
    if (!v || !/^https?:\/\//.test(v)) {
      setError("https:// 로 시작하는 URL이어야 합니다");
      return;
    }
    if (values.includes(v)) {
      setError("이미 추가된 URL입니다");
      return;
    }
    onChange([...values, v]);
    setUrlDraft("");
    setError(null);
  };

  const remove = (i: number) => {
    onChange(values.filter((_, j) => j !== i));
  };

  const uploadFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    const newUrls: string[] = [];
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/upload/creative-asset", {
          method: "POST",
          body: fd,
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error || `${file.name} 업로드 실패`);
          break;
        }
        if (json.url) newUrls.push(json.url);
      }
      if (newUrls.length) onChange([...values, ...newUrls]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "업로드 실패");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2">
      {/* Image previews */}
      {values.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {values.map((url, i) => {
            const isImg = /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(url);
            return (
              <div
                key={`${url}-${i}`}
                className="relative border border-slate-200 rounded-md overflow-hidden bg-slate-50 group"
              >
                {isImg ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={url}
                    alt={`creative ${i + 1}`}
                    className="w-full h-20 object-cover"
                  />
                ) : (
                  <div className="w-full h-20 flex items-center justify-center text-slate-400 px-2">
                    <ImageIcon size={20} />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="absolute top-1 right-1 bg-white/90 hover:bg-red-50 text-slate-500 hover:text-red-600 rounded-full p-0.5 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label={`remove ${i + 1}`}
                >
                  <X size={11} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Upload button */}
      <div className="flex items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          onChange={(e) => uploadFiles(e.target.files)}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-1.5 text-[11px] font-medium text-violet-700 bg-violet-50 hover:bg-violet-100 disabled:opacity-50 px-3 py-1.5 rounded-md border border-violet-200"
        >
          {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
          {uploading ? "업로드 중..." : "이미지 파일 업로드"}
        </button>
        <span className="text-[10px] text-slate-400">JPG/PNG/WebP/GIF · 최대 4MB</span>
      </div>

      {/* URL paste */}
      <div className="flex items-center gap-1.5">
        <input
          type="url"
          value={urlDraft}
          onChange={(e) => setUrlDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addUrl();
            }
          }}
          placeholder="또는 https:// 로 시작하는 이미지 URL"
          className="flex-1 text-xs text-slate-900 placeholder:text-slate-400 bg-white border border-slate-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-300"
        />
        {urlDraft && (
          <button
            type="button"
            onClick={addUrl}
            className="inline-flex items-center gap-1 text-[11px] text-violet-700 bg-violet-50 hover:bg-violet-100 px-2 py-1.5 rounded-md border border-violet-200"
          >
            <Plus size={12} />
            추가
          </button>
        )}
      </div>

      {error && (
        <div className="text-[11px] text-red-600 bg-red-50 border border-red-100 rounded px-2 py-1">
          {error}
        </div>
      )}
    </div>
  );
}

function StartedCard({
  state,
  productName,
  countries,
  locale,
}: {
  state: Extract<RunState, { status: "started" }>;
  productName: string;
  countries: string[];
  locale: "ko" | "en";
}) {
  const tierInfo = TIER_LABEL[state.tier];
  const projectUrl = `/${locale}/projects/${state.projectId}`;
  return (
    <section className="rounded-xl border-2 border-emerald-200 bg-emerald-50/40 p-4 mt-2">
      <header className="flex items-start gap-3">
        <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-emerald-600 text-white shrink-0">
          <Check size={16} />
        </span>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-emerald-900">
            시뮬 시작됨 · {tierInfo.name}
          </h3>
          <p className="text-xs text-emerald-700 mt-0.5">
            {productName} · {countries.join(", ")} 시장 검증. 약 {tierInfo.time} 후 완료. Email + Slack로 자동 알림.
          </p>
          <div className="mt-2 flex items-center gap-3">
            <a
              href={projectUrl}
              className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-900 hover:underline"
            >
              프로젝트 페이지 열기
              <ExternalLink size={11} />
            </a>
            {state.ensembleId && (
              <span className="text-[11px] text-emerald-600 font-mono">
                ensemble {state.ensembleId.slice(0, 8)}
              </span>
            )}
          </div>
        </div>
      </header>
    </section>
  );
}

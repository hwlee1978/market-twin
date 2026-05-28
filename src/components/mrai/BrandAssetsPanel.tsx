"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Trash2, UploadCloud, Image as ImageIcon, X as CloseX } from "lucide-react";

type Asset = {
  id: string;
  asset_type: string;
  label: string | null;
  description: string | null;
  image_url: string;
  storage_path: string;
  width: number | null;
  height: number | null;
  file_size_bytes: number | null;
  mime_type: string | null;
  use_count: number;
  last_used_at: string | null;
  created_at: string;
};

const ASSET_TYPES: Array<{ value: string; label: string; icon: string }> = [
  { value: "ambassador", label: "광고 모델/연예인", icon: "⭐" },
  { value: "product", label: "제품", icon: "👟" },
  { value: "lifestyle", label: "라이프스타일", icon: "🌿" },
  { value: "logo", label: "로고", icon: "🔖" },
  { value: "packaging", label: "패키지", icon: "📦" },
  { value: "pattern", label: "패턴/배경", icon: "🎨" },
  { value: "other", label: "기타", icon: "🔗" },
];

export function BrandAssetsPanel() {
  const [assets, setAssets] = useState<Asset[] | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/mrai/brand-assets", { cache: "no-store" });
    if (!res.ok) {
      setError("자산 목록 로드 실패");
      return;
    }
    const { assets: data } = (await res.json()) as { assets: Asset[] };
    setAssets(data);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async (id: string) => {
    if (!confirm("이 자산을 삭제할까요?")) return;
    const res = await fetch(`/api/mrai/brand-assets/${id}`, { method: "DELETE" });
    if (res.ok) {
      setAssets((prev) => prev?.filter((a) => a.id !== id) ?? null);
    }
  };

  const filtered =
    filter === "all"
      ? assets
      : (assets ?? []).filter((a) => a.asset_type === filter);

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-rose-600" />
            브랜드 자산 라이브러리
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            실제 제품 사진을 업로드하면 AI 콘텐츠 이미지 생성 시 reference로 사용해 일관된 브랜드 이미지를 만듭니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setUploadOpen(true)}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-slate-900 text-white text-xs font-medium hover:bg-slate-800"
        >
          <UploadCloud className="w-3.5 h-3.5" /> 업로드
        </button>
      </div>
      <div className="px-5 py-3 border-b border-slate-100 flex gap-1.5 overflow-x-auto">
        <FilterChip
          active={filter === "all"}
          label="전체"
          count={assets?.length ?? 0}
          onClick={() => setFilter("all")}
        />
        {ASSET_TYPES.map((t) => {
          const count = (assets ?? []).filter((a) => a.asset_type === t.value).length;
          return (
            <FilterChip
              key={t.value}
              active={filter === t.value}
              label={`${t.icon} ${t.label}`}
              count={count}
              onClick={() => setFilter(t.value)}
            />
          );
        })}
      </div>
      <div className="px-5 py-4">
        {error && <p className="text-xs text-red-600 mb-3">{error}</p>}
        {assets === null ? (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> 불러오는 중…
          </div>
        ) : !filtered || filtered.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-6">
            {filter === "all"
              ? "아직 업로드된 자산이 없습니다. 실제 제품 사진 5-10장을 업로드하면 이미지 생성 품질이 즉시 올라갑니다."
              : `이 카테고리에 자산이 없습니다.`}
          </p>
        ) : (
          <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-3">
            {filtered.map((a) => (
              <div key={a.id} className="group relative">
                <div className="aspect-square overflow-hidden rounded-md border border-slate-200 bg-slate-50">
                  <img
                    src={a.image_url}
                    alt={a.label ?? ""}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="mt-1 flex items-baseline justify-between gap-1">
                  <span className="text-[10px] text-slate-500 truncate">
                    {ASSET_TYPES.find((t) => t.value === a.asset_type)?.icon}{" "}
                    {a.label || a.asset_type}
                  </span>
                  {a.use_count > 0 && (
                    <span className="text-[9px] text-emerald-700">{a.use_count}회 사용</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => remove(a.id)}
                  className="absolute top-1 right-1 p-1 rounded bg-white/80 backdrop-blur text-slate-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {uploadOpen && (
        <UploadModal
          onClose={() => setUploadOpen(false)}
          onUploaded={(a) => {
            setAssets((prev) => [a, ...(prev ?? [])]);
            setUploadOpen(false);
          }}
        />
      )}
    </div>
  );
}

function FilterChip({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 text-[11px] px-2.5 py-1 rounded-md border ${
        active
          ? "bg-slate-900 border-slate-900 text-white"
          : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
      }`}
    >
      {label} <span className={active ? "text-slate-300" : "text-slate-400"}>({count})</span>
    </button>
  );
}

function UploadModal({
  onClose,
  onUploaded,
}: {
  onClose: () => void;
  onUploaded: (a: Asset) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [assetType, setAssetType] = useState("product");
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const choose = (f: File | null) => {
    setFile(f);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(f ? URL.createObjectURL(f) : null);
  };

  const submit = async () => {
    if (!file) {
      setErr("이미지를 선택하세요");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("asset_type", assetType);
      if (label.trim()) fd.append("label", label.trim());
      if (description.trim()) fd.append("description", description.trim());
      const res = await fetch("/api/mrai/brand-assets", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.detail ?? json.error ?? "업로드 실패");
      onUploaded(json.asset as Asset);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "업로드 실패");
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4"
    >
      <div
        className="bg-white rounded-xl w-full max-w-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">브랜드 자산 업로드</h3>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="text-slate-400 hover:text-slate-700"
          >
            <CloseX className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div
            className="rounded-lg border-2 border-dashed border-slate-300 p-4 text-center hover:border-slate-400 cursor-pointer"
            onClick={() => inputRef.current?.click()}
          >
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => choose(e.target.files?.[0] ?? null)}
              className="hidden"
            />
            {preview ? (
              <img src={preview} alt="preview" className="max-h-48 mx-auto rounded" />
            ) : (
              <div>
                <UploadCloud className="w-8 h-8 mx-auto text-slate-400" />
                <p className="text-sm text-slate-600 mt-2">클릭해서 이미지 선택</p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  JPG / PNG / WEBP · 최대 8 MB
                </p>
              </div>
            )}
          </div>
          {file && (
            <div className="text-[11px] text-slate-500">
              {file.name} · {(file.size / 1024).toFixed(1)} KB
            </div>
          )}
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">유형</label>
            <select
              value={assetType}
              onChange={(e) => setAssetType(e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 bg-white text-slate-900"
            >
              {ASSET_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.icon} {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              라벨 (선택)
            </label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="예: 메이트 화이트 사이드뷰"
              className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 bg-white text-slate-900 placeholder:text-slate-400"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1">
              설명 (선택)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="추가 컨텍스트 (FW26 룩북에서 발췌 등)"
              className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 bg-white text-slate-900 placeholder:text-slate-400 resize-none"
            />
          </div>
          {err && <p className="text-xs text-red-600">{err}</p>}
        </div>
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
            disabled={busy || !file}
            className="inline-flex items-center gap-1.5 bg-slate-900 text-white text-sm px-3 py-1.5 rounded-md hover:bg-slate-800 disabled:opacity-60"
          >
            {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {busy ? "업로드 중…" : "업로드"}
          </button>
        </div>
      </div>
    </div>
  );
}

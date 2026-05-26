"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, Loader2, Search, ExternalLink, X as CloseX, Check } from "lucide-react";

type SeoProperty = {
  id: string;
  property_url: string;
  property_type: string;
  label: string | null;
  gsc_verified: boolean;
  gsc_property: string | null;
  ga4_property_id: string | null;
  ga4_measurement_id: string | null;
  naver_verified: boolean;
  naver_site_url: string | null;
  sitemap_url: string | null;
  rss_url: string | null;
  default_meta_title: string | null;
  default_meta_description: string | null;
  default_keywords: string[];
  enabled: boolean;
  created_at: string;
};

const PROPERTY_TYPES = [
  { value: "website", label: "웹사이트 (본사 도메인)" },
  { value: "smartstore", label: "스마트스토어" },
  { value: "blog", label: "블로그" },
  { value: "landing", label: "랜딩 페이지" },
  { value: "other", label: "기타" },
];

export function BrandSEOPanel() {
  const [props, setProps] = useState<SeoProperty[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = async () => {
    const res = await fetch("/api/mrai/seo-properties", { cache: "no-store" });
    if (res.ok) {
      const { properties } = (await res.json()) as { properties: SeoProperty[] };
      setProps(properties);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const remove = async (id: string) => {
    if (!confirm("이 SEO 자산을 삭제할까요?")) return;
    const res = await fetch(`/api/mrai/seo-properties/${id}`, { method: "DELETE" });
    if (res.ok) {
      setProps((prev) => prev?.filter((p) => p.id !== id) ?? null);
    }
  };

  const toggleVerified = async (id: string, field: "gscVerified" | "naverVerified", value: boolean) => {
    const res = await fetch(`/api/mrai/seo-properties/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    if (res.ok) {
      const { property } = (await res.json()) as { property: SeoProperty };
      setProps((prev) => prev?.map((p) => (p.id === id ? property : p)) ?? null);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <Search className="w-4 h-4 text-emerald-600" />
            브랜드 SEO 자산
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            자사 웹사이트·스마트스토어·블로그를 등록하고 GSC · GA4 · 네이버 서치어드바이저 연동 상태를 관리합니다. 콘텐츠 SEO와 별도로, 브랜드 사이트 전체 SEO 환경 셋업용.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-slate-900 text-white text-xs font-medium hover:bg-slate-800"
        >
          <Plus className="w-3.5 h-3.5" /> 자산 추가
        </button>
      </div>
      <div className="px-5 py-4">
        {props === null ? (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> 불러오는 중…
          </div>
        ) : props.length === 0 ? (
          <p className="text-xs text-slate-400">
            아직 등록된 SEO 자산이 없습니다. 본사 사이트 URL 1개부터 추가하세요.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 -mt-2">
            {props.map((p) => (
              <li key={p.id} className="py-3">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <a
                        href={p.property_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-semibold text-slate-900 hover:text-brand inline-flex items-center gap-1"
                      >
                        {p.label || new URL(p.property_url).hostname}
                        <ExternalLink className="w-3 h-3 text-slate-400" />
                      </a>
                      <span className="text-[10px] uppercase tracking-wider text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">
                        {PROPERTY_TYPES.find((t) => t.value === p.property_type)?.label ?? p.property_type}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 font-mono break-all">
                      {p.property_url}
                    </div>

                    <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <VerifyChip
                        label="Google Search Console"
                        verified={p.gsc_verified}
                        detail={p.gsc_property}
                        onToggle={() => toggleVerified(p.id, "gscVerified", !p.gsc_verified)}
                      />
                      <div className="rounded-md border border-slate-200 px-2.5 py-1.5 bg-slate-50">
                        <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                          Google Analytics 4
                        </div>
                        <div className="text-xs text-slate-700 font-mono mt-0.5 truncate">
                          {p.ga4_measurement_id || p.ga4_property_id || (
                            <span className="text-slate-400 italic">미연결</span>
                          )}
                        </div>
                      </div>
                      <VerifyChip
                        label="네이버 서치어드바이저"
                        verified={p.naver_verified}
                        detail={p.naver_site_url}
                        onToggle={() => toggleVerified(p.id, "naverVerified", !p.naver_verified)}
                      />
                    </div>

                    {(p.sitemap_url || p.rss_url) && (
                      <div className="mt-2.5 text-xs text-slate-500 space-y-0.5">
                        {p.sitemap_url && (
                          <div>
                            <span className="font-semibold text-slate-700">Sitemap:</span>{" "}
                            <a href={p.sitemap_url} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline break-all">
                              {p.sitemap_url}
                            </a>
                          </div>
                        )}
                        {p.rss_url && (
                          <div>
                            <span className="font-semibold text-slate-700">RSS:</span>{" "}
                            <a href={p.rss_url} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline break-all">
                              {p.rss_url}
                            </a>
                          </div>
                        )}
                      </div>
                    )}

                    {p.default_keywords.length > 0 && (
                      <div className="mt-2 flex gap-1 flex-wrap">
                        <span className="text-[10px] uppercase tracking-wider text-slate-500 mr-1">
                          기본 키워드:
                        </span>
                        {p.default_keywords.map((k, i) => (
                          <span key={i} className="text-[10px] text-slate-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">
                            {k}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => setEditingId(p.id)}
                      className="text-xs text-slate-500 hover:text-brand"
                      title="편집"
                    >
                      편집
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(p.id)}
                      className="text-slate-400 hover:text-red-600 p-1"
                      title="삭제"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {creating && (
        <PropertyModal
          mode="create"
          onClose={() => setCreating(false)}
          onSaved={(p) => {
            setCreating(false);
            setProps((prev) => [p, ...(prev ?? [])]);
          }}
        />
      )}
      {editingId && props && (
        <PropertyModal
          mode="edit"
          initial={props.find((p) => p.id === editingId) ?? null}
          onClose={() => setEditingId(null)}
          onSaved={(p) => {
            setEditingId(null);
            setProps((prev) => prev?.map((q) => (q.id === p.id ? p : q)) ?? null);
          }}
        />
      )}
    </div>
  );
}

function VerifyChip({
  label,
  verified,
  detail,
  onToggle,
}: {
  label: string;
  verified: boolean;
  detail: string | null;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`rounded-md border px-2.5 py-1.5 text-left hover:bg-slate-50 transition-colors ${
        verified ? "border-emerald-300 bg-emerald-50/40" : "border-slate-200 bg-slate-50"
      }`}
      title="클릭하여 verification 상태 토글"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
          {label}
        </span>
        {verified ? (
          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-700">
            <Check className="w-3 h-3" /> verified
          </span>
        ) : (
          <span className="text-[10px] text-slate-400">미연결</span>
        )}
      </div>
      <div className="text-xs text-slate-700 font-mono mt-0.5 truncate">
        {detail || <span className="text-slate-400 italic">—</span>}
      </div>
    </button>
  );
}

function PropertyModal({
  mode,
  initial,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  initial?: SeoProperty | null;
  onClose: () => void;
  onSaved: (p: SeoProperty) => void;
}) {
  const [propertyUrl, setPropertyUrl] = useState(initial?.property_url ?? "");
  const [propertyType, setPropertyType] = useState(initial?.property_type ?? "website");
  const [label, setLabel] = useState(initial?.label ?? "");
  const [gscProperty, setGscProperty] = useState(initial?.gsc_property ?? "");
  const [ga4MeasurementId, setGa4MeasurementId] = useState(initial?.ga4_measurement_id ?? "");
  const [ga4PropertyId, setGa4PropertyId] = useState(initial?.ga4_property_id ?? "");
  const [naverSiteUrl, setNaverSiteUrl] = useState(initial?.naver_site_url ?? "");
  const [sitemapUrl, setSitemapUrl] = useState(initial?.sitemap_url ?? "");
  const [rssUrl, setRssUrl] = useState(initial?.rss_url ?? "");
  const [defaultMetaTitle, setDefaultMetaTitle] = useState(initial?.default_meta_title ?? "");
  const [defaultMetaDescription, setDefaultMetaDescription] = useState(
    initial?.default_meta_description ?? "",
  );
  const [defaultKeywords, setDefaultKeywords] = useState(
    (initial?.default_keywords ?? []).join(", "),
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!propertyUrl.trim()) {
      setErr("사이트 URL은 필수입니다 (https://... 형식)");
      return;
    }
    setBusy(true);
    setErr(null);
    const payload = {
      propertyUrl: propertyUrl.trim(),
      propertyType,
      label: label.trim() || undefined,
      gscProperty: gscProperty.trim() || undefined,
      ga4MeasurementId: ga4MeasurementId.trim() || undefined,
      ga4PropertyId: ga4PropertyId.trim() || undefined,
      naverSiteUrl: naverSiteUrl.trim() || undefined,
      sitemapUrl: sitemapUrl.trim() || undefined,
      rssUrl: rssUrl.trim() || undefined,
      defaultMetaTitle: defaultMetaTitle.trim() || undefined,
      defaultMetaDescription: defaultMetaDescription.trim() || undefined,
      defaultKeywords: defaultKeywords
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter(Boolean),
    };
    try {
      const url =
        mode === "create"
          ? "/api/mrai/seo-properties"
          : `/api/mrai/seo-properties/${initial!.id}`;
      const res = await fetch(url, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "저장 실패");
      onSaved(json.property as SeoProperty);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "저장 실패");
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl w-full max-w-xl shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white">
          <h3 className="text-base font-semibold text-slate-900">
            {mode === "create" ? "새 SEO 자산" : "SEO 자산 편집"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700"
          >
            <CloseX className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3 text-sm">
          <Field label="사이트 URL *">
            <input
              value={propertyUrl}
              onChange={(e) => setPropertyUrl(e.target.value)}
              placeholder="https://lemouton.com"
              className="w-full border border-slate-200 rounded-md px-3 py-2 bg-white text-slate-900 placeholder:text-slate-400"
              disabled={mode === "edit"}
            />
          </Field>
          <Field label="자산 유형">
            <select
              value={propertyType}
              onChange={(e) => setPropertyType(e.target.value)}
              className="w-full border border-slate-200 rounded-md px-3 py-2 bg-white text-slate-900"
              disabled={mode === "edit"}
            >
              {PROPERTY_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="라벨 (선택)">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="르무통 본사"
              className="w-full border border-slate-200 rounded-md px-3 py-2 bg-white text-slate-900 placeholder:text-slate-400"
            />
          </Field>

          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider pt-2">
            Google Search Console
          </h4>
          <Field label="GSC 등록 Property">
            <input
              value={gscProperty}
              onChange={(e) => setGscProperty(e.target.value)}
              placeholder="sc-domain:lemouton.com 또는 https://lemouton.com/"
              className="w-full border border-slate-200 rounded-md px-3 py-2 bg-white text-slate-900 placeholder:text-slate-400 font-mono text-xs"
            />
          </Field>

          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider pt-2">
            Google Analytics 4
          </h4>
          <Field label="Measurement ID (G-XXX)">
            <input
              value={ga4MeasurementId}
              onChange={(e) => setGa4MeasurementId(e.target.value)}
              placeholder="G-XXXXXXXXXX"
              className="w-full border border-slate-200 rounded-md px-3 py-2 bg-white text-slate-900 placeholder:text-slate-400 font-mono text-xs"
            />
          </Field>
          <Field label="Property ID (properties/123)">
            <input
              value={ga4PropertyId}
              onChange={(e) => setGa4PropertyId(e.target.value)}
              placeholder="properties/123456789"
              className="w-full border border-slate-200 rounded-md px-3 py-2 bg-white text-slate-900 placeholder:text-slate-400 font-mono text-xs"
            />
          </Field>

          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider pt-2">
            네이버 서치어드바이저
          </h4>
          <Field label="네이버 등록 사이트 URL">
            <input
              value={naverSiteUrl}
              onChange={(e) => setNaverSiteUrl(e.target.value)}
              placeholder="https://lemouton.com"
              className="w-full border border-slate-200 rounded-md px-3 py-2 bg-white text-slate-900 placeholder:text-slate-400 font-mono text-xs"
            />
          </Field>

          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider pt-2">
            Sitemap / RSS
          </h4>
          <Field label="Sitemap URL">
            <input
              value={sitemapUrl}
              onChange={(e) => setSitemapUrl(e.target.value)}
              placeholder="https://lemouton.com/sitemap.xml"
              className="w-full border border-slate-200 rounded-md px-3 py-2 bg-white text-slate-900 placeholder:text-slate-400 font-mono text-xs"
            />
          </Field>
          <Field label="RSS URL">
            <input
              value={rssUrl}
              onChange={(e) => setRssUrl(e.target.value)}
              placeholder="https://lemouton.com/feed.xml"
              className="w-full border border-slate-200 rounded-md px-3 py-2 bg-white text-slate-900 placeholder:text-slate-400 font-mono text-xs"
            />
          </Field>

          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider pt-2">
            기본 메타데이터
          </h4>
          <Field label="기본 메타 제목">
            <input
              value={defaultMetaTitle}
              onChange={(e) => setDefaultMetaTitle(e.target.value)}
              placeholder="르무통 — K-comfort 캐시미어 아우터"
              className="w-full border border-slate-200 rounded-md px-3 py-2 bg-white text-slate-900 placeholder:text-slate-400"
            />
          </Field>
          <Field label="기본 메타 설명">
            <textarea
              value={defaultMetaDescription}
              onChange={(e) => setDefaultMetaDescription(e.target.value)}
              rows={2}
              placeholder="신었다 잊는 편안함의 캐시미어 100% 롱코트, 30-40대 도시 직장인 여성을 위한 ..."
              className="w-full border border-slate-200 rounded-md px-3 py-2 bg-white text-slate-900 placeholder:text-slate-400 resize-none"
            />
          </Field>
          <Field label="기본 키워드 (콤마 구분)">
            <input
              value={defaultKeywords}
              onChange={(e) => setDefaultKeywords(e.target.value)}
              placeholder="캐시미어 코트, 르무통, K-fashion, 프리미엄 아우터"
              className="w-full border border-slate-200 rounded-md px-3 py-2 bg-white text-slate-900 placeholder:text-slate-400"
            />
          </Field>

          {err && <p className="text-xs text-red-600">{err}</p>}
        </div>
        <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-2 sticky bottom-0 bg-white">
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
            {busy ? "저장 중…" : mode === "create" ? "추가" : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-semibold text-slate-700 block mb-1">{label}</label>
      {children}
    </div>
  );
}

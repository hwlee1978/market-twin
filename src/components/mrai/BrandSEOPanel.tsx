"use client";

import { useEffect, useState } from "react";
import {
  Plus,
  Trash2,
  Loader2,
  Search,
  ExternalLink,
  X as CloseX,
  Check,
  HelpCircle,
  ChevronDown,
  Globe2,
} from "lucide-react";
import { EmptyState } from "./EmptyState";

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
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
          <EmptyState
            icon={Globe2}
            tone="sky"
            title="SEO 자산을 등록하세요"
            description="자사 본사 URL 1개부터 시작. GSC · GA4 · 네이버 서치어드바이저 연동까지 한 자리에서 관리합니다."
          />
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
    >
      <div
        className="bg-white rounded-xl w-full max-w-xl shadow-2xl max-h-[90vh] overflow-y-auto"
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
          {mode === "create" && (
            <div className="rounded-md bg-slate-50 border border-slate-200 px-3 py-2.5 text-[11px] text-slate-600 leading-relaxed">
              <div className="font-semibold text-slate-800 mb-1">
                💡 어디까지 채워야 하나요?
              </div>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>
                  <strong>필수</strong>: 사이트 URL 1개. 나머지는 모두 선택.
                </li>
                <li>
                  <strong>추천</strong>: 기본 메타 제목 · 설명 · 키워드 — Mr.AI 가 SEO 추천을 만들 때 컨텍스트로 사용.
                </li>
                <li>
                  <strong>나중에</strong>: GSC · GA4 · 네이버 · Sitemap — 사이트에 아직 연결 안 했으면 비워두고 나중에 추가해도 됩니다.
                </li>
              </ul>
              <div className="mt-1.5 text-slate-500">
                각 섹션의 <span className="text-brand font-medium">&quot;처음이라면…&quot;</span> 링크를 펼치면 어디서 찾는지 단계별로 안내합니다.
              </div>
            </div>
          )}
          <Field label="사이트 URL *">
            <input
              value={propertyUrl}
              onChange={(e) => setPropertyUrl(e.target.value)}
              placeholder="https://yourbrand.com"
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
              placeholder="자사 본사 / 메인 사이트"
              className="w-full border border-slate-200 rounded-md px-3 py-2 bg-white text-slate-900 placeholder:text-slate-400"
            />
          </Field>

          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider pt-2">
            Google Search Console
          </h4>
          <SectionHelp
            title="처음이라면 — GSC 속성 ID 찾는 법"
            consoleLabel="Google Search Console 열기 (search.google.com/search-console)"
            consoleUrl="https://search.google.com/search-console"
            steps={[
              <>
                <strong className="text-amber-700">⚠ 주의:</strong> 이건 <strong>Search Console</strong> (검색 노출 관리 도구) 입니다. 아래의 <strong>Google Analytics</strong> 와는 다른 서비스예요 — 9-10자리 숫자 ID는 GA4 에만 있고 GSC 에는 없습니다.
              </>,
              <>구글 계정으로 로그인 후 좌측 상단 <strong>속성 추가</strong> 클릭.</>,
              <>
                <strong>도메인</strong>(전체 도메인 한 번에 권장) 또는 <strong>URL 접두어</strong> 선택 → 사이트 주소 입력 (예: <code className="font-mono bg-white px-1">yourbrand.com</code>).
              </>,
              <>
                안내되는 방법(도메인 DNS TXT 레코드 또는 HTML 파일 업로드)으로 <strong>소유권 확인</strong>. 도메인 방식은 가비아·Porkbun·Cafe24 등 도메인 관리 콘솔에서 TXT 추가.
              </>,
              <>
                확인 완료되면 GSC 좌측 상단 <strong>속성 선택 풀다운</strong>에 표기된 값을 그대로 복사 (도메인 또는 전체 URL).
              </>,
            ]}
            formatHint={
              <>
                도메인 방식 = <code className="font-mono bg-white px-1">sc-domain:yourbrand.com</code> / URL 접두어 방식 = <code className="font-mono bg-white px-1">https://yourbrand.com/</code>
              </>
            }
          />
          <Field label="GSC 등록 Property">
            <input
              value={gscProperty}
              onChange={(e) => setGscProperty(e.target.value)}
              placeholder="sc-domain:yourbrand.com 또는 https://yourbrand.com/"
              className="w-full border border-slate-200 rounded-md px-3 py-2 bg-white text-slate-900 placeholder:text-slate-400 font-mono text-xs"
            />
          </Field>

          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider pt-2">
            Google Analytics 4
          </h4>
          <SectionHelp
            title="처음이라면 — GA4 ID 두 개 찾는 법"
            consoleLabel="Google Analytics 열기 (analytics.google.com)"
            consoleUrl="https://analytics.google.com"
            steps={[
              <>
                <strong className="text-amber-700">⚠ 주의:</strong> URL이 <code className="font-mono bg-white px-1">analytics.google.com</code> 인지 확인하세요. <code className="font-mono bg-white px-1">search.google.com</code> (Search Console) 과는 별개 서비스이고, GA4 ID는 Analytics 쪽에만 있습니다.
              </>,
              <>
                구글 계정으로 로그인 → 화면 <strong>좌측 사이드바 맨 아래</strong>의 <strong>⚙ 관리(Admin)</strong> (톱니바퀴 아이콘) 클릭. 보이지 않으면 좌측 사이드바를 펼쳐주세요.
              </>,
              <>
                관리(Admin) 화면이 열리면 가운데에 <strong>속성(Property)</strong> 컬럼이 있습니다. <strong>속성 설정(Property Settings)</strong> 또는 <strong>속성 세부정보(Property details)</strong> 클릭 — Google 이 UI를 최근 자주 바꿔서 둘 중 하나로 표시됩니다.
              </>,
              <>
                열린 화면 <strong>우측 상단</strong>에 9-10자리 <strong>속성 ID(Property ID)</strong> 표시 (예: <code className="font-mono bg-white px-1">123456789</code>). 그 숫자만 복사하세요.
              </>,
              <>
                <strong>Measurement ID (G-XXX)</strong> 는 다른 위치 — 관리 화면 <em>속성</em> 컬럼에서 <strong>데이터 스트림(Data Streams)</strong> 클릭 → 웹 스트림 한 줄 클릭 → 우측 상단에 <code className="font-mono bg-white px-1">G-XXXXXXXXXX</code> 형태로 표시.
              </>,
              <>
                GA4 계정이 아직 없으면 관리(Admin) → <strong>속성 만들기</strong> 로 새 속성 생성 → 웹 스트림 등록 시 두 ID가 모두 자동 발급됩니다.
              </>,
            ]}
            formatHint={
              <>
                Measurement ID 는 <code className="font-mono bg-white px-1">G-</code> 접두어 포함 그대로 / Property ID 는 숫자 앞에 <code className="font-mono bg-white px-1">properties/</code> 를 붙여서 입력 (예: <code className="font-mono bg-white px-1">properties/123456789</code>).
              </>
            }
          />
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
          <SectionHelp
            title="처음이라면 — 네이버 사이트 등록 방법"
            consoleLabel="네이버 서치어드바이저 열기"
            consoleUrl="https://searchadvisor.naver.com"
            steps={[
              <>네이버 계정으로 로그인 후 상단 <strong>웹마스터 도구</strong> 진입.</>,
              <>
                <strong>사이트 관리 → 사이트 등록</strong> 클릭 → 사이트 URL 입력 (예: <code className="font-mono bg-white px-1">https://yourbrand.com</code>).
              </>,
              <>
                안내된 <strong>HTML 메타태그</strong>를 사이트 <code className="font-mono bg-white px-1">&lt;head&gt;</code> 에 추가하거나 <strong>HTML 파일</strong>을 루트에 업로드 → <strong>소유 확인</strong>.
              </>,
              <>
                등록 완료된 사이트 URL을 그대로 복사. 가능한 빨리 사이트맵·RSS 도 함께 제출 (아래 섹션에서 URL 입력).
              </>,
            ]}
            formatHint={
              <>
                반드시 <code className="font-mono bg-white px-1">https://</code> 접두어 포함 (예: <code className="font-mono bg-white px-1">https://yourbrand.com</code>).
              </>
            }
          />
          <Field label="네이버 등록 사이트 URL">
            <input
              value={naverSiteUrl}
              onChange={(e) => setNaverSiteUrl(e.target.value)}
              placeholder="https://yourbrand.com"
              className="w-full border border-slate-200 rounded-md px-3 py-2 bg-white text-slate-900 placeholder:text-slate-400 font-mono text-xs"
            />
          </Field>

          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider pt-2">
            Sitemap / RSS
          </h4>
          <SectionHelp
            title="처음이라면 — Sitemap / RSS URL 찾는 법"
            consoleLabel="일반적인 위치 가이드"
            consoleUrl="https://www.sitemaps.org/protocol.html"
            steps={[
              <>
                <strong>Sitemap</strong>: 대부분 자동 생성됩니다. 브라우저에서 직접 확인 — 흔한 위치: <code className="font-mono bg-white px-1">/sitemap.xml</code>, <code className="font-mono bg-white px-1">/sitemap_index.xml</code>, <code className="font-mono bg-white px-1">/sitemaps.xml</code>.
              </>,
              <>
                플랫폼별: <strong>Cafe24</strong> 는 관리자페이지 → SEO 설정 / <strong>WordPress</strong> 는 <code className="font-mono bg-white px-1">/sitemap_index.xml</code> (Yoast/Rank Math) / <strong>Next.js</strong> 는 <code className="font-mono bg-white px-1">app/sitemap.ts</code> 로 자동 생성.
              </>,
              <>
                없으면 무료 생성기 (예: xml-sitemaps.com) 로 만들어서 사이트 루트에 업로드.
              </>,
              <>
                <strong>RSS</strong>: 블로그·뉴스 콘텐츠가 있는 사이트만 해당. 흔한 위치: <code className="font-mono bg-white px-1">/feed</code>, <code className="font-mono bg-white px-1">/feed.xml</code>, <code className="font-mono bg-white px-1">/rss.xml</code>. 없으면 비워두세요.
              </>,
            ]}
            formatHint={
              <>
                전체 URL 입력 (예: <code className="font-mono bg-white px-1">https://yourbrand.com/sitemap.xml</code>). 브라우저에서 직접 열어 XML 이 보이는지 먼저 확인 권장.
              </>
            }
          />
          <Field label="Sitemap URL">
            <input
              value={sitemapUrl}
              onChange={(e) => setSitemapUrl(e.target.value)}
              placeholder="https://yourbrand.com/sitemap.xml"
              className="w-full border border-slate-200 rounded-md px-3 py-2 bg-white text-slate-900 placeholder:text-slate-400 font-mono text-xs"
            />
          </Field>
          <Field label="RSS URL">
            <input
              value={rssUrl}
              onChange={(e) => setRssUrl(e.target.value)}
              placeholder="https://yourbrand.com/feed.xml"
              className="w-full border border-slate-200 rounded-md px-3 py-2 bg-white text-slate-900 placeholder:text-slate-400 font-mono text-xs"
            />
          </Field>

          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider pt-2">
            기본 메타데이터
          </h4>
          <SectionHelp
            title="처음이라면 — 메타데이터 작성 가이드"
            consoleLabel="검색 결과 미리보기"
            consoleUrl="https://www.google.com/search?q=site:yourbrand.com"
            steps={[
              <>
                <strong>기본 메타 제목</strong>: 검색 결과에 굵게 표시되는 한 줄. <strong>50-60자</strong> 권장. 형식 = <em>브랜드 — 핵심 가치 + 카테고리</em>. 예: <code className="font-mono bg-white px-1">자사 브랜드 — 핵심 가치 + 제품 카테고리</code>.
              </>,
              <>
                <strong>기본 메타 설명</strong>: 제목 아래 회색 두 줄. <strong>140-160자</strong> 권장. 누가·뭐가·왜 좋은지 핵심을 한 문장으로. 예: <em>&quot;타겟 고객층을 위한 제품 정의 + 가장 강력한 차별점 한 문장.&quot;</em>
              </>,
              <>
                <strong>기본 키워드</strong>: 콤마(,) 로 구분한 5-10개 핵심 검색어. 사용자가 실제로 검색할 표현을 그대로. 예: <code className="font-mono bg-white px-1">제품 카테고리, 자사 브랜드명, 핵심 차별 키워드, 타겟 세그먼트</code>.
              </>,
              <>
                작성 후 위 링크로 구글에 <code className="font-mono bg-white px-1">site:내도메인.com</code> 으로 검색해보면 실제 표시 형태를 확인할 수 있습니다 (인덱싱 후 며칠 소요).
              </>,
            ]}
            formatHint={
              <>
                제목·설명 모두 한국어 그대로 입력. 키워드는 콤마 구분 — 각 키워드 앞뒤 공백은 자동 정리됩니다.
              </>
            }
          />
          <Field label="기본 메타 제목">
            <input
              value={defaultMetaTitle}
              onChange={(e) => setDefaultMetaTitle(e.target.value)}
              placeholder="자사 브랜드 — 핵심 가치 + 카테고리"
              className="w-full border border-slate-200 rounded-md px-3 py-2 bg-white text-slate-900 placeholder:text-slate-400"
            />
          </Field>
          <Field label="기본 메타 설명">
            <textarea
              value={defaultMetaDescription}
              onChange={(e) => setDefaultMetaDescription(e.target.value)}
              rows={2}
              placeholder="(예시) 타겟 고객층을 위한 제품 정의 + 가장 강력한 차별점 한 문장."
              className="w-full border border-slate-200 rounded-md px-3 py-2 bg-white text-slate-900 placeholder:text-slate-400 resize-none"
            />
          </Field>
          <Field label="기본 키워드 (콤마 구분)">
            <input
              value={defaultKeywords}
              onChange={(e) => setDefaultKeywords(e.target.value)}
              placeholder="제품 카테고리, 자사 브랜드명, 핵심 차별 키워드"
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

/**
 * Collapsible step-by-step guide attached to a section header. Default
 * collapsed so power users skip past it; non-technical users click to
 * expand and see a numbered walkthrough + the relevant external console
 * link. Help text uses indented numbered steps and a footer "✓ 입력 형식"
 * line so the user knows exactly what to paste back into the form.
 */
function SectionHelp({
  title,
  consoleLabel,
  consoleUrl,
  steps,
  formatHint,
}: {
  title: string;
  consoleLabel: string;
  consoleUrl: string;
  steps: React.ReactNode[];
  formatHint?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="-mt-1 mb-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 text-[11px] text-brand hover:text-brand-700 font-medium"
      >
        <HelpCircle className="w-3 h-3" />
        {title}
        <ChevronDown
          className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="mt-2 rounded-md border border-brand/20 bg-brand/[0.04] px-3 py-2.5 text-[11px] text-slate-700 leading-relaxed">
          <div className="mb-2">
            <a
              href={consoleUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-brand font-semibold hover:underline"
            >
              {consoleLabel}
              <ExternalLink className="w-3 h-3" />
            </a>
            <span className="text-slate-500"> 에서 다음 순서로 진행하세요.</span>
          </div>
          <ol className="list-decimal pl-4 space-y-1">
            {steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
          {formatHint && (
            <div className="mt-2 pt-2 border-t border-brand/15 text-slate-700">
              <span className="font-semibold text-brand">✓ 입력 형식:</span> {formatHint}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

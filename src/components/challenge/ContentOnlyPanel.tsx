"use client";

import { useState } from "react";
import {
  Package,
  Building2,
  Loader2,
  FileText,
  Globe2,
  AlertTriangle,
} from "lucide-react";
import { DetailPagePreview } from "./DetailPagePreview";

type MarketReport = {
  executive_summary: string;
  matched_programs: Array<{ program_name: string; type: "domestic" | "export"; fit_score: number; leverage: string }>;
  market_signals: string[];
  recommended_actions: string[];
  risks: string[];
  generation_ms: number;
  cost_usd: number;
};

type Locale = "ko" | "en" | "ja" | "zh-tw" | "zh-cn";

type MultilingualSpec = {
  by_locale: Record<Locale, { headline: string; tagline: string; body: string; bullets: string[]; cta: string }>;
  generation_ms: number;
  cost_usd: number;
};

/**
 * Task 2 전용 패널 — 4 산출물 통합 생성:
 *   ① 시장분석 리포트  ② 다국어 상품 기술서  ③ 상세페이지  ④ 홍보영상
 *
 * 추천 결과 의존성 없음 — 기업·제품 정보만으로 작동. 응모/심사 시
 * Task 1 추천 없이 단독 검증 가능.
 */
export function ContentOnlyPanel() {
  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState("");
  const [productName, setProductName] = useState("");
  const [productCategory, setProductCategory] = useState("");
  const [productDescription, setProductDescription] = useState("");
  const [productImageUrl, setProductImageUrl] = useState("");
  const [goal, setGoal] = useState("");
  const [activeSpecLocale, setActiveSpecLocale] = useState<Locale>("ko");

  const [report, setReport] = useState<MarketReport | null>(null);
  const [spec, setSpec] = useState<MultilingualSpec | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (!productName.trim()) {
      setError("제품명은 필수입니다 (다국어 기술서·상세페이지 생성에 사용)");
      return;
    }
    setLoading(true);
    setError(null);
    setReport(null);
    setSpec(null);
    try {
      const body = {
        company: {
          name: companyName || undefined,
          industry: industry || undefined,
        },
        product: {
          name: productName,
          category: productCategory || undefined,
          description: productDescription || undefined,
        },
        goal: goal || undefined,
        recommendations: [],
      };
      const res = await fetch("/api/challenge/content", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || j.detail || "content failed");
      }
      const json = (await res.json()) as {
        report?: MarketReport | { error: string };
        spec?: MultilingualSpec | { error: string };
      };
      const reportErr = json.report && "error" in json.report ? json.report.error : null;
      const specErr = json.spec && "error" in json.spec ? json.spec.error : null;
      if (reportErr && specErr) throw new Error(`report: ${reportErr} / spec: ${specErr}`);
      setReport(reportErr ? null : ((json.report as MarketReport) ?? null));
      setSpec(specErr ? null : ((json.spec as MultilingualSpec) ?? null));
      if (reportErr) setError(`시장분석 실패: ${reportErr}`);
      if (specErr) setError(`다국어 기술서 실패: ${specErr}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "콘텐츠 생성 실패");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Input */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <header className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <Package className="w-4 h-4 text-sky-600" />
            제품 정보 (4 산출물 생성용)
          </h2>
        </header>
        <div className="px-5 py-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="제품명 *" value={productName} setValue={setProductName} placeholder="메리노 울 스니커즈" />
            <Field label="카테고리" value={productCategory} setValue={setProductCategory} placeholder="신발 / 화장품 / 식품 ..." />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-slate-500 block mb-1">제품 설명</label>
            <textarea
              value={productDescription}
              onChange={(e) => setProductDescription(e.target.value)}
              rows={2}
              placeholder="핵심 차별점·소재·타겟 시장·가격 등"
              className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 bg-white text-slate-900"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-slate-500 block mb-1">
              제품 이미지 URL (선택 — 상세페이지 hero + 홍보영상에 사용)
            </label>
            <input
              value={productImageUrl}
              onChange={(e) => setProductImageUrl(e.target.value)}
              placeholder="https://..."
              className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 bg-white text-slate-900"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="기업명 (선택)" value={companyName} setValue={setCompanyName} placeholder="(주)예시기업" />
            <Field label="업종 (선택)" value={industry} setValue={setIndustry} placeholder="신발 제조" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-slate-500 block mb-1">목표 (선택)</label>
            <textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              rows={2}
              placeholder="예: 동남아 진출 / ESG 인증"
              className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 bg-white text-slate-900"
            />
          </div>
        </div>
      </section>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void run()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-md bg-sky-600 text-white text-sm font-medium hover:bg-sky-700 disabled:opacity-60"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
          {loading ? "생성 중… (~60초)" : "4 산출물 생성"}
        </button>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5" />
          {error}
        </div>
      )}

      {/* ① 시장분석 리포트 */}
      {report && (
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <header className="px-5 py-4 border-b border-slate-100">
            <div className="flex items-baseline gap-2">
              <span className="text-[10px] font-bold text-slate-400">①</span>
              <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-600" />
                시장분석 리포트
              </h2>
            </div>
          </header>
          <div className="px-5 py-4 space-y-4">
            <div>
              <h3 className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Executive Summary</h3>
              <p className="text-sm text-slate-900 leading-relaxed">{report.executive_summary}</p>
            </div>
            {report.market_signals.length > 0 && (
              <BulletSection title="시장 신호" items={report.market_signals} />
            )}
            {report.recommended_actions.length > 0 && (
              <BulletSection title="추천 액션" items={report.recommended_actions} tone="emerald" />
            )}
            {report.risks.length > 0 && (
              <BulletSection title="리스크" items={report.risks} tone="amber" />
            )}
          </div>
        </section>
      )}

      {/* ③ 상세페이지 (spec 있을 때) */}
      {spec && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1 px-1">
            <span className="font-bold">③</span> 상세페이지 미리보기 + ④ 홍보영상
          </div>
          <DetailPagePreview spec={spec.by_locale} imageUrl={productImageUrl || null} productName={productName} />
        </div>
      )}

      {/* ② 다국어 상품 기술서 */}
      {spec && (
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <header className="px-5 py-4 border-b border-slate-100">
            <div className="flex items-baseline gap-2">
              <span className="text-[10px] font-bold text-slate-400">②</span>
              <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <Globe2 className="w-4 h-4 text-sky-600" />
                다국어 상품 기술서 (5개국어)
              </h2>
            </div>
          </header>
          <div className="px-5 py-3 border-b border-slate-100 flex gap-1.5 overflow-x-auto">
            {(["ko", "en", "ja", "zh-tw", "zh-cn"] as Locale[]).map((loc) => (
              <button
                key={loc}
                type="button"
                onClick={() => setActiveSpecLocale(loc)}
                className={`shrink-0 text-xs px-3 py-1.5 rounded-md border ${
                  activeSpecLocale === loc
                    ? "bg-sky-600 border-sky-600 text-white font-medium"
                    : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                }`}
              >
                {loc === "ko" ? "한국어" : loc === "en" ? "English" : loc === "ja" ? "日本語" : loc === "zh-tw" ? "繁體中文" : "简体中文"}
              </button>
            ))}
          </div>
          <div className="px-5 py-4 space-y-3">
            {(() => {
              const s = spec.by_locale[activeSpecLocale];
              if (!s || !s.headline) return <p className="text-xs text-slate-500">데이터 없음</p>;
              return (
                <>
                  <Row label="Headline" v={<p className="text-lg font-bold text-slate-900">{s.headline}</p>} />
                  <Row label="Tagline" v={<p className="text-sm text-slate-800">{s.tagline}</p>} />
                  <Row label="Body" v={<p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{s.body}</p>} />
                  {s.bullets && s.bullets.length > 0 && (
                    <Row
                      label="Key bullets"
                      v={
                        <ul className="space-y-1">
                          {s.bullets.map((b, i) => (
                            <li key={i} className="text-sm text-slate-800">· {b}</li>
                          ))}
                        </ul>
                      }
                    />
                  )}
                  <Row label="CTA" v={<p className="text-sm font-medium text-emerald-700">{s.cta}</p>} />
                </>
              );
            })()}
          </div>
        </section>
      )}
    </div>
  );
}

function Field({ label, value, setValue, placeholder }: { label: string; value: string; setValue: (s: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider text-slate-500 block mb-1">{label}</label>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 bg-white text-slate-900"
      />
    </div>
  );
}

function BulletSection({ title, items, tone }: { title: string; items: string[]; tone?: "emerald" | "amber" }) {
  const dot = tone === "emerald" ? "bg-emerald-500" : tone === "amber" ? "bg-amber-500" : "bg-slate-400";
  return (
    <div>
      <h3 className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">{title}</h3>
      <ul className="space-y-1">
        {items.map((it, i) => (
          <li key={i} className="text-sm text-slate-800 flex items-start gap-2">
            <span className={`shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full ${dot}`} />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Row({ label, v }: { label: string; v: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">{label}</div>
      {v}
    </div>
  );
}

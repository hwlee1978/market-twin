"use client";

import { useState } from "react";
import {
  Package,
  Building2,
  Loader2,
  FileText,
  Globe2,
  AlertTriangle,
  Database,
} from "lucide-react";
import { DetailPagePreview } from "./DetailPagePreview";

type HofstedeProfile = {
  powerDistance: number;
  individualism: number;
  masculinity: number;
  uncertaintyAvoidance: number;
  longTermOrientation: number;
  indulgence: number;
};

type PublicDataGrounding = {
  targetCountry: string;
  category: string;
  hofstede: { korea: HofstedeProfile; target: HofstedeProfile; distance: number } | null;
  worldBank: {
    country: string;
    gdpPerCapitaPpp: number;
    population: number;
    householdConsumptionPpp: number;
    gdpUsd: number;
    year: number;
  } | null;
  kotra: {
    totalKoreanCompanies: number;
    categoryMatched: Array<{
      parentName: string;
      localName: string;
      industry: string;
      category: string;
    }>;
  } | null;
  comtrade: {
    hsCodes: string[];
    flows: Array<{ year: number; tradeValueUsd: number }>;
    yoyGrowthPct: number | null;
  } | null;
  fetched_ms: number;
  errors: string[];
};

type MarketReport = {
  executive_summary: string;
  matched_programs: Array<{ program_name: string; type: "domestic" | "export"; fit_score: number; leverage: string }>;
  market_signals: string[];
  recommended_actions: string[];
  risks: string[];
  public_data_grounding?: PublicDataGrounding;
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

      {/* 공공데이터 grounding (Market Twin anchor) */}
      {report?.public_data_grounding && (
        <GroundingPanel g={report.public_data_grounding} />
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

// 한국식 단위 formatter — 미국식 "101.0M" 대신 "1억 100만 명" 등 한국 독자
// 친화적 표기. anchors.ts의 fmtKoPopulation/fmtKoUsd/fmtKoUsdSmall과 동일.
function fmtKoPopulation(n: number): string {
  if (!Number.isFinite(n)) return "n/a";
  const eok = Math.floor(n / 1e8);
  const man = Math.floor((n - eok * 1e8) / 1e4);
  if (eok > 0) return man > 0 ? `${eok}억 ${man.toLocaleString()}만 명` : `${eok}억 명`;
  return man > 0 ? `${man.toLocaleString()}만 명` : `${Math.round(n).toLocaleString()}명`;
}
function fmtKoUsd(n: number): string {
  if (!Number.isFinite(n)) return "n/a";
  if (n >= 1e12) {
    const jo = n / 1e12;
    return `${jo.toFixed(jo >= 10 ? 1 : 2)}조 달러`;
  }
  if (n >= 1e8) {
    const eok = Math.floor(n / 1e8);
    const cheonman = Math.floor((n - eok * 1e8) / 1e7);
    if (eok >= 100) return `${eok.toLocaleString()}억 달러`;
    if (cheonman > 0) return `${eok}억 ${cheonman}천만 달러`;
    return `${eok}억 달러`;
  }
  if (n >= 1e4) return `${Math.round(n / 1e4).toLocaleString()}만 달러`;
  return `$${Math.round(n).toLocaleString()}`;
}
function fmtKoUsdSmall(n: number): string {
  if (!Number.isFinite(n)) return "n/a";
  if (n >= 1e4) {
    const man = Math.floor(n / 1e4);
    const rest = Math.round((n - man * 1e4) / 100) * 100;
    if (rest > 0) return `${man}만 ${rest.toLocaleString()}달러`;
    return `${man}만 달러`;
  }
  return `${Math.round(n).toLocaleString()}달러`;
}

function GroundingPanel({ g }: { g: PublicDataGrounding }) {

  return (
    <section className="bg-gradient-to-br from-violet-50 to-sky-50 rounded-xl border border-violet-200 shadow-sm">
      <header className="px-5 py-4 border-b border-violet-200">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <Database className="w-4 h-4 text-violet-600" />
            공공데이터 그라운딩
            <span className="text-[10px] font-normal text-violet-600 bg-white px-2 py-0.5 rounded-full border border-violet-200">
              Market Twin anchor
            </span>
          </h2>
          <div className="text-[10px] text-slate-500">
            타겟국 <strong className="text-violet-700">{g.targetCountry}</strong> · {g.category} · fetch {g.fetched_ms}ms
          </div>
        </div>
        <p className="text-[11px] text-slate-600 mt-1">
          아래 4개 정부·국제기구 공개 데이터가 LLM 리포트의 grounding context로 주입됩니다.
          시장신호 항목에서 이 수치를 직접 인용합니다.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-5">
        {/* Hofstede */}
        {g.hofstede ? (
          <div className="bg-white rounded-lg border border-slate-200 p-3">
            <div className="flex items-baseline justify-between mb-1">
              <h3 className="text-xs font-semibold text-slate-900">Hofstede 6-Dim</h3>
              <span className="text-[10px] text-slate-400">cultural distance</span>
            </div>
            <div className="flex items-baseline gap-2 mb-2">
              <span className="text-2xl font-bold text-violet-600 tabular-nums">{g.hofstede.distance}</span>
              <span className="text-[11px] text-slate-500">
                KR↔{g.targetCountry} 거리 ({g.hofstede.distance < 30 ? "매우 가까움" : g.hofstede.distance < 50 ? "보통" : "먼 거리"})
              </span>
            </div>
            <div className="space-y-0.5 text-[10px] text-slate-600 font-mono">
              {(
                [
                  ["권력거리", "powerDistance"],
                  ["개인주의", "individualism"],
                  ["남성성", "masculinity"],
                  ["불확실성회피", "uncertaintyAvoidance"],
                  ["장기지향", "longTermOrientation"],
                  ["탐닉", "indulgence"],
                ] as Array<[string, keyof HofstedeProfile]>
              ).map(([label, key]) => {
                const kr = g.hofstede!.korea[key];
                const tg = g.hofstede!.target[key];
                return (
                  <div key={key} className="flex justify-between">
                    <span className="text-slate-500">{label}</span>
                    <span>
                      KR <strong>{kr}</strong> · {g.targetCountry} <strong>{tg}</strong>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <Skeleton label="Hofstede" />
        )}

        {/* World Bank */}
        {g.worldBank ? (
          <div className="bg-white rounded-lg border border-slate-200 p-3">
            <div className="flex items-baseline justify-between mb-1">
              <h3 className="text-xs font-semibold text-slate-900">World Bank 거시지표</h3>
              <span className="text-[10px] text-slate-400">{g.worldBank.year}</span>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between">
                <span className="text-[11px] text-slate-500">인구</span>
                <span className="text-sm font-semibold text-violet-700">
                  {fmtKoPopulation(g.worldBank.population)}
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-[11px] text-slate-500">1인당 GDP(PPP)</span>
                <span className="text-sm font-semibold text-violet-700">
                  {fmtKoUsdSmall(g.worldBank.gdpPerCapitaPpp)}
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-[11px] text-slate-500">가계소비</span>
                <span className="text-sm font-semibold text-violet-700">
                  {fmtKoUsd(g.worldBank.householdConsumptionPpp)}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <Skeleton label="World Bank" note="Taiwan 등 일부 국가 미수록" />
        )}

        {/* KOTRA */}
        {g.kotra ? (
          <div className="bg-white rounded-lg border border-slate-200 p-3">
            <div className="flex items-baseline justify-between mb-1">
              <h3 className="text-xs font-semibold text-slate-900">KOTRA 진출 한국기업</h3>
              <span className="text-[10px] text-slate-400">korCompList</span>
            </div>
            <div className="flex items-baseline gap-3 mb-2">
              <div>
                <span className="text-2xl font-bold text-violet-600 tabular-nums">{g.kotra.totalKoreanCompanies}</span>
                <span className="text-[11px] text-slate-500 ml-1">전체</span>
              </div>
              <div>
                <span className="text-lg font-semibold text-emerald-600 tabular-nums">{g.kotra.categoryMatched.length}</span>
                <span className="text-[11px] text-slate-500 ml-1">{g.category} 매칭</span>
              </div>
            </div>
            {g.kotra.categoryMatched.length > 0 && (
              <ul className="text-[10px] text-slate-600 space-y-0.5">
                {g.kotra.categoryMatched.slice(0, 5).map((c, i) => (
                  <li key={i} className="truncate">
                    · <strong>{c.parentName || c.localName}</strong>
                    <span className="text-slate-400"> ({c.industry || c.category})</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <Skeleton label="KOTRA" note="DATAGOKR_API_KEY 필요" />
        )}

        {/* Comtrade */}
        {g.comtrade && g.comtrade.flows.length > 0 ? (
          <div className="bg-white rounded-lg border border-slate-200 p-3">
            <div className="flex items-baseline justify-between mb-1">
              <h3 className="text-xs font-semibold text-slate-900">UN Comtrade — KR 수출</h3>
              <span className="text-[10px] text-slate-400">HS {g.comtrade.hsCodes.join("/")}</span>
            </div>
            <div className="space-y-0.5 mb-1">
              {g.comtrade.flows.map((f) => (
                <div key={f.year} className="flex justify-between text-[11px]">
                  <span className="text-slate-500">{f.year}년</span>
                  <span className="font-semibold text-slate-900">{fmtKoUsd(f.tradeValueUsd)}</span>
                </div>
              ))}
            </div>
            {g.comtrade.yoyGrowthPct !== null && (
              <div className="text-[11px] mt-1 pt-1 border-t border-slate-100">
                전년 대비{" "}
                <span
                  className={
                    g.comtrade.yoyGrowthPct >= 0
                      ? "text-emerald-600 font-semibold"
                      : "text-red-600 font-semibold"
                  }
                >
                  {g.comtrade.yoyGrowthPct >= 0 ? "▲" : "▼"} {Math.abs(g.comtrade.yoyGrowthPct)}%
                </span>
              </div>
            )}
          </div>
        ) : (
          <Skeleton label="UN Comtrade" note="COMTRADE_API_KEY 필요 (free tier)" />
        )}
      </div>

      {g.errors.length > 0 && (
        <div className="px-5 pb-4 -mt-1">
          <details className="text-[10px] text-slate-500">
            <summary className="cursor-pointer hover:text-slate-700">
              {g.errors.length}개 anchor fetch 실패 — 자세히
            </summary>
            <ul className="mt-1 ml-3 space-y-0.5 list-disc">
              {g.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </details>
        </div>
      )}
    </section>
  );
}

function Skeleton({ label, note }: { label: string; note?: string }) {
  return (
    <div className="bg-white/60 rounded-lg border border-dashed border-slate-300 p-3">
      <h3 className="text-xs font-semibold text-slate-400">{label}</h3>
      <p className="text-[10px] text-slate-400 mt-1">데이터 없음{note ? ` — ${note}` : ""}</p>
    </div>
  );
}

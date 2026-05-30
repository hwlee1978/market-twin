"use client";

import { useState } from "react";
import {
  Building2,
  Package,
  Target,
  Loader2,
  Sparkles,
  ExternalLink,
  AlertTriangle,
  Hash,
  Clock,
  DollarSign,
} from "lucide-react";

type Recommendation = {
  program_id: string;
  program_table: "ch_pp_programs" | "ch_voucher_programs";
  program_name: string;
  type: "domestic" | "export";
  similarity_score: number;
  llm_rank: number;
  llm_score: number;
  reason: string;
  warnings?: string[];
};

type RecommendResponse = {
  recommendations: Recommendation[];
  input_hash: string;
  stage1_candidates?: number;
  generation_ms?: number;
  cost_usd?: number;
  cached?: boolean;
  cached_at?: string;
};

export function ChallengeRecommendPanel() {
  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState("");
  const [region, setRegion] = useState("");
  const [revenueBand, setRevenueBand] = useState("");
  const [employeeBand, setEmployeeBand] = useState("");
  const [productName, setProductName] = useState("");
  const [productCategory, setProductCategory] = useState("");
  const [productDescription, setProductDescription] = useState("");
  const [intent, setIntent] = useState<"both" | "domestic" | "export">("both");
  const [goal, setGoal] = useState("");

  const [result, setResult] = useState<RecommendResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const body = {
        company: {
          name: companyName || undefined,
          industry: industry || undefined,
          region: region || undefined,
          revenue_band: revenueBand || undefined,
          employee_band: employeeBand || undefined,
        },
        products: productName
          ? [
              {
                name: productName,
                category: productCategory || undefined,
                description: productDescription || undefined,
              },
            ]
          : undefined,
        intent,
        goal: goal || undefined,
      };
      const res = await fetch("/api/challenge/recommend", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || j.detail || "recommend failed");
      }
      const json = (await res.json()) as RecommendResponse;
      setResult(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "추천 실패");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Input form */}
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-violet-600" />
            기업 정보
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            정확한 매칭을 위해 가능한 한 자세히 입력 (모두 선택 사항)
          </p>
        </header>
        <div className="px-5 py-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="기업명" value={companyName} setValue={setCompanyName} placeholder="(주)예시기업" />
          <Field label="업종" value={industry} setValue={setIndustry} placeholder="화장품 제조, 식품 가공, ..." />
          <Field label="지역" value={region} setValue={setRegion} placeholder="서울, 경기, 부산, ..." />
          <Field
            label="매출 규모"
            value={revenueBand}
            setValue={setRevenueBand}
            placeholder="10억 이하, 10-50억, 50-100억, ..."
          />
          <Field
            label="종업원 수"
            value={employeeBand}
            setValue={setEmployeeBand}
            placeholder="5명 이하, 5-20명, 20-50명, ..."
          />
        </div>
      </section>

      {/* Product */}
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <Package className="w-4 h-4 text-emerald-600" />
            대표 제품 (선택)
          </h2>
        </header>
        <div className="px-5 py-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="제품명" value={productName} setValue={setProductName} placeholder="메리노 울 스니커즈" />
            <Field
              label="카테고리"
              value={productCategory}
              setValue={setProductCategory}
              placeholder="신발, 화장품, 식품, ..."
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-slate-500 block mb-1">
              제품 설명
            </label>
            <textarea
              value={productDescription}
              onChange={(e) => setProductDescription(e.target.value)}
              rows={2}
              placeholder="핵심 차별점·소재·타겟 시장 등"
              className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 bg-white text-slate-900"
            />
          </div>
        </div>
      </section>

      {/* Intent + Goal */}
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <Target className="w-4 h-4 text-rose-600" />
            추천 방향
          </h2>
        </header>
        <div className="px-5 py-4 space-y-3">
          <div className="flex gap-2">
            {(["both", "domestic", "export"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setIntent(v)}
                className={`flex-1 text-sm px-3 py-2 rounded-md border ${
                  intent === v
                    ? "bg-violet-600 border-violet-600 text-white font-semibold"
                    : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                }`}
              >
                {v === "both" ? "내수 + 수출" : v === "domestic" ? "내수 지원사업" : "수출 바우처"}
              </button>
            ))}
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-slate-500 block mb-1">
              목표 (선택)
            </label>
            <textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              rows={2}
              placeholder="예: 동남아 신규 진출 / R&D 인증 / 마케팅 비용 지원"
              className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 bg-white text-slate-900"
            />
          </div>
        </div>
      </section>

      {/* CTA */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void run()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-md bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-sm font-medium hover:opacity-90 disabled:opacity-60"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {loading ? "분석 중… (15-30초)" : "적합 판로 추천"}
        </button>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5" />
          {error}
        </div>
      )}

      {/* Results */}
      {result && (
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <header className="px-5 py-4 border-b border-slate-100">
            <h2 className="text-base font-semibold text-slate-900">
              추천 결과 ({result.recommendations.length}개)
            </h2>
            <div className="mt-1 text-[11px] text-slate-500 flex flex-wrap gap-3">
              <span className="inline-flex items-center gap-1">
                <Hash className="w-3 h-3" /> 재현성 키: <code>{result.input_hash.slice(0, 12)}…</code>
              </span>
              {result.stage1_candidates !== undefined && (
                <span>Stage 1 후보: {result.stage1_candidates}개</span>
              )}
              {result.generation_ms !== undefined && (
                <span className="inline-flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {(result.generation_ms / 1000).toFixed(1)}초
                </span>
              )}
              {result.cost_usd !== undefined && (
                <span className="inline-flex items-center gap-1">
                  <DollarSign className="w-3 h-3" /> ${result.cost_usd.toFixed(3)}
                </span>
              )}
              {result.cached && (
                <span className="text-violet-700 font-medium">
                  ✓ 캐시 (재현성 검증 결과 — 새 LLM 호출 없음)
                </span>
              )}
            </div>
          </header>
          <ul className="divide-y divide-slate-100">
            {result.recommendations.map((r) => (
              <li key={`${r.program_id}-${r.llm_rank}`} className="px-5 py-4">
                <div className="flex items-start gap-3">
                  <div className="shrink-0 w-9 h-9 rounded-lg bg-violet-100 text-violet-700 flex items-center justify-center font-bold">
                    {r.llm_rank}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-slate-900">{r.program_name}</h3>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded ${
                          r.type === "domestic"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-sky-100 text-sky-800"
                        }`}
                      >
                        {r.type === "domestic" ? "내수 지원사업" : "수출 바우처"}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-700 leading-relaxed">{r.reason}</p>
                    {r.warnings && r.warnings.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {r.warnings.map((w, i) => (
                          <div
                            key={i}
                            className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 px-2 py-1 rounded inline-flex items-center gap-1.5"
                          >
                            <AlertTriangle className="w-3 h-3" /> {w}
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="mt-2 text-[10px] text-slate-400 flex gap-3">
                      <span>LLM 적합도: <b>{r.llm_score}</b>/100</span>
                      {r.similarity_score > 0 && (
                        <span>Stage1 유사도: <b>{(r.similarity_score * 100).toFixed(1)}%</b></span>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  setValue,
  placeholder,
}: {
  label: string;
  value: string;
  setValue: (s: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider text-slate-500 block mb-1">
        {label}
      </label>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 bg-white text-slate-900"
      />
    </div>
  );
}

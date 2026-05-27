"use client";

import { useEffect, useState } from "react";
import { Loader2, Search, RefreshCw, Bot, AlertCircle } from "lucide-react";

type PerLLM = {
  llm: "claude" | "gpt" | "gemini";
  queries: Array<{
    query: string;
    response_text: string;
    brand_mentioned: boolean;
    brand_position: number | null;
    competitors_mentioned: string[];
    cited_domains: string[];
  }>;
  brand_mention_rate: number;
  avg_brand_position: number | null;
};

type Audit = {
  id: string;
  brand_name: string;
  brand_category: string | null;
  market_country: string | null;
  visibility_score: number | null;
  per_llm: PerLLM[];
  test_queries: string[];
  top_competitors: Array<{ name: string; mentions: number }>;
  top_sources: Array<{ domain: string; mentions: number }>;
  cost_usd: number | null;
  generated_at: string;
};

const LLM_LABEL: Record<string, string> = {
  claude: "Claude",
  gpt: "ChatGPT",
  gemini: "Gemini",
};
const LLM_COLOR: Record<string, string> = {
  claude: "bg-orange-50 text-orange-800 border-orange-200",
  gpt: "bg-emerald-50 text-emerald-800 border-emerald-200",
  gemini: "bg-blue-50 text-blue-800 border-blue-200",
};

export function LLMVisibilityPanel({
  defaultBrand,
  defaultCategory,
  defaultMarket,
  channelId,
}: {
  defaultBrand: string;
  defaultCategory: string;
  defaultMarket: string | null;
  channelId?: string;
}) {
  const [audit, setAudit] = useState<Audit | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedLLM, setExpandedLLM] = useState<string | null>(null);
  const [brandName, setBrandName] = useState(defaultBrand);
  const [category, setCategory] = useState(defaultCategory);
  const [customQueriesText, setCustomQueriesText] = useState("");
  const [showCustomQueries, setShowCustomQueries] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/mrai/llm-seo/visibility-audit", {
          cache: "no-store",
        });
        if (!res.ok) {
          if (!cancelled) setLoading(false);
          return;
        }
        const json = (await res.json()) as { audit: Audit | null };
        if (!cancelled) {
          setAudit(json.audit);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const runAudit = async () => {
    setRunning(true);
    setError(null);
    try {
      const customQueries = customQueriesText
        .split("\n")
        .map((s) => s.trim())
        .filter((s) => s.length >= 3 && s.length <= 300)
        .slice(0, 10);
      const res = await fetch("/api/mrai/llm-seo/visibility-audit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          brand_name: brandName.trim(),
          brand_category: category.trim(),
          market_country: defaultMarket,
          marketing_channel_id: channelId ?? null,
          custom_queries:
            customQueries.length > 0 ? customQueries : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "감사 실패");
      setAudit(json.audit);
    } catch (e) {
      setError(e instanceof Error ? e.message : "감사 실패");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <Bot className="w-4 h-4 text-violet-600" />
            LLM Search 가시성
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Claude / ChatGPT / Gemini가 우리 카테고리에서 무엇을 추천하는지
            측정. 답변엔진 시대의 새 SEO 지표.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void runAudit()}
          disabled={running || !brandName.trim() || !category.trim()}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-violet-600 text-white text-xs font-medium hover:bg-violet-700 disabled:opacity-60"
        >
          {running ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5" />
          )}
          {running ? "감사 실행 중… (~$0.10, 90초)" : audit ? "다시 감사" : "감사 실행"}
        </button>
      </div>

      <div className="px-5 py-4 space-y-4">
        {/* Brand + category inputs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-slate-500 block mb-1">
              브랜드명
            </label>
            <input
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              disabled={running}
              className="w-full text-sm border border-slate-200 rounded-md px-3 py-1.5 bg-white text-slate-900"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-slate-500 block mb-1">
              카테고리 (LLM에 던질 질문에 들어감)
            </label>
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              disabled={running}
              placeholder="예: 메리노 울 컴포트 스니커즈"
              className="w-full text-sm border border-slate-200 rounded-md px-3 py-1.5 bg-white text-slate-900"
            />
          </div>
        </div>

        <div>
          <button
            type="button"
            onClick={() => setShowCustomQueries((v) => !v)}
            className="text-[11px] text-indigo-600 hover:text-indigo-800"
          >
            {showCustomQueries ? "▾" : "▸"} 직접 쿼리 지정 (선택 — 자동 생성 대신 사용자 입력 사용)
          </button>
          {showCustomQueries && (
            <div className="mt-2">
              <textarea
                value={customQueriesText}
                onChange={(e) => setCustomQueriesText(e.target.value)}
                disabled={running}
                placeholder={`한 줄에 하나씩. 예:\nWhich merino wool sneaker brands are recommended for daily commuting?\nbest comfortable Korean sneakers for office workers\n메리노 울 컴포트 스니커즈 추천`}
                rows={5}
                className="w-full text-xs border border-slate-200 rounded-md px-3 py-2 bg-white text-slate-900 font-mono"
              />
              <p className="text-[10px] text-slate-400 mt-1">
                내가 manual로 LLM에 테스트해서 효과 본 쿼리를 그대로 넣을 수 있습니다.
                최대 10개. 빈 값이면 자동 생성 사용 (KR 시장은 한국어 3개 + 영어 3개).
              </p>
            </div>
          )}
        </div>

        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700 flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5" />
            <div>{error}</div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-xs text-slate-400 py-6 justify-center">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> 불러오는 중…
          </div>
        ) : !audit ? (
          <div className="text-center text-xs text-slate-400 py-6">
            아직 감사 기록이 없습니다. "감사 실행" 버튼을 누르면 LLM 3개가
            카테고리 관련 질문에 어떻게 답하는지 측정합니다.
          </div>
        ) : (
          <>
            {/* Overall visibility */}
            <div className="rounded-lg bg-gradient-to-br from-violet-50 to-indigo-50 border border-violet-200 px-4 py-4">
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-violet-700 font-medium mb-1">
                    종합 LLM 가시성
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span
                      className={`text-4xl font-bold ${
                        (audit.visibility_score ?? 0) >= 60
                          ? "text-emerald-700"
                          : (audit.visibility_score ?? 0) >= 30
                            ? "text-amber-700"
                            : "text-red-700"
                      }`}
                    >
                      {audit.visibility_score ?? 0}
                    </span>
                    <span className="text-base text-slate-500">/ 100</span>
                  </div>
                </div>
                <div className="text-right text-[11px] text-slate-500">
                  <div>
                    {audit.generated_at &&
                      new Date(audit.generated_at).toLocaleString("ko-KR")}
                  </div>
                  {audit.cost_usd !== null && (
                    <div>비용 ${audit.cost_usd?.toFixed(3)}</div>
                  )}
                </div>
              </div>
            </div>

            {/* Per LLM breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {audit.per_llm.map((llm) => (
                <button
                  type="button"
                  key={llm.llm}
                  onClick={() =>
                    setExpandedLLM((cur) => (cur === llm.llm ? null : llm.llm))
                  }
                  className={`text-left rounded-md border px-3 py-2.5 ${
                    LLM_COLOR[llm.llm] ?? "border-slate-200"
                  } hover:opacity-90`}
                >
                  <div className="text-xs font-semibold">
                    {LLM_LABEL[llm.llm] ?? llm.llm}
                  </div>
                  <div className="mt-1 flex items-baseline gap-1.5">
                    <span className="text-lg font-bold">
                      {Math.round(llm.brand_mention_rate * 100)}%
                    </span>
                    <span className="text-[10px]">언급률</span>
                  </div>
                  <div className="text-[10px] mt-0.5 opacity-80">
                    {llm.queries.filter((q) => q.brand_mentioned).length}/
                    {llm.queries.length} 쿼리에서 언급
                    {llm.avg_brand_position !== null && (
                      <> · 평균 위치 {Math.round(llm.avg_brand_position * 100)}%</>
                    )}
                  </div>
                </button>
              ))}
            </div>

            {/* Expanded LLM detail */}
            {expandedLLM &&
              (() => {
                const llm = audit.per_llm.find((l) => l.llm === expandedLLM);
                if (!llm) return null;
                return (
                  <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">
                      {LLM_LABEL[llm.llm]} 쿼리별 응답
                    </div>
                    <ul className="space-y-3">
                      {llm.queries.map((q, i) => (
                        <li key={i} className="text-xs">
                          <div className="flex items-center gap-2 mb-1">
                            <Search className="w-3 h-3 text-slate-400" />
                            <span className="font-medium text-slate-700">
                              {q.query}
                            </span>
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded ${
                                q.brand_mentioned
                                  ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                                  : "bg-red-100 text-red-700 border border-red-200"
                              }`}
                            >
                              {q.brand_mentioned ? "언급됨" : "언급 X"}
                            </span>
                          </div>
                          <div className="pl-5 text-[11px] text-slate-600 whitespace-pre-line line-clamp-5">
                            {q.response_text}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })()}

            {/* Competitors */}
            {audit.top_competitors.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">
                  답변 엔진이 대신 언급한 경쟁 브랜드
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {audit.top_competitors.slice(0, 12).map((c) => (
                    <span
                      key={c.name}
                      className="text-[11px] bg-amber-50 border border-amber-200 text-amber-800 px-2 py-0.5 rounded"
                    >
                      {c.name}{" "}
                      <span className="text-amber-500">×{c.mentions}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Sources */}
            {audit.top_sources.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">
                  자주 인용된 도메인 (백링크 타겟)
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {audit.top_sources.slice(0, 10).map((s) => (
                    <span
                      key={s.domain}
                      className="text-[11px] bg-slate-100 border border-slate-200 text-slate-700 px-2 py-0.5 rounded"
                    >
                      {s.domain}{" "}
                      <span className="text-slate-400">×{s.mentions}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Test queries used */}
            <details className="text-[11px]">
              <summary className="cursor-pointer text-slate-500 hover:text-slate-900">
                테스트에 사용된 쿼리 ({audit.test_queries.length}개)
              </summary>
              <ul className="mt-1.5 pl-3 space-y-0.5 text-slate-600">
                {audit.test_queries.map((q, i) => (
                  <li key={i}>· {q}</li>
                ))}
              </ul>
            </details>
          </>
        )}
      </div>
    </div>
  );
}

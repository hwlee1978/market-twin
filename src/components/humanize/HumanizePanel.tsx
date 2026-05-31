"use client";

import { useState } from "react";
import {
  Sparkles,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Copy,
  RefreshCw,
  ChevronRight,
} from "lucide-react";

type Detected = {
  id: string;
  severity: "S1" | "S2";
  category: string;
  before: string;
  after: string;
  note?: string;
};

type SelfCheck = {
  preserved_facts: boolean;
  preserved_register: boolean;
  no_genre_drift: boolean;
  no_artificial_additions: boolean;
  residual_s1_count: number;
  residual_s2_count: number;
};

type Result = {
  humanized: string;
  detected: Detected[];
  grade: "A" | "B" | "C" | "D";
  change_rate: number;
  self_check: SelfCheck;
  summary: string;
  original_length: number;
  generation_ms: number;
  cost_usd: number;
};

const SAMPLE = `생성형 AI의 등장은 콘텐츠 산업에 있어서 새로운 패러다임의 전환점을 시사하는 바가 크다. 본질적으로 인공지능은 인간의 창의성을 보조하는 도구로 기능할 수 있으며, 이를 통해 우리는 더욱 효율적인 콘텐츠 제작이 가능해질 것이다. 따라서 콘텐츠 제작자들은 AI를 적극적으로 활용해야 할 것이다.

또한 AI에 의해 생성된 콘텐츠는 다음과 같은 특징을 가지고 있다: (1) 빠른 생산 속도, (2) 균일한 품질, (3) 다양한 변주 가능성. 이러한 특징들은 전략적 관점에서 매우 중요한 의미를 가진다고 판단되어진다. 즉, AI 도구의 도입은 단순한 효율성 증대를 넘어, 콘텐츠 산업 전반에 걸친 구조적 변화를 가져올 수 있는 잠재력을 가지고 있다는 점에서 주목할 만하다.

결론적으로, 우리는 지금이야말로 AI와의 협업 모델을 구축해야 할 때다.`;

const GRADE_TONE: Record<Result["grade"], { bg: string; text: string; label: string }> = {
  A: { bg: "bg-emerald-50 border-emerald-300", text: "text-emerald-700", label: "A · 우수" },
  B: { bg: "bg-sky-50 border-sky-300", text: "text-sky-700", label: "B · 양호" },
  C: { bg: "bg-amber-50 border-amber-300", text: "text-amber-700", label: "C · 보통" },
  D: { bg: "bg-red-50 border-red-300", text: "text-red-700", label: "D · 재작업 권장" },
};

export function HumanizePanel() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [copied, setCopied] = useState(false);

  const charCount = text.length;

  const run = async () => {
    if (text.trim().length < 20) {
      setError("최소 20자 이상 입력하세요");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    setCopied(false);
    try {
      const res = await fetch("/api/tools/humanize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.detail || j.error || `status ${res.status}`);
      }
      const json = (await res.json()) as Result;
      setResult(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "윤문 실패");
    } finally {
      setLoading(false);
    }
  };

  const loadSample = () => {
    setText(SAMPLE);
    setError(null);
    setResult(null);
  };

  const copyResult = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result.humanized);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Input */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <header className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-violet-600" />
            원문 입력 (AI가 작성한 한국어 글)
          </h2>
          <div className="flex items-center gap-3">
            <span className={`text-[11px] tabular-nums ${charCount > 8000 ? "text-red-600 font-semibold" : "text-slate-500"}`}>
              {charCount.toLocaleString()} / 8,000자
            </span>
            <button
              type="button"
              onClick={loadSample}
              className="text-xs text-violet-700 hover:text-violet-900 inline-flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" /> 샘플 불러오기
            </button>
          </div>
        </header>
        <div className="p-5">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={14}
            placeholder="ChatGPT/Claude/Gemini가 쓴 한국어 글을 붙여넣으세요. 최소 20자, 최대 8,000자."
            className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 bg-white text-slate-900 leading-relaxed focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500"
          />
        </div>
      </section>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void run()}
          disabled={loading || charCount < 20 || charCount > 8000}
          className="inline-flex items-center gap-1.5 px-6 py-2.5 rounded-md bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {loading ? "윤문 중… (~30-60초)" : "AI 글 자연스럽게 윤문"}
        </button>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5" />
          {error}
        </div>
      )}

      {/* Result */}
      {result && (
        <>
          {/* Grade + summary */}
          <section
            className={`rounded-xl border-2 px-5 py-4 ${GRADE_TONE[result.grade].bg}`}
          >
            <div className="flex items-baseline justify-between flex-wrap gap-2">
              <div className="flex items-baseline gap-3">
                <span className={`text-2xl font-bold ${GRADE_TONE[result.grade].text}`}>
                  {GRADE_TONE[result.grade].label}
                </span>
                <span className="text-[11px] text-slate-600">
                  탐지·수정 {result.detected.length}건 · 변경률 {(result.change_rate * 100).toFixed(1)}%
                </span>
              </div>
              <span className="text-[10px] text-slate-500 tabular-nums">
                {(result.generation_ms / 1000).toFixed(1)}s · ${result.cost_usd}
              </span>
            </div>
            {result.summary && (
              <p className={`text-sm mt-2 ${GRADE_TONE[result.grade].text}`}>{result.summary}</p>
            )}
          </section>

          {/* Before / After */}
          <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <header className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">윤문 전 → 후</h3>
              <button
                type="button"
                onClick={() => void copyResult()}
                className="inline-flex items-center gap-1.5 text-xs text-slate-700 hover:text-slate-900"
              >
                {copied ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> 복사됨
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" /> 결과 복사
                  </>
                )}
              </button>
            </header>
            <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-100">
              <div className="p-5">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">
                  원문 ({result.original_length.toLocaleString()}자)
                </div>
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                  {text}
                </p>
              </div>
              <div className="p-5">
                <div className="text-[10px] uppercase tracking-wider text-violet-700 mb-2">
                  윤문 결과 ({result.humanized.length.toLocaleString()}자)
                </div>
                <p className="text-sm text-slate-900 leading-relaxed whitespace-pre-wrap">
                  {result.humanized}
                </p>
              </div>
            </div>
          </section>

          {/* Detected patterns */}
          {result.detected.length > 0 && (
            <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <header className="px-5 py-3 border-b border-slate-100">
                <h3 className="text-sm font-semibold text-slate-900">
                  탐지·수정된 AI 패턴 ({result.detected.length}건)
                </h3>
              </header>
              <ul className="divide-y divide-slate-100">
                {result.detected.map((d, i) => (
                  <li key={i} className="px-5 py-3">
                    <div className="flex items-baseline gap-2 mb-1">
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          d.severity === "S1"
                            ? "bg-red-100 text-red-700"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {d.severity}
                      </span>
                      <code className="text-[11px] font-mono text-slate-600">{d.id}</code>
                      <span className="text-[11px] text-slate-500">{d.category}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-red-600 line-through decoration-red-300/60 truncate max-w-[280px]">
                        {d.before}
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="text-emerald-700 font-medium truncate max-w-[280px]">
                        {d.after}
                      </span>
                    </div>
                    {d.note && <p className="text-[11px] text-slate-500 mt-1">{d.note}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Self check */}
          <section className="bg-white rounded-xl border border-slate-200 px-5 py-4">
            <h3 className="text-sm font-semibold text-slate-900 mb-2">자체검증</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-xs">
              <CheckRow ok={result.self_check.preserved_facts} label="사실·수치·고유명사·인용 100% 보존" />
              <CheckRow ok={result.self_check.preserved_register} label="격식 register 유지" />
              <CheckRow ok={result.self_check.no_genre_drift} label="장르 이탈 없음" />
              <CheckRow ok={result.self_check.no_artificial_additions} label="인공 표현 임의 추가 없음" />
              <CheckRow
                ok={result.self_check.residual_s1_count === 0}
                label={`잔존 S1 패턴 ${result.self_check.residual_s1_count}건`}
              />
              <CheckRow
                ok={result.self_check.residual_s2_count <= 4}
                label={`잔존 S2 패턴 ${result.self_check.residual_s2_count}건`}
              />
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function CheckRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={ok ? "text-emerald-600" : "text-amber-600"}>{ok ? "✓" : "△"}</span>
      <span className="text-slate-700">{label}</span>
    </div>
  );
}

"use client";

import { useRef, useState } from "react";
import { parse as csvParse } from "csv-parse/sync";
import { stringify as csvStringify } from "csv-stringify/sync";
import {
  Upload,
  Download,
  Play,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  FileDown,
  Repeat,
  XCircle,
} from "lucide-react";

type InputRow = {
  company_name?: string;
  industry?: string;
  region?: string;
  revenue_band?: string;
  employee_band?: string;
  product_name?: string;
  product_category?: string;
  product_description?: string;
  intent?: string;
  goal?: string;
};

type OutputRow = {
  input_row: number;
  input_company_name: string;
  input_product_name: string;
  input_hash: string;
  rec_rank: number;
  rec_type: "domestic" | "export";
  rec_program_name: string;
  rec_llm_score: number;
  rec_reason: string;
};

type ProcessState =
  | { stage: "idle" }
  | { stage: "preview"; rows: InputRow[] }
  | {
      stage: "running";
      rows: InputRow[];
      done: number;
      total: number;
      results: OutputRow[];
      errors: Array<{ row: number; msg: string }>;
      hashes: Map<number, string>;
    }
  | {
      stage: "done";
      rows: InputRow[];
      results: OutputRow[];
      errors: Array<{ row: number; msg: string }>;
      hashes: Map<number, string>;
    };

const SAMPLE_CSV = `company_name,industry,region,revenue_band,employee_band,product_name,product_category,product_description,intent,goal
(주)예시화장품,화장품 제조,서울,10-50억,5-20명,비건 쿠션 파운데이션,화장품,K-뷰티 비건 쿠션,both,동남아 진출 + ESG 인증
(주)예시신발,신발 제조,경기,50-100억,20-50명,메리노 울 스니커즈,신발,통근용 울 스니커즈,both,대만 시장 진출
(주)예시식품,식품 가공,부산,10억 이하,5명 이하,곤약 라면,식음료,저칼로리 곤약면,export,일본 수출
`;

const TOP_K = 3;
const CONCURRENCY = 2;  // 동시 호출 수 — LLM rate limit 고려

export function BatchRecommendPanel() {
  const [state, setState] = useState<ProcessState>({ stage: "idle" });
  const [error, setError] = useState<string | null>(null);
  const [reprodResult, setReprodResult] = useState<{
    matched: number;
    total: number;
    mismatches: Array<{ row: number; first: string; second: string }>;
  } | null>(null);
  const cancelRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setError(null);
    setReprodResult(null);
    try {
      const text = await file.text();
      const rows = csvParse(text, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      }) as InputRow[];
      if (rows.length === 0) {
        setError("CSV에 데이터 row가 없습니다");
        return;
      }
      if (rows.length > 200) {
        setError(`최대 200 row까지 (현재 ${rows.length}). 분할 업로드 권장.`);
        return;
      }
      setState({ stage: "preview", rows });
    } catch (e) {
      setError(`CSV 파싱 실패: ${e instanceof Error ? e.message : "unknown"}`);
    }
  };

  const loadSample = () => {
    const rows = csvParse(SAMPLE_CSV, { columns: true, skip_empty_lines: true, trim: true }) as InputRow[];
    setState({ stage: "preview", rows });
    setError(null);
    setReprodResult(null);
  };

  const downloadSample = () => {
    const blob = new Blob([SAMPLE_CSV], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "challenge-batch-sample.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const runBatch = async () => {
    if (state.stage !== "preview" && state.stage !== "done") return;
    const rows = state.rows;
    cancelRef.current = false;
    const results: OutputRow[] = [];
    const errors: Array<{ row: number; msg: string }> = [];
    const hashes = new Map<number, string>();

    setState({
      stage: "running",
      rows,
      done: 0,
      total: rows.length,
      results,
      errors,
      hashes,
    });
    setReprodResult(null);

    // Limited concurrency
    let cursor = 0;
    let completed = 0;

    const worker = async () => {
      while (true) {
        if (cancelRef.current) return;
        const idx = cursor++;
        if (idx >= rows.length) return;
        const row = rows[idx];
        try {
          const body = {
            company: {
              name: row.company_name,
              industry: row.industry,
              region: row.region,
              revenue_band: row.revenue_band,
              employee_band: row.employee_band,
            },
            products: row.product_name
              ? [{
                  name: row.product_name,
                  category: row.product_category,
                  description: row.product_description,
                }]
              : undefined,
            intent: (row.intent === "domestic" || row.intent === "export" || row.intent === "both")
              ? row.intent : "both",
            goal: row.goal,
            top_k: TOP_K,
            use_cache: true,
          };
          const res = await fetch("/api/challenge/recommend", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
          });
          if (!res.ok) {
            const j = await res.json().catch(() => ({}));
            throw new Error(j.error || j.detail || `status ${res.status}`);
          }
          const json = (await res.json()) as {
            recommendations: Array<{
              program_table: string;
              program_name: string;
              type: "domestic" | "export";
              llm_score: number;
              llm_rank: number;
              reason: string;
            }>;
            input_hash: string;
          };
          hashes.set(idx, json.input_hash);
          for (const r of json.recommendations) {
            results.push({
              input_row: idx + 1,
              input_company_name: row.company_name ?? "",
              input_product_name: row.product_name ?? "",
              input_hash: json.input_hash,
              rec_rank: r.llm_rank,
              rec_type: r.type,
              rec_program_name: r.program_name,
              rec_llm_score: r.llm_score,
              rec_reason: r.reason,
            });
          }
          // 빈 결과 처리 (챌린지 데이터 미적재 시)
          if (json.recommendations.length === 0) {
            results.push({
              input_row: idx + 1,
              input_company_name: row.company_name ?? "",
              input_product_name: row.product_name ?? "",
              input_hash: json.input_hash,
              rec_rank: 0,
              rec_type: "domestic",
              rec_program_name: "(매칭된 사업 없음 — 챌린지 데이터 미적재)",
              rec_llm_score: 0,
              rec_reason: "",
            });
          }
        } catch (e) {
          errors.push({ row: idx + 1, msg: e instanceof Error ? e.message : "unknown" });
        }
        completed++;
        setState({
          stage: "running",
          rows,
          done: completed,
          total: rows.length,
          results: [...results],
          errors: [...errors],
          hashes: new Map(hashes),
        });
      }
    };

    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

    setState({
      stage: cancelRef.current ? "preview" : "done",
      rows,
      results,
      errors,
      hashes,
    });
  };

  const checkReproducibility = async () => {
    if (state.stage !== "done") return;
    const firstHashes = new Map(state.hashes);
    // 두 번째 실행
    await runBatch();
    // runBatch 후 state는 새 hashes를 가짐 → 비교
    setTimeout(() => {
      setState((curr) => {
        if (curr.stage !== "done") return curr;
        const mismatches: Array<{ row: number; first: string; second: string }> = [];
        let matched = 0;
        for (const [idx, secondHash] of curr.hashes.entries()) {
          const firstHash = firstHashes.get(idx);
          if (firstHash === secondHash) matched++;
          else mismatches.push({ row: idx + 1, first: firstHash ?? "?", second: secondHash });
        }
        setReprodResult({ matched, total: curr.hashes.size, mismatches });
        return curr;
      });
    }, 100);
  };

  const cancel = () => {
    cancelRef.current = true;
  };

  const downloadResults = () => {
    if (state.stage !== "done" && state.stage !== "running") return;
    const csv = csvStringify(state.results, {
      header: true,
      columns: [
        "input_row",
        "input_company_name",
        "input_product_name",
        "input_hash",
        "rec_rank",
        "rec_type",
        "rec_program_name",
        "rec_llm_score",
        "rec_reason",
      ],
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `challenge-batch-results-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Step 1: Upload */}
      {state.stage === "idle" && (
        <section className="bg-white rounded-xl border border-slate-200 p-6">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">CSV 업로드 (최대 200 row)</h3>
          <div
            className="rounded-lg border-2 border-dashed border-slate-300 p-8 text-center hover:border-amber-400 cursor-pointer"
            onClick={() => fileRef.current?.click()}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
              }}
              className="hidden"
            />
            <Upload className="w-8 h-8 mx-auto text-slate-400" />
            <p className="text-sm text-slate-600 mt-2">클릭해서 CSV 선택</p>
            <p className="text-[10px] text-slate-400 mt-1">UTF-8 인코딩 권장</p>
          </div>
          <div className="mt-3 flex gap-2 text-xs">
            <button
              type="button"
              onClick={downloadSample}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50"
            >
              <FileDown className="w-3.5 h-3.5" /> 샘플 CSV 다운로드
            </button>
            <button
              type="button"
              onClick={loadSample}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50"
            >
              <Play className="w-3.5 h-3.5" /> 샘플 3개 입력으로 바로 실행
            </button>
          </div>
          <div className="mt-3 text-[11px] text-slate-500 leading-relaxed">
            <strong className="text-slate-700">필수 컬럼:</strong> company_name, industry, region,
            revenue_band, employee_band, product_name, product_category, product_description, intent
            (domestic/export/both), goal
            <br />
            모든 컬럼 선택사항이지만 매칭 정확도를 위해 가능한 한 자세히.
          </div>
        </section>
      )}

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5" />
          {error}
        </div>
      )}

      {/* Preview */}
      {state.stage === "preview" && (
        <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <header className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">
              미리보기 — {state.rows.length} row 입력 확인
            </h3>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setState({ stage: "idle" })}
                className="text-xs text-slate-600 hover:text-slate-900 px-2 py-1"
              >
                재업로드
              </button>
              <button
                type="button"
                onClick={() => void runBatch()}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-amber-600 text-white text-xs font-medium hover:bg-amber-700"
              >
                <Play className="w-3.5 h-3.5" />
                Batch 실행 (예상 {state.rows.length * 15}-{state.rows.length * 30}초)
              </button>
            </div>
          </header>
          <div className="overflow-x-auto max-h-64">
            <PreviewTable rows={state.rows} />
          </div>
        </section>
      )}

      {/* Running */}
      {state.stage === "running" && (
        <section className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-sm text-slate-900">
              <Loader2 className="w-4 h-4 animate-spin text-amber-600" />
              처리 중… {state.done} / {state.total}
            </div>
            <button
              type="button"
              onClick={cancel}
              className="text-xs text-red-600 hover:text-red-800 inline-flex items-center gap-1"
            >
              <XCircle className="w-3.5 h-3.5" /> 취소
            </button>
          </div>
          <div className="w-full bg-slate-100 rounded h-2 overflow-hidden">
            <div
              className="h-full bg-amber-500 transition-all"
              style={{ width: `${(state.done / state.total) * 100}%` }}
            />
          </div>
          {state.results.length > 0 && (
            <p className="text-[11px] text-slate-500 mt-2">
              누적 추천 row: {state.results.length} · 에러: {state.errors.length}
            </p>
          )}
        </section>
      )}

      {/* Done */}
      {state.stage === "done" && (
        <>
          <section className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span className="font-semibold text-slate-900">완료</span>
                <span className="text-slate-600">
                  {state.rows.length} 입력 → {state.results.length} 추천 row
                  {state.errors.length > 0 && (
                    <span className="text-red-600 ml-1">· 에러 {state.errors.length}</span>
                  )}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void checkReproducibility()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs"
                >
                  <Repeat className="w-3.5 h-3.5" />
                  재현성 검증 (2회차 실행)
                </button>
                <button
                  type="button"
                  onClick={downloadResults}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700"
                >
                  <Download className="w-3.5 h-3.5" /> 결과 CSV 다운로드
                </button>
              </div>
            </div>
            {reprodResult && (
              <div
                className={`rounded-md border px-3 py-2 text-xs ${
                  reprodResult.mismatches.length === 0
                    ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                    : "bg-amber-50 border-amber-200 text-amber-800"
                }`}
              >
                {reprodResult.mismatches.length === 0 ? (
                  <span>
                    <CheckCircle2 className="inline w-3.5 h-3.5 mr-1" />
                    재현성 100% — 2회 실행 모두 input_hash 일치 ({reprodResult.matched}/
                    {reprodResult.total} row)
                  </span>
                ) : (
                  <span>
                    <AlertTriangle className="inline w-3.5 h-3.5 mr-1" />
                    {reprodResult.matched}/{reprodResult.total} 일치 ·{" "}
                    {reprodResult.mismatches.length} mismatch
                  </span>
                )}
              </div>
            )}
          </section>

          {state.errors.length > 0 && (
            <section className="bg-red-50 border border-red-200 rounded-xl p-4 text-xs text-red-800">
              <div className="font-semibold mb-1">실패 row ({state.errors.length})</div>
              <ul className="space-y-0.5 max-h-32 overflow-y-auto">
                {state.errors.map((e, i) => (
                  <li key={i}>· row {e.row}: {e.msg.slice(0, 200)}</li>
                ))}
              </ul>
            </section>
          )}

          <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <header className="px-5 py-3 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-900">결과 미리보기 (최대 50 row)</h3>
            </header>
            <div className="overflow-x-auto max-h-96">
              <ResultsTable results={state.results.slice(0, 50)} />
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function PreviewTable({ rows }: { rows: InputRow[] }) {
  return (
    <table className="w-full text-[11px]">
      <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-wider">
        <tr>
          <th className="px-2 py-1.5 text-left">#</th>
          <th className="px-2 py-1.5 text-left">기업</th>
          <th className="px-2 py-1.5 text-left">업종</th>
          <th className="px-2 py-1.5 text-left">제품</th>
          <th className="px-2 py-1.5 text-left">의도</th>
          <th className="px-2 py-1.5 text-left">목표</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-t border-slate-100">
            <td className="px-2 py-1.5 text-slate-400">{i + 1}</td>
            <td className="px-2 py-1.5 text-slate-900 truncate max-w-[150px]">{r.company_name}</td>
            <td className="px-2 py-1.5 text-slate-700 truncate max-w-[120px]">{r.industry}</td>
            <td className="px-2 py-1.5 text-slate-700 truncate max-w-[200px]">{r.product_name}</td>
            <td className="px-2 py-1.5 text-slate-700">{r.intent}</td>
            <td className="px-2 py-1.5 text-slate-600 truncate max-w-[250px]">{r.goal}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ResultsTable({ results }: { results: OutputRow[] }) {
  return (
    <table className="w-full text-[11px]">
      <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-wider sticky top-0">
        <tr>
          <th className="px-2 py-1.5 text-left">입력#</th>
          <th className="px-2 py-1.5 text-left">기업</th>
          <th className="px-2 py-1.5 text-left">순위</th>
          <th className="px-2 py-1.5 text-left">유형</th>
          <th className="px-2 py-1.5 text-left">사업명</th>
          <th className="px-2 py-1.5 text-right">점수</th>
          <th className="px-2 py-1.5 text-left">이유</th>
          <th className="px-2 py-1.5 text-left">input_hash</th>
        </tr>
      </thead>
      <tbody>
        {results.map((r, i) => (
          <tr key={i} className="border-t border-slate-100">
            <td className="px-2 py-1.5 text-slate-400">{r.input_row}</td>
            <td className="px-2 py-1.5 text-slate-900 truncate max-w-[120px]">{r.input_company_name}</td>
            <td className="px-2 py-1.5 text-slate-700">{r.rec_rank}</td>
            <td className="px-2 py-1.5">
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                r.rec_type === "domestic" ? "bg-amber-100 text-amber-800" : "bg-sky-100 text-sky-800"
              }`}>
                {r.rec_type === "domestic" ? "내수" : "수출"}
              </span>
            </td>
            <td className="px-2 py-1.5 text-slate-900 truncate max-w-[200px]" title={r.rec_program_name}>
              {r.rec_program_name}
            </td>
            <td className="px-2 py-1.5 text-right tabular-nums">{r.rec_llm_score}</td>
            <td className="px-2 py-1.5 text-slate-600 truncate max-w-[280px]" title={r.rec_reason}>
              {r.rec_reason}
            </td>
            <td className="px-2 py-1.5 text-slate-400 font-mono">{r.input_hash.slice(0, 8)}…</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

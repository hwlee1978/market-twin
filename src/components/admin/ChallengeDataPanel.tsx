"use client";

import { useEffect, useState } from "react";
import { Loader2, Database, AlertCircle, ChevronDown, ChevronRight } from "lucide-react";

type TableInfo = {
  table: string;
  count: number;
  sample: Record<string, unknown>[];
  years?: Array<{ year: number; n: number }>;
  error?: string;
};

const TABLE_LABELS: Record<string, { label: string; desc: string }> = {
  ch_pp_programs: { label: "판판대로 — 지원사업", desc: "내수 정부 지원사업 정보 (~90개)" },
  ch_pp_companies: { label: "판판대로 — 선정 기업", desc: "비식별화된 선정 기업 (~7만社)" },
  ch_pp_products: { label: "판판대로 — 제품", desc: "선정 기업 제품 + embedding (~7만)" },
  ch_voucher_programs: { label: "수출바우처 — 프로그램", desc: "수출 지원 프로그램 (~5.8만)" },
  ch_voucher_exports: { label: "수출바우처 — 수출 성과", desc: "기업별 수출 실적 (~1.1만)" },
  ch_recommendations: { label: "추천 결과 (Phase B 산출물)", desc: "사용자 추천 실행 + 재현성 키" },
  ch_ab_battles: { label: "LMArena A/B 결과 (Phase E)", desc: "콘텐츠 블라인드 비교 + 승률" },
};

export function ChallengeDataPanel() {
  const [tables, setTables] = useState<TableInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/admin/challenge-data", { cache: "no-store" });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const json = (await res.json()) as { tables: TableInfo[] };
        setTables(json.tables);
      } catch (e) {
        setError(e instanceof Error ? e.message : "load failed");
      }
    })();
  }, []);

  if (error) {
    return (
      <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700 flex items-start gap-2">
        <AlertCircle className="w-4 h-4 mt-0.5" />
        {error}
      </div>
    );
  }

  if (tables === null) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> 불러오는 중…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Quick-start ingestion instructions */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-5 py-4">
        <h3 className="text-sm font-semibold text-slate-900 mb-2">
          ingestion 사용법
        </h3>
        <pre className="text-[11px] bg-white border border-slate-200 rounded p-3 overflow-x-auto text-slate-800">
{`# (A) 챌린지 측 제공 데이터 (CSV/Excel) ingestion
npm run ingest:challenge -- programs path/to/판판대로_지원사업.csv --dry-run
npm run ingest:challenge -- programs path/to/판판대로_지원사업.csv
npm run ingest:challenge -- companies path/to/판판대로_선정기업.csv
npm run ingest:challenge -- products path/to/판판대로_제품.csv
npm run ingest:challenge -- voucher-programs path/to/수출바우처_프로그램.xlsx
npm run ingest:challenge -- voucher-exports path/to/수출바우처_성과.xlsx

# (B) 공개 데이터 (기업마당 API, 1,385+ 사업) — 챌린지 데이터 도착 전 데모용
# 0) BIZINFO_API_KEY 발급 (https://www.bizinfo.go.kr/apiDetail.do?id=bizinfoApi)
# 1) .env.local 에 BIZINFO_API_KEY=... 설정
npm run fetch:bizinfo -- --dry-run    # API 호출만 확인
npm run fetch:bizinfo                  # 전체 카테고리 적재 (10-15분)

# (C) 임베딩 생성 (위 ingestion 후 1회 — ~$0.86)
npm run embed:challenge -- all`}
        </pre>
        <p className="text-[11px] text-slate-500 mt-2">
          사업자등록번호는 SHA-256 해시로 비식별화 후 저장. 원본은 DB에 적재되지 않음.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {tables.map((t) => {
          const meta = TABLE_LABELS[t.table];
          const isExpanded = expanded === t.table;
          const isEmpty = t.count === 0;
          return (
            <div
              key={t.table}
              className="rounded-xl border border-slate-200 bg-white"
            >
              <button
                type="button"
                onClick={() => setExpanded(isExpanded ? null : t.table)}
                className="w-full flex items-start gap-3 px-5 py-4 text-left hover:bg-slate-50"
              >
                <div className="shrink-0 mt-0.5">
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  )}
                </div>
                <div className="shrink-0 w-9 h-9 rounded-lg bg-violet-100 text-violet-700 flex items-center justify-center">
                  <Database className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <h3 className="text-sm font-semibold text-slate-900">
                      {meta?.label ?? t.table}
                    </h3>
                    <code className="text-[10px] text-slate-400">{t.table}</code>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">{meta?.desc}</p>
                  {t.years && t.years.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {t.years.slice(0, 5).map((y) => (
                        <span
                          key={y.year}
                          className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded"
                        >
                          {y.year}: {y.n.toLocaleString()}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <div
                    className={`text-xl font-bold tabular-nums ${
                      isEmpty ? "text-slate-300" : "text-slate-900"
                    }`}
                  >
                    {t.count.toLocaleString()}
                  </div>
                  <div className="text-[10px] text-slate-400">rows</div>
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-slate-100 px-5 py-3 bg-slate-50/50">
                  {t.error ? (
                    <div className="text-xs text-red-600 flex items-start gap-2">
                      <AlertCircle className="w-3.5 h-3.5 mt-0.5" />
                      {t.error}
                    </div>
                  ) : t.sample.length === 0 ? (
                    <p className="text-xs text-slate-500">
                      데이터 없음 — ingestion 후 다시 확인하세요.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      <div className="text-[10px] uppercase tracking-wider text-slate-500">
                        샘플 row ({t.sample.length}개)
                      </div>
                      <pre className="text-[10px] bg-white border border-slate-200 rounded p-2 overflow-x-auto max-h-64 text-slate-800">
                        {JSON.stringify(t.sample, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import {
  History,
  Loader2,
  AlertTriangle,
  Sparkles,
  Database,
  ArrowRight,
  Package,
  Building2,
  Target,
} from "lucide-react";

type HistoryItem = {
  hash: string;
  generated_at: string;
  cost_usd: number | null;
  company_name: string | null;
  industry: string | null;
  product_name: string | null;
  product_category: string | null;
  goal: string | null;
  target_country: string | null;
  anchor_category: string | null;
  exec_preview: string;
  report_grade: "A" | "B" | "C" | "D" | null;
  spec_grade: "A" | "B" | "C" | "D" | null;
};

const GRADE_TONE: Record<"A" | "B" | "C" | "D", string> = {
  A: "bg-emerald-100 text-emerald-800",
  B: "bg-sky-100 text-sky-800",
  C: "bg-amber-100 text-amber-800",
  D: "bg-red-100 text-red-800",
};

export function ContentHistoryPanel() {
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/challenge/content/history?limit=20", {
          cache: "no-store",
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.detail || j.error || `status ${res.status}`);
        }
        const json = (await res.json()) as { items: HistoryItem[] };
        setItems(json.items);
      } catch (e) {
        setError(e instanceof Error ? e.message : "load failed");
      }
    })();
  }, []);

  if (error) {
    return (
      <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 mt-0.5" />
        {error}
      </div>
    );
  }

  if (items === null) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500 py-12 justify-center">
        <Loader2 className="w-4 h-4 animate-spin" /> 불러오는 중…
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 px-6 py-12 text-center">
        <History className="w-10 h-10 mx-auto text-slate-300 mb-3" />
        <p className="text-sm text-slate-600">아직 생성한 콘텐츠가 없습니다.</p>
        <Link
          href="/sme-strategy/content"
          className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 rounded-md bg-sky-600 text-white text-xs font-medium hover:bg-sky-700"
        >
          첫 콘텐츠 생성 <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <header className="flex items-baseline justify-between flex-wrap gap-2">
        <div className="text-xs text-slate-500">
          최근 생성한 콘텐츠 <strong className="text-slate-900">{items.length}건</strong> · 각 항목 클릭 시 동일 결과 즉시 열람 (LLM 호출 0)
        </div>
        <Link
          href="/sme-strategy/content"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-sky-600 text-white text-xs font-medium hover:bg-sky-700"
        >
          새 콘텐츠 생성 <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </header>

      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.hash}>
            <Link
              href={`/sme-strategy/content?hash=${item.hash}`}
              className="block bg-white rounded-xl border border-slate-200 p-4 hover:border-sky-300 hover:shadow-sm transition"
            >
              <div className="flex items-start gap-3">
                <div className="shrink-0 w-9 h-9 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center">
                  <Package className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2 flex-wrap">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-900 truncate">
                        {item.product_name || "(제품명 없음)"}
                      </span>
                      {item.product_category && (
                        <span className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">
                          {item.product_category}
                        </span>
                      )}
                      {item.target_country && (
                        <span className="text-[10px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded inline-flex items-center gap-1">
                          <Database className="w-2.5 h-2.5" />
                          {item.target_country}
                        </span>
                      )}
                      {item.report_grade && (
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded inline-flex items-center gap-1 ${GRADE_TONE[item.report_grade]}`}
                          title={`시장분석 리포트 윤문 등급 ${item.report_grade}`}
                        >
                          <Sparkles className="w-2.5 h-2.5" />
                          리포트 {item.report_grade}
                        </span>
                      )}
                      {item.spec_grade && (
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded inline-flex items-center gap-1 ${GRADE_TONE[item.spec_grade]}`}
                          title={`다국어 기술서 윤문 등급 ${item.spec_grade}`}
                        >
                          <Sparkles className="w-2.5 h-2.5" />
                          기술서 {item.spec_grade}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-500 tabular-nums shrink-0">
                      {new Date(item.generated_at).toLocaleString("ko-KR", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </span>
                  </div>

                  {(item.company_name || item.industry || item.goal) && (
                    <div className="flex items-baseline gap-3 mt-1 text-[11px] text-slate-600 flex-wrap">
                      {item.company_name && (
                        <span className="inline-flex items-center gap-1">
                          <Building2 className="w-3 h-3" />
                          {item.company_name}
                          {item.industry && <span className="text-slate-400">({item.industry})</span>}
                        </span>
                      )}
                      {item.goal && (
                        <span className="inline-flex items-center gap-1 truncate max-w-[400px]">
                          <Target className="w-3 h-3" />
                          {item.goal}
                        </span>
                      )}
                    </div>
                  )}

                  {item.exec_preview && (
                    <p className="text-xs text-slate-500 mt-1.5 line-clamp-2">
                      {item.exec_preview}
                      {item.exec_preview.length >= 140 && "…"}
                    </p>
                  )}

                  <div className="flex items-baseline justify-between mt-1.5 text-[10px] text-slate-400">
                    <code className="font-mono">{item.hash.slice(0, 12)}…</code>
                    {item.cost_usd !== null && (
                      <span className="tabular-nums">${item.cost_usd.toFixed(4)}</span>
                    )}
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-300 self-center shrink-0" />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

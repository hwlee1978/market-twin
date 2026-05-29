"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, TrendingUp, TrendingDown, Minus, LineChart } from "lucide-react";
import { EmptyState } from "./EmptyState";

type PerLLM = {
  llm: "claude" | "gpt" | "gemini";
  queries: unknown[];
  brand_mention_rate: number;
  avg_brand_position: number | null;
};

type AuditHistoryRow = {
  id: string;
  generated_at: string;
  brand_name: string;
  brand_category: string | null;
  market_country: string | null;
  visibility_score: number | null;
  per_llm: PerLLM[];
  top_competitors: Array<{ name: string; mentions: number }>;
  cost_usd: number | null;
};

const LLM_COLOR: Record<string, string> = {
  claude: "#ea580c", // orange
  gpt: "#10b981", // emerald
  gemini: "#3b82f6", // blue
};
const LLM_LABEL: Record<string, string> = {
  claude: "Claude",
  gpt: "ChatGPT",
  gemini: "Gemini",
};

/**
 * KPI time-series for LLM visibility audits.
 *
 * Renders a line chart of overall + per-LLM mention rate over time,
 * plus a delta vs the prior audit and the top-competitor table.
 *
 * Pure SVG (no chart lib) so the component is lean and the styling
 * matches the existing Mr. AI panels.
 */
export function LLMVisibilityHistoryPanel() {
  const [rows, setRows] = useState<AuditHistoryRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          "/api/mrai/llm-seo/visibility-audit/history?limit=30",
          { cache: "no-store" },
        );
        if (!res.ok) {
          if (!cancelled) setLoading(false);
          return;
        }
        const json = (await res.json()) as { history: AuditHistoryRow[] };
        if (!cancelled) {
          // Sort ascending so the chart reads left=old, right=new
          setRows(
            [...(json.history ?? [])].sort(
              (a, b) => a.generated_at.localeCompare(b.generated_at),
            ),
          );
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

  const chart = useMemo(() => {
    if (!rows || rows.length === 0) return null;
    return buildChart(rows);
  }, [rows]);

  const delta = useMemo(() => {
    if (!rows || rows.length < 2) return null;
    const latest = rows[rows.length - 1].visibility_score ?? 0;
    const prev = rows[rows.length - 2].visibility_score ?? 0;
    return latest - prev;
  }, [rows]);

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm px-5 py-4">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> 추세 불러오는 중…
        </div>
      </div>
    );
  }

  if (!rows || rows.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm px-5 py-4">
        <h2 className="text-base font-semibold text-slate-900 mb-1">
          LLM 가시성 추세
        </h2>
        <EmptyState
          icon={LineChart}
          tone="violet"
          compact
          title="아직 추세 데이터가 없어요"
          description="위 'LLM Search 가시성' 패널에서 감사를 1회 이상 실행하면 시계열이 여기 쌓입니다."
        />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-violet-600" />
            LLM 가시성 추세
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {rows.length}회 감사 · 가장 최근 {new Date(rows[rows.length - 1].generated_at).toLocaleString("ko-KR")}
          </p>
        </div>
        {delta !== null && (
          <div
            className={`flex items-center gap-1 px-2 py-1 rounded-md border text-xs font-semibold ${
              delta > 0
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : delta < 0
                  ? "border-red-200 bg-red-50 text-red-700"
                  : "border-slate-200 bg-slate-50 text-slate-600"
            }`}
          >
            {delta > 0 ? (
              <TrendingUp className="w-3.5 h-3.5" />
            ) : delta < 0 ? (
              <TrendingDown className="w-3.5 h-3.5" />
            ) : (
              <Minus className="w-3.5 h-3.5" />
            )}
            전 회 대비 {delta > 0 ? "+" : ""}
            {delta}
          </div>
        )}
      </div>

      <div className="px-5 py-4 space-y-4">
        {chart}

        {/* Tabular history */}
        <div className="border-t border-slate-100 pt-3">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2">
            감사 이력
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-100">
                  <th className="py-1 pr-3">날짜</th>
                  <th className="py-1 px-2 text-right">종합</th>
                  <th className="py-1 px-2 text-right">Claude</th>
                  <th className="py-1 px-2 text-right">ChatGPT</th>
                  <th className="py-1 px-2 text-right">Gemini</th>
                  <th className="py-1 px-2 text-left">Top 경쟁사</th>
                  <th className="py-1 pl-2 text-right">비용</th>
                </tr>
              </thead>
              <tbody className="text-slate-700">
                {[...rows].reverse().map((r) => {
                  const claude = pct(r.per_llm.find((l) => l.llm === "claude")?.brand_mention_rate);
                  const gpt = pct(r.per_llm.find((l) => l.llm === "gpt")?.brand_mention_rate);
                  const gemini = pct(r.per_llm.find((l) => l.llm === "gemini")?.brand_mention_rate);
                  const top3 = r.top_competitors
                    .slice(0, 3)
                    .map((c) => `${c.name}×${c.mentions}`)
                    .join(", ");
                  return (
                    <tr key={r.id} className="border-b border-slate-50">
                      <td className="py-1.5 pr-3 text-slate-600 whitespace-nowrap">
                        {new Date(r.generated_at).toLocaleString("ko-KR", {
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="py-1.5 px-2 text-right font-semibold">
                        {r.visibility_score ?? "—"}
                      </td>
                      <td className="py-1.5 px-2 text-right text-orange-700">{claude}</td>
                      <td className="py-1.5 px-2 text-right text-emerald-700">{gpt}</td>
                      <td className="py-1.5 px-2 text-right text-blue-700">{gemini}</td>
                      <td className="py-1.5 px-2 text-slate-500 truncate max-w-[280px]">
                        {top3}
                      </td>
                      <td className="py-1.5 pl-2 text-right text-slate-400">
                        ${r.cost_usd?.toFixed(3) ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function pct(rate: number | undefined): string {
  if (typeof rate !== "number") return "—";
  return `${Math.round(rate * 100)}%`;
}

function buildChart(rows: AuditHistoryRow[]): React.ReactNode {
  const W = 800;
  const H = 220;
  const PAD = { top: 18, right: 12, bottom: 28, left: 36 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const n = rows.length;
  const x = (i: number) => PAD.left + (n === 1 ? innerW / 2 : (innerW * i) / (n - 1));
  const y = (val: number) => PAD.top + innerH - (val / 100) * innerH;

  const overallPath = rows
    .map((r, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(r.visibility_score ?? 0)}`)
    .join(" ");
  const llmPaths: Array<{ llm: "claude" | "gpt" | "gemini"; d: string }> = (
    ["claude", "gpt", "gemini"] as const
  ).map((llm) => ({
    llm,
    d: rows
      .map((r, i) => {
        const m = r.per_llm.find((p) => p.llm === llm)?.brand_mention_rate ?? 0;
        return `${i === 0 ? "M" : "L"}${x(i)},${y(m * 100)}`;
      })
      .join(" "),
  }));

  // Y-axis ticks
  const yTicks = [0, 25, 50, 75, 100];
  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        preserveAspectRatio="none"
      >
        {/* gridlines */}
        {yTicks.map((t) => (
          <line
            key={t}
            x1={PAD.left}
            x2={W - PAD.right}
            y1={y(t)}
            y2={y(t)}
            stroke="#e2e8f0"
            strokeWidth="1"
          />
        ))}
        {/* y labels */}
        {yTicks.map((t) => (
          <text
            key={t}
            x={PAD.left - 6}
            y={y(t) + 3}
            textAnchor="end"
            fontSize="9"
            fill="#94a3b8"
          >
            {t}
          </text>
        ))}
        {/* Per-LLM lines (lighter) */}
        {llmPaths.map((p) => (
          <path
            key={p.llm}
            d={p.d}
            fill="none"
            stroke={LLM_COLOR[p.llm]}
            strokeWidth="1.5"
            strokeOpacity="0.55"
          />
        ))}
        {/* Overall line (bold) */}
        <path
          d={overallPath}
          fill="none"
          stroke="#7c3aed"
          strokeWidth="2.5"
        />
        {/* Overall dots */}
        {rows.map((r, i) => (
          <circle
            key={r.id}
            cx={x(i)}
            cy={y(r.visibility_score ?? 0)}
            r="3.5"
            fill="#7c3aed"
          />
        ))}
        {/* X-axis date labels (subset to avoid overlap) */}
        {rows.map((r, i) => {
          if (n > 8 && i % Math.ceil(n / 6) !== 0 && i !== n - 1) return null;
          return (
            <text
              key={r.id}
              x={x(i)}
              y={H - PAD.bottom + 14}
              textAnchor="middle"
              fontSize="9"
              fill="#94a3b8"
            >
              {new Date(r.generated_at).toLocaleDateString("ko-KR", {
                month: "2-digit",
                day: "2-digit",
              })}
            </text>
          );
        })}
      </svg>
      {/* Legend */}
      <div className="flex gap-4 text-[11px] mt-1 ml-9">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-3 h-0.5 bg-violet-600" /> 종합
        </span>
        {(["claude", "gpt", "gemini"] as const).map((llm) => (
          <span key={llm} className="inline-flex items-center gap-1.5">
            <span
              className="inline-block w-3 h-0.5"
              style={{ background: LLM_COLOR[llm] }}
            />
            {LLM_LABEL[llm]}
          </span>
        ))}
      </div>
    </div>
  );
}

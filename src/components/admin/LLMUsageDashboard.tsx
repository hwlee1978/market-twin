"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type UsageRow = {
  workspaceId: string;
  workspaceName: string;
  ownerEmail: string;
  provider: string;
  model: string;
  stage: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  createdAt: string;
};

const PROVIDER_COLORS: Record<string, string> = {
  anthropic: "#D97706",
  openai: "#10B981",
  gemini: "#3B82F6",
  deepseek: "#8B5CF6",
  xai: "#EF4444",
  unknown: "#94A3B8",
};

const STAGE_COLORS = ["#0EA5E9", "#F97316", "#A855F7", "#EC4899", "#22C55E", "#EAB308", "#06B6D4", "#84CC16", "#F43F5E"];

export function LLMUsageDashboard({ rows }: { rows: UsageRow[] }) {
  const [selectedWs, setSelectedWs] = useState<string | null>(null);

  // ── Workspace ranking ──────────────────────────────────────────────
  const ranking = useMemo(() => {
    const map = new Map<
      string,
      {
        workspaceId: string;
        workspaceName: string;
        ownerEmail: string;
        calls: number;
        inputTokens: number;
        outputTokens: number;
        costUsd: number;
      }
    >();
    for (const r of rows) {
      const cur = map.get(r.workspaceId) ?? {
        workspaceId: r.workspaceId,
        workspaceName: r.workspaceName,
        ownerEmail: r.ownerEmail,
        calls: 0,
        inputTokens: 0,
        outputTokens: 0,
        costUsd: 0,
      };
      cur.calls += 1;
      cur.inputTokens += r.inputTokens;
      cur.outputTokens += r.outputTokens;
      cur.costUsd += r.costUsd;
      map.set(r.workspaceId, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.costUsd - a.costUsd);
  }, [rows]);

  // ── Daily time series for the selected workspace (or overall) ──────
  const timeSeries = useMemo(() => {
    const filtered = selectedWs
      ? rows.filter((r) => r.workspaceId === selectedWs)
      : rows;
    const byDay = new Map<string, { date: string; costUsd: number; calls: number }>();
    for (const r of filtered) {
      const day = r.createdAt.slice(0, 10);
      const cur = byDay.get(day) ?? { date: day, costUsd: 0, calls: 0 };
      cur.costUsd += r.costUsd;
      cur.calls += 1;
      byDay.set(day, cur);
    }
    return Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [rows, selectedWs]);

  // ── Provider mix ───────────────────────────────────────────────────
  const providerMix = useMemo(() => {
    const filtered = selectedWs
      ? rows.filter((r) => r.workspaceId === selectedWs)
      : rows;
    const map = new Map<string, { provider: string; costUsd: number; calls: number }>();
    for (const r of filtered) {
      const cur = map.get(r.provider) ?? { provider: r.provider, costUsd: 0, calls: 0 };
      cur.costUsd += r.costUsd;
      cur.calls += 1;
      map.set(r.provider, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.costUsd - a.costUsd);
  }, [rows, selectedWs]);

  // ── Stage mix ──────────────────────────────────────────────────────
  const stageMix = useMemo(() => {
    const filtered = selectedWs
      ? rows.filter((r) => r.workspaceId === selectedWs)
      : rows;
    const map = new Map<string, { stage: string; costUsd: number; calls: number }>();
    for (const r of filtered) {
      const cur = map.get(r.stage) ?? { stage: r.stage, costUsd: 0, calls: 0 };
      cur.costUsd += r.costUsd;
      cur.calls += 1;
      map.set(r.stage, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.costUsd - a.costUsd);
  }, [rows, selectedWs]);

  const fmtUsd = (n: number) => `$${n.toFixed(2)}`;
  const fmtTokens = (n: number) =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

  return (
    <div className="space-y-6">
      {/* Workspace ranking table */}
      <section>
        <div className="flex items-baseline justify-between mb-3 gap-3 flex-wrap">
          <h2 className="text-base font-semibold text-slate-900">
            워크스페이스 사용량 랭킹 ({ranking.length})
          </h2>
          {selectedWs && (
            <button
              type="button"
              onClick={() => setSelectedWs(null)}
              className="text-xs text-brand hover:underline"
            >
              전체 보기로 돌아가기
            </button>
          )}
        </div>
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600 uppercase tracking-wider">
              <tr>
                <th className="px-4 py-2 text-left">워크스페이스</th>
                <th className="px-4 py-2 text-right">호출</th>
                <th className="px-4 py-2 text-right">Input</th>
                <th className="px-4 py-2 text-right">Output</th>
                <th className="px-4 py-2 text-right">USD</th>
              </tr>
            </thead>
            <tbody>
              {ranking.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-xs text-slate-400">
                    아직 로깅된 LLM 호출이 없습니다. 새 시뮬·Mr.AI 채팅이 실행되면 여기에 표시됩니다.
                  </td>
                </tr>
              )}
              {ranking.map((r) => (
                <tr
                  key={r.workspaceId}
                  className={`border-t border-slate-100 hover:bg-slate-50 cursor-pointer ${
                    selectedWs === r.workspaceId ? "bg-amber-50" : ""
                  }`}
                  onClick={() => setSelectedWs(r.workspaceId)}
                >
                  <td className="px-4 py-2">
                    <div className="text-sm font-medium text-slate-900">{r.workspaceName}</div>
                    {r.ownerEmail && (
                      <div className="text-[10px] text-slate-400 font-mono">{r.workspaceId.slice(0, 8)} · {r.ownerEmail}</div>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{r.calls.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-600">{fmtTokens(r.inputTokens)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-600">{fmtTokens(r.outputTokens)}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-semibold text-slate-900">{fmtUsd(r.costUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-slate-400 mt-2">
          행 클릭 시 아래 차트들이 해당 워크스페이스로 필터링됩니다.
        </p>
      </section>

      {/* Time series */}
      <section>
        <h2 className="text-base font-semibold text-slate-900 mb-3">
          일별 사용량 추이 {selectedWs ? `(${ranking.find((r) => r.workspaceId === selectedWs)?.workspaceName ?? selectedWs.slice(0, 8)})` : "(전체)"}
        </h2>
        <div className="card p-4">
          {timeSeries.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-8">데이터 없음</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={timeSeries} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="#E2E8F0" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#64748B" }} interval="preserveStartEnd" />
                <YAxis
                  yAxisId="cost"
                  orientation="left"
                  tick={{ fontSize: 10, fill: "#64748B" }}
                  tickFormatter={(v) => `$${v.toFixed(2)}`}
                />
                <YAxis
                  yAxisId="calls"
                  orientation="right"
                  tick={{ fontSize: 10, fill: "#94A3B8" }}
                />
                <Tooltip
                  contentStyle={{ fontSize: 12, border: "1px solid #E2E8F0", borderRadius: 4 }}
                  formatter={(value, name) => {
                    if (name === "costUsd") return [`$${Number(value).toFixed(4)}`, "Cost"];
                    return [Number(value).toLocaleString(), "Calls"];
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line yAxisId="cost" type="monotone" dataKey="costUsd" name="Cost USD" stroke="#D97706" strokeWidth={2} dot={{ r: 2 }} />
                <Line yAxisId="calls" type="monotone" dataKey="calls" name="Calls" stroke="#94A3B8" strokeWidth={1.5} strokeDasharray="3 3" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      {/* Provider + Stage breakdown side-by-side */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h2 className="text-base font-semibold text-slate-900 mb-3">Provider 분포</h2>
          <div className="card p-4">
            {providerMix.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-8">데이터 없음</p>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={providerMix}
                      dataKey="costUsd"
                      nameKey="provider"
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={80}
                      paddingAngle={2}
                      label={(props: unknown) => {
                        const p = props as { provider?: string; costUsd?: number };
                        return `${p.provider ?? ""} ${fmtUsd(p.costUsd ?? 0)}`;
                      }}
                      labelLine={false}
                    >
                      {providerMix.map((p, i) => (
                        <Cell key={i} fill={PROVIDER_COLORS[p.provider] ?? PROVIDER_COLORS.unknown} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ fontSize: 12, border: "1px solid #E2E8F0", borderRadius: 4 }}
                      formatter={(value) => [`$${Number(value).toFixed(4)}`, "Cost"]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <table className="w-full text-xs mt-3">
                  <thead className="text-slate-500">
                    <tr>
                      <th className="text-left font-medium pb-1">Provider</th>
                      <th className="text-right font-medium pb-1">호출</th>
                      <th className="text-right font-medium pb-1">USD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {providerMix.map((p) => (
                      <tr key={p.provider} className="border-t border-slate-100">
                        <td className="py-1.5 flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full inline-block"
                            style={{
                              backgroundColor: PROVIDER_COLORS[p.provider] ?? PROVIDER_COLORS.unknown,
                            }}
                          />
                          <span className="font-medium text-slate-700">{p.provider}</span>
                        </td>
                        <td className="text-right tabular-nums text-slate-600">{p.calls.toLocaleString()}</td>
                        <td className="text-right tabular-nums font-semibold text-slate-900">{fmtUsd(p.costUsd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        </div>

        <div>
          <h2 className="text-base font-semibold text-slate-900 mb-3">Stage 분포</h2>
          <div className="card p-4">
            {stageMix.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-8">데이터 없음</p>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={stageMix} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="2 4" stroke="#E2E8F0" />
                    <XAxis dataKey="stage" tick={{ fontSize: 9, fill: "#64748B" }} interval={0} angle={-30} textAnchor="end" height={60} />
                    <YAxis tick={{ fontSize: 10, fill: "#64748B" }} tickFormatter={(v) => `$${Number(v).toFixed(1)}`} />
                    <Tooltip
                      contentStyle={{ fontSize: 12, border: "1px solid #E2E8F0", borderRadius: 4 }}
                      formatter={(value) => [`$${Number(value).toFixed(4)}`, "Cost"]}
                    />
                    <Bar dataKey="costUsd" name="Cost USD">
                      {stageMix.map((_, i) => (
                        <Cell key={i} fill={STAGE_COLORS[i % STAGE_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <table className="w-full text-xs mt-3">
                  <thead className="text-slate-500">
                    <tr>
                      <th className="text-left font-medium pb-1">Stage</th>
                      <th className="text-right font-medium pb-1">호출</th>
                      <th className="text-right font-medium pb-1">USD</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stageMix.map((s, i) => (
                      <tr key={s.stage} className="border-t border-slate-100">
                        <td className="py-1.5 flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full inline-block"
                            style={{ backgroundColor: STAGE_COLORS[i % STAGE_COLORS.length] }}
                          />
                          <span className="font-medium text-slate-700">{s.stage}</span>
                        </td>
                        <td className="text-right tabular-nums text-slate-600">{s.calls.toLocaleString()}</td>
                        <td className="text-right tabular-nums font-semibold text-slate-900">{fmtUsd(s.costUsd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

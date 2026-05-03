import { setRequestLocale } from "next-intl/server";
import { KpiCard } from "@/components/ui/KpiCard";
import { createServiceClient } from "@/lib/supabase/server";
import { formatCentsUsd } from "@/lib/llm/cost";

interface SimRow {
  id: string;
  workspace_id: string | null;
  total_input_tokens: number | null;
  total_output_tokens: number | null;
  total_cost_cents: number | null;
  completed_at: string | null;
  model_provider: string | null;
}

interface WorkspaceMeta {
  id: string;
  name: string | null;
}

/**
 * Operator-facing billing dashboard. Renders three rollups:
 *   1. Workspace × month cost board (top spenders this month)
 *   2. Provider mix (where the spend went, by LLM)
 *   3. Last 30 days running total + sim count
 *
 * Cost data comes from `simulations.total_cost_cents` populated by the
 * runner at sim completion (migration 0016 + cost.ts pricing table).
 * Failed / cancelled / pre-migration sims show null cost and are
 * skipped in the rollups, so the totals here are "successful billable
 * sims only" — a reasonable definition for spend-in-the-real-world.
 */
export default async function AdminBillingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const isKo = locale === "ko";
  const admin = createServiceClient();

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const last30Start = new Date();
  last30Start.setDate(last30Start.getDate() - 30);
  last30Start.setHours(0, 0, 0, 0);

  const [{ data: thisMonthSims }, { data: last30Sims }, { data: workspaces }] =
    await Promise.all([
      admin
        .from("simulations")
        .select(
          "id, workspace_id, total_input_tokens, total_output_tokens, total_cost_cents, completed_at, model_provider",
        )
        .eq("status", "completed")
        .gte("completed_at", monthStart.toISOString())
        .not("total_cost_cents", "is", null),
      admin
        .from("simulations")
        .select(
          "id, workspace_id, total_input_tokens, total_output_tokens, total_cost_cents, completed_at, model_provider",
        )
        .eq("status", "completed")
        .gte("completed_at", last30Start.toISOString())
        .not("total_cost_cents", "is", null),
      admin.from("workspaces").select("id, name"),
    ]);

  const monthRows = (thisMonthSims ?? []) as unknown as SimRow[];
  const recent30Rows = (last30Sims ?? []) as unknown as SimRow[];
  const wsList = (workspaces ?? []) as WorkspaceMeta[];
  const wsName = (id: string | null) => {
    if (!id) return "?";
    return wsList.find((w) => w.id === id)?.name ?? id.slice(0, 8);
  };

  const sum = (rows: SimRow[], key: keyof SimRow) =>
    rows.reduce((s, r) => s + ((r[key] as number | null) ?? 0), 0);

  const monthTotalCents = sum(monthRows, "total_cost_cents");
  const monthInputTokens = sum(monthRows, "total_input_tokens");
  const monthOutputTokens = sum(monthRows, "total_output_tokens");
  const monthSimCount = monthRows.length;

  const recent30TotalCents = sum(recent30Rows, "total_cost_cents");
  const recent30SimCount = recent30Rows.length;
  const recent30AvgCents = recent30SimCount > 0 ? Math.round(recent30TotalCents / recent30SimCount) : 0;

  // Top-spending workspaces this month.
  const byWorkspace = new Map<string, { sims: number; cents: number; tokens: number }>();
  for (const r of monthRows) {
    const key = r.workspace_id ?? "?";
    const cur = byWorkspace.get(key) ?? { sims: 0, cents: 0, tokens: 0 };
    cur.sims += 1;
    cur.cents += r.total_cost_cents ?? 0;
    cur.tokens += (r.total_input_tokens ?? 0) + (r.total_output_tokens ?? 0);
    byWorkspace.set(key, cur);
  }
  const topSpenders = [...byWorkspace.entries()]
    .map(([wsId, v]) => ({ wsId, ...v }))
    .sort((a, b) => b.cents - a.cents)
    .slice(0, 10);

  // Provider mix this month.
  const byProvider = new Map<string, { sims: number; cents: number }>();
  for (const r of monthRows) {
    const key = r.model_provider ?? "unknown";
    const cur = byProvider.get(key) ?? { sims: 0, cents: 0 };
    cur.sims += 1;
    cur.cents += r.total_cost_cents ?? 0;
    byProvider.set(key, cur);
  }
  const providerMix = [...byProvider.entries()]
    .map(([provider, v]) => ({ provider, ...v }))
    .sort((a, b) => b.cents - a.cents);
  const providerMixMaxCents = providerMix[0]?.cents ?? 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{isKo ? "비용 / 사용량" : "Billing & usage"}</h1>
        <p className="text-sm text-slate-500 mt-1">
          {isKo
            ? "성공한 시뮬레이션 기준 LLM 토큰 사용량과 비용을 워크스페이스별로 집계합니다. 실패·취소·구버전(컬럼 없음) 시뮬은 제외됩니다."
            : "Token usage + cost aggregated from successful sims. Failed / cancelled / pre-migration sims are excluded."}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label={isKo ? "이번 달 비용" : "Spend this month"}
          value={formatCentsUsd(monthTotalCents)}
          hint={isKo ? `${monthSimCount}개 시뮬` : `${monthSimCount} sims`}
        />
        <KpiCard
          label={isKo ? "이번 달 토큰" : "Tokens this month"}
          value={`${((monthInputTokens + monthOutputTokens) / 1_000_000).toFixed(1)}M`}
          hint={`${(monthInputTokens / 1000).toFixed(0)}k in / ${(monthOutputTokens / 1000).toFixed(0)}k out`}
        />
        <KpiCard
          label={isKo ? "최근 30일 비용" : "Spend last 30 days"}
          value={formatCentsUsd(recent30TotalCents)}
          hint={isKo ? `${recent30SimCount}개 시뮬` : `${recent30SimCount} sims`}
        />
        <KpiCard
          label={isKo ? "시뮬당 평균" : "Avg cost / sim"}
          value={formatCentsUsd(recent30AvgCents)}
          hint={isKo ? "최근 30일" : "Last 30 days"}
        />
      </div>

      <div className="card p-0">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold">
            {isKo ? "이번 달 워크스페이스별 비용 (Top 10)" : "Top workspaces this month"}
          </h2>
        </div>
        {topSpenders.length === 0 ? (
          <div className="px-6 py-12 text-center text-slate-500 text-sm">
            {isKo ? "이번 달 사용 데이터가 없습니다." : "No usage data yet this month."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="text-left px-6 py-3 font-medium">{isKo ? "워크스페이스" : "Workspace"}</th>
                  <th className="text-right px-6 py-3 font-medium">{isKo ? "시뮬 수" : "Sims"}</th>
                  <th className="text-right px-6 py-3 font-medium">{isKo ? "토큰" : "Tokens"}</th>
                  <th className="text-right px-6 py-3 font-medium">{isKo ? "누적 비용" : "Cost"}</th>
                  <th className="text-right px-6 py-3 font-medium">{isKo ? "시뮬당 평균" : "Avg / sim"}</th>
                </tr>
              </thead>
              <tbody>
                {topSpenders.map((w) => (
                  <tr key={w.wsId} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-6 py-3 text-slate-900">
                      <div className="font-medium">{wsName(w.wsId)}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{w.wsId.slice(0, 8)}</div>
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums text-slate-700">{w.sims.toLocaleString()}</td>
                    <td className="px-6 py-3 text-right tabular-nums text-slate-600">
                      {(w.tokens / 1_000_000).toFixed(2)}M
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums font-mono text-slate-900 font-medium">
                      {formatCentsUsd(w.cents)}
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums text-slate-500">
                      {formatCentsUsd(w.sims > 0 ? Math.round(w.cents / w.sims) : 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card p-0">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold">
            {isKo ? "이번 달 LLM별 비용 분포" : "Provider mix this month"}
          </h2>
        </div>
        {providerMix.length === 0 ? (
          <div className="px-6 py-12 text-center text-slate-500 text-sm">—</div>
        ) : (
          <div className="px-6 py-4 space-y-3">
            {providerMix.map((p) => {
              const w = (p.cents / providerMixMaxCents) * 100;
              const share = monthTotalCents > 0 ? Math.round((p.cents / monthTotalCents) * 100) : 0;
              return (
                <div key={p.provider} className="flex items-center gap-3 text-sm">
                  <div className="w-24 font-medium text-slate-700 capitalize">{p.provider}</div>
                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-brand" style={{ width: `${w}%` }} />
                  </div>
                  <div className="w-32 text-right tabular-nums font-mono text-slate-900">
                    {formatCentsUsd(p.cents)}
                  </div>
                  <div className="w-20 text-right text-xs text-slate-500 tabular-nums">
                    {p.sims} sims · {share}%
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

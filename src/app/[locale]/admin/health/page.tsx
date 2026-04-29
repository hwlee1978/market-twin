import { getTranslations, setRequestLocale } from "next-intl/server";
import { KpiCard } from "@/components/ui/KpiCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { createServiceClient } from "@/lib/supabase/server";

// A simulation is considered "stuck" if it's been in the running state past
// the maxDuration we give the Vercel function (300s). After that point the
// row exists but the worker is gone — it'll never finish on its own.
const STUCK_THRESHOLD_MS = 6 * 60 * 1000;

type SimRow = {
  id: string;
  project_id: string;
  workspace_id: string | null;
  status: string;
  current_stage: string | null;
  model_provider: string | null;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
};

export default async function AdminHealthPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("admin.health");

  const admin = createServiceClient();

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Pull a window of recent simulations once, derive every metric in memory.
  // For v0.1 traffic this is ~hundreds of rows max — well under the cost of
  // making 5 separate count queries.
  const { data: recent } = await admin
    .from("simulations")
    .select(
      "id, project_id, workspace_id, status, current_stage, model_provider, started_at, completed_at, error_message",
    )
    .gte("created_at", since7d)
    .order("started_at", { ascending: false, nullsFirst: false });

  const sims = (recent ?? []) as SimRow[];

  const sims24h = sims.filter((s) => s.started_at && s.started_at >= since24h);
  const completed24h = sims24h.filter((s) => s.status === "completed");
  const failed24h = sims24h.filter((s) => s.status === "failed");
  const successRate24h =
    sims24h.length > 0
      ? Math.round((completed24h.length / sims24h.length) * 100)
      : null;

  const completedWithDurations = sims
    .filter((s) => s.status === "completed" && s.started_at && s.completed_at)
    .map(
      (s) =>
        new Date(s.completed_at as string).getTime() -
        new Date(s.started_at as string).getTime(),
    );
  const avgRuntimeMs =
    completedWithDurations.length > 0
      ? Math.round(
          completedWithDurations.reduce((a, b) => a + b, 0) /
            completedWithDurations.length,
        )
      : null;

  // Stuck = still in 'running' but started long enough ago that the serverless
  // function must have been killed. These are operator-actionable (cancel/retry).
  const now = Date.now();
  const stuck = sims.filter(
    (s) =>
      s.status === "running" &&
      s.started_at &&
      now - new Date(s.started_at).getTime() > STUCK_THRESHOLD_MS,
  );

  // Stage-level failure distribution: where in the pipeline are we losing runs?
  const stageFailures = new Map<string, number>();
  for (const s of sims.filter((s) => s.status === "failed")) {
    const key = s.current_stage ?? "unknown";
    stageFailures.set(key, (stageFailures.get(key) ?? 0) + 1);
  }
  const stageRows = Array.from(stageFailures.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([stage, count]) => ({ stage, count }));
  const maxStageCount = stageRows[0]?.count ?? 0;

  // Provider health: error rate + avg runtime per LLM provider.
  type ProviderAgg = {
    provider: string;
    total: number;
    failed: number;
    durations: number[];
  };
  const byProvider = new Map<string, ProviderAgg>();
  for (const s of sims) {
    const key = s.model_provider ?? "unknown";
    let agg = byProvider.get(key);
    if (!agg) {
      agg = { provider: key, total: 0, failed: 0, durations: [] };
      byProvider.set(key, agg);
    }
    agg.total += 1;
    if (s.status === "failed") agg.failed += 1;
    if (s.status === "completed" && s.started_at && s.completed_at) {
      agg.durations.push(
        new Date(s.completed_at).getTime() - new Date(s.started_at).getTime(),
      );
    }
  }
  const providerRows = Array.from(byProvider.values())
    .map((p) => ({
      provider: p.provider,
      total: p.total,
      failed: p.failed,
      errorRate: p.total > 0 ? Math.round((p.failed / p.total) * 100) : 0,
      avgMs:
        p.durations.length > 0
          ? Math.round(p.durations.reduce((a, b) => a + b, 0) / p.durations.length)
          : null,
    }))
    .sort((a, b) => b.total - a.total);

  const recentFailedRows = sims
    .filter((s) => s.status === "failed")
    .slice(0, 10);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-slate-500 mt-1">{t("subtitle")}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label={t("kpi.successRate24h")}
          value={successRate24h !== null ? `${successRate24h}%` : "—"}
          tone={
            successRate24h === null
              ? "default"
              : successRate24h >= 90
                ? "success"
                : successRate24h >= 70
                  ? "warn"
                  : "risk"
          }
          hint={t("kpi.runs", { n: sims24h.length })}
        />
        <KpiCard
          label={t("kpi.avgRuntime")}
          value={avgRuntimeMs !== null ? formatDuration(avgRuntimeMs) : "—"}
          hint={t("kpi.over7d")}
        />
        <KpiCard
          label={t("kpi.stuck")}
          value={stuck.length}
          tone={stuck.length > 0 ? "risk" : "default"}
        />
        <KpiCard
          label={t("kpi.failed24h")}
          value={failed24h.length}
          tone={failed24h.length > 0 ? "risk" : "default"}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="text-base font-semibold mb-4">{t("stageFailures.title")}</h2>
          {stageRows.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">
              {t("stageFailures.empty")}
            </p>
          ) : (
            <div className="space-y-2">
              {stageRows.map((row) => (
                <div key={row.stage} className="text-sm">
                  <div className="flex justify-between mb-1">
                    <span className="text-slate-700 capitalize">{row.stage}</span>
                    <span className="text-slate-500 tabular-nums">{row.count}</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-risk"
                      style={{
                        width: `${maxStageCount > 0 ? (row.count / maxStageCount) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h2 className="text-base font-semibold mb-4">{t("providers.title")}</h2>
          {providerRows.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">
              {t("providers.empty")}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="text-left pb-2 font-medium">
                    {t("providers.col.provider")}
                  </th>
                  <th className="text-right pb-2 font-medium">
                    {t("providers.col.total")}
                  </th>
                  <th className="text-right pb-2 font-medium">
                    {t("providers.col.errorRate")}
                  </th>
                  <th className="text-right pb-2 font-medium">
                    {t("providers.col.avgRuntime")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {providerRows.map((row) => (
                  <tr key={row.provider} className="border-t border-slate-100">
                    <td className="py-2 capitalize">{row.provider}</td>
                    <td className="py-2 text-right tabular-nums text-slate-600">
                      {row.total}
                    </td>
                    <td
                      className={`py-2 text-right tabular-nums ${
                        row.errorRate >= 25
                          ? "text-risk"
                          : row.errorRate >= 10
                            ? "text-warn"
                            : "text-slate-600"
                      }`}
                    >
                      {row.errorRate}% ({row.failed})
                    </td>
                    <td className="py-2 text-right tabular-nums text-slate-500">
                      {row.avgMs !== null ? formatDuration(row.avgMs) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold">{t("stuck.title")}</h2>
          <p className="text-xs text-slate-500 mt-1">{t("stuck.description")}</p>
        </div>
        {stuck.length === 0 ? (
          <div className="px-6 py-10 text-center text-slate-500 text-sm">
            {t("stuck.empty")}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-6 py-2 font-medium">ID</th>
                <th className="text-left px-6 py-2 font-medium">{t("stuck.col.stage")}</th>
                <th className="text-left px-6 py-2 font-medium">{t("stuck.col.provider")}</th>
                <th className="text-right px-6 py-2 font-medium">{t("stuck.col.runtime")}</th>
                <th className="text-left px-6 py-2 font-medium">{t("stuck.col.started")}</th>
              </tr>
            </thead>
            <tbody>
              {stuck.map((s) => (
                <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-6 py-2 font-mono text-xs">{s.id.slice(0, 8)}</td>
                  <td className="px-6 py-2 text-slate-600">{s.current_stage ?? "—"}</td>
                  <td className="px-6 py-2 text-slate-500 text-xs">
                    {s.model_provider ?? "—"}
                  </td>
                  <td className="px-6 py-2 text-right text-risk tabular-nums">
                    {s.started_at
                      ? formatDuration(now - new Date(s.started_at).getTime())
                      : "—"}
                  </td>
                  <td className="px-6 py-2 text-slate-500 text-xs">
                    {s.started_at ? new Date(s.started_at).toLocaleString(locale) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold">{t("recentErrors.title")}</h2>
        </div>
        {recentFailedRows.length === 0 ? (
          <div className="px-6 py-10 text-center text-slate-500 text-sm">
            {t("recentErrors.empty")}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-6 py-2 font-medium">ID</th>
                <th className="text-left px-6 py-2 font-medium">{t("recentErrors.col.stage")}</th>
                <th className="text-left px-6 py-2 font-medium">{t("recentErrors.col.status")}</th>
                <th className="text-left px-6 py-2 font-medium">{t("recentErrors.col.error")}</th>
                <th className="text-left px-6 py-2 font-medium">{t("recentErrors.col.started")}</th>
              </tr>
            </thead>
            <tbody>
              {recentFailedRows.map((s) => (
                <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-6 py-2 font-mono text-xs">{s.id.slice(0, 8)}</td>
                  <td className="px-6 py-2 text-slate-600">{s.current_stage ?? "—"}</td>
                  <td className="px-6 py-2">
                    <StatusBadge status={s.status} />
                  </td>
                  <td className="px-6 py-2 text-xs text-risk max-w-md truncate">
                    {s.error_message ?? "—"}
                  </td>
                  <td className="px-6 py-2 text-slate-500 text-xs">
                    {s.started_at ? new Date(s.started_at).toLocaleString(locale) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rest = sec % 60;
  return rest === 0 ? `${min}m` : `${min}m ${rest}s`;
}

import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ArrowRight } from "lucide-react";
import { KpiCard } from "@/components/ui/KpiCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { createServiceClient } from "@/lib/supabase/server";

export default async function AdminOverviewPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("admin.overview");

  // Use service role for cross-workspace aggregates.
  const admin = createServiceClient();

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  interface FailedRow {
    id: string;
    status: string;
    current_stage: string | null;
    started_at: string | null;
    error_message: string | null;
    project_id: string;
    workspace_id: string | null;
  }

  const [workspaces, projects, simsThisMonth, failedSims, recentFailed] = await Promise.all([
    admin.from("workspaces").select("*", { count: "exact", head: true }),
    admin.from("projects").select("*", { count: "exact", head: true }),
    admin
      .from("simulations")
      .select("*", { count: "exact", head: true })
      .gte("started_at", monthStart.toISOString()),
    admin
      .from("simulations")
      .select("*", { count: "exact", head: true })
      .eq("status", "failed"),
    admin
      .from("simulations")
      .select("id, status, current_stage, started_at, error_message, project_id, workspace_id")
      .in("status", ["failed", "running"])
      .order("started_at", { ascending: false, nullsFirst: false })
      .limit(8),
  ]);

  const recentFailedRows = (recentFailed.data ?? []) as FailedRow[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-slate-500 mt-1">{t("subtitle")}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label={t("kpi.totalWorkspaces")} value={workspaces.count ?? 0} />
        <KpiCard label={t("kpi.totalProjects")} value={projects.count ?? 0} />
        <KpiCard label={t("kpi.simulationsMonth")} value={simsThisMonth.count ?? 0} />
        <KpiCard
          label={t("kpi.failedJobs")}
          value={failedSims.count ?? 0}
          tone={(failedSims.count ?? 0) > 0 ? "risk" : "default"}
        />
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-base font-semibold">{t("recentIssues")}</h2>
          <Link
            href="/admin/simulations"
            className="text-xs text-brand hover:underline inline-flex items-center gap-1"
          >
            {t("viewAll")}
            <ArrowRight size={12} />
          </Link>
        </div>
        {recentFailedRows.length > 0 ? (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-6 py-3 font-medium">{t("table.simulation")}</th>
                <th className="text-left px-6 py-3 font-medium">{t("table.workspace")}</th>
                <th className="text-left px-6 py-3 font-medium">{t("table.stage")}</th>
                <th className="text-left px-6 py-3 font-medium">{t("table.status")}</th>
                <th className="text-left px-6 py-3 font-medium">{t("table.started")}</th>
                <th className="text-left px-6 py-3 font-medium">{t("table.error")}</th>
              </tr>
            </thead>
            <tbody>
              {recentFailedRows.map((s) => (
                <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-6 py-3 font-mono text-xs text-slate-700">
                    {s.id.slice(0, 8)}
                  </td>
                  <td className="px-6 py-3 font-mono text-xs text-slate-500">
                    {(s.workspace_id ?? "").slice(0, 8)}
                  </td>
                  <td className="px-6 py-3 text-slate-600">{s.current_stage ?? "—"}</td>
                  <td className="px-6 py-3">
                    <StatusBadge status={s.status} />
                  </td>
                  <td className="px-6 py-3 text-slate-500">
                    {s.started_at
                      ? new Date(s.started_at).toLocaleString(locale)
                      : "—"}
                  </td>
                  <td className="px-6 py-3 text-xs text-risk max-w-md truncate">
                    {s.error_message ?? ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="px-6 py-12 text-center text-slate-500 text-sm">
            {t("noIssues")}
          </div>
        )}
      </div>
    </div>
  );
}

import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { FolderOpen, Plus } from "lucide-react";
import { KpiCard } from "@/components/ui/KpiCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) return null;

  const supabase = await createClient();
  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, product_name, status, candidate_countries, updated_at")
    .eq("workspace_id", ctx.workspaceId)
    .order("updated_at", { ascending: false })
    .limit(8);

  const { data: completedSims } = await supabase
    .from("simulations")
    .select("id, simulation_results(overview)")
    .eq("workspace_id", ctx.workspaceId)
    .eq("status", "completed")
    .limit(50);

  const successScores = (completedSims ?? [])
    .map((s) => {
      const results = s.simulation_results as { overview?: { successScore?: number } } | { overview?: { successScore?: number } }[] | null;
      const overview = Array.isArray(results) ? results[0]?.overview : results?.overview;
      return overview?.successScore;
    })
    .filter((n): n is number => typeof n === "number");
  const avgScore = successScores.length
    ? Math.round(successScores.reduce((a, b) => a + b, 0) / successScores.length)
    : 0;

  const countriesTested = new Set(
    (projects ?? []).flatMap((p) => p.candidate_countries ?? []),
  ).size;

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const { count: monthlyReports } = await supabase
    .from("reports")
    .select("*", { count: "exact", head: true })
    .eq("workspace_id", ctx.workspaceId)
    .gte("created_at", monthStart.toISOString());

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("dashboard.title")}</h1>
        <Link href="/projects/new" className="btn-primary">
          <Plus size={16} />
          {t("dashboard.newProject")}
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label={t("dashboard.kpi.activeProjects")}
          value={projects?.filter((p) => p.status !== "archived").length ?? 0}
        />
        <KpiCard
          label={t("dashboard.kpi.avgSuccessScore")}
          value={avgScore ? `${avgScore}%` : "—"}
        />
        <KpiCard label={t("dashboard.kpi.countriesTested")} value={countriesTested} />
        <KpiCard label={t("dashboard.kpi.monthlyReports")} value={monthlyReports ?? 0} />
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-base font-semibold">{t("dashboard.recentProjects")}</h2>
        </div>
        {projects && projects.length > 0 ? (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-6 py-3 font-medium">{t("dashboard.table.project")}</th>
                <th className="text-left px-6 py-3 font-medium">{t("dashboard.table.product")}</th>
                <th className="text-left px-6 py-3 font-medium">{t("dashboard.table.status")}</th>
                <th className="text-left px-6 py-3 font-medium">{t("dashboard.table.countries")}</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-6 py-3">
                    <Link href={`/projects/${p.id}`} className="text-brand font-medium hover:underline">
                      {p.name}
                    </Link>
                  </td>
                  <td className="px-6 py-3 text-slate-700">{p.product_name}</td>
                  <td className="px-6 py-3">
                    <StatusBadge status={p.status} label={t(`project.status.${p.status}`)} />
                  </td>
                  <td className="px-6 py-3 text-slate-600">
                    {(p.candidate_countries ?? []).slice(0, 3).join(", ")}
                    {(p.candidate_countries ?? []).length > 3 ? "…" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState
            icon={FolderOpen}
            title={t("dashboard.noProjects")}
            action={
              <Link href="/projects/new" className="btn-primary">
                <Plus size={16} />
                {t("dashboard.newProject")}
              </Link>
            }
          />
        )}
      </div>
    </div>
  );
}

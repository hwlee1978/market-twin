import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Plus, Compass, BarChart3, Globe2, FileText } from "lucide-react";
import { KpiCard } from "@/components/ui/KpiCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { PageHeader } from "@/components/ui/PageHeader";
import { CountryChipRow } from "@/components/ui/CountryChip";
import { DemoCard } from "@/components/onboarding/DemoCard";
import { DashboardGuideButton } from "@/components/onboarding/DashboardGuideButton";
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
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  // Parallel fan-out — these three queries don't depend on each other, so
  // doing them sequentially was costing ~3× the wall time. Promise.all keeps
  // them in flight together and lets the slowest one set the page latency.
  const [projectsRes, completedSimsRes, monthlyReportsRes] = await Promise.all([
    supabase
      .from("projects")
      .select("id, name, product_name, status, candidate_countries, updated_at")
      .eq("workspace_id", ctx.workspaceId)
      .order("updated_at", { ascending: false })
      .limit(8),
    supabase
      .from("simulations")
      .select("id, success_score")
      .eq("workspace_id", ctx.workspaceId)
      .eq("status", "completed")
      .not("success_score", "is", null)
      .limit(50),
    supabase
      .from("reports")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", ctx.workspaceId)
      .gte("created_at", monthStart.toISOString()),
  ]);

  const projects = projectsRes.data;
  const completedSims = completedSimsRes.data;
  const monthlyReports = monthlyReportsRes.count;

  const successScores = (completedSims ?? [])
    .map((s) => (s as { success_score: number | null }).success_score)
    .filter((n): n is number => typeof n === "number");
  const avgScore = successScores.length
    ? Math.round(successScores.reduce((a, b) => a + b, 0) / successScores.length)
    : 0;

  const countriesTested = new Set(
    (projects ?? []).flatMap((p) => p.candidate_countries ?? []),
  ).size;

  const hasProjects = !!projects && projects.length > 0;

  // Personalize greeting from email — use the local-part before "@" so it reads
  // naturally without exposing the full address in the headline.
  const greetingName = (ctx.email ?? "").split("@")[0] || "";

  return (
    <>
      {hasProjects ? (
        <PageHeader
          title={t("dashboard.title")}
          subtitle={t("dashboard.subtitleReturning")}
          actions={
            <div className="flex items-center gap-2">
              <DashboardGuideButton
                isKo={locale === "ko"}
                hasProjects
                demoToken={process.env.NEXT_PUBLIC_DEMO_SHARE_TOKEN}
              />
              <Link href="/projects/new" className="btn-primary">
                <Plus size={16} />
                {t("dashboard.newProject")}
              </Link>
            </div>
          }
        />
      ) : (
        <PageHeader
          title={
            greetingName
              ? t("dashboard.welcomeNamed", { name: greetingName })
              : t("dashboard.welcome")
          }
          subtitle={t("dashboard.subtitleNew")}
          actions={
            <DashboardGuideButton
              isKo={locale === "ko"}
              hasProjects={false}
              demoToken={process.env.NEXT_PUBLIC_DEMO_SHARE_TOKEN}
            />
          }
        />
      )}

      {!hasProjects ? (
        <>
          <DemoCard />
          <TrackingPreview />
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard
              label={t("dashboard.kpi.activeProjects")}
              value={projects.filter((p) => p.status !== "archived").length}
            />
            <KpiCard
              label={t("dashboard.kpi.avgSuccessScore")}
              value={avgScore ? `${avgScore}%` : "—"}
            />
            <KpiCard
              label={t("dashboard.kpi.countriesTested")}
              value={countriesTested}
            />
            <KpiCard
              label={t("dashboard.kpi.monthlyReports")}
              value={monthlyReports ?? 0}
            />
          </div>

          <div className="card overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-base font-semibold">{t("dashboard.recentProjects")}</h2>
            </div>
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
                      <Link
                        href={`/projects/${p.id}`}
                        className="text-brand font-medium hover:underline"
                      >
                        {p.name}
                      </Link>
                    </td>
                    <td className="px-6 py-3 text-slate-700">{p.product_name}</td>
                    <td className="px-6 py-3">
                      <StatusBadge status={p.status} label={t(`project.status.${p.status}`)} />
                    </td>
                    <td className="px-6 py-3">
                      <CountryChipRow
                        codes={(p.candidate_countries ?? []).slice(0, 4)}
                        size="sm"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

/**
 * Replaces the row of empty 0/0/0/— KPIs new users used to see. Instead it
 * tells them WHAT will get tracked here once they run a simulation, which
 * frames the empty dashboard as a feature roadmap rather than a void.
 */
async function TrackingPreview() {
  const t = await getTranslations("dashboard.tracking");
  const items = [
    { icon: BarChart3, key: "successScore" as const },
    { icon: Globe2, key: "countries" as const },
    { icon: FileText, key: "reports" as const },
    { icon: Compass, key: "actions" as const },
  ];
  return (
    <div className="card p-6">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-4">
        {t("title")}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {items.map((it) => (
          <div key={it.key} className="flex items-start gap-3">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-brand-50 text-brand shrink-0">
              <it.icon size={16} />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-medium text-slate-900">
                {t(`${it.key}.title`)}
              </div>
              <div className="mt-0.5 text-xs text-slate-500 leading-relaxed">
                {t(`${it.key}.description`)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

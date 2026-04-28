import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { FolderOpen, Plus } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";

export default async function ProjectsPage({
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
    .select("id, name, product_name, category, status, candidate_countries, updated_at")
    .eq("workspace_id", ctx.workspaceId)
    .order("updated_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t("nav.projects")}</h1>
        <Link href="/projects/new" className="btn-primary">
          <Plus size={16} />
          {t("dashboard.newProject")}
        </Link>
      </div>

      <div className="card p-0 overflow-hidden">
        {projects && projects.length > 0 ? (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-6 py-3 font-medium">{t("dashboard.table.project")}</th>
                <th className="text-left px-6 py-3 font-medium">{t("dashboard.table.product")}</th>
                <th className="text-left px-6 py-3 font-medium">{t("dashboard.table.category")}</th>
                <th className="text-left px-6 py-3 font-medium">{t("dashboard.table.status")}</th>
                <th className="text-left px-6 py-3 font-medium">{t("dashboard.table.countries")}</th>
                <th className="text-left px-6 py-3 font-medium">{t("dashboard.table.updated")}</th>
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
                  <td className="px-6 py-3 text-slate-600">
                    {p.category
                      ? t(
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          `project.wizard.categories.${p.category}` as any,
                        )
                      : "—"}
                  </td>
                  <td className="px-6 py-3">
                    <StatusBadge status={p.status} label={t(`project.status.${p.status}`)} />
                  </td>
                  <td className="px-6 py-3 text-slate-600">
                    {(p.candidate_countries ?? []).length}
                  </td>
                  <td className="px-6 py-3 text-slate-500">
                    {new Date(p.updated_at).toLocaleDateString(locale)}
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

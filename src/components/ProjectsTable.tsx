"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { Search, Trash2, X } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";

interface ProjectRow {
  id: string;
  name: string;
  product_name: string;
  category: string | null;
  status: string;
  candidate_countries: string[] | null;
  updated_at: string;
}

interface Props {
  projects: ProjectRow[];
  locale: string;
}

export function ProjectsTable({ projects, locale }: Props) {
  const t = useTranslations();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.product_name.toLowerCase().includes(q) ||
        (p.category ?? "").toLowerCase().includes(q),
    );
  }, [projects, query]);

  const onDelete = async (project: ProjectRow) => {
    if (!confirm(t("projectList.deleteConfirm", { name: project.name }))) return;
    setBusyId(project.id);
    try {
      const res = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(t("projectList.deleteFailed", { error: body.error ?? res.statusText }));
        return;
      }
      router.refresh();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="relative max-w-md">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          className="input pl-9 pr-9"
          placeholder={t("projectList.search")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
            aria-label="clear"
          >
            <X size={14} />
          </button>
        )}
      </div>

      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-6 py-3 font-medium">{t("dashboard.table.project")}</th>
              <th className="text-left px-6 py-3 font-medium">{t("dashboard.table.product")}</th>
              <th className="text-left px-6 py-3 font-medium">{t("dashboard.table.category")}</th>
              <th className="text-left px-6 py-3 font-medium">{t("dashboard.table.status")}</th>
              <th className="text-left px-6 py-3 font-medium">{t("dashboard.table.countries")}</th>
              <th className="text-left px-6 py-3 font-medium">{t("dashboard.table.updated")}</th>
              <th className="px-2 py-3" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50 group">
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
                <td className="px-2 py-3">
                  <button
                    onClick={() => onDelete(p)}
                    disabled={busyId === p.id}
                    title={t("projectList.delete")}
                    aria-label={t("projectList.delete")}
                    className="p-1.5 rounded-md text-slate-400 hover:text-risk hover:bg-risk-soft transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-100 disabled:cursor-wait"
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-slate-500 text-sm">
                  {query ? t("projectList.noResults") : t("dashboard.noProjects")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

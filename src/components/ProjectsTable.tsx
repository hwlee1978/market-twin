"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { Search, Trash2, X, FolderPlus, Sparkles } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatDate } from "@/lib/format/date";

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

  // First-run empty state — workspace has zero projects ever. Different
  // from "search returned nothing" which keeps the search UI in place.
  // Renders a hero CTA so a brand-new account isn't staring at a bare
  // table with one line of grey text.
  const isKo = locale === "ko";
  if (projects.length === 0) {
    return (
      <div className="card p-10 sm:p-14 text-center space-y-5">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-brand-50 text-brand">
          <FolderPlus size={28} />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-slate-900">
            {isKo ? "첫 프로젝트를 만들어보세요" : "Start your first project"}
          </h2>
          <p className="text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
            {isKo
              ? "제품과 후보 진출국을 입력하면 AI 페르소나가 시장 적합성을 평가하고, 어느 시장에 먼저 진출할지 알려줍니다. 5~6분 안에 첫 결과를 받을 수 있습니다."
              : "Enter your product and candidate markets. AI personas evaluate fit and tell you which market to launch first. First result in ~5-6 minutes."}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
          <Link href="/projects/new" className="btn-primary inline-flex items-center gap-2">
            <Sparkles size={14} />
            {isKo ? "새 프로젝트 만들기" : "Create project"}
          </Link>
        </div>
      </div>
    );
  }

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

      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
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
                    ? // Fall back to the raw category string when the i18n key
                      // is missing — DB may hold legacy enum values from older
                      // benchmark fixtures (e.g. "beverage", "alcohol") that
                      // were never added to ProjectWizard's dropdown.
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      t.has(`project.wizard.categories.${p.category}` as any)
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      ? t(`project.wizard.categories.${p.category}` as any)
                      : p.category
                    : "—"}
                </td>
                <td className="px-6 py-3">
                  <StatusBadge status={p.status} label={t(`project.status.${p.status}`)} />
                </td>
                <td className="px-6 py-3 text-slate-600">
                  {(p.candidate_countries ?? []).length}
                </td>
                <td className="px-6 py-3 text-slate-500">
                  {formatDate(p.updated_at, locale === "ko") ?? "—"}
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

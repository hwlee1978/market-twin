"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Search, X } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";

export interface CustomerRow {
  id: string;
  name: string;
  companyName: string | null;
  country: string | null;
  plan: string;
  status: "active" | "suspended" | "archived";
  ownerEmail: string;
  memberCount: number;
  projectCount: number;
  simCount: number;
  completedSimCount: number;
  lastActivity: string | null;
  createdAt: string;
}

const FILTERS = [
  { key: "all", label: "all" as const },
  { key: "active", label: "active" as const },
  { key: "suspended", label: "suspended" as const },
  { key: "archived", label: "archived" as const },
];

export function AdminCustomersTable({
  rows,
  locale,
}: {
  rows: CustomerRow[];
  locale: string;
}) {
  const t = useTranslations("admin.customers");
  const [filter, setFilter] = useState<string>("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== "all" && r.status !== filter) return false;
      if (q) {
        const hay = [r.name, r.companyName ?? "", r.ownerEmail, r.country ?? ""]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, filter, query]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length, active: 0, suspended: 0, archived: 0 };
    for (const r of rows) c[r.status]++;
    return c;
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative max-w-md flex-1 min-w-[240px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-9 pr-9"
            placeholder={t("search")}
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
        <div className="flex items-center gap-1 text-xs">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                filter === f.key
                  ? "bg-brand text-white"
                  : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
              }`}
            >
              {t(`filter.${f.label}` as "filter.all")} ({counts[f.key] ?? 0})
            </button>
          ))}
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-6 py-3 font-medium">{t("col.workspace")}</th>
              <th className="text-left px-6 py-3 font-medium">{t("col.owner")}</th>
              <th className="text-left px-6 py-3 font-medium">{t("col.plan")}</th>
              <th className="text-left px-6 py-3 font-medium">{t("col.status")}</th>
              <th className="text-right px-6 py-3 font-medium">{t("col.members")}</th>
              <th className="text-right px-6 py-3 font-medium">{t("col.projects")}</th>
              <th className="text-right px-6 py-3 font-medium">{t("col.sims")}</th>
              <th className="text-left px-6 py-3 font-medium">{t("col.lastActivity")}</th>
              <th className="text-left px-6 py-3 font-medium">{t("col.created")}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-6 py-3">
                  <Link
                    href={`/admin/customers/${r.id}`}
                    className="text-brand font-medium hover:underline"
                  >
                    {r.name}
                  </Link>
                  {r.companyName && r.companyName !== r.name && (
                    <div className="text-[11px] text-slate-500">{r.companyName}</div>
                  )}
                </td>
                <td className="px-6 py-3 text-xs text-slate-700 font-mono">
                  {r.ownerEmail || "—"}
                </td>
                <td className="px-6 py-3 text-slate-600 capitalize">{r.plan}</td>
                <td className="px-6 py-3">
                  <StatusBadge
                    status={r.status === "active" ? "completed" : r.status === "suspended" ? "failed" : "archived"}
                    label={t(`status.${r.status}` as "status.active")}
                  />
                </td>
                <td className="px-6 py-3 text-right tabular-nums">{r.memberCount}</td>
                <td className="px-6 py-3 text-right tabular-nums">{r.projectCount}</td>
                <td className="px-6 py-3 text-right tabular-nums">
                  {r.completedSimCount}
                  {r.simCount !== r.completedSimCount && (
                    <span className="text-slate-400 text-xs">/{r.simCount}</span>
                  )}
                </td>
                <td className="px-6 py-3 text-slate-500 text-xs">
                  {r.lastActivity ? new Date(r.lastActivity).toLocaleDateString(locale) : "—"}
                </td>
                <td className="px-6 py-3 text-slate-500 text-xs">
                  {new Date(r.createdAt).toLocaleDateString(locale)}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-6 py-12 text-center text-slate-500 text-sm">
                  {query ? t("noResults") : t("empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

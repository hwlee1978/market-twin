"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { AlertTriangle, RotateCcw, X } from "lucide-react";
import { clsx } from "clsx";
import { StatusBadge } from "@/components/ui/StatusBadge";

// Past this many minutes a "running" sim is almost certainly a zombie —
// Vercel Pro + Fluid Compute caps functions at 800s (~13 min) so anything
// still claiming "running" past ~15 min hasn't actually been alive for a while.
const ZOMBIE_THRESHOLD_MINUTES = 15;

interface Row {
  id: string;
  workspace_id: string | null;
  project_id: string;
  project_name: string | null;
  status: string;
  current_stage: string | null;
  persona_count: number | null;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  model_provider: string | null;
  model_version: string | null;
}

const FILTERS = [
  { key: "all", label: "all" },
  { key: "running", label: "running" },
  { key: "failed", label: "failed" },
  { key: "cancelled", label: "cancelled" },
  { key: "completed", label: "completed" },
] as const;

export function AdminSimulationsTable({
  rows,
  locale,
}: {
  rows: Row[];
  locale: string;
}) {
  const t = useTranslations("admin.simulations");
  const tProj = useTranslations("project.status");
  const router = useRouter();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (filter === "all") return rows;
    if (filter === "running") {
      return rows.filter((r) => r.status === "running" || r.status === "pending");
    }
    return rows.filter((r) => r.status === filter);
  }, [rows, filter]);

  const onCancel = async (sim: Row) => {
    if (!confirm(t("confirmCancel"))) return;
    setBusyId(sim.id);
    try {
      const res = await fetch(`/api/admin/simulations/${sim.id}/cancel`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(t("actionFailed", { error: body.error ?? res.statusText }));
        return;
      }
      router.refresh();
    } finally {
      setBusyId(null);
    }
  };

  const onRetry = async (sim: Row) => {
    if (!confirm(t("confirmRetry"))) return;
    setBusyId(sim.id);
    try {
      const res = await fetch(`/api/admin/simulations/${sim.id}/retry`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(t("actionFailed", { error: body.error ?? res.statusText }));
        return;
      }
      router.refresh();
    } finally {
      setBusyId(null);
    }
  };

  const runtime = (sim: Row): string => {
    if (!sim.started_at) return "—";
    const end = sim.completed_at ? new Date(sim.completed_at) : new Date();
    const ms = end.getTime() - new Date(sim.started_at).getTime();
    if (ms < 0) return "—";
    const sec = Math.floor(ms / 1000);
    if (sec < 60) return `${sec}s`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ${sec % 60}s`;
    const hr = Math.floor(min / 60);
    return `${hr}h ${min % 60}m`;
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = {
      all: rows.length,
      running: 0,
      failed: 0,
      cancelled: 0,
      completed: 0,
    };
    for (const r of rows) {
      if (r.status === "running" || r.status === "pending") c.running++;
      if (r.status === "failed") c.failed++;
      if (r.status === "cancelled") c.cancelled++;
      if (r.status === "completed") c.completed++;
    }
    return c;
  }, [rows]);

  /**
   * A "running" row is suspect when started > ZOMBIE_THRESHOLD_MINUTES ago.
   * Vercel Pro + Fluid Compute caps functions at 800s (~13 min), so anything
   * still claiming `running` past ~15 minutes is almost certainly a zombie
   * left behind by a function timeout. Surfacing these helps the admin clean up.
   */
  const isZombie = (sim: Row): boolean => {
    if (sim.status !== "running" && sim.status !== "pending") return false;
    if (!sim.started_at) return false;
    const ageMin = (Date.now() - new Date(sim.started_at).getTime()) / 60000;
    return ageMin > ZOMBIE_THRESHOLD_MINUTES;
  };

  return (
    <div className="space-y-4">
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

      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm min-w-[920px]">
          <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-6 py-3 font-medium">{t("col.id")}</th>
              <th className="text-left px-6 py-3 font-medium">{t("col.project")}</th>
              <th className="text-left px-6 py-3 font-medium">{t("col.status")}</th>
              <th className="text-left px-6 py-3 font-medium">{t("col.stage")}</th>
              <th className="text-right px-6 py-3 font-medium">{t("col.personas")}</th>
              <th className="text-left px-6 py-3 font-medium">{t("col.model")}</th>
              <th className="text-right px-6 py-3 font-medium">{t("col.runtime")}</th>
              <th className="text-left px-6 py-3 font-medium">{t("col.started")}</th>
              <th className="px-2 py-3" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => {
              const zombie = isZombie(s);
              return (
              <tr
                key={s.id}
                className={clsx(
                  "border-t border-slate-100 transition-colors",
                  zombie ? "bg-warn-soft/40 hover:bg-warn-soft/60" : "hover:bg-slate-50",
                )}
              >
                <td className="px-6 py-3 font-mono text-xs text-slate-700">{s.id.slice(0, 8)}</td>
                <td className="px-6 py-3">
                  <div className="text-slate-900 truncate max-w-[200px]">
                    {s.project_name ?? "—"}
                  </div>
                  <div className="font-mono text-[10px] text-slate-400">
                    {(s.workspace_id ?? "").slice(0, 8)}
                  </div>
                </td>
                <td className="px-6 py-3">
                  <div className="flex items-center gap-1.5">
                    <StatusBadge status={s.status} label={tProj(s.status as "completed")} />
                    {zombie && (
                      <span
                        title={t("zombieHint", { mins: ZOMBIE_THRESHOLD_MINUTES })}
                        className="inline-flex items-center text-warn"
                      >
                        <AlertTriangle size={12} />
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-3 text-slate-600 text-xs">{s.current_stage ?? "—"}</td>
                <td className="px-6 py-3 text-right tabular-nums text-slate-700">
                  {s.persona_count ?? "—"}
                </td>
                <td className="px-6 py-3 text-xs text-slate-500">
                  {s.model_provider ? `${s.model_provider}` : "—"}
                  {s.model_version && (
                    <div className="text-[10px] text-slate-400 truncate max-w-[140px]">
                      {s.model_version}
                    </div>
                  )}
                </td>
                <td className="px-6 py-3 text-right tabular-nums text-slate-600 text-xs">
                  {runtime(s)}
                </td>
                <td className="px-6 py-3 text-slate-500 text-xs">
                  {s.started_at ? new Date(s.started_at).toLocaleString(locale) : "—"}
                </td>
                <td className="px-2 py-3 whitespace-nowrap">
                  {(s.status === "running" || s.status === "pending") && (
                    <button
                      onClick={() => onCancel(s)}
                      disabled={busyId === s.id}
                      title={t("action.cancel")}
                      aria-label={t("action.cancel")}
                      className="p-1.5 rounded-md text-slate-400 hover:text-risk hover:bg-risk-soft transition-colors disabled:opacity-50"
                    >
                      <X size={14} />
                    </button>
                  )}
                  {(s.status === "failed" || s.status === "cancelled") && (
                    <button
                      onClick={() => onRetry(s)}
                      disabled={busyId === s.id}
                      title={t("action.retry")}
                      aria-label={t("action.retry")}
                      className="p-1.5 rounded-md text-slate-400 hover:text-brand hover:bg-brand-50 transition-colors disabled:opacity-50"
                    >
                      <RotateCcw size={14} />
                    </button>
                  )}
                </td>
              </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-6 py-12 text-center text-slate-500 text-sm">
                  {t("empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

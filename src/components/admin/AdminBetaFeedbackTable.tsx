"use client";

import { useMemo, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { Star, Mail } from "lucide-react";
import { clsx } from "clsx";
import { formatDateTime } from "@/lib/format/date";

interface Row {
  id: string;
  created_at: string;
  rating: number | null;
  category: string | null;
  message: string;
  name: string | null;
  email: string | null;
  locale: string | null;
  status: string;
}

type StatusKey = "new" | "reviewed" | "archived";
const STATUSES: StatusKey[] = ["new", "reviewed", "archived"];

const STATUS_LABEL: Record<StatusKey, { ko: string; en: string }> = {
  new: { ko: "신규", en: "New" },
  reviewed: { ko: "검토됨", en: "Reviewed" },
  archived: { ko: "보관", en: "Archived" },
};

const CATEGORY_LABEL: Record<string, { ko: string; en: string }> = {
  bug: { ko: "버그·오류", en: "Bug" },
  idea: { ko: "기능 제안", en: "Idea" },
  usability: { ko: "사용성", en: "Usability" },
  pricing: { ko: "가격", en: "Pricing" },
  praise: { ko: "칭찬", en: "Praise" },
  other: { ko: "기타", en: "Other" },
};

const STATUS_BADGE: Record<StatusKey, string> = {
  new: "bg-brand/10 text-brand",
  reviewed: "bg-emerald-100 text-emerald-700",
  archived: "bg-slate-200 text-slate-500",
};

export function AdminBetaFeedbackTable({
  rows,
  isKo,
}: {
  rows: Row[];
  isKo: boolean;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | StatusKey>("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length, new: 0, reviewed: 0, archived: 0 };
    for (const r of rows) {
      if (r.status in c) c[r.status]++;
    }
    return c;
  }, [rows]);

  const filtered = useMemo(
    () => (filter === "all" ? rows : rows.filter((r) => r.status === filter)),
    [rows, filter],
  );

  const setStatus = async (id: string, status: StatusKey) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/beta-feedback/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(
          (isKo ? "변경 실패: " : "Update failed: ") +
            (body.error ?? res.statusText),
        );
        return;
      }
      router.refresh();
    } finally {
      setBusyId(null);
    }
  };

  const FILTER_TABS: { key: "all" | StatusKey; label: string }[] = [
    { key: "all", label: isKo ? "전체" : "All" },
    { key: "new", label: STATUS_LABEL.new[isKo ? "ko" : "en"] },
    { key: "reviewed", label: STATUS_LABEL.reviewed[isKo ? "ko" : "en"] },
    { key: "archived", label: STATUS_LABEL.archived[isKo ? "ko" : "en"] },
  ];

  return (
    <div className="space-y-4">
      {/* Filter tabs */}
      <div className="flex items-center gap-1 text-xs">
        {FILTER_TABS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={clsx(
              "px-3 py-1.5 rounded-md transition-colors",
              filter === f.key
                ? "bg-brand text-white"
                : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200",
            )}
          >
            {f.label} ({counts[f.key] ?? 0})
          </button>
        ))}
      </div>

      {/* Cards */}
      <div className="space-y-3">
        {filtered.map((r) => {
          const cat = r.category ? CATEGORY_LABEL[r.category] : null;
          return (
            <div
              key={r.id}
              className={clsx(
                "rounded-xl border bg-white p-5",
                r.status === "archived"
                  ? "border-slate-200 opacity-70"
                  : "border-slate-200",
              )}
            >
              {/* Top row: meta + status actions */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  {cat && (
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                      {cat[isKo ? "ko" : "en"]}
                    </span>
                  )}
                  {r.rating != null && (
                    <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-amber-600">
                      <Star size={12} className="fill-amber-400 stroke-amber-500" />
                      {r.rating}/5
                    </span>
                  )}
                  <span
                    className={clsx(
                      "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                      STATUS_BADGE[r.status as StatusKey] ?? "bg-slate-100 text-slate-500",
                    )}
                  >
                    {STATUS_LABEL[r.status as StatusKey]?.[isKo ? "ko" : "en"] ?? r.status}
                  </span>
                  <span className="text-xs text-slate-400">
                    {formatDateTime(r.created_at, isKo) ?? "—"}
                  </span>
                  {r.locale && (
                    <span className="text-[10px] uppercase text-slate-300">
                      {r.locale}
                    </span>
                  )}
                </div>

                {/* Status triage buttons */}
                <div className="flex items-center gap-1">
                  {STATUSES.map((s) => (
                    <button
                      key={s}
                      onClick={() => setStatus(r.id, s)}
                      disabled={busyId === r.id || r.status === s}
                      className={clsx(
                        "rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-default",
                        r.status === s
                          ? "bg-slate-800 text-white"
                          : "bg-white text-slate-500 border border-slate-200 hover:bg-slate-50 disabled:opacity-40",
                      )}
                    >
                      {STATUS_LABEL[s][isKo ? "ko" : "en"]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Message */}
              <p className="mt-3 whitespace-pre-wrap break-words text-sm text-slate-800">
                {r.message}
              </p>

              {/* Contact */}
              {(r.name || r.email) && (
                <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                  {r.name && <span>{r.name}</span>}
                  {r.email && (
                    <a
                      href={`mailto:${r.email}`}
                      className="inline-flex items-center gap-1 text-brand hover:underline"
                    >
                      <Mail size={12} />
                      {r.email}
                    </a>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500">
            {isKo ? "표시할 피드백이 없습니다." : "No feedback to show."}
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { ShieldOff, ShieldCheck, Archive } from "lucide-react";

type Status = "active" | "suspended" | "archived";

export function CustomerActions({
  workspaceId,
  currentStatus,
}: {
  workspaceId: string;
  currentStatus: Status;
}) {
  const t = useTranslations("admin.customers");
  const router = useRouter();
  const [busy, setBusy] = useState<Status | null>(null);

  const change = async (next: Status, confirmKey: "suspend" | "reactivate" | "archive") => {
    if (!confirm(t(`confirm.${confirmKey}` as "confirm.suspend"))) return;
    setBusy(next);
    try {
      const res = await fetch(`/api/admin/workspaces/${workspaceId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(t("actionFailed", { error: body.error ?? res.statusText }));
        return;
      }
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {currentStatus === "active" && (
        <>
          <button
            onClick={() => change("suspended", "suspend")}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 rounded-lg bg-risk-soft text-risk px-3 py-2 text-sm font-medium hover:bg-risk hover:text-white transition-colors disabled:opacity-50"
          >
            <ShieldOff size={14} />
            {t("action.suspend")}
          </button>
          <button
            onClick={() => change("archived", "archive")}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 text-slate-700 px-3 py-2 text-sm font-medium hover:bg-slate-200 transition-colors disabled:opacity-50"
          >
            <Archive size={14} />
            {t("action.archive")}
          </button>
        </>
      )}
      {currentStatus === "suspended" && (
        <>
          <button
            onClick={() => change("active", "reactivate")}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 rounded-lg bg-success-soft text-success px-3 py-2 text-sm font-medium hover:bg-success hover:text-white transition-colors disabled:opacity-50"
          >
            <ShieldCheck size={14} />
            {t("action.reactivate")}
          </button>
          <button
            onClick={() => change("archived", "archive")}
            disabled={busy !== null}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 text-slate-700 px-3 py-2 text-sm font-medium hover:bg-slate-200 transition-colors disabled:opacity-50"
          >
            <Archive size={14} />
            {t("action.archive")}
          </button>
        </>
      )}
      {currentStatus === "archived" && (
        <button
          onClick={() => change("active", "reactivate")}
          disabled={busy !== null}
          className="inline-flex items-center gap-1.5 rounded-lg bg-success-soft text-success px-3 py-2 text-sm font-medium hover:bg-success hover:text-white transition-colors disabled:opacity-50"
        >
          <ShieldCheck size={14} />
          {t("action.reactivate")}
        </button>
      )}
    </div>
  );
}

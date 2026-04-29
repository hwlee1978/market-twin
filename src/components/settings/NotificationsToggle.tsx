"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Mail } from "lucide-react";

export function NotificationsToggle({
  workspaceId,
  initial,
}: {
  workspaceId: string;
  initial: boolean;
}) {
  const t = useTranslations("settings.notifications");
  const router = useRouter();
  const [enabled, setEnabled] = useState(initial);
  const [busy, setBusy] = useState(false);

  const onToggle = async () => {
    const next = !enabled;
    setBusy(true);
    setEnabled(next);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailNotifications: next }),
      });
      if (!res.ok) throw new Error(await res.text());
      router.refresh();
    } catch {
      // Revert on failure — best-effort UX
      setEnabled(!next);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-slate-200 p-4">
      <div className="flex items-start gap-3 min-w-0">
        <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-brand-50 text-brand shrink-0">
          <Mail size={16} />
        </span>
        <div>
          <div className="text-sm font-medium text-slate-900">{t("simEmail.title")}</div>
          <p className="mt-0.5 text-xs text-slate-500 leading-relaxed">
            {t("simEmail.description")}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={onToggle}
        disabled={busy}
        role="switch"
        aria-checked={enabled}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
          enabled ? "bg-brand" : "bg-slate-300"
        } disabled:opacity-50`}
      >
        <span
          aria-hidden
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
            enabled ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}

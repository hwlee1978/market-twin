"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { AlertCircle, Check, Loader2 } from "lucide-react";

interface Initial {
  name: string;
  companyName: string;
  industry: string;
  country: string;
}

export function WorkspaceSettingsForm({
  workspaceId,
  initial,
}: {
  workspaceId: string;
  initial: Initial;
}) {
  const t = useTranslations("settings.workspace");
  const router = useRouter();
  const [form, setForm] = useState<Initial>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const dirty =
    form.name !== initial.name ||
    form.companyName !== initial.companyName ||
    form.industry !== initial.industry ||
    form.country !== initial.country;

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          companyName: form.companyName.trim() || null,
          industry: form.industry.trim() || null,
          country: form.country.trim() || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? res.statusText);
      }
      setSavedAt(Date.now());
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={onSave} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">{t("name")}</label>
          <input
            className="input"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </div>
        <div>
          <label className="label">{t("companyName")}</label>
          <input
            className="input"
            value={form.companyName}
            onChange={(e) => setForm({ ...form, companyName: e.target.value })}
            placeholder={t("companyNamePlaceholder")}
          />
        </div>
        <div>
          <label className="label">{t("industry")}</label>
          <input
            className="input"
            value={form.industry}
            onChange={(e) => setForm({ ...form, industry: e.target.value })}
            placeholder={t("industryPlaceholder")}
          />
        </div>
        <div>
          <label className="label">{t("country")}</label>
          <input
            className="input"
            value={form.country}
            onChange={(e) => setForm({ ...form, country: e.target.value })}
            placeholder={t("countryPlaceholder")}
          />
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-risk-soft bg-risk-soft/40 px-3 py-2 text-sm text-risk">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={!dirty || busy}
          className="btn-primary disabled:opacity-40"
        >
          {busy ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              {t("saving")}
            </>
          ) : (
            t("save")
          )}
        </button>
        {savedAt !== null && !busy && !dirty && (
          <span className="inline-flex items-center gap-1.5 text-xs text-success">
            <Check size={13} />
            {t("saved")}
          </span>
        )}
      </div>
    </form>
  );
}

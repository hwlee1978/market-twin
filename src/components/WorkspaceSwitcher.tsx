"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { ChevronsUpDown, Check, Plus, Building2, X, Loader2 } from "lucide-react";
import { clsx } from "clsx";
import type { WorkspaceSummary } from "@/lib/workspace";

type Props = {
  workspaces: WorkspaceSummary[];
};

export function WorkspaceSwitcher({ workspaces }: Props) {
  const t = useTranslations("workspaceSwitcher");
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const active = workspaces.find((w) => w.isActive) ?? workspaces[0];

  const switchTo = (id: string) => {
    if (!id || id === active?.id) {
      setOpen(false);
      return;
    }
    setSwitchingTo(id);
    setOpen(false);
    startTransition(async () => {
      const res = await fetch("/api/workspaces/switch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ workspaceId: id }),
      });
      if (res.ok) {
        // ID-scoped routes (/projects/[id]/*, /reports/[id]/*) become
        // invalid after the workspace switch because the new workspace
        // has no such project / report. Staying on the same URL would
        // either notFound() server-side or render an empty page — both
        // look like "nothing happened" to the user. Detect those routes
        // and bounce to the section's list page; for workspace-neutral
        // routes (/dashboard, /billing, /team, /settings, …) we keep
        // the current URL and just hard reload so panels re-init from
        // the new workspace's data.
        const next = resolvePostSwitchPath(window.location.pathname);
        if (next) {
          window.location.assign(next);
        } else {
          // Hard reload — see note above on why router.refresh() is not
          // enough (client-state-backed panels don't reset).
          window.location.reload();
        }
        // Overlay stays visible until the browser navigates away —
        // do not clear switchingTo on success.
      } else {
        // Failure (e.g. forbidden) — drop overlay so the user can retry.
        setSwitchingTo(null);
      }
    });
  };

  if (!active) return null;

  return (
    <>
      <div ref={wrapRef} className="relative px-3 pb-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-brand-600/40 hover:bg-brand-600/70 text-left transition-colors group"
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-white/10 shrink-0">
            <Building2 size={14} className="text-brand-100" />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-[10px] uppercase tracking-wider text-brand-200">
              {t("label")}
            </span>
            <span className="block text-xs font-semibold text-white truncate">
              {active.name}
            </span>
          </span>
          <ChevronsUpDown size={14} className="text-brand-200 shrink-0" />
        </button>

        {open && (
          <div
            role="listbox"
            className="absolute left-3 right-3 top-full mt-1 z-30 bg-white text-slate-900 rounded-lg shadow-xl border border-slate-200 overflow-hidden"
          >
            <div className="px-3 py-2 border-b border-slate-100">
              <div className="text-[10px] uppercase tracking-wider text-slate-500">
                {t("dropdownTitle")}
              </div>
            </div>
            <ul className="max-h-72 overflow-y-auto py-1">
              {workspaces.map((w) => {
                const isSwitching = switchingTo === w.id;
                return (
                  <li key={w.id}>
                    <button
                      type="button"
                      onClick={() => switchTo(w.id)}
                      disabled={pending}
                      className={clsx(
                        "w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-slate-50 transition-colors disabled:opacity-60",
                        w.isActive && "bg-brand-50/40",
                      )}
                    >
                      <span className="mt-0.5 w-4 h-4 inline-flex items-center justify-center shrink-0">
                        {isSwitching ? (
                          <Loader2 size={14} className="text-brand animate-spin" />
                        ) : w.isActive ? (
                          <Check size={14} className="text-brand" />
                        ) : null}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-xs font-semibold truncate">
                          {w.name}
                        </span>
                        <span className="block text-[10px] text-slate-500 truncate">
                          {w.companyName ?? w.role}
                        </span>
                      </span>
                      <span className="text-[10px] uppercase text-slate-400 shrink-0 mt-0.5">
                        {w.role}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setCreateOpen(true);
              }}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-xs font-medium text-brand hover:bg-brand-50 border-t border-slate-100"
            >
              <Plus size={14} />
              {t("createNew")}
            </button>
          </div>
        )}
      </div>

      {createOpen && (
        <CreateWorkspaceModal
          onClose={() => setCreateOpen(false)}
          onCreated={(id) => {
            setCreateOpen(false);
            // Hard reload — same reason as switchTo (router.refresh
            // doesn't reset client-state-backed panels). The new
            // workspace's empty state needs every panel to re-init.
            void id;
            setSwitchingTo(id);
            window.location.reload();
          }}
        />
      )}

      {switchingTo && (
        <SwitchingOverlay
          targetName={
            workspaces.find((w) => w.id === switchingTo)?.name ?? ""
          }
        />
      )}
    </>
  );
}

/**
 * Full-screen overlay shown during a workspace switch. The switch chain
 * (POST /api/workspaces/switch → window.location.assign/reload) takes a
 * few seconds — without a visible state change, users assume the click
 * didn't register and click again. The overlay also blocks interactions
 * with the page that's about to be replaced, preventing stale clicks.
 */
function SwitchingOverlay({ targetName }: { targetName: string }) {
  const t = useTranslations("workspaceSwitcher");
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/55 backdrop-blur-sm"
      role="status"
      aria-live="polite"
    >
      <div className="bg-white rounded-xl shadow-2xl px-8 py-7 flex flex-col items-center gap-3 max-w-sm mx-4">
        <Loader2 size={32} className="text-brand animate-spin" />
        <div className="text-sm font-semibold text-slate-900 text-center">
          {t("switching")}
        </div>
        {targetName && (
          <div className="text-xs text-brand font-medium">{targetName}</div>
        )}
        <div className="text-[11px] text-slate-500 text-center leading-relaxed">
          {t("switchingSubtitle")}
        </div>
      </div>
    </div>
  );
}

/**
 * Decide where to land after a workspace switch. ID-scoped routes
 * (project/report detail pages) become invalid in the new workspace
 * because the resource lives under the OLD workspace_id — server
 * components either notFound() or render an empty filtered list.
 *
 * Returns the path to navigate to, or null if the current path is safe
 * to reload in place (workspace-neutral list/index pages).
 *
 * Path shapes covered:
 *   /ko/projects/<uuid>/*         → /projects
 *   /en/projects/<uuid>/results   → /projects
 *   /reports/<uuid>               → /reports
 *   /mr-ai/<sub-tab>              → /mr-ai (sub-tabs reset to dashboard)
 *
 * Locale prefix is preserved so users stay on the right /ko or /en tree.
 */
function resolvePostSwitchPath(pathname: string): string | null {
  // Optional locale prefix (/ko or /en). Strip it for matching, then
  // reapply when emitting the redirect target.
  const localeMatch = pathname.match(/^\/(ko|en)(\/|$)/);
  const localePrefix = localeMatch ? `/${localeMatch[1]}` : "";
  const rest = localeMatch ? pathname.slice(localePrefix.length) || "/" : pathname;

  // Project detail / sub-routes — anything past /projects/<id> is workspace-bound.
  if (/^\/projects\/[^/]+(\/|$)/.test(rest) && !/^\/projects\/new(\/|$)/.test(rest)) {
    return `${localePrefix}/projects`;
  }
  // Report detail
  if (/^\/reports\/[^/]+(\/|$)/.test(rest)) {
    return `${localePrefix}/reports`;
  }
  // Mr.AI sub-tabs hold workspace-scoped state in their initial server
  // fetch — bounce to the tab root so each panel re-initialises.
  if (/^\/mr-ai\/[^/]+(\/|$)/.test(rest)) {
    return `${localePrefix}/mr-ai`;
  }
  return null;
}

function CreateWorkspaceModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const t = useTranslations("workspaceSwitcher");
  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState("");
  const [country, setCountry] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          companyName: companyName.trim() || undefined,
          industry: industry.trim() || undefined,
          country: country.trim() || undefined,
          setActive: true,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(typeof json.error === "string" ? json.error : t("createFailed"));
        return;
      }
      onCreated(json.workspaceId);
    } catch (err) {
      setError(t("createFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm px-4"
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 text-slate-400 hover:text-slate-600"
          aria-label="close"
        >
          <X size={18} />
        </button>
        <h2 className="text-base font-semibold text-slate-900 mb-1">
          {t("modalTitle")}
        </h2>
        <p className="text-xs text-slate-500 mb-5">{t("modalSubtitle")}</p>

        <form onSubmit={submit} className="space-y-3">
          <Field
            label={t("fieldName")}
            value={name}
            onChange={setName}
            required
            autoFocus
            placeholder={t("fieldNamePlaceholder")}
          />
          <Field
            label={t("fieldCompany")}
            value={companyName}
            onChange={setCompanyName}
            placeholder={t("fieldCompanyPlaceholder")}
          />
          <div className="grid grid-cols-2 gap-3">
            <Field
              label={t("fieldIndustry")}
              value={industry}
              onChange={setIndustry}
              placeholder={t("fieldIndustryPlaceholder")}
            />
            <Field
              label={t("fieldCountry")}
              value={country}
              onChange={setCountry}
              placeholder="KR"
            />
          </div>

          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900"
            >
              {t("cancel")}
            </button>
            <button
              type="submit"
              disabled={submitting || !name.trim()}
              className="px-4 py-2 text-sm font-medium bg-brand text-white rounded-md hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? t("creating") : t("create")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  required,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-wider text-slate-500">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        autoFocus={autoFocus}
        className="mt-1 w-full px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
      />
    </label>
  );
}

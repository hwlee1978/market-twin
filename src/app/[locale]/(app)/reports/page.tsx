import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Download, ExternalLink, FileText } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { CountryChip } from "@/components/ui/CountryChip";
import { ReportsSearch } from "@/components/reports/ReportsSearch";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { getCountryLabel } from "@/lib/countries";

type ReportRow = {
  id: string;
  project_id: string;
  status: string;
  persona_count: number;
  started_at: string | null;
  completed_at: string | null;
  model_provider: string | null;
  success_score: number | null;
  best_country: string | null;
  projects: { id: string; name: string; product_name: string } | null;
};

export default async function ReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("reports");
  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) return null;

  const supabase = await createClient();
  // Reads success_score / best_country directly from simulations (denormalized
  // by migration 0007) instead of joining simulation_results — that join was
  // pulling the entire JSONB blob (tens of KB per row) just for two fields.
  const { data: simsRaw } = await supabase
    .from("simulations")
    .select(
      `id, project_id, status, persona_count, started_at, completed_at,
       model_provider, success_score, best_country,
       projects:projects(id, name, product_name)`,
    )
    .eq("workspace_id", ctx.workspaceId)
    .eq("status", "completed")
    .order("completed_at", { ascending: false, nullsFirst: false });
  const sims = (simsRaw ?? []) as unknown as ReportRow[];

  const q = (sp.q ?? "").trim().toLowerCase();
  const filtered = q
    ? sims.filter((s) => {
        const proj = s.projects;
        const haystack = [proj?.name, proj?.product_name, s.id].filter(Boolean).join(" ").toLowerCase();
        return haystack.includes(q);
      })
    : sims;

  return (
    <>
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      <ReportsSearch initialQuery={sp.q ?? ""} />

      {filtered.length === 0 ? (
        <div className="card text-center py-16">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-100 text-slate-400 mb-4">
            <FileText size={20} />
          </div>
          <h2 className="text-base font-semibold text-slate-900">
            {sims.length === 0 ? t("emptyTitle") : t("noResults")}
          </h2>
          <p className="mt-1.5 text-sm text-slate-500 max-w-sm mx-auto leading-relaxed">
            {sims.length === 0 ? t("emptyDescription") : t("noResultsHint")}
          </p>
          {sims.length === 0 && (
            <Link href="/projects/new" className="btn-primary mt-5">
              {t("startFirst")}
            </Link>
          )}
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wider">
              <tr>
                <th className="text-left px-6 py-3 font-medium">{t("col.project")}</th>
                <th className="text-left px-6 py-3 font-medium">{t("col.product")}</th>
                <th className="text-right px-6 py-3 font-medium">{t("col.successScore")}</th>
                <th className="text-left px-6 py-3 font-medium">{t("col.bestCountry")}</th>
                <th className="text-right px-6 py-3 font-medium">{t("col.personas")}</th>
                <th className="text-left px-6 py-3 font-medium">{t("col.completed")}</th>
                <th className="text-right px-6 py-3 font-medium">{t("col.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const proj = s.projects;
                const score = s.success_score;
                const bestCountry = s.best_country;
                return (
                  <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-6 py-3">
                      <Link
                        href={`/projects/${s.project_id}`}
                        className="text-brand font-medium hover:underline"
                      >
                        {proj?.name ?? "—"}
                      </Link>
                    </td>
                    <td className="px-6 py-3 text-slate-700">{proj?.product_name ?? "—"}</td>
                    <td className="px-6 py-3 text-right tabular-nums font-mono">
                      {score !== undefined ? `${score}%` : "—"}
                    </td>
                    <td className="px-6 py-3">
                      {bestCountry ? (
                        <span className="inline-flex items-center gap-2">
                          <CountryChip code={bestCountry} size="sm" />
                          <span className="text-slate-700 text-xs">
                            {getCountryLabel(bestCountry, locale) || bestCountry}
                          </span>
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums text-slate-600">
                      {s.persona_count}
                    </td>
                    <td className="px-6 py-3 text-slate-500 text-xs">
                      {s.completed_at
                        ? new Date(s.completed_at).toLocaleString(locale, {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/projects/${s.project_id}/results?sim=${s.id}`}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-slate-600 hover:bg-slate-100 hover:text-brand transition-colors"
                          title={t("action.view")}
                        >
                          <ExternalLink size={13} />
                        </Link>
                        <a
                          href={`/api/reports/${s.id}/pdf?locale=${locale}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-slate-600 hover:bg-slate-100 hover:text-brand transition-colors"
                          title={t("action.pdf")}
                        >
                          <Download size={13} />
                        </a>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-slate-400 text-center">
        {t("footnote", { count: filtered.length, total: sims.length })}
      </p>
    </>
  );
}

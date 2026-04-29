import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { RunSimulationButton } from "@/components/RunSimulationButton";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id, locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) return null;

  const supabase = await createClient();
  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .eq("workspace_id", ctx.workspaceId)
    .single();
  if (!project) notFound();

  const { data: simulations } = await supabase
    .from("simulations")
    .select("id, status, current_stage, persona_count, started_at, completed_at, model_provider, model_version")
    .eq("project_id", id)
    .order("created_at", { ascending: false });

  const latest = simulations?.[0];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{project.name}</h1>
          <p className="text-slate-500 text-sm mt-1">{project.product_name}</p>
        </div>
        <StatusBadge status={project.status} label={t(`project.status.${project.status}`)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card lg:col-span-2 space-y-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">
              {t("projectDetail.description")}
            </div>
            <p className="text-sm text-slate-700 whitespace-pre-wrap">{project.description}</p>
          </div>
          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100">
            <Field label={t("project.wizard.fields.basePrice")}>
              {((project.base_price_cents ?? 0) / 100).toFixed(2)} {project.currency}
            </Field>
            <Field label={t("project.wizard.fields.objective")}>
              {t(`project.wizard.objective.${project.objective as "conversion"}`)}
            </Field>
            <Field label={t("project.wizard.fields.countries")}>
              {(project.candidate_countries ?? []).join(", ")}
            </Field>
            <Field label={t("project.wizard.fields.competitorUrls")}>
              <span className="text-xs">
                {t("projectDetail.competitorUrlsCount", {
                  count: (project.competitor_urls ?? []).length,
                })}
              </span>
            </Field>
          </div>
        </div>

        <div className="card">
          <h3 className="text-base font-semibold mb-3">{t("projectDetail.simulations")}</h3>
          {simulations && simulations.length > 0 ? (
            <ul className="space-y-2">
              {simulations.map((s) => (
                <li key={s.id} className="flex items-center justify-between text-sm">
                  <Link
                    href={`/projects/${id}/results?sim=${s.id}`}
                    className="text-brand hover:underline truncate"
                  >
                    {new Date(s.started_at ?? Date.now()).toLocaleString(locale)}
                  </Link>
                  <StatusBadge status={s.status} label={t(`project.status.${s.status}`)} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">{t("projectDetail.noSimulations")}</p>
          )}
          {latest && (
            <Link
              href={`/projects/${id}/results?sim=${latest.id}`}
              className="btn-secondary w-full mt-4"
            >
              {latest.status === "completed"
                ? t("projectDetail.viewResults")
                : t("projectDetail.viewProgress")}
            </Link>
          )}
          {(simulations?.filter((s) => s.status === "completed").length ?? 0) >= 2 && (
            <Link
              href={`/projects/${id}/compare`}
              className="btn-ghost w-full mt-2"
            >
              {t("projectDetail.compareRuns")}
            </Link>
          )}
          <div className="mt-4 pt-4 border-t border-slate-100">
            <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">
              {t("projectDetail.runNew")}
            </div>
            <RunSimulationButton projectId={id} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">{label}</div>
      <div className="text-sm text-slate-900">{children}</div>
    </div>
  );
}

import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Sparkles } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { RunSimulationButton } from "@/components/RunSimulationButton";
import { RunEnsembleButton } from "@/components/RunEnsembleButton";
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

  // Standalone simulations only — sims that belong to an ensemble are
  // already tracked in the ensemble card, and a 25-sim deep ensemble would
  // otherwise drown the page in repeated rows.
  const { data: simulations } = await supabase
    .from("simulations")
    .select("id, status, current_stage, persona_count, started_at, completed_at, model_provider, model_version")
    .eq("project_id", id)
    .is("ensemble_id", null)
    .order("created_at", { ascending: false })
    .limit(10);

  const latest = simulations?.[0];

  // Pull ensemble history alongside individual sims. Ensembles are the
  // primary history view going forward — each row links to the aggregated
  // dashboard. Standalone sims (legacy / quick mode) stay in their own list.
  const { data: ensembles } = await supabase
    .from("ensembles")
    .select(
      "id, tier, parallel_sims, per_sim_personas, status, created_at, completed_at, aggregate_result",
    )
    .eq("project_id", id)
    .order("created_at", { ascending: false })
    .limit(10);
  type EnsembleTier =
    | "hypothesis"
    | "decision"
    | "decision_plus"
    | "deep"
    | "deep_pro";
  type EnsembleRow = {
    id: string;
    tier: EnsembleTier;
    parallel_sims: number;
    per_sim_personas: number;
    status: string;
    created_at: string;
    completed_at: string | null;
    aggregate_result: {
      recommendation?: { country: string; consensusPercent: number; confidence: string };
    } | null;
  };
  const ensemblesList = (ensembles ?? []) as unknown as EnsembleRow[];
  const TIER_LABELS: Record<EnsembleTier, string> =
    locale === "ko"
      ? {
          hypothesis: "초기검증",
          decision: "검증분석",
          decision_plus: "검증분석+",
          deep: "심층분석",
          deep_pro: "심층분석 Pro",
        }
      : {
          hypothesis: "Hypothesis",
          decision: "Decision",
          decision_plus: "Decision+",
          deep: "Deep",
          deep_pro: "Deep Pro",
        };

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
          <h3 className="text-base font-semibold mb-3">{t("projectDetail.analyses")}</h3>

          {ensemblesList.length > 0 && (
            <ul className="space-y-2 mb-4">
              {ensemblesList.map((e) => {
                const tierLabel = TIER_LABELS[e.tier] ?? e.tier;
                const rec = e.aggregate_result?.recommendation;
                return (
                  <li key={e.id} className="text-sm">
                    <Link
                      href={`/projects/${id}/results?ensemble=${e.id}`}
                      className="block rounded-lg border border-slate-200 px-3 py-2 hover:border-brand transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[10px] font-semibold uppercase tracking-wide bg-brand/10 text-brand px-1.5 py-0.5 rounded">
                            {tierLabel}
                          </span>
                          <span className="text-xs text-slate-500 truncate">
                            {new Date(e.created_at).toLocaleString(locale)}
                          </span>
                        </div>
                        <StatusBadge status={e.status} label={t(`project.status.${e.status}`)} />
                      </div>
                      {rec && e.status === "completed" && (
                        <div className="mt-1.5 text-xs text-slate-600">
                          {t("projectDetail.recommendation")}:{" "}
                          <span className="font-semibold text-slate-900">{rec.country}</span>{" "}
                          <span className="text-slate-400">
                            · {rec.consensusPercent}% {t("projectDetail.consensus")}
                          </span>
                        </div>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}

          {simulations && simulations.length > 0 ? (
            <>
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
              {(simulations.filter((s) => s.status === "completed").length ?? 0) >= 2 && (
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
                <RunEnsembleButton projectId={id} />
                <details className="mt-3">
                  <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-600">
                    {locale === "ko" ? "단일 시뮬 (legacy)" : "Single sim (legacy)"}
                  </summary>
                  <div className="mt-2">
                    <RunSimulationButton projectId={id} />
                  </div>
                </details>
              </div>
            </>
          ) : (
            // First-run state: collapse the empty list + separated "RUN NEW"
            // section into one inviting CTA so the action is obvious. The
            // separated layout above is appropriate when sims already exist
            // but felt disconnected here.
            <div className="text-center px-2 py-4">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-brand/10 text-brand mb-3">
                <Sparkles size={18} />
              </div>
              <h4 className="text-sm font-semibold text-slate-900 mb-1.5 break-keep">
                {t("projectDetail.firstSimTitle")}
              </h4>
              <p className="text-xs text-slate-500 leading-relaxed mb-4 break-keep">
                {t("projectDetail.firstSimSubtitle")}
              </p>
              <RunEnsembleButton projectId={id} />
            </div>
          )}
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

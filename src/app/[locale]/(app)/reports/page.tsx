import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ChevronRight, Download, ExternalLink, FileText } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { CountryChip } from "@/components/ui/CountryChip";
import { ReportsSearch } from "@/components/reports/ReportsSearch";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { getCountryLabel } from "@/lib/countries";

type EnsembleTier =
  | "hypothesis"
  | "decision"
  | "decision_plus"
  | "deep"
  | "deep_pro";

type ProjectMeta = { id: string; name: string; product_name: string };

type EnsembleRow = {
  id: string;
  project_id: string;
  status: string;
  tier: EnsembleTier;
  parallel_sims: number;
  per_sim_personas: number;
  created_at: string;
  completed_at: string | null;
  aggregate_result: {
    recommendation?: { country: string; consensusPercent: number; confidence: string };
  } | null;
  projects: ProjectMeta | null;
};

type SimRow = {
  id: string;
  project_id: string;
  status: string;
  persona_count: number;
  started_at: string | null;
  completed_at: string | null;
  success_score: number | null;
  best_country: string | null;
  ensemble_id: string | null;
  projects: ProjectMeta | null;
};

interface ProjectBucket {
  project: ProjectMeta;
  ensembles: EnsembleRow[];
  standaloneSims: SimRow[];
  totalAnalyses: number;
  lastActivityAt: Date | null;
}

function tierLabel(tier: EnsembleTier, isKo: boolean): string {
  const map: Record<EnsembleTier, { ko: string; en: string }> = {
    hypothesis: { ko: "초기검증", en: "Hypothesis" },
    decision: { ko: "검증분석", en: "Decision" },
    decision_plus: { ko: "검증분석+", en: "Decision+" },
    deep: { ko: "심층분석", en: "Deep" },
    deep_pro: { ko: "심층분석 Pro", en: "Deep Pro" },
  };
  const entry = map[tier];
  if (!entry) return tier;
  return isKo ? entry.ko : entry.en;
}

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
  const isKo = locale === "ko";
  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) return null;

  const supabase = await createClient();

  // Pull ensembles + standalone sims separately. Joining sims onto
  // ensembles is not what we want here — the report list is "what runs
  // exist on each project", and ensembles are first-class runs that
  // should NOT be expanded into their N child sims at this level.
  const [{ data: ensRaw }, { data: simsRaw }] = await Promise.all([
    supabase
      .from("ensembles")
      .select(
        `id, project_id, status, tier, parallel_sims, per_sim_personas,
         created_at, completed_at, aggregate_result,
         projects:projects(id, name, product_name)`,
      )
      .eq("workspace_id", ctx.workspaceId)
      .order("created_at", { ascending: false }),
    supabase
      .from("simulations")
      .select(
        `id, project_id, status, persona_count, started_at, completed_at,
         success_score, best_country, ensemble_id,
         projects:projects(id, name, product_name)`,
      )
      .eq("workspace_id", ctx.workspaceId)
      .is("ensemble_id", null)
      .order("created_at", { ascending: false }),
  ]);

  const ensembles = (ensRaw ?? []) as unknown as EnsembleRow[];
  const standalone = (simsRaw ?? []) as unknown as SimRow[];

  // Group by project. A project shows up in the list if it has at least
  // one ensemble OR one standalone sim. Sort buckets by their most recent
  // activity so the latest-touched project floats to the top.
  const buckets = new Map<string, ProjectBucket>();
  const ensureBucket = (p: ProjectMeta | null): ProjectBucket | null => {
    if (!p) return null;
    let b = buckets.get(p.id);
    if (!b) {
      b = {
        project: p,
        ensembles: [],
        standaloneSims: [],
        totalAnalyses: 0,
        lastActivityAt: null,
      };
      buckets.set(p.id, b);
    }
    return b;
  };
  for (const e of ensembles) {
    const b = ensureBucket(e.projects);
    if (!b) continue;
    b.ensembles.push(e);
    b.totalAnalyses += 1;
    const at = e.completed_at ?? e.created_at;
    const d = at ? new Date(at) : null;
    if (d && (!b.lastActivityAt || d > b.lastActivityAt)) b.lastActivityAt = d;
  }
  for (const s of standalone) {
    const b = ensureBucket(s.projects);
    if (!b) continue;
    b.standaloneSims.push(s);
    b.totalAnalyses += 1;
    const at = s.completed_at ?? s.started_at;
    const d = at ? new Date(at) : null;
    if (d && (!b.lastActivityAt || d > b.lastActivityAt)) b.lastActivityAt = d;
  }

  const allBuckets = [...buckets.values()].sort((a, b) => {
    const av = a.lastActivityAt?.getTime() ?? 0;
    const bv = b.lastActivityAt?.getTime() ?? 0;
    return bv - av;
  });

  const q = (sp.q ?? "").trim().toLowerCase();
  const filtered = q
    ? allBuckets.filter((b) =>
        [b.project.name, b.project.product_name]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q),
      )
    : allBuckets;

  const totalProjects = allBuckets.length;
  const totalAnalyses = allBuckets.reduce((sum, b) => sum + b.totalAnalyses, 0);

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
            {totalProjects === 0 ? t("emptyTitle") : t("noResults")}
          </h2>
          <p className="mt-1.5 text-sm text-slate-500 max-w-sm mx-auto leading-relaxed">
            {totalProjects === 0 ? t("emptyDescription") : t("noResultsHint")}
          </p>
          {totalProjects === 0 && (
            <Link href="/projects/new" className="btn-primary mt-5">
              {t("startFirst")}
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((b) => (
            <ProjectGroupCard
              key={b.project.id}
              bucket={b}
              locale={locale}
              isKo={isKo}
            />
          ))}
        </div>
      )}

      <p className="text-xs text-slate-400 text-center mt-4">
        {isKo
          ? `${filtered.length}개 프로젝트 · 총 ${totalAnalyses}건의 분석`
          : `${filtered.length} project${filtered.length === 1 ? "" : "s"} · ${totalAnalyses} analysis run${totalAnalyses === 1 ? "" : "s"} total`}
      </p>
    </>
  );
}

function ProjectGroupCard({
  bucket,
  locale,
  isKo,
}: {
  bucket: ProjectBucket;
  locale: string;
  isKo: boolean;
}) {
  const { project, ensembles, standaloneSims, totalAnalyses, lastActivityAt } = bucket;
  const lastLabel = lastActivityAt
    ? lastActivityAt.toLocaleString(locale, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

  // Combined timeline so the inside list is always newest-first regardless
  // of whether the run was an ensemble or a standalone sim.
  const items: Array<
    | { kind: "ensemble"; row: EnsembleRow; at: Date }
    | { kind: "sim"; row: SimRow; at: Date }
  > = [];
  for (const e of ensembles) {
    const at = new Date(e.completed_at ?? e.created_at);
    items.push({ kind: "ensemble", row: e, at });
  }
  for (const s of standaloneSims) {
    const at = new Date(s.completed_at ?? s.started_at ?? Date.now());
    items.push({ kind: "sim", row: s, at });
  }
  items.sort((a, b) => b.at.getTime() - a.at.getTime());

  return (
    <details className="card p-0 overflow-hidden group">
      <summary className="flex items-center gap-3 px-6 py-4 cursor-pointer list-none hover:bg-slate-50 transition-colors">
        <ChevronRight
          size={16}
          className="shrink-0 text-slate-400 transition-transform group-open:rotate-90"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-3 flex-wrap">
            <span className="font-semibold text-slate-900">{project.name}</span>
            <span className="text-sm text-slate-500 truncate">
              {project.product_name}
            </span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-sm text-slate-700 font-medium">
            {isKo ? `분석 ${totalAnalyses}건` : `${totalAnalyses} run${totalAnalyses === 1 ? "" : "s"}`}
          </div>
          <div className="text-xs text-slate-400">{lastLabel}</div>
        </div>
      </summary>

      <div className="border-t border-slate-100 divide-y divide-slate-100 bg-slate-50/40">
        {items.length === 0 ? (
          <div className="px-6 py-4 text-sm text-slate-400 text-center">—</div>
        ) : (
          items.map((it) =>
            it.kind === "ensemble" ? (
              <EnsembleRowItem
                key={`e-${it.row.id}`}
                ensemble={it.row}
                locale={locale}
                isKo={isKo}
              />
            ) : (
              <SimRowItem
                key={`s-${it.row.id}`}
                sim={it.row}
                locale={locale}
                isKo={isKo}
              />
            ),
          )
        )}
      </div>
    </details>
  );
}

function EnsembleRowItem({
  ensemble,
  locale,
  isKo,
}: {
  ensemble: EnsembleRow;
  locale: string;
  isKo: boolean;
}) {
  const rec = ensemble.aggregate_result?.recommendation;
  const badge = tierLabel(ensemble.tier, isKo);
  const at = ensemble.completed_at ?? ensemble.created_at;
  return (
    <div className="px-6 py-3 flex items-center gap-4">
      <span className="shrink-0 inline-block w-20 text-[10px] font-bold uppercase tracking-wider text-brand bg-brand/10 px-2 py-0.5 rounded">
        {badge}
      </span>
      <div className="text-xs text-slate-500 shrink-0 w-44 tabular-nums">
        {new Date(at).toLocaleString(locale, {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </div>
      <div className="min-w-0 flex-1 flex items-center gap-3">
        {rec && ensemble.status === "completed" ? (
          <>
            <CountryChip code={rec.country} size="sm" />
            <span className="text-sm font-medium text-slate-900">
              {getCountryLabel(rec.country, locale) || rec.country}
            </span>
            <span className="text-xs text-slate-500 tabular-nums">
              {rec.consensusPercent}%
            </span>
            <span
              className={`text-[10px] font-bold uppercase ${
                rec.confidence === "STRONG"
                  ? "text-success"
                  : rec.confidence === "MODERATE"
                    ? "text-warn"
                    : "text-risk"
              }`}
            >
              {rec.confidence}
            </span>
          </>
        ) : (
          <StatusBadge
            status={ensemble.status}
            label={isKo ? statusLabelKo(ensemble.status) : ensemble.status}
          />
        )}
      </div>
      <div className="shrink-0 flex items-center gap-1">
        <Link
          href={`/projects/${ensemble.project_id}/results?ensemble=${ensemble.id}`}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-slate-600 hover:bg-slate-100 hover:text-brand transition-colors"
          title={isKo ? "결과 보기" : "View result"}
        >
          <ExternalLink size={13} />
        </Link>
        {ensemble.status === "completed" && (
          <a
            href={`/api/ensembles/${ensemble.id}/pdf?locale=${locale}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-slate-600 hover:bg-slate-100 hover:text-brand transition-colors"
            title="PDF"
          >
            <Download size={13} />
          </a>
        )}
      </div>
    </div>
  );
}

function SimRowItem({
  sim,
  locale,
  isKo,
}: {
  sim: SimRow;
  locale: string;
  isKo: boolean;
}) {
  const at = sim.completed_at ?? sim.started_at;
  return (
    <div className="px-6 py-3 flex items-center gap-4">
      <span className="shrink-0 inline-block w-20 text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
        {isKo ? "단일" : "Single"}
      </span>
      <div className="text-xs text-slate-500 shrink-0 w-44 tabular-nums">
        {at
          ? new Date(at).toLocaleString(locale, {
              year: "numeric",
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })
          : "—"}
      </div>
      <div className="min-w-0 flex-1 flex items-center gap-3">
        {sim.best_country && sim.status === "completed" ? (
          <>
            <CountryChip code={sim.best_country} size="sm" />
            <span className="text-sm font-medium text-slate-900">
              {getCountryLabel(sim.best_country, locale) || sim.best_country}
            </span>
            {sim.success_score !== null && (
              <span className="text-xs text-slate-500 tabular-nums">
                {sim.success_score}%
              </span>
            )}
            <span className="text-xs text-slate-400">
              {isKo ? `${sim.persona_count}명` : `${sim.persona_count} personas`}
            </span>
          </>
        ) : (
          <StatusBadge
            status={sim.status}
            label={isKo ? statusLabelKo(sim.status) : sim.status}
          />
        )}
      </div>
      <div className="shrink-0 flex items-center gap-1">
        <Link
          href={`/projects/${sim.project_id}/results?sim=${sim.id}`}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-slate-600 hover:bg-slate-100 hover:text-brand transition-colors"
          title={isKo ? "결과 보기" : "View result"}
        >
          <ExternalLink size={13} />
        </Link>
        {sim.status === "completed" && (
          <a
            href={`/api/reports/${sim.id}/pdf?locale=${locale}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-slate-600 hover:bg-slate-100 hover:text-brand transition-colors"
            title="PDF"
          >
            <Download size={13} />
          </a>
        )}
      </div>
    </div>
  );
}

function statusLabelKo(status: string): string {
  switch (status) {
    case "completed":
      return "완료";
    case "running":
      return "진행 중";
    case "failed":
      return "실패";
    case "pending":
      return "대기";
    case "cancelled":
      return "취소";
    default:
      return status;
  }
}

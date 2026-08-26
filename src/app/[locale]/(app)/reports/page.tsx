import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import {
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  Archive,
  FolderOpen,
  Globe2,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { ReportsSearch } from "@/components/reports/ReportsSearch";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SectionTitle } from "@/components/dashboard/SectionTitle";
import { CountryMark } from "@/components/dashboard/CountryMark";
import {
  CATEGORY_META,
  DEFAULT_CATEGORY_META,
} from "@/components/dashboard/RecentProjectsCards";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { getCountryLabel } from "@/lib/countries";

// Per-category accent (gradient icon + left stripe + chip) — hex mirror of
// the tailwind classes in CATEGORY_META so the group card can paint a
// gradient avatar and a colored rail that class utilities can't express.
const CATEGORY_ACCENT: Record<
  string,
  { from: string; to: string; chip: string; chipBg: string }
> = {
  beauty: { from: "#6d28d9", to: "#7c3aed", chip: "#7c3aed", chipBg: "#f2ecfe" },
  fashion: { from: "#d97706", to: "#f59e0b", chip: "#c77c0a", chipBg: "#fdf3e2" },
  food: { from: "#0d9488", to: "#14b8a6", chip: "#0e8a7e", chipBg: "#e3f7f4" },
  health: { from: "#e11d48", to: "#f43f5e", chip: "#d64040", chipBg: "#fdeef1" },
  electronics: { from: "#2563eb", to: "#3b82f6", chip: "#2563eb", chipBg: "#e7effe" },
  home: { from: "#0d9c72", to: "#10b981", chip: "#0d9c72", chipBg: "#e7f7f1" },
  saas: { from: "#4338ca", to: "#4f46e5", chip: "#4f46e5", chipBg: "#ebeafd" },
};
const DEFAULT_ACCENT = { from: "#475569", to: "#64748b", chip: "#64748b", chipBg: "#f1f5f9" };

type EnsembleTier =
  | "hypothesis"
  | "decision"
  | "decision_plus"
  | "deep"
  | "deep_pro";

type ProjectMeta = {
  id: string;
  name: string;
  product_name: string;
  category: string | null;
};

type EnsembleRow = {
  id: string;
  project_id: string;
  status: string;
  tier: EnsembleTier;
  parallel_sims: number;
  per_sim_personas: number;
  created_at: string;
  completed_at: string | null;
  // Only the recommendation summary is pulled from aggregate_result (via a
  // jsonb path select) — the full aggregate is multi-MB per ensemble and the
  // report list never renders anything beyond this. See the query below.
  recommendation: {
    country: string;
    consensusPercent: number;
    confidence: string;
    displayMode?: string;
    secondary?: { country?: string } | null;
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
    decision: { ko: "검증분석", en: "Consensus" },
    decision_plus: { ko: "검증분석 Plus", en: "Consensus Plus" },
    deep: { ko: "심층분석", en: "Triangulated" },
    deep_pro: { ko: "심층분석 Pro", en: "Triangulated Pro" },
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
      // Pull ONLY the recommendation summary out of the aggregate_result
      // jsonb (via a PostgREST json-path select) instead of the whole
      // multi-MB blob. With hundreds of ensembles, selecting the full
      // aggregate_result was transferring/serializing hundreds of MB and
      // made this page take many seconds to load. The list renders nothing
      // beyond `recommendation`, so this is a pure payload reduction.
      .select(
        `id, project_id, status, tier, parallel_sims, per_sim_personas,
         created_at, completed_at,
         recommendation:aggregate_result->recommendation,
         projects:projects(id, name, product_name, category)`,
      )
      .eq("workspace_id", ctx.workspaceId)
      .order("created_at", { ascending: false }),
    supabase
      .from("simulations")
      .select(
        `id, project_id, status, persona_count, started_at, completed_at,
         success_score, best_country, ensemble_id,
         projects:projects(id, name, product_name, category)`,
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
  const totalEnsembles = allBuckets.reduce((sum, b) => sum + b.ensembles.length, 0);

  // Root-scoped translations for category labels — the page `t` is scoped to
  // the "reports" namespace, but category labels live under project.wizard.
  const tRoot = await getTranslations();
  const catLabel = (cat: string | null): string | null => {
    if (!cat) return null;
    const key = `project.wizard.categories.${cat}`;
    // next-intl types reject dynamic keys; the runtime lookup with a
    // raw-string fallback is intentional (same pattern as ProjectsTable).
    return tRoot.has(key as never) ? (tRoot(key as never) as string) : cat;
  };

  // Summary-strip stats, computed from the lightweight recommendation
  // summaries already loaded (no extra query). Only completed ensembles
  // that produced a recommendation are counted.
  const recRows = ensembles.filter(
    (e) => e.status === "completed" && e.recommendation?.country,
  );
  const marketCounts = new Map<string, number>();
  let strongCount = 0;
  for (const e of recRows) {
    const c = e.recommendation!.country;
    marketCounts.set(c, (marketCounts.get(c) ?? 0) + 1);
    if (e.recommendation!.confidence === "STRONG") strongCount += 1;
  }
  let topMarketCode: string | null = null;
  let topMarketCount = 0;
  for (const [code, n] of marketCounts) {
    if (n > topMarketCount) {
      topMarketCount = n;
      topMarketCode = code;
    }
  }
  const recTotal = recRows.length;
  const topMarketShare = recTotal ? Math.round((topMarketCount / recTotal) * 100) : 0;
  const strongShare = recTotal ? Math.round((strongCount / recTotal) * 100) : 0;

  return (
    <>
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          totalEnsembles >= 2 ? (
            <Link href="/analyses/compare" className="btn-ghost text-xs">
              {locale === "ko" ? "분석 비교" : "Compare analyses"}
            </Link>
          ) : null
        }
      />

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <StatTile
          gradient="linear-gradient(140deg,#1e4d8f,#0b2a5b)"
          icon={FolderOpen}
          value={String(totalProjects)}
          label={isKo ? "총 프로젝트" : "Projects"}
        />
        <StatTile
          gradient="linear-gradient(140deg,#0891b2,#06b6d4)"
          icon={FileText}
          value={String(totalAnalyses)}
          label={isKo ? "총 분석 실행" : "Analysis runs"}
        />
        <StatTile
          gradient="linear-gradient(140deg,#6d28d9,#7c3aed)"
          icon={Globe2}
          value={topMarketCode ? getCountryLabel(topMarketCode, locale) || topMarketCode : "—"}
          sub={topMarketCode ? `${topMarketShare}%` : undefined}
          label={isKo ? "최다 추천 시장" : "Top market"}
        />
        <StatTile
          gradient="linear-gradient(140deg,#0d9c72,#10b981)"
          icon={ShieldCheck}
          value={recTotal ? `${strongShare}%` : "—"}
          sub={recTotal ? "STRONG" : undefined}
          label={isKo ? "STRONG 신뢰도 비중" : "STRONG share"}
        />
      </section>

      <ReportsSearch initialQuery={sp.q ?? ""} />

      <SectionTitle
        icon={Archive}
        gradient="linear-gradient(135deg,#0891b2,#06b6d4)"
        title={isKo ? "프로젝트별 분석 기록" : "Analysis history by project"}
        note={
          isKo
            ? `${filtered.length}개 프로젝트 · ${totalAnalyses}건`
            : `${filtered.length} project${filtered.length === 1 ? "" : "s"} · ${totalAnalyses} run${totalAnalyses === 1 ? "" : "s"}`
        }
      />

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
              categoryLabel={catLabel(b.project.category)}
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
  categoryLabel,
}: {
  bucket: ProjectBucket;
  locale: string;
  isKo: boolean;
  categoryLabel: string | null;
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

  const meta = (project.category && CATEGORY_META[project.category]) || DEFAULT_CATEGORY_META;
  const accent = (project.category && CATEGORY_ACCENT[project.category]) || DEFAULT_ACCENT;
  const CatIcon = meta.icon;

  // Outcome preview shown on the collapsed row: the newest completed
  // ensemble that produced a recommendation for this project. Lets the user
  // see the result without expanding.
  const previewRec =
    ensembles.find((e) => e.status === "completed" && e.recommendation?.country)
      ?.recommendation ?? null;

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
    const at = new Date(s.completed_at ?? s.started_at ?? 0);
    items.push({ kind: "sim", row: s, at });
  }
  items.sort((a, b) => b.at.getTime() - a.at.getTime());

  return (
    <details className="card p-0 overflow-hidden group relative">
      <span
        className="absolute left-0 top-0 bottom-0 w-1"
        style={{ background: `linear-gradient(180deg, ${accent.from}, ${accent.to})` }}
        aria-hidden
      />
      <summary className="flex items-center gap-3.5 pl-5 pr-5 py-4 cursor-pointer list-none hover:bg-slate-50 transition-colors">
        <ChevronRight
          size={15}
          className="shrink-0 text-slate-400 transition-transform group-open:rotate-90"
        />
        <span
          className="w-10 h-10 rounded-xl grid place-items-center shrink-0 text-white"
          style={{ background: `linear-gradient(135deg, ${accent.from}, ${accent.to})` }}
        >
          <CatIcon size={19} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="font-bold text-slate-900 text-[13.5px]">{project.name}</span>
            {categoryLabel && (
              <span
                className="badge text-[10px] font-bold"
                style={{ color: accent.chip, background: accent.chipBg }}
              >
                {categoryLabel}
              </span>
            )}
          </div>
          <div className="text-[12px] text-slate-400 truncate mt-0.5">
            {project.product_name}
          </div>
        </div>

        {previewRec && (
          <div className="shrink-0 hidden sm:flex items-center gap-2 mr-1">
            <CountryMark code={previewRec.country} size="sm" />
            {previewRec.displayMode === "top2" && previewRec.secondary?.country ? (
              <>
                <CountryMark code={previewRec.secondary.country} size="sm" />
                <span className="badge text-[10px] font-bold uppercase text-warn bg-warn-soft">
                  {isKo ? "TOP 2" : "TOP 2"}
                </span>
              </>
            ) : (
              <span className={`badge text-[10px] font-bold uppercase ${confBadgeClass(previewRec.confidence)}`}>
                {previewRec.confidence}
              </span>
            )}
          </div>
        )}

        <div className="shrink-0 flex flex-col items-end gap-1">
          <span className="badge bg-brand-50 text-brand tabular-nums">
            {isKo ? `분석 ${totalAnalyses}건` : `${totalAnalyses} run${totalAnalyses === 1 ? "" : "s"}`}
          </span>
          <span className="text-[11px] text-slate-400 tabular-nums hidden sm:inline">{lastLabel}</span>
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
  const rec = ensemble.recommendation;
  const badge = tierLabel(ensemble.tier, isKo);
  const at = ensemble.completed_at ?? ensemble.created_at;
  const tierCls =
    ensemble.tier === "hypothesis"
      ? "text-blue-600 bg-blue-50"
      : ensemble.tier === "deep" || ensemble.tier === "deep_pro"
        ? "text-teal-600 bg-teal-50"
        : "text-violet-600 bg-violet-50";
  return (
    <div className="px-5 py-3 flex items-center gap-4">
      <span className={`badge shrink-0 w-20 justify-center text-[10px] font-bold uppercase tracking-wider ${tierCls}`}>
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
          rec.displayMode === "top2" && rec.secondary?.country ? (
            // Top-2 tie: show both candidates side by side instead of
            // a single chip + STRONG badge that contradicts the tie.
            <>
              <CountryMark code={rec.country} size="sm" />
              <span className="text-xs text-slate-400">·</span>
              <CountryMark code={rec.secondary.country} size="sm" />
              <span className="text-sm font-medium text-slate-900">
                {`${getCountryLabel(rec.country, locale) || rec.country} · ${getCountryLabel(rec.secondary.country, locale) || rec.secondary.country}`}
              </span>
              <span className="badge text-[10px] font-bold uppercase text-warn bg-warn-soft">
                {isKo ? "TOP 2 동등" : "TOP 2 TIE"}
              </span>
            </>
          ) : (
            <>
              <CountryMark code={rec.country} size="sm" />
              <span className="text-sm font-medium text-slate-900">
                {getCountryLabel(rec.country, locale) || rec.country}
              </span>
              <span className="text-xs text-slate-500 tabular-nums">
                {rec.consensusPercent}%
              </span>
              <span
                className={`badge text-[10px] font-bold uppercase ${
                  rec.confidence === "STRONG"
                    ? "text-success bg-success-soft"
                    : rec.confidence === "MODERATE"
                      ? "text-warn bg-warn-soft"
                      : "text-risk bg-risk-soft"
                }`}
              >
                {rec.confidence}
              </span>
            </>
          )
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
          className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md text-xs text-slate-600 hover:bg-accent-50 hover:text-accent-600 transition-colors"
          title={isKo ? "결과 보기" : "View result"}
        >
          <ExternalLink size={13} />
        </Link>
        {ensemble.status === "completed" && (
          <a
            href={`/api/ensembles/${ensemble.id}/pdf?locale=${locale}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md text-xs text-slate-600 hover:bg-accent-50 hover:text-accent-600 transition-colors"
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
    <div className="px-5 py-3 flex items-center gap-4">
      <span className="badge shrink-0 w-20 justify-center text-[10px] font-bold uppercase tracking-wider text-slate-500 bg-slate-100">
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
            <CountryMark code={sim.best_country} size="sm" />
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
          className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md text-xs text-slate-600 hover:bg-accent-50 hover:text-accent-600 transition-colors"
          title={isKo ? "결과 보기" : "View result"}
        >
          <ExternalLink size={13} />
        </Link>
        {sim.status === "completed" && (
          <a
            href={`/api/reports/${sim.id}/pdf?locale=${locale}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md text-xs text-slate-600 hover:bg-accent-50 hover:text-accent-600 transition-colors"
            title="PDF"
          >
            <Download size={13} />
          </a>
        )}
      </div>
    </div>
  );
}

function confBadgeClass(confidence: string): string {
  if (confidence === "STRONG") return "text-success bg-success-soft";
  if (confidence === "MODERATE") return "text-warn bg-warn-soft";
  return "text-risk bg-risk-soft";
}

function StatTile({
  gradient,
  icon: Icon,
  value,
  sub,
  label,
}: {
  gradient: string;
  icon: LucideIcon;
  value: string;
  sub?: string;
  label: string;
}) {
  return (
    <div
      className="rounded-2xl p-4 text-white shadow-card relative overflow-hidden"
      style={{ background: gradient }}
    >
      <span className="inline-flex w-8 h-8 rounded-[9px] bg-white/20 items-center justify-center mb-2.5">
        <Icon size={16} />
      </span>
      <div className="text-[22px] font-extrabold leading-none flex items-baseline gap-1.5 min-w-0">
        <span className="truncate">{value}</span>
        {sub && (
          <span className="text-[13px] font-bold opacity-85 tabular-nums shrink-0">· {sub}</span>
        )}
      </div>
      <div className="text-[11.5px] font-semibold text-white/85 mt-1.5">{label}</div>
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

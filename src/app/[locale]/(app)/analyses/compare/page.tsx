import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { CompareSelector } from "@/components/results/CompareSelector";
import {
  ActionPanel,
  CompareInfo,
  CompareKpi,
  DistributionPanel,
  RiskPanel,
  SectionTitle,
} from "@/components/compare/CompareCards";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { getCountryLabel } from "@/lib/countries";
import type { EnsembleAggregate } from "@/lib/simulation/ensemble";

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
  description: string | null;
  base_price_cents: number | null;
  currency: string | null;
  objective: string | null;
  originating_country: string | null;
  candidate_countries: string[] | null;
};

type EnsembleRow = {
  id: string;
  project_id: string;
  status: string;
  tier: EnsembleTier;
  parallel_sims: number;
  per_sim_personas: number;
  llm_providers: string[] | null;
  aggregate_result: EnsembleAggregate | null;
  created_at: string;
  completed_at: string | null;
  projects: ProjectMeta | null;
};

const TIER_LABELS_KO: Record<EnsembleTier, string> = {
  hypothesis: "초기검증",
  decision: "검증분석",
  decision_plus: "검증분석+",
  deep: "심층분석",
  deep_pro: "심층분석 Pro",
};

const TIER_LABELS_EN: Record<EnsembleTier, string> = {
  hypothesis: "Hypothesis",
  decision: "Decision",
  decision_plus: "Decision+",
  deep: "Deep",
  deep_pro: "Deep Pro",
};

/**
 * Cross-project ensemble comparison. Same comparison primitives as the
 * within-project page, but selectors span the entire workspace and the
 * page leads with an "input differences" diff so the user can see which
 * fixture changes drove which result changes.
 *
 * The within-project page (`/projects/[id]/compare-ensembles`) is the
 * fast path for "did upgrading the tier change anything"; this page is
 * the path for "did changing the price / market list change anything".
 */
export default async function CrossProjectCompare({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const isKo = locale === "ko";
  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) return null;

  const supabase = await createClient();
  const { data: ensRaw } = await supabase
    .from("ensembles")
    .select(
      `id, project_id, status, tier, parallel_sims, per_sim_personas,
       llm_providers, aggregate_result, created_at, completed_at,
       projects:projects(id, name, product_name, category, description,
         base_price_cents, currency, objective, originating_country,
         candidate_countries)`,
    )
    .eq("workspace_id", ctx.workspaceId)
    .eq("status", "completed")
    .order("created_at", { ascending: false });
  const ensembles = (ensRaw ?? []) as unknown as EnsembleRow[];

  if (ensembles.length < 2) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={isKo ? "분석 비교 (프로젝트 간)" : "Compare analyses (cross-project)"}
        />
        <div className="card text-center py-12 text-sm text-slate-500">
          {isKo
            ? "비교 가능한 완료된 앙상블이 워크스페이스 전체에서 2개 이상 필요합니다."
            : "Need at least two completed ensembles across the workspace to compare."}
          <div className="mt-4">
            <Link href="/reports" className="text-brand hover:underline text-sm font-medium">
              ← {isKo ? "리포트로" : "Back to reports"}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Default to two latest, A from any project, B from a DIFFERENT project
  // when possible (this page is for cross-project comparisons after all).
  const aId = sp.a && ensembles.find((e) => e.id === sp.a) ? sp.a : ensembles[0].id;
  const aEnsTmp = ensembles.find((e) => e.id === aId)!;
  const bIdCandidate = sp.b && ensembles.find((e) => e.id === sp.b) ? sp.b : null;
  const defaultB =
    ensembles.find((e) => e.id !== aId && e.project_id !== aEnsTmp.project_id) ??
    ensembles.find((e) => e.id !== aId);
  const bId =
    bIdCandidate && bIdCandidate !== aId ? bIdCandidate : defaultB?.id ?? ensembles[1].id;

  const aEns = ensembles.find((e) => e.id === aId)!;
  const bEns = ensembles.find((e) => e.id === bId)!;

  const inputDiff = computeInputDiff(aEns.projects, bEns.projects, isKo);
  const sameProject = aEns.project_id === bEns.project_id;

  return (
    <div className="space-y-6">
      <PageHeader
        title={isKo ? "분석 비교 (프로젝트 간)" : "Compare analyses (cross-project)"}
        subtitle={
          sameProject
            ? aEns.projects?.name ?? ""
            : isKo
              ? `${aEns.projects?.name ?? "?"} ↔ ${bEns.projects?.name ?? "?"}`
              : `${aEns.projects?.name ?? "?"} ↔ ${bEns.projects?.name ?? "?"}`
        }
        actions={
          <Link href="/reports" className="btn-ghost text-xs">
            <ArrowLeft size={14} />
            {isKo ? "리포트로" : "Back to reports"}
          </Link>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <CompareSelector
          projectId="cross"
          label="A"
          slot="a"
          currentValue={aId}
          oppositeValue={bId}
          options={ensembles.map((e) => ({
            id: e.id,
            label: formatLabel(e, locale, isKo),
            personaCount: e.parallel_sims * e.per_sim_personas,
            modelProvider: e.projects?.product_name ?? null,
          }))}
        />
        <CompareSelector
          projectId="cross"
          label="B"
          slot="b"
          currentValue={bId}
          oppositeValue={aId}
          options={ensembles.map((e) => ({
            id: e.id,
            label: formatLabel(e, locale, isKo),
            personaCount: e.parallel_sims * e.per_sim_personas,
            modelProvider: e.projects?.product_name ?? null,
          }))}
        />
      </div>

      {/* Input diff — the whole point of the cross-project view. */}
      <div className={`card p-5 border-l-4 ${sameProject ? "border-slate-300" : "border-brand"}`}>
        <SectionTitle>{isKo ? "입력 비교" : "Input differences"}</SectionTitle>
        {sameProject ? (
          <p className="mt-3 text-sm text-slate-600">
            {isKo
              ? "두 앙상블이 같은 프로젝트에 속해 있습니다. 입력은 동일합니다 — tier 또는 시점만 다릅니다."
              : "Both ensembles belong to the same project. Inputs are identical — only tier or run time differs."}
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {inputDiff.map((d, i) => (
              <div
                key={i}
                className={`flex items-start gap-3 p-2 rounded ${d.changed ? "bg-warn-soft/40" : ""}`}
              >
                <div className="shrink-0 w-24 text-[11px] font-semibold uppercase tracking-wider text-slate-500 pt-0.5">
                  {d.label}
                </div>
                <div className="grid grid-cols-2 gap-3 flex-1 text-sm">
                  <div className="text-slate-700">{d.a ?? "—"}</div>
                  <div className={`${d.changed ? "text-warn font-medium" : "text-slate-700"}`}>
                    {d.b ?? "—"}
                  </div>
                </div>
                {d.changed && (
                  <span className="shrink-0 text-[10px] font-bold text-warn uppercase">
                    {isKo ? "변경" : "diff"}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recommendation comparison */}
      <div className="card p-5">
        <SectionTitle>{isKo ? "추천 비교" : "Recommendation"}</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
          <CompareInfo
            label={isKo ? "분석 단계" : "Tier"}
            a={isKo ? TIER_LABELS_KO[aEns.tier] : TIER_LABELS_EN[aEns.tier]}
            b={isKo ? TIER_LABELS_KO[bEns.tier] : TIER_LABELS_EN[bEns.tier]}
            tooltip={
              isKo
                ? "분석의 깊이 등급. 시뮬 수와 페르소나 수가 많은 tier일수록 합의도가 강해지지만 시간/비용도 큽니다."
                : "Analysis depth. Higher tiers run more sims for stronger consensus at higher cost/time."
            }
          />
          <CompareInfo
            label={isKo ? "추천 진출국" : "Recommended"}
            a={
              aEns.aggregate_result?.recommendation.country
                ? getCountryLabel(aEns.aggregate_result.recommendation.country, locale) ||
                  aEns.aggregate_result.recommendation.country
                : "—"
            }
            b={
              bEns.aggregate_result?.recommendation.country
                ? getCountryLabel(bEns.aggregate_result.recommendation.country, locale) ||
                  bEns.aggregate_result.recommendation.country
                : "—"
            }
            tooltip={
              isKo
                ? "각 분석에서 가장 많이 1순위로 선택된 진출국. 양쪽이 다르면 입력 또는 환경 변화가 결론에 영향을 준 것."
                : "Most-frequently-picked top market. Diverging values mean inputs or environment shifted the conclusion."
            }
          />
          <CompareKpi
            label={isKo ? "합의도" : "Consensus"}
            a={aEns.aggregate_result?.recommendation.consensusPercent}
            b={bEns.aggregate_result?.recommendation.consensusPercent}
            format={(v) => (v !== undefined ? `${v}%` : "—")}
            higherIsBetter
            tooltip={
              isKo
                ? "전체 시뮬 중 추천 진출국을 1순위로 뽑은 비율. ≥80% STRONG, 50-79% MODERATE, <50% WEAK."
                : "Share of sims that picked the recommended market. ≥80% STRONG, 50-79% MODERATE, <50% WEAK."
            }
          />
          <CompareInfo
            label={isKo ? "신뢰도 등급" : "Confidence"}
            a={aEns.aggregate_result?.recommendation.confidence}
            b={bEns.aggregate_result?.recommendation.confidence}
            tooltip={
              isKo
                ? "합의도를 STRONG/MODERATE/WEAK 라벨로 변환한 값. 의사결정 시 즉시 참고할 시각 신호."
                : "Shorthand label for the consensus tier."
            }
          />
          <CompareKpi
            label={isKo ? "병렬 시뮬" : "Parallel sims"}
            a={aEns.parallel_sims}
            b={bEns.parallel_sims}
            format={(v) => (v !== undefined ? String(v) : "—")}
            higherIsBetter
            tooltip={
              isKo
                ? "동시에 실행한 독립 시뮬 수. 많을수록 합의도와 변동성 측정이 견고합니다."
                : "Independent sims run in parallel. More = more robust signal."
            }
          />
          <CompareKpi
            label={isKo ? "유효 페르소나" : "Effective personas"}
            a={aEns.aggregate_result?.effectivePersonas ?? aEns.parallel_sims * aEns.per_sim_personas}
            b={bEns.aggregate_result?.effectivePersonas ?? bEns.parallel_sims * bEns.per_sim_personas}
            format={(v) => (v !== undefined ? v.toLocaleString() : "—")}
            higherIsBetter
            tooltip={
              isKo
                ? "모든 시뮬에 걸쳐 생성된 총 페르소나 수. 통계적 신뢰도의 직접 지표."
                : "Total personas across every sim. Direct measure of statistical confidence."
            }
          />
        </div>
      </div>

      {/* Pricing + variance */}
      <div className="card p-5">
        <SectionTitle>{isKo ? "결과 신뢰성 / 가격" : "Reliability · pricing"}</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
          <CompareInfo
            label={isKo ? "변동성 등급" : "Variance"}
            a={aEns.aggregate_result?.varianceAssessment.label.toUpperCase()}
            b={bEns.aggregate_result?.varianceAssessment.label.toUpperCase()}
            tooltip={
              isKo
                ? "LOW(낮음)·MODERATE(보통)·HIGH(높음). HIGH면 단일 시뮬은 노이즈에 휩쓸릴 수 있어 앙상블 합의도를 더 신뢰해야 합니다."
                : "LOW · MODERATE · HIGH. HIGH means single sims could be noisy."
            }
          />
          <CompareKpi
            label={isKo ? "최대 점수 변동" : "Max score range"}
            a={aEns.aggregate_result?.varianceAssessment.maxFinalScoreRange}
            b={bEns.aggregate_result?.varianceAssessment.maxFinalScoreRange}
            format={(v) => (v !== undefined ? `${v}pt` : "—")}
            higherIsBetter={false}
            tooltip={
              isKo
                ? "한 국가 점수가 시뮬마다 얼마나 다르게 나왔는지의 최대 차이. 30점 이상이면 단일 시뮬은 신뢰하기 어렵습니다."
                : "Largest spread of a single country's score across sims. >30 means a lone sim is unreliable."
            }
          />
          <CompareInfo
            label={isKo ? "종합 리스크" : "Overall risk"}
            a={aEns.aggregate_result?.narrative?.overallRiskLevel?.toUpperCase()}
            b={bEns.aggregate_result?.narrative?.overallRiskLevel?.toUpperCase()}
            tooltip={
              isKo
                ? "각 시뮬이 매긴 리스크 수준의 다수결. HIGH/MEDIUM이면 진출 전 특별 검토가 필요한 신호."
                : "Mode of per-sim riskLevel. HIGH/MEDIUM signals special review before entry."
            }
          />
          <CompareKpi
            label={isKo ? "권장 가격 ($)" : "Recommended price ($)"}
            a={
              aEns.aggregate_result?.pricing?.recommendedPriceCents !== undefined
                ? aEns.aggregate_result.pricing.recommendedPriceCents / 100
                : undefined
            }
            b={
              bEns.aggregate_result?.pricing?.recommendedPriceCents !== undefined
                ? bEns.aggregate_result.pricing.recommendedPriceCents / 100
                : undefined
            }
            format={(v) => (v !== undefined ? `$${v.toFixed(2)}` : "—")}
            tooltip={
              isKo
                ? "각 시뮬의 권장 가격을 모은 중앙값. 시장 가격 민감도와 마진 균형을 가장 잘 만족시키는 가격."
                : "Median recommended price across sims — balance of sensitivity and margin."
            }
          />
        </div>
      </div>

      {/* Side-by-side distributions */}
      <div className="card p-5">
        <SectionTitle>{isKo ? "1위 국가 분포" : "Best-country distribution"}</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
          <DistributionPanel
            title={`A — ${formatLabel(aEns, locale, isKo)}`}
            distribution={aEns.aggregate_result?.bestCountryDistribution ?? []}
            winner={aEns.aggregate_result?.recommendation.country}
            simCount={aEns.aggregate_result?.simCount ?? 0}
            locale={locale}
          />
          <DistributionPanel
            title={`B — ${formatLabel(bEns, locale, isKo)}`}
            distribution={bEns.aggregate_result?.bestCountryDistribution ?? []}
            winner={bEns.aggregate_result?.recommendation.country}
            simCount={bEns.aggregate_result?.simCount ?? 0}
            locale={locale}
          />
        </div>
      </div>

      {/* Top risks */}
      {(aEns.aggregate_result?.narrative?.mergedRisks?.length ||
        bEns.aggregate_result?.narrative?.mergedRisks?.length) && (
        <div className="card p-5">
          <SectionTitle>{isKo ? "주요 리스크 (Top 5)" : "Top risks"}</SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
            <RiskPanel
              title={`A — ${formatLabel(aEns, locale, isKo)}`}
              risks={aEns.aggregate_result?.narrative?.mergedRisks?.slice(0, 5) ?? []}
              isKo={isKo}
            />
            <RiskPanel
              title={`B — ${formatLabel(bEns, locale, isKo)}`}
              risks={bEns.aggregate_result?.narrative?.mergedRisks?.slice(0, 5) ?? []}
              isKo={isKo}
            />
          </div>
        </div>
      )}

      {/* Top actions */}
      {(aEns.aggregate_result?.narrative?.mergedActions?.length ||
        bEns.aggregate_result?.narrative?.mergedActions?.length) && (
        <div className="card p-5">
          <SectionTitle>{isKo ? "권장 액션 (Top 5)" : "Top actions"}</SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
            <ActionPanel
              title={`A — ${formatLabel(aEns, locale, isKo)}`}
              actions={aEns.aggregate_result?.narrative?.mergedActions?.slice(0, 5) ?? []}
              isKo={isKo}
            />
            <ActionPanel
              title={`B — ${formatLabel(bEns, locale, isKo)}`}
              actions={bEns.aggregate_result?.narrative?.mergedActions?.slice(0, 5) ?? []}
              isKo={isKo}
            />
          </div>
        </div>
      )}
    </div>
  );
}

interface InputDiffRow {
  label: string;
  a: string;
  b: string;
  changed: boolean;
}

function computeInputDiff(
  a: ProjectMeta | null,
  b: ProjectMeta | null,
  isKo: boolean,
): InputDiffRow[] {
  if (!a || !b) return [];
  const fmtPrice = (cents: number | null, currency: string | null) => {
    if (cents == null) return "—";
    return `${(cents / 100).toFixed(2)} ${currency ?? "USD"}`;
  };
  const objectiveLabel = (o: string | null | undefined) => {
    if (!o) return "—";
    if (!isKo) return o;
    const map: Record<string, string> = {
      conversion: "전환",
      awareness: "인지도",
      retention: "유지",
      expansion: "확장",
    };
    return map[o] ?? o;
  };
  const aCountries = (a.candidate_countries ?? []).join(", ");
  const bCountries = (b.candidate_countries ?? []).join(", ");
  return [
    {
      label: isKo ? "프로젝트" : "Project",
      a: a.name,
      b: b.name,
      changed: a.id !== b.id,
    },
    {
      label: isKo ? "제품" : "Product",
      a: a.product_name,
      b: b.product_name,
      changed: a.product_name !== b.product_name,
    },
    {
      label: isKo ? "카테고리" : "Category",
      a: a.category ?? "—",
      b: b.category ?? "—",
      changed: a.category !== b.category,
    },
    {
      label: isKo ? "기본 가격" : "Base price",
      a: fmtPrice(a.base_price_cents, a.currency),
      b: fmtPrice(b.base_price_cents, b.currency),
      changed: a.base_price_cents !== b.base_price_cents || a.currency !== b.currency,
    },
    {
      label: isKo ? "출시 목표" : "Objective",
      a: objectiveLabel(a.objective),
      b: objectiveLabel(b.objective),
      changed: a.objective !== b.objective,
    },
    {
      label: isKo ? "출시국" : "Origin",
      a: a.originating_country ?? "—",
      b: b.originating_country ?? "—",
      changed: a.originating_country !== b.originating_country,
    },
    {
      label: isKo ? "후보 진출국" : "Target markets",
      a: aCountries || "—",
      b: bCountries || "—",
      changed: aCountries !== bCountries,
    },
  ];
}

function formatLabel(e: EnsembleRow, locale: string, isKo: boolean): string {
  const date = new Date(e.completed_at ?? e.created_at).toLocaleString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const tier = isKo ? TIER_LABELS_KO[e.tier] : TIER_LABELS_EN[e.tier];
  const product = e.projects?.product_name ?? "?";
  // Truncate product name so the dropdown stays readable.
  const productShort = product.length > 28 ? `${product.slice(0, 28)}…` : product;
  return `[${tier}] ${productShort} · ${date}`;
}


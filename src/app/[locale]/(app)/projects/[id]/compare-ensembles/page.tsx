import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { ArrowLeft, ArrowRight, Minus } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { CountryChip } from "@/components/ui/CountryChip";
import { CompareSelector } from "@/components/results/CompareSelector";
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

type EnsembleRow = {
  id: string;
  status: string;
  tier: EnsembleTier;
  parallel_sims: number;
  per_sim_personas: number;
  llm_providers: string[] | null;
  aggregate_result: EnsembleAggregate | null;
  created_at: string;
  completed_at: string | null;
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

export default async function CompareEnsemblesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; locale: string }>;
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const { id, locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const isKo = locale === "ko";
  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) return null;

  const supabase = await createClient();
  const { data: project } = await supabase
    .from("projects")
    .select("id, name, product_name, currency")
    .eq("id", id)
    .eq("workspace_id", ctx.workspaceId)
    .single();
  if (!project) notFound();

  // All completed ensembles for this project — drives both A/B dropdowns
  // and the latest-two default when the URL is bare.
  const { data: ensRaw } = await supabase
    .from("ensembles")
    .select(
      `id, status, tier, parallel_sims, per_sim_personas, llm_providers,
       aggregate_result, created_at, completed_at`,
    )
    .eq("project_id", id)
    .eq("status", "completed")
    .order("created_at", { ascending: false });
  const ensembles = (ensRaw ?? []) as unknown as EnsembleRow[];

  if (ensembles.length < 2) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={isKo ? "앙상블 비교" : "Compare ensembles"}
          subtitle={project.name}
        />
        <div className="card text-center py-12 text-sm text-slate-500">
          {isKo
            ? "이 프로젝트에는 비교 가능한 앙상블이 2개 이상 없습니다. 추가 분석을 실행한 뒤 다시 시도하세요."
            : "Need at least two completed ensembles on this project to compare. Run another analysis and come back."}
          <div className="mt-4">
            <Link
              href={`/projects/${id}`}
              className="text-brand hover:underline text-sm font-medium"
            >
              ← {isKo ? "프로젝트로" : "Back to project"}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Resolve A/B from query params, falling back to the two latest ensembles.
  const aId = sp.a && ensembles.find((e) => e.id === sp.a) ? sp.a : ensembles[0].id;
  const bIdCandidate = sp.b && ensembles.find((e) => e.id === sp.b) ? sp.b : null;
  const bId =
    bIdCandidate && bIdCandidate !== aId
      ? bIdCandidate
      : ensembles.find((e) => e.id !== aId)?.id ?? ensembles[1].id;

  const aEns = ensembles.find((e) => e.id === aId)!;
  const bEns = ensembles.find((e) => e.id === bId)!;

  const projectCurrency = project.currency ?? "USD";
  const priceFormatter = new Intl.NumberFormat(
    isKo ? "ko-KR" : "en-US",
    {
      style: "currency",
      currency: projectCurrency,
      currencyDisplay: "symbol",
    },
  );

  // ── compute the comparison context + diagnosis upfront ────────────────
  const ctx_ = analyseComparison(aEns, bEns, isKo);

  return (
    <div className="space-y-6">
      <PageHeader
        title={isKo ? "앙상블 비교" : "Compare ensembles"}
        subtitle={`${project.name} — ${project.product_name}`}
        actions={
          <Link href={`/projects/${id}`} className="btn-ghost text-xs">
            <ArrowLeft size={14} />
            {isKo ? "프로젝트로" : "Back to project"}
          </Link>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <CompareSelector
          projectId={id}
          label="A"
          slot="a"
          currentValue={aId}
          oppositeValue={bId}
          options={ensembles.map((e) => ({
            id: e.id,
            label: formatEnsembleLabel(e, locale, isKo),
            personaCount: e.parallel_sims * e.per_sim_personas,
            modelProvider: (e.llm_providers ?? []).join(", "),
          }))}
        />
        <CompareSelector
          projectId={id}
          label="B"
          slot="b"
          currentValue={bId}
          oppositeValue={aId}
          options={ensembles.map((e) => ({
            id: e.id,
            label: formatEnsembleLabel(e, locale, isKo),
            personaCount: e.parallel_sims * e.per_sim_personas,
            modelProvider: (e.llm_providers ?? []).join(", "),
          }))}
        />
      </div>

      {/* Context + diagnosis — what the user is actually looking at, and
          the one-line conclusion. Sits above the data dump so the page
          opens with an answer, not a table. */}
      <div className={`card p-5 border-l-4 ${ctx_.borderClass}`}>
        <div className="flex items-start gap-3">
          <div className={`text-xs font-bold uppercase tracking-wider ${ctx_.labelClass}`}>
            {ctx_.contextLabel}
          </div>
        </div>
        <div className="mt-3 flex items-baseline gap-3 flex-wrap">
          <TierBadge label={isKo ? TIER_LABELS_KO[aEns.tier] : TIER_LABELS_EN[aEns.tier]} />
          <span className="text-slate-400">→</span>
          <TierBadge label={isKo ? TIER_LABELS_KO[bEns.tier] : TIER_LABELS_EN[bEns.tier]} />
          <span className="text-xs text-slate-400">·</span>
          <span className="text-xs text-slate-500">{ctx_.timeLabel}</span>
        </div>
        <p className="mt-3 text-sm text-slate-700 leading-relaxed">
          {ctx_.headline}
        </p>
      </div>

      {/* Key changes — only the deltas that matter, with severity color */}
      {ctx_.changes.length > 0 && (
        <div className="card p-5">
          <SectionTitle>{isKo ? "주요 변화" : "Key changes"}</SectionTitle>
          <ul className="mt-3 space-y-2.5">
            {ctx_.changes.map((c, i) => (
              <li key={i} className="flex items-start gap-3 text-sm">
                <span
                  className={`shrink-0 mt-0.5 inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold ${c.toneClass}`}
                >
                  {c.icon}
                </span>
                <span className="text-slate-700 leading-relaxed">
                  <span className="font-semibold">{c.title}</span>
                  {c.detail && <span className="text-slate-600"> — {c.detail}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recommendation insight — single-sentence conclusion the user can act on */}
      {ctx_.insight && (
        <div className="card p-5 bg-brand-50/30 border-brand/20">
          <div className="text-xs uppercase tracking-wider text-brand font-semibold mb-2">
            {isKo ? "권장" : "Takeaway"}
          </div>
          <p className="text-sm text-slate-800 leading-relaxed">{ctx_.insight}</p>
        </div>
      )}

      {/* Headline KPIs */}
      <div className="card p-5">
        <SectionTitle>{isKo ? "추천 비교" : "Recommendation"}</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
          <CompareInfo
            label={isKo ? "분석 단계" : "Tier"}
            a={isKo ? TIER_LABELS_KO[aEns.tier] : TIER_LABELS_EN[aEns.tier]}
            b={isKo ? TIER_LABELS_KO[bEns.tier] : TIER_LABELS_EN[bEns.tier]}
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
          />
          <CompareKpi
            label={isKo ? "합의도" : "Consensus"}
            a={aEns.aggregate_result?.recommendation.consensusPercent}
            b={bEns.aggregate_result?.recommendation.consensusPercent}
            format={(v) => (v !== undefined ? `${v}%` : "—")}
            higherIsBetter
          />
          <CompareInfo
            label={isKo ? "신뢰도 등급" : "Confidence"}
            a={aEns.aggregate_result?.recommendation.confidence}
            b={bEns.aggregate_result?.recommendation.confidence}
          />
          <CompareKpi
            label={isKo ? "병렬 시뮬" : "Parallel sims"}
            a={aEns.parallel_sims}
            b={bEns.parallel_sims}
            format={(v) => (v !== undefined ? String(v) : "—")}
            higherIsBetter
          />
          <CompareKpi
            label={isKo ? "유효 페르소나" : "Effective personas"}
            a={aEns.aggregate_result?.effectivePersonas ?? aEns.parallel_sims * aEns.per_sim_personas}
            b={bEns.aggregate_result?.effectivePersonas ?? bEns.parallel_sims * bEns.per_sim_personas}
            format={(v) => (v !== undefined ? v.toLocaleString() : "—")}
            higherIsBetter
          />
        </div>
      </div>

      {/* Variance + risk + pricing snapshot */}
      <div className="card p-5">
        <SectionTitle>{isKo ? "결과 신뢰성 / 리스크 / 가격" : "Reliability · risk · pricing"}</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
          <CompareInfo
            label={isKo ? "변동성 등급" : "Variance"}
            a={aEns.aggregate_result?.varianceAssessment.label.toUpperCase()}
            b={bEns.aggregate_result?.varianceAssessment.label.toUpperCase()}
          />
          <CompareKpi
            label={isKo ? "최대 점수 변동" : "Max score range"}
            a={aEns.aggregate_result?.varianceAssessment.maxFinalScoreRange}
            b={bEns.aggregate_result?.varianceAssessment.maxFinalScoreRange}
            format={(v) => (v !== undefined ? `${v}pt` : "—")}
            higherIsBetter={false}
          />
          <CompareInfo
            label={isKo ? "종합 리스크" : "Overall risk"}
            a={aEns.aggregate_result?.narrative?.overallRiskLevel?.toUpperCase()}
            b={bEns.aggregate_result?.narrative?.overallRiskLevel?.toUpperCase()}
          />
          <CompareKpi
            label={isKo ? "권장 가격" : "Recommended price"}
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
            format={(v) => (v !== undefined ? priceFormatter.format(v) : "—")}
            currency={projectCurrency}
          />
          {aEns.aggregate_result?.personas && bEns.aggregate_result?.personas && (
            <>
              <CompareKpi
                label={isKo ? "평균 구매의향" : "Mean intent"}
                a={aEns.aggregate_result.personas.intentMean}
                b={bEns.aggregate_result.personas.intentMean}
                format={(v) => (v !== undefined ? `${v.toFixed(0)}%` : "—")}
                higherIsBetter
              />
              <CompareKpi
                label={isKo ? "강한 관심 (≥70)" : "High intent (≥70)"}
                a={aEns.aggregate_result.personas.highIntentCount}
                b={bEns.aggregate_result.personas.highIntentCount}
                format={(v) => (v !== undefined ? v.toLocaleString() : "—")}
                higherIsBetter
              />
            </>
          )}
        </div>
      </div>

      {/* Country distribution side by side */}
      <div className="card p-5">
        <SectionTitle>{isKo ? "1위 국가 분포" : "Best-country distribution"}</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
          <DistributionPanel
            title={`A — ${formatEnsembleLabel(aEns, locale, isKo)}`}
            distribution={aEns.aggregate_result?.bestCountryDistribution ?? []}
            winner={aEns.aggregate_result?.recommendation.country}
            simCount={aEns.aggregate_result?.simCount ?? 0}
            locale={locale}
          />
          <DistributionPanel
            title={`B — ${formatEnsembleLabel(bEns, locale, isKo)}`}
            distribution={bEns.aggregate_result?.bestCountryDistribution ?? []}
            winner={bEns.aggregate_result?.recommendation.country}
            simCount={bEns.aggregate_result?.simCount ?? 0}
            locale={locale}
          />
        </div>
      </div>

      {/* Top risks side by side */}
      {(aEns.aggregate_result?.narrative?.mergedRisks?.length ||
        bEns.aggregate_result?.narrative?.mergedRisks?.length) && (
        <div className="card p-5">
          <SectionTitle>{isKo ? "주요 리스크 (Top 5)" : "Top risks"}</SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
            <RiskPanel
              title={`A — ${formatEnsembleLabel(aEns, locale, isKo)}`}
              risks={aEns.aggregate_result?.narrative?.mergedRisks?.slice(0, 5) ?? []}
              isKo={isKo}
            />
            <RiskPanel
              title={`B — ${formatEnsembleLabel(bEns, locale, isKo)}`}
              risks={bEns.aggregate_result?.narrative?.mergedRisks?.slice(0, 5) ?? []}
              isKo={isKo}
            />
          </div>
        </div>
      )}

      {/* Top actions side by side */}
      {(aEns.aggregate_result?.narrative?.mergedActions?.length ||
        bEns.aggregate_result?.narrative?.mergedActions?.length) && (
        <div className="card p-5">
          <SectionTitle>{isKo ? "권장 액션 (Top 5)" : "Top actions"}</SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
            <ActionPanel
              title={`A — ${formatEnsembleLabel(aEns, locale, isKo)}`}
              actions={aEns.aggregate_result?.narrative?.mergedActions?.slice(0, 5) ?? []}
              isKo={isKo}
            />
            <ActionPanel
              title={`B — ${formatEnsembleLabel(bEns, locale, isKo)}`}
              actions={bEns.aggregate_result?.narrative?.mergedActions?.slice(0, 5) ?? []}
              isKo={isKo}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Decide whether the user is comparing two tiers of the same fixture
 * (ROI question), the same tier re-run later (drift question), or
 * "neither — same tier, near-simultaneous" (mostly a sanity check).
 * Returns the label, the diagnosis copy, and the list of changes worth
 * surfacing. Heuristics are deliberately simple and explained so future
 * tweaks don't need to reverse-engineer the thresholds.
 */
function analyseComparison(a: EnsembleRow, b: EnsembleRow, isKo: boolean) {
  const TIER_RANK: Record<EnsembleTier, number> = {
    hypothesis: 1,
    decision: 2,
    decision_plus: 3,
    deep: 4,
    deep_pro: 5,
  };
  const sameTier = a.tier === b.tier;
  const tierDelta = TIER_RANK[b.tier] - TIER_RANK[a.tier];

  const aTime = new Date(a.completed_at ?? a.created_at).getTime();
  const bTime = new Date(b.completed_at ?? b.created_at).getTime();
  const daysApart = Math.abs(bTime - aTime) / (1000 * 60 * 60 * 24);

  let mode: "tier" | "rerun" | "drift" = "rerun";
  if (!sameTier) mode = "tier";
  else if (daysApart >= 1) mode = "drift";

  const contextLabel =
    mode === "tier"
      ? isKo ? "Tier 업그레이드 비교" : "Tier upgrade comparison"
      : mode === "drift"
        ? isKo ? "시간 변화 추적" : "Drift over time"
        : isKo ? "재실행 비교" : "Re-run comparison";
  const labelClass =
    mode === "tier" ? "text-brand" : mode === "drift" ? "text-warn" : "text-slate-500";
  const borderClass =
    mode === "tier" ? "border-brand" : mode === "drift" ? "border-warn" : "border-slate-300";

  // Time-difference label, human-readable.
  const timeLabel = (() => {
    if (daysApart < 1) {
      const hours = Math.round((daysApart * 24) * 10) / 10;
      return isKo ? `${hours}시간 차이` : `${hours}h apart`;
    }
    if (daysApart < 30) {
      const d = Math.round(daysApart);
      return isKo ? `${d}일 차이` : `${d}d apart`;
    }
    const months = Math.round(daysApart / 30);
    return isKo ? `${months}개월 차이` : `${months}mo apart`;
  })();

  // ── compute key changes ──
  type Change = {
    title: string;
    detail?: string;
    icon: string;
    toneClass: string;
  };
  const changes: Change[] = [];
  const aRec = a.aggregate_result?.recommendation;
  const bRec = b.aggregate_result?.recommendation;

  if (aRec && bRec) {
    if (aRec.country !== bRec.country) {
      // Recommendation flip — usually the most actionable signal.
      changes.push({
        title: isKo
          ? `추천 진출국 변경: ${aRec.country} → ${bRec.country}`
          : `Recommendation flipped: ${aRec.country} → ${bRec.country}`,
        detail: isKo
          ? `합의도 ${aRec.consensusPercent}% → ${bRec.consensusPercent}% (${aRec.confidence} → ${bRec.confidence})`
          : `Consensus ${aRec.consensusPercent}% → ${bRec.consensusPercent}% (${aRec.confidence} → ${bRec.confidence})`,
        icon: "↻",
        toneClass: "bg-warn/15 text-warn",
      });
    } else {
      const consensusDelta = bRec.consensusPercent - aRec.consensusPercent;
      if (Math.abs(consensusDelta) >= 5) {
        const better = consensusDelta > 0;
        changes.push({
          title: isKo
            ? `합의도 ${better ? "상승" : "하락"}: ${aRec.consensusPercent}% → ${bRec.consensusPercent}% (${better ? "+" : ""}${consensusDelta}pt)`
            : `Consensus ${better ? "up" : "down"}: ${aRec.consensusPercent}% → ${bRec.consensusPercent}% (${better ? "+" : ""}${consensusDelta}pt)`,
          detail: better
            ? isKo
              ? "동일한 추천이 더 강한 신뢰도로 확인됨."
              : "Same recommendation, now backed more confidently."
            : isKo
              ? "추천은 같지만 합의도가 약해짐 — 추가 분석 권장."
              : "Same pick but consensus weakened — consider another run.",
          icon: better ? "↑" : "↓",
          toneClass: better
            ? "bg-success/15 text-success"
            : "bg-warn/15 text-warn",
        });
      } else {
        changes.push({
          title: isKo
            ? `추천 일관: ${bRec.country} (합의도 ${bRec.consensusPercent}%)`
            : `Stable recommendation: ${bRec.country} (${bRec.consensusPercent}%)`,
          icon: "=",
          toneClass: "bg-slate-200 text-slate-600",
        });
      }
    }
  }

  // Variance label change.
  const aVar = a.aggregate_result?.varianceAssessment.label;
  const bVar = b.aggregate_result?.varianceAssessment.label;
  if (aVar && bVar && aVar !== bVar) {
    const VAR_RANK = { low: 1, moderate: 2, high: 3 };
    const better = VAR_RANK[bVar] < VAR_RANK[aVar];
    changes.push({
      title: isKo
        ? `결과 안정성 ${better ? "향상" : "악화"}: ${aVar.toUpperCase()} → ${bVar.toUpperCase()}`
        : `Stability ${better ? "improved" : "degraded"}: ${aVar.toUpperCase()} → ${bVar.toUpperCase()}`,
      icon: better ? "↑" : "↓",
      toneClass: better
        ? "bg-success/15 text-success"
        : "bg-warn/15 text-warn",
    });
  }

  // Risk diff — risks in B not in A (newly surfaced) and vice versa.
  const aRisks = new Set(
    (a.aggregate_result?.narrative?.mergedRisks ?? []).map((r) => normaliseTitle(r.factor)),
  );
  const bRisks = new Set(
    (b.aggregate_result?.narrative?.mergedRisks ?? []).map((r) => normaliseTitle(r.factor)),
  );
  const newRisks = (b.aggregate_result?.narrative?.mergedRisks ?? []).filter(
    (r) => !aRisks.has(normaliseTitle(r.factor)),
  );
  const droppedRisks = (a.aggregate_result?.narrative?.mergedRisks ?? []).filter(
    (r) => !bRisks.has(normaliseTitle(r.factor)),
  );
  if (newRisks.length > 0) {
    changes.push({
      title: isKo
        ? `새 리스크 ${newRisks.length}건`
        : `${newRisks.length} new risk${newRisks.length === 1 ? "" : "s"}`,
      detail: newRisks
        .slice(0, 3)
        .map((r) => r.factor)
        .join(" · "),
      icon: "+",
      toneClass: "bg-risk/15 text-risk",
    });
  }
  if (droppedRisks.length > 0) {
    changes.push({
      title: isKo
        ? `해소된 리스크 ${droppedRisks.length}건`
        : `${droppedRisks.length} resolved risk${droppedRisks.length === 1 ? "" : "s"}`,
      detail: droppedRisks
        .slice(0, 3)
        .map((r) => r.factor)
        .join(" · "),
      icon: "−",
      toneClass: "bg-success/15 text-success",
    });
  }

  // Pricing delta.
  const aPrice = a.aggregate_result?.pricing?.recommendedPriceCents;
  const bPrice = b.aggregate_result?.pricing?.recommendedPriceCents;
  if (aPrice !== undefined && bPrice !== undefined && aPrice !== bPrice) {
    const dollar = (cents: number) => `$${(cents / 100).toFixed(2)}`;
    const pct = Math.round(((bPrice - aPrice) / aPrice) * 100);
    if (Math.abs(pct) >= 3) {
      changes.push({
        title: isKo
          ? `권장 가격 변경: ${dollar(aPrice)} → ${dollar(bPrice)} (${pct > 0 ? "+" : ""}${pct}%)`
          : `Recommended price: ${dollar(aPrice)} → ${dollar(bPrice)} (${pct > 0 ? "+" : ""}${pct}%)`,
        icon: pct > 0 ? "↑" : "↓",
        toneClass: "bg-slate-200 text-slate-700",
      });
    }
  }

  // ── headline + insight per mode ──
  let headline = "";
  let insight: string | null = null;

  if (mode === "tier") {
    const aLabel = isKo ? TIER_LABELS_KO[a.tier] : TIER_LABELS_EN[a.tier];
    const bLabel = isKo ? TIER_LABELS_KO[b.tier] : TIER_LABELS_EN[b.tier];
    headline = isKo
      ? `같은 입력에 ${aLabel}와 ${bLabel}을(를) 적용해 결과가 어떻게 달라지는지 비교합니다. 합의도가 의미 있게 향상되지 않으면 낮은 tier로 충분합니다.`
      : `Same fixture run at ${aLabel} vs ${bLabel}. If consensus doesn't meaningfully improve, the lower tier is sufficient.`;
    if (aRec && bRec) {
      const consensusDelta = bRec.consensusPercent - aRec.consensusPercent;
      const sameRec = aRec.country === bRec.country;
      if (tierDelta > 0 && sameRec && consensusDelta < 5) {
        insight = isKo
          ? `${aLabel}만으로도 같은 결론과 비슷한 신뢰도를 얻습니다. 향후 분석은 ${aLabel} tier로 충분합니다.`
          : `${aLabel} alone gives the same conclusion at similar confidence. Default to ${aLabel} for future runs.`;
      } else if (tierDelta > 0 && sameRec && consensusDelta >= 5) {
        insight = isKo
          ? `상위 tier에서 합의도가 ${consensusDelta}pt 상승했습니다. 의사결정 임팩트가 큰 분석에는 ${bLabel} 권장.`
          : `Higher tier raised consensus by ${consensusDelta}pt. Use ${bLabel} when the decision is high-stakes.`;
      } else if (tierDelta > 0 && !sameRec) {
        insight = isKo
          ? `상위 tier에서 추천이 바뀌었습니다 (${aRec.country} → ${bRec.country}). 단순 tier로는 결론을 신뢰할 수 없습니다.`
          : `Recommendation flipped at the higher tier (${aRec.country} → ${bRec.country}). Don't trust the lower-tier conclusion.`;
      }
    }
  } else if (mode === "drift") {
    headline = isKo
      ? `같은 fixture를 시간 차이를 두고 두 번 실행했습니다. 추천이나 리스크가 변했다면 시장 환경이나 모델 변경의 영향을 의심하세요.`
      : `Same fixture run twice across a time gap. Any change in recommendation or risk likely reflects market or model drift.`;
    if (aRec && bRec) {
      const sameRec = aRec.country === bRec.country;
      if (sameRec) {
        insight = isKo
          ? `시간 차이에도 결론이 일관적입니다. 시장 환경이 안정적이라는 신호.`
          : `Conclusion stable across the time gap — market signal looks consistent.`;
      } else {
        insight = isKo
          ? `시간 차이로 추천이 바뀌었습니다 (${aRec.country} → ${bRec.country}). 시장 환경 또는 입력 데이터 변경 가능성을 검토하세요.`
          : `Recommendation drifted (${aRec.country} → ${bRec.country}). Investigate market shift or upstream data changes.`;
      }
    }
  } else {
    headline = isKo
      ? `같은 tier로 비슷한 시점에 두 번 실행한 결과입니다. 결과 일관성을 점검하는 sanity check.`
      : `Same tier, similar timestamp — sanity check on result consistency.`;
    if (aRec && bRec && aRec.country === bRec.country) {
      insight = isKo
        ? `재현성 OK — 두 번의 실행이 동일한 결론을 내렸습니다.`
        : `Reproducibility OK — both runs converged on the same conclusion.`;
    } else if (aRec && bRec) {
      insight = isKo
        ? `같은 조건에서 결과가 갈렸습니다. 시뮬 변동성이 크다는 신호 — 더 많은 시뮬이 필요할 수 있습니다.`
        : `Two same-condition runs disagreed. High variance — consider a larger sim count.`;
    }
  }

  return {
    mode,
    contextLabel,
    labelClass,
    borderClass,
    timeLabel,
    headline,
    insight,
    changes,
  };
}

function normaliseTitle(s: string): string {
  // Cheap dedup key — collapse whitespace + lowercase. Risks worded
  // slightly differently across runs still match if the core phrase is
  // similar; not bulletproof but better than exact-string match.
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function TierBadge({ label }: { label: string }) {
  return (
    <span className="inline-block text-xs font-bold uppercase tracking-wider bg-brand/10 text-brand px-2 py-1 rounded">
      {label}
    </span>
  );
}

function formatEnsembleLabel(e: EnsembleRow, locale: string, isKo: boolean): string {
  const date = new Date(e.completed_at ?? e.created_at).toLocaleString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const tier = isKo ? TIER_LABELS_KO[e.tier] : TIER_LABELS_EN[e.tier];
  return `${tier} · ${date}`;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
      {children}
    </h2>
  );
}

function CompareKpi({
  label,
  a,
  b,
  format,
  higherIsBetter,
  currency,
}: {
  label: string;
  a: number | undefined;
  b: number | undefined;
  format: (v: number | undefined) => string;
  higherIsBetter?: boolean;
  currency?: string;
}) {
  const delta = a !== undefined && b !== undefined && a !== b ? b - a : undefined;
  const deltaSign =
    delta === undefined ? "flat" : delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  const tone =
    delta === undefined || higherIsBetter === undefined
      ? "neutral"
      : (higherIsBetter && deltaSign === "up") ||
          (!higherIsBetter && deltaSign === "down")
        ? "good"
        : deltaSign === "flat"
          ? "neutral"
          : "bad";
  return (
    <div className="rounded-lg border border-slate-200 p-4 bg-slate-50/40">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-sm tabular-nums">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-400">A</div>
          <div className="font-mono text-slate-900">{format(a)}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-400">B</div>
          <div className="font-mono text-slate-900">{format(b)}</div>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-xs">
        <DeltaBadge sign={deltaSign} tone={tone} />
        {delta !== undefined && (
          <span className="text-slate-500 tabular-nums">
            Δ {delta > 0 ? "+" : ""}
            {currency ? delta.toFixed(2) : Math.round(delta)}
          </span>
        )}
      </div>
    </div>
  );
}

function CompareInfo({
  label,
  a,
  b,
}: {
  label: string;
  a: string | undefined;
  b: string | undefined;
}) {
  const same = a === b;
  return (
    <div className="rounded-lg border border-slate-200 p-4 bg-slate-50/40">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-400">A</div>
          <div className="text-slate-900 font-medium">{a ?? "—"}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-slate-400">B</div>
          <div className="text-slate-900 font-medium">{b ?? "—"}</div>
        </div>
      </div>
      <div className="mt-2 text-xs text-slate-500">{same ? "—" : "≠"}</div>
    </div>
  );
}

function DeltaBadge({
  sign,
  tone,
}: {
  sign: "up" | "down" | "flat";
  tone: "good" | "bad" | "neutral";
}) {
  const Icon = sign === "up" ? ArrowRight : sign === "down" ? ArrowLeft : Minus;
  const cls =
    tone === "good"
      ? "bg-success-soft text-success"
      : tone === "bad"
        ? "bg-risk-soft text-risk"
        : "bg-slate-100 text-slate-500";
  return (
    <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full ${cls}`}>
      <Icon
        size={11}
        className={
          sign === "up" ? "rotate-[-45deg]" : sign === "down" ? "rotate-[-135deg]" : ""
        }
      />
    </span>
  );
}

function DistributionPanel({
  title,
  distribution,
  winner,
  simCount,
  locale,
}: {
  title: string;
  distribution: EnsembleAggregate["bestCountryDistribution"];
  winner?: string;
  simCount: number;
  locale: string;
}) {
  void locale;
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-3">
        {title}
      </div>
      {distribution.length === 0 ? (
        <p className="text-xs text-slate-500">—</p>
      ) : (
        <div className="space-y-2">
          {distribution.map((b) => {
            const isWinner = b.country === winner;
            return (
              <div key={b.country} className="flex items-center gap-3 text-sm">
                <CountryChip code={b.country} size="sm" />
                <div className="w-10 font-medium text-slate-700">{b.country}</div>
                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${isWinner ? "bg-success" : "bg-slate-300"}`}
                    style={{ width: `${b.percent}%` }}
                  />
                </div>
                <div className="w-20 text-right text-xs text-slate-500 tabular-nums">
                  {b.count}/{simCount} ({b.percent}%)
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RiskPanel({
  title,
  risks,
  isKo,
}: {
  title: string;
  risks: NonNullable<EnsembleAggregate["narrative"]>["mergedRisks"];
  isKo: boolean;
}) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-3">
        {title}
      </div>
      {risks.length === 0 ? (
        <p className="text-xs text-slate-500">—</p>
      ) : (
        <ul className="space-y-3">
          {risks.map((r, i) => {
            const sevClass =
              r.severity === "high"
                ? "text-risk"
                : r.severity === "medium"
                  ? "text-warn"
                  : "text-slate-500";
            return (
              <li key={i} className="text-sm">
                <div className="flex items-baseline gap-2">
                  <span className={`text-[10px] font-bold uppercase ${sevClass}`}>
                    {r.severity}
                  </span>
                  <span className="font-semibold text-slate-900">{r.factor}</span>
                </div>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  {r.description}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {isKo
                    ? `${r.surfacedInSims}개 시뮬에서 언급`
                    : `Surfaced in ${r.surfacedInSims} sim${r.surfacedInSims === 1 ? "" : "s"}`}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ActionPanel({
  title,
  actions,
  isKo,
}: {
  title: string;
  actions: NonNullable<EnsembleAggregate["narrative"]>["mergedActions"];
  isKo: boolean;
}) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-3">
        {title}
      </div>
      {actions.length === 0 ? (
        <p className="text-xs text-slate-500">—</p>
      ) : (
        <ol className="space-y-3">
          {actions.map((a, i) => (
            <li key={i} className="text-sm flex gap-2">
              <span className="text-brand font-bold shrink-0">{i + 1}.</span>
              <div className="min-w-0">
                <p className="text-slate-700 leading-relaxed">{a.action}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {isKo
                    ? `${a.surfacedInSims}개 시뮬에서 권장`
                    : `Recommended by ${a.surfacedInSims} sim${a.surfacedInSims === 1 ? "" : "s"}`}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

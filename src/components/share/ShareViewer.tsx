"use client";

import { CheckCircle2, TrendingUp } from "lucide-react";
import { clsx } from "clsx";
import type { EnsembleAggregate } from "@/lib/simulation/ensemble";
import { formatDate } from "@/lib/format/date";

type EnsembleTier =
  | "hypothesis"
  | "decision"
  | "decision_plus"
  | "deep"
  | "deep_pro";

interface ProjectInfo {
  name: string;
  product_name: string;
  category: string | null;
  description: string | null;
  base_price_cents: number | null;
  currency: string | null;
  objective: string | null;
  originating_country: string | null;
  candidate_countries: string[] | null;
}

const TIER_LABELS_KO: Record<EnsembleTier, string> = {
  hypothesis: "초기검증",
  decision: "검증분석",
  decision_plus: "검증분석+",
  deep: "심층분석",
  deep_pro: "심층분석 Pro",
};

const TIER_LABELS_EN: Record<EnsembleTier, string> = {
  hypothesis: "Hypothesis",
  decision: "Consensus",
  decision_plus: "Consensus+",
  deep: "Triangulated",
  deep_pro: "Triangulated Pro",
};

/**
 * Read-only public viewer for a shared ensemble. Same content the owner
 * sees on the dashboard, minus interactive surfaces that require auth
 * (PDF download, all-personas modal, cancel button, re-run button) or
 * that don't make sense to surface to an external stakeholder
 * (provider failure annotations, raw metadata, sim IDs).
 *
 * Single scrollable page rather than 8 tabs — readers landing here
 * from a chat link want the headline, not navigation. Sections are
 * ordered: project context → recommendation → consensus narrative →
 * countries → risks → actions → variance.
 */
export function ShareViewer({
  locale,
  ensemble,
  shareExpiresAt,
}: {
  locale: string;
  ensemble: {
    id: string;
    tier: EnsembleTier;
    parallel_sims: number;
    per_sim_personas: number;
    llm_providers: string[];
    aggregate: EnsembleAggregate;
    completed_at: string | null;
    project: ProjectInfo | null;
  };
  shareExpiresAt: string;
}) {
  const isKo = locale === "ko";
  const { aggregate, project, tier } = ensemble;
  const { recommendation, varianceAssessment, narrative, countryStats, segments, simCount, effectivePersonas } =
    aggregate;
  const tierLabel = isKo ? TIER_LABELS_KO[tier] : TIER_LABELS_EN[tier];
  const confidenceColor =
    recommendation.confidence === "STRONG"
      ? "text-success"
      : recommendation.confidence === "MODERATE"
        ? "text-warn"
        : "text-risk";
  const expiresLabel = formatDate(shareExpiresAt, isKo) ?? "";

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Brand accent rule + public share banner */}
      <div className="h-1 bg-brand" />
      <div className="bg-brand text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-2 text-sm">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-bold tracking-wider">MARKET TWIN</span>
            <span className="text-white/40">·</span>
            <span className="text-white/70 text-xs truncate">
              {isKo ? "공유 보기" : "Shared report"}
            </span>
          </div>
          <div className="text-white/60 text-xs whitespace-nowrap">
            {isKo ? `만료 ${expiresLabel}` : `Expires ${expiresLabel}`}
          </div>
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-5">
        {/* Project info */}
        {project && (
          <div className="card p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
              <h1 className="text-xl sm:text-2xl font-semibold text-slate-900 break-keep">
                {project.product_name}
              </h1>
              <span className="text-xs uppercase tracking-wide text-slate-500">
                {project.name}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <Field label={isKo ? "분석 단계" : "Tier"} value={tierLabel} />
              <Field
                label={isKo ? "유효 페르소나" : "Effective personas"}
                value={effectivePersonas.toLocaleString()}
              />
              <Field
                label={isKo ? "후보 진출국" : "Markets analysed"}
                value={(project.candidate_countries ?? []).join(", ") || "—"}
              />
              <Field
                label={isKo ? "기본 가격" : "Base price"}
                value={
                  project.base_price_cents != null
                    ? `${(project.base_price_cents / 100).toFixed(2)} ${project.currency ?? "USD"}`
                    : "—"
                }
              />
            </div>
          </div>
        )}

        {/* Top recommendation — hero card with brand-color left rule */}
        <div className="card p-5 sm:p-6 bg-gradient-to-br from-brand-50/40 to-white border-brand/20 border-l-4 border-l-brand">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wider text-brand font-semibold mb-2">
                {isKo ? "추천 진출국" : "Recommended market"}
              </div>
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <div className="text-4xl sm:text-5xl font-bold text-slate-900 tracking-tight">
                  {recommendation.country}
                </div>
                <div className="text-sm">
                  <span className={clsx("font-semibold", confidenceColor)}>
                    {recommendation.consensusPercent}% {isKo ? "합의" : "consensus"}
                  </span>
                  <span className="text-slate-500 ml-2">({recommendation.confidence})</span>
                </div>
              </div>
            </div>
            <CheckCircle2 className={clsx(confidenceColor, "shrink-0")} size={32} />
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-500">
            {isKo
              ? `${simCount}개 독립 시뮬레이션의 합의 결과 · ${effectivePersonas.toLocaleString()}명 페르소나 평균`
              : `Consensus across ${simCount} independent sims · ${effectivePersonas.toLocaleString()} aggregated personas`}
          </div>
        </div>

        {/* Executive summary */}
        {narrative?.executiveSummary && (
          <div>
            <h2 className="text-base font-semibold text-slate-900 mb-2">
              {isKo ? "종합 의견" : "Executive summary"}
            </h2>
            <div className="card p-5">
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                {narrative.executiveSummary}
              </p>
            </div>
          </div>
        )}

        {/* Strategy picks */}
        {segments.length > 0 && (
          <div>
            <h2 className="text-base font-semibold text-slate-900 mb-3">
              {isKo ? "전략별 추천" : "Strategy picks"}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {segments.map((seg) => (
                <div key={seg.id} className="card p-4">
                  <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">
                    {(() => {
                      // Same locale fallback as EnsembleView.segmentLabel —
                      // older aggregates persist seg.labelKo in Korean only.
                      if (isKo) return seg.labelKo;
                      switch (seg.id) {
                        case "volume": return "Speed first (HIGHEST DEMAND)";
                        case "cac": return "Cost efficient (LOWEST CAC)";
                        case "competition": return "Avoid competition (LOWEST COMPETITION)";
                        case "overall": return "Balanced (HIGHEST FINALSCORE)";
                        default: return seg.labelKo;
                      }
                    })()}
                  </div>
                  <div className="flex items-baseline gap-2">
                    <div className="text-xl font-semibold text-slate-900">{seg.bestCountry}</div>
                    <div className="text-xs text-slate-500">
                      {seg.id === "cac" ? `$${seg.bestValue.toFixed(2)}` : seg.bestValue.toFixed(1)}
                    </div>
                  </div>
                  {seg.alternative && (
                    <div className="mt-1 text-xs text-slate-500">
                      {isKo ? "대안" : "Alt"}: {seg.alternative.country} (
                      {seg.id === "cac"
                        ? `$${seg.alternative.value.toFixed(2)}`
                        : seg.alternative.value.toFixed(1)}
                      )
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Country stats */}
        {countryStats.length > 0 && (
          <div>
            <h2 className="text-base font-semibold text-slate-900 mb-3">
              {isKo ? "국가별 점수 분포" : "Per-country score distribution"}
            </h2>
            <div className="card overflow-x-auto">
              <table className="w-full text-sm min-w-[480px]">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2 text-left">{isKo ? "국가" : "Country"}</th>
                    <th className="px-4 py-2 text-right">{isKo ? "평균" : "Mean"}</th>
                    <th className="px-4 py-2 text-right">{isKo ? "중앙값" : "Median"}</th>
                    <th className="px-4 py-2 text-right">{isKo ? "범위" : "Range"}</th>
                    <th className="px-4 py-2 text-right">CAC</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {countryStats.map((c) => {
                    const isWinner =
                      c.country.toUpperCase() === recommendation.country.toUpperCase();
                    return (
                      <tr
                        key={c.country}
                        className={clsx(isWinner && "bg-brand-50/30")}
                      >
                        <td className="px-4 py-2 font-medium text-slate-900">
                          <span className="inline-flex items-center gap-1.5">
                            {isWinner && (
                              <span
                                aria-hidden
                                className="inline-block w-1.5 h-1.5 rounded-full bg-brand"
                              />
                            )}
                            {c.country}
                          </span>
                        </td>
                        <td
                          className={clsx(
                            "px-4 py-2 text-right tabular-nums",
                            isWinner && "font-semibold text-brand",
                          )}
                        >
                          {c.finalScore.mean.toFixed(1)}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums">
                          {c.finalScore.median.toFixed(1)}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-slate-500">
                          {c.finalScore.min.toFixed(0)}–{c.finalScore.max.toFixed(0)}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-slate-500">
                          {/* Match the main dashboard: prefer the server-computed
                              cacRange (persona-derived, channel-cost-grounded)
                              over the LLM median when available. */}
                          ${(c.cacRange?.medianUsd ?? c.cacEstimateUsd.median).toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Risks */}
        {narrative?.mergedRisks?.length ? (
          <div>
            <h2 className="text-base font-semibold text-slate-900 mb-3">
              {isKo ? "주요 리스크" : "Key risks"}
            </h2>
            <div className="card divide-y divide-slate-100">
              {narrative.mergedRisks.slice(0, 8).map((r, i) => {
                const sevClass =
                  r.severity === "high"
                    ? "text-risk"
                    : r.severity === "medium"
                      ? "text-warn"
                      : "text-slate-500";
                return (
                  <div key={i} className="p-4 flex gap-3 items-start">
                    <div
                      className={clsx(
                        "shrink-0 w-16 text-[10px] font-bold uppercase tracking-wider pt-0.5",
                        sevClass,
                      )}
                    >
                      {r.severity}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-slate-900 mb-0.5">{r.factor}</div>
                      <p className="text-sm text-slate-600 leading-relaxed">{r.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* Actions */}
        {narrative?.mergedActions?.length ? (
          <div>
            <h2 className="text-base font-semibold text-slate-900 mb-3">
              {isKo ? "권장 액션" : "Recommended actions"}
            </h2>
            <ol className="card divide-y divide-slate-100">
              {narrative.mergedActions.slice(0, 8).map((a, i) => (
                <li key={i} className="p-4 flex gap-3 items-start">
                  <div className="shrink-0 w-6 text-sm font-bold text-brand">{i + 1}.</div>
                  <p className="min-w-0 flex-1 text-sm text-slate-700 leading-relaxed">{a.action}</p>
                </li>
              ))}
            </ol>
          </div>
        ) : null}

        {/* Variance assessment */}
        <div
          className={clsx(
            "card p-4 flex gap-3 items-start",
            varianceAssessment.label === "high" && "bg-warn-soft/40 border-warn-soft",
            varianceAssessment.label === "moderate" && "bg-slate-50",
          )}
        >
          <TrendingUp
            className={clsx(
              "shrink-0 mt-0.5",
              varianceAssessment.label === "high"
                ? "text-warn"
                : varianceAssessment.label === "moderate"
                  ? "text-slate-500"
                  : "text-success",
            )}
            size={18}
          />
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">
              {isKo ? "변동성 평가" : "Variance assessment"}
            </div>
            <p className="text-sm text-slate-700 leading-relaxed">{varianceCopy(varianceAssessment.label, isKo)}</p>
            <p className="text-xs text-slate-500 mt-1">
              {isKo
                ? `최대 점수 변동: ${varianceAssessment.maxFinalScoreRange}점 · 평균 변동: ${varianceAssessment.meanFinalScoreRange}점`
                : `Max range: ${varianceAssessment.maxFinalScoreRange}pt · Mean range: ${varianceAssessment.meanFinalScoreRange}pt`}
            </p>
          </div>
        </div>

        <p className="text-xs text-slate-400 text-center pt-4">
          {isKo
            ? "이 보고서는 Market Twin 앙상블 분석 결과입니다 — 공유된 읽기 전용 보기."
            : "Market Twin ensemble analysis — public read-only view."}
        </p>
      </main>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">{label}</div>
      <div className="text-sm font-medium text-slate-900">{value}</div>
    </div>
  );
}

function varianceCopy(label: "low" | "moderate" | "high", isKo: boolean): string {
  if (label === "high") {
    return isKo
      ? "동일 조건에서도 시뮬마다 점수 편차가 큽니다. 단일 시뮬은 불안정하니 앙상블 결과를 신뢰하세요."
      : "Same fixture produces very different country scores per run. Trust the ensemble; single sim alone would be unreliable.";
  }
  if (label === "moderate") {
    return isKo
      ? "시뮬 간 변동이 중간 수준입니다. 앙상블 결과가 의미 있는 신뢰도를 더해줍니다."
      : "Moderate run-to-run variance. Ensemble adds meaningful confidence.";
  }
  return isKo
    ? "단일 시뮬 결과만으로도 신뢰할 수 있는 수준입니다."
    : "Single-sim answer would have been reliable.";
}

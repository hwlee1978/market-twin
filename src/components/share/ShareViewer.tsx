"use client";

import { CheckCircle2, TrendingUp } from "lucide-react";
import { clsx } from "clsx";
import type { EnsembleAggregate } from "@/lib/simulation/ensemble";

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
  decision: "Decision",
  decision_plus: "Decision+",
  deep: "Deep",
  deep_pro: "Deep Pro",
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
  const expiresLabel = new Date(shareExpiresAt).toLocaleDateString(
    isKo ? "ko-KR" : "en-US",
    { year: "numeric", month: "long", day: "numeric" },
  );

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Public share banner */}
      <div className="bg-brand text-white">
        <div className="max-w-4xl mx-auto px-6 py-3 flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <span className="font-bold">MARKET TWIN</span>
            <span className="text-white/60">·</span>
            <span className="text-white/80">
              {isKo ? "공유 링크로 보고 있습니다" : "Viewing via shared link"}
            </span>
          </div>
          <div className="text-white/60 text-xs">
            {isKo ? `만료: ${expiresLabel}` : `Expires: ${expiresLabel}`}
          </div>
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {/* Project info */}
        {project && (
          <div className="card p-5">
            <div className="flex items-baseline justify-between mb-3">
              <h1 className="text-2xl font-semibold text-slate-900">{project.product_name}</h1>
              <span className="text-xs uppercase tracking-wide text-slate-500">{project.name}</span>
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

        {/* Top recommendation */}
        <div className="card p-6 bg-gradient-to-br from-brand-50/40 to-white border-brand/20">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">
                {isKo ? "추천 진출국" : "Recommended market"}
              </div>
              <div className="flex items-baseline gap-3">
                <div className="text-4xl font-bold text-slate-900">{recommendation.country}</div>
                <div className="text-sm">
                  <span className={clsx("font-semibold", confidenceColor)}>
                    {recommendation.consensusPercent}% {isKo ? "합의" : "consensus"}
                  </span>
                  <span className="text-slate-500 ml-2">({recommendation.confidence})</span>
                </div>
              </div>
            </div>
            <CheckCircle2 className={confidenceColor} size={32} />
          </div>
          <div className="mt-4 text-xs text-slate-500">
            {isKo
              ? `${simCount}개 시뮬에서 가장 자주 1순위로 선택된 시장입니다.`
              : `Top-pick across ${simCount} sims.`}
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
                    {seg.labelKo}
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
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
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
                  {countryStats.map((c) => (
                    <tr key={c.country}>
                      <td className="px-4 py-2 font-medium text-slate-900">{c.country}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{c.finalScore.mean.toFixed(1)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {c.finalScore.median.toFixed(1)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-500">
                        {c.finalScore.min.toFixed(0)}–{c.finalScore.max.toFixed(0)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-500">
                        ${c.cacEstimateUsd.median.toFixed(2)}
                      </td>
                    </tr>
                  ))}
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

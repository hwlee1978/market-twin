"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, CheckCircle2, AlertCircle, TrendingUp, Download } from "lucide-react";
import { clsx } from "clsx";
import type { EnsembleAggregate } from "@/lib/simulation/ensemble";

interface EnsembleStatus {
  id: string;
  status: "pending" | "running" | "completed" | "failed";
  tier: "hypothesis" | "decision" | "deep";
  parallel_sims: number;
  per_sim_personas: number;
  counts: {
    total: number;
    completed: number;
    running: number;
    pending: number;
    failed: number;
  };
  sims: Array<{
    id: string;
    status: string;
    current_stage: string | null;
    ensemble_index: number | null;
  }>;
  error_message?: string | null;
}

interface EnsembleResult {
  id: string;
  tier: string;
  parallel_sims: number;
  per_sim_personas: number;
  llm_providers: string[];
  aggregate: EnsembleAggregate;
}

export function EnsembleView({
  projectId,
  ensembleId,
  locale,
}: {
  projectId: string;
  ensembleId: string;
  locale: string;
}) {
  const t = useTranslations();
  const [status, setStatus] = useState<EnsembleStatus | null>(null);
  const [result, setResult] = useState<EnsembleResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Status polling. Once status flips to completed/failed, fetch the
  // aggregate result once and stop polling.
  useEffect(() => {
    let active = true;
    const tick = async () => {
      try {
        const res = await fetch(`/api/ensembles/${ensembleId}/status`);
        if (!res.ok) throw new Error(await res.text());
        const data = (await res.json()) as EnsembleStatus;
        if (!active) return;
        setStatus(data);
        if (data.status === "completed" || data.status === "failed") {
          const rRes = await fetch(`/api/ensembles/${ensembleId}/result`);
          if (rRes.ok) {
            const rData = (await rRes.json()) as EnsembleResult;
            if (active) setResult(rData);
          }
          return; // stop polling
        }
        if (active) setTimeout(tick, 5000);
      } catch (err) {
        if (!active) return;
        console.error("[ensemble status]", err);
        setError(err instanceof Error ? err.message : String(err));
        setTimeout(tick, 8000);
      }
    };
    tick();
    return () => {
      active = false;
    };
  }, [ensembleId]);

  if (!status) {
    return (
      <div className="max-w-3xl mx-auto py-12 text-center">
        <Loader2 className="animate-spin mx-auto" size={32} />
        <p className="mt-4 text-sm text-slate-500">앙상블 상태 로딩 중...</p>
      </div>
    );
  }

  if (status.status === "failed") {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <div className="card text-center p-12">
          <AlertCircle className="mx-auto text-risk" size={32} />
          <h2 className="text-xl font-semibold mt-4 mb-2">앙상블 분석 실패</h2>
          <p className="text-sm text-slate-500">
            {status.error_message ?? "일부 시뮬레이션 또는 집계 단계에서 오류가 발생했습니다."}
          </p>
        </div>
      </div>
    );
  }

  if (status.status !== "completed" || !result) {
    return <EnsembleProgress status={status} pollError={error} />;
  }

  return <EnsembleDashboard projectId={projectId} result={result} locale={locale} />;
}

/* ────────────────────────────────── progress ─── */
function EnsembleProgress({
  status,
  pollError,
}: {
  status: EnsembleStatus;
  pollError: string | null;
}) {
  const { counts } = status;
  const pct = counts.total > 0 ? Math.round((counts.completed / counts.total) * 100) : 0;
  return (
    <div className="max-w-2xl mx-auto py-12">
      <div className="card p-10">
        <div className="text-xs uppercase tracking-wide text-accent-600 mb-2 text-center">
          정밀 검증 진행 중
        </div>
        <h2 className="text-2xl font-semibold text-center mb-1">
          {counts.completed}/{counts.total} 시뮬레이션 완료
        </h2>
        <p className="text-sm text-slate-500 text-center mb-6">
          {status.parallel_sims}개 독립 시뮬레이션을 병렬 실행하여 신뢰도 있는 결과를 도출합니다.
        </p>

        {/* Per-sim status grid — N small bars showing individual progress. */}
        <div className="grid grid-cols-5 sm:grid-cols-10 gap-2 mb-6">
          {status.sims.map((sim) => (
            <div
              key={sim.id}
              className={clsx(
                "h-2 rounded-full transition-colors",
                sim.status === "completed"
                  ? "bg-success"
                  : sim.status === "running"
                    ? "bg-brand"
                    : sim.status === "failed"
                      ? "bg-risk"
                      : "bg-slate-200",
              )}
              title={`Sim ${(sim.ensemble_index ?? 0) + 1}: ${sim.status}`}
            />
          ))}
        </div>

        {/* Aggregate progress bar */}
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-brand transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-2 text-xs text-slate-500 text-center">{pct}%</div>

        {pollError && (
          <p className="mt-4 text-xs text-warn text-center">{pollError}</p>
        )}
      </div>
    </div>
  );
}

/* ────────────────────────────────── dashboard ─── */
function EnsembleDashboard({
  projectId,
  result,
  locale,
}: {
  projectId: string;
  result: EnsembleResult;
  locale: string;
}) {
  void projectId;
  const { aggregate, llm_providers, tier, parallel_sims } = result;
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  // Same blob-fetch pattern as ResultsDashboard.exportPdf — lets us show
  // an inline error if generation fails instead of opening a tab to a
  // raw JSON 4xx page.
  const exportPdf = async () => {
    if (pdfBusy) return;
    setPdfBusy(true);
    setPdfError(null);
    try {
      const res = await fetch(`/api/ensembles/${result.id}/pdf?locale=${locale}`);
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const filename =
        res.headers
          .get("content-disposition")
          ?.match(/filename="?([^"]+)"?/)?.[1] ?? `market-twin-ensemble-${result.id.slice(0, 8)}.pdf`;
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[ensemble pdf]", err);
      setPdfError(locale === "ko" ? "PDF 생성에 실패했습니다." : "Couldn't generate PDF.");
    } finally {
      setPdfBusy(false);
    }
  };
  const {
    bestCountryDistribution,
    recommendation,
    countryStats,
    segments,
    varianceAssessment,
    providerBreakdown,
    effectivePersonas,
    simCount,
  } = aggregate;

  const confidenceColor =
    recommendation.confidence === "STRONG"
      ? "text-success"
      : recommendation.confidence === "MODERATE"
        ? "text-warn"
        : "text-risk";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-500 mb-1 flex-wrap">
            <span className="px-2 py-0.5 rounded-full bg-brand/10 text-brand font-semibold">
              {tier.toUpperCase()}
            </span>
            <span>·</span>
            <span>
              {simCount}{locale === "ko" ? "개 시뮬" : " sims"} · {effectivePersonas.toLocaleString()}
              {locale === "ko" ? " 페르소나" : " personas"}
            </span>
            <span>·</span>
            <ProviderLineup
              providers={llm_providers}
              parallelSims={parallel_sims}
              breakdown={providerBreakdown}
              locale={locale}
            />
          </div>
          <h1 className="text-2xl font-semibold">앙상블 분석 결과</h1>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <button
            onClick={exportPdf}
            disabled={pdfBusy}
            className="btn-primary disabled:opacity-60"
          >
            {pdfBusy ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            {pdfBusy
              ? locale === "ko"
                ? "PDF 생성 중..."
                : "Generating PDF..."
              : locale === "ko"
                ? "PDF 리포트 다운로드"
                : "Download PDF report"}
          </button>
          {pdfError && <p className="text-xs text-risk">{pdfError}</p>}
        </div>
      </div>

      {/* Top recommendation card */}
      <div className="card p-6 bg-gradient-to-br from-brand-50/40 to-white border-brand/20">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">
              추천 진출국
            </div>
            <div className="flex items-baseline gap-3">
              <div className="text-4xl font-bold text-slate-900">
                {recommendation.country}
              </div>
              <div className="text-sm">
                <span className={clsx("font-semibold", confidenceColor)}>
                  {recommendation.consensusPercent}% 합의
                </span>
                <span className="text-slate-500 ml-2">
                  ({recommendation.confidence})
                </span>
              </div>
            </div>
          </div>
          <CheckCircle2 className={confidenceColor} size={32} />
        </div>

        {/* Distribution bars */}
        <div className="mt-6 space-y-2">
          {bestCountryDistribution.map((b) => (
            <div key={b.country} className="flex items-center gap-3 text-sm">
              <div className="w-12 font-medium text-slate-700">{b.country}</div>
              <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={clsx(
                    "h-full",
                    b.country === recommendation.country ? "bg-success" : "bg-slate-300",
                  )}
                  style={{ width: `${b.percent}%` }}
                />
              </div>
              <div className="w-20 text-right text-xs text-slate-500 tabular-nums">
                {b.count}/{simCount} ({b.percent}%)
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Segment recommendations */}
      <div>
        <h2 className="text-base font-semibold text-slate-900 mb-3">
          전략별 추천
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {segments.map((seg) => (
            <div key={seg.id} className="card p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">
                {seg.labelKo}
              </div>
              <div className="flex items-baseline gap-2">
                <div className="text-xl font-semibold text-slate-900">
                  {seg.bestCountry}
                </div>
                <div className="text-xs text-slate-500">
                  {seg.id === "cac" ? `$${seg.bestValue.toFixed(2)}` : seg.bestValue.toFixed(1)}
                </div>
              </div>
              {seg.alternative && (
                <div className="mt-1 text-xs text-slate-500">
                  대안: {seg.alternative.country} (
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

      {/* Provider consensus — only when sims spanned multiple LLMs (deep tier) */}
      {providerBreakdown && providerBreakdown.length > 0 && (
        <div>
          <h2 className="text-base font-semibold text-slate-900 mb-3">
            {locale === "ko" ? "LLM별 합의도" : "Cross-model consensus"}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {providerBreakdown.map((pb) => {
              const top = pb.bestCountryDistribution[0];
              const aligned = pb.agreementWithOverallPercent;
              return (
                <div key={pb.provider} className="card p-4">
                  <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">
                    {providerLabel(pb.provider)} · {pb.simCount}{locale === "ko" ? "개 시뮬" : " sims"}
                  </div>
                  <div className="text-xl font-bold text-slate-900">
                    {top?.country ?? "—"}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {top ? `${top.percent}% ${locale === "ko" ? "지지" : "support"}` : ""}
                  </div>
                  <div className="mt-2 text-xs">
                    <span
                      className={clsx(
                        "font-semibold",
                        aligned === 100
                          ? "text-success"
                          : aligned >= 50
                            ? "text-slate-700"
                            : "text-warn",
                      )}
                    >
                      {aligned}%
                    </span>{" "}
                    <span className="text-slate-500">
                      {locale === "ko" ? "전체 합의와 일치" : "agreement w/ overall"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Country stats table */}
      <div>
        <h2 className="text-base font-semibold text-slate-900 mb-3">
          국가별 점수 분포
        </h2>
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 text-left">국가</th>
                <th className="px-4 py-2 text-right">평균 점수</th>
                <th className="px-4 py-2 text-right">중앙값</th>
                <th className="px-4 py-2 text-right">표준편차</th>
                <th className="px-4 py-2 text-right">범위</th>
                <th className="px-4 py-2 text-right">CAC</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {countryStats.map((c) => (
                <tr key={c.country}>
                  <td className="px-4 py-2 font-medium text-slate-900">{c.country}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {c.finalScore.mean.toFixed(1)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {c.finalScore.median.toFixed(1)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-500">
                    {c.finalScore.std.toFixed(1)}
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
            {locale === "ko" ? "변동성 평가" : "Variance assessment"}
          </div>
          <p className="text-sm text-slate-700 leading-relaxed">
            {varianceCopy(varianceAssessment.label, locale)}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {locale === "ko"
              ? `최대 점수 변동: ${varianceAssessment.maxFinalScoreRange}점 · 평균 변동: ${varianceAssessment.meanFinalScoreRange}점`
              : `Max score range: ${varianceAssessment.maxFinalScoreRange}pt · Mean range: ${varianceAssessment.meanFinalScoreRange}pt`}
          </p>
        </div>
      </div>

      <p className="text-xs text-slate-400 text-center">
        앙상블 ID: {result.id}
      </p>
    </div>
  );
}

// Display label for a provider id. Keep this small and centralized so the
// dashboard, PDF, and any admin views render the same brand name. Unknown
// providers fall through to the raw id.
function providerLabel(provider: string): string {
  switch (provider) {
    case "anthropic":
      return "Claude";
    case "openai":
      return "GPT-4";
    case "gemini":
      return "Gemini";
    default:
      return provider;
  }
}

/**
 * Renders the provider lineup with per-provider completion counts when a
 * sim from that provider failed. The lineup is computed from the same
 * round-robin the runner uses, so "expected" matches what was actually
 * scheduled. We only annotate providers that have failures — successful
 * providers stay as plain brand names to keep the header light.
 */
function ProviderLineup({
  providers,
  parallelSims,
  breakdown,
  locale,
}: {
  providers: string[];
  parallelSims: number;
  breakdown: import("@/lib/simulation/ensemble").ProviderConsensus[] | undefined;
  locale: string;
}) {
  // Single-provider ensemble (hypothesis/decision) — no failure attribution
  // possible at this level, just print the lineup.
  if (providers.length <= 1) {
    return <span>{providers.map(providerLabel).join(", ")}</span>;
  }
  const expected: Record<string, number> = {};
  for (let i = 0; i < parallelSims; i++) {
    const p = providers[i % providers.length];
    expected[p] = (expected[p] ?? 0) + 1;
  }
  const actualByProvider = new Map<string, number>(
    (breakdown ?? []).map((b) => [b.provider, b.simCount]),
  );
  return (
    <span>
      {providers.map((p, i) => {
        const exp = expected[p] ?? 0;
        const actual = actualByProvider.get(p) ?? 0;
        const failed = exp - actual;
        return (
          <span key={p}>
            {i > 0 && " · "}
            {providerLabel(p)}
            {failed > 0 && (
              <span className="text-warn normal-case">
                {" "}
                ({actual}/{exp}
                {locale === "ko" ? " 완주" : " ok"})
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}

// Mirrors the locale mapping in src/lib/report/ensemble-pdf.tsx so the
// dashboard and PDF tell the same story for the same variance label. The
// English string baked into aggregate.varianceAssessment.note is ignored.
function varianceCopy(label: "low" | "moderate" | "high", locale: string): string {
  const isKo = locale === "ko";
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

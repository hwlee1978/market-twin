"use client";

import { useEffect, useRef, useState } from "react";
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
  // Tracks whether we've already fired the OS-level "complete" notification
  // for this ensemble. The polling effect can re-render after the result
  // arrives; without this guard the user gets the same toast twice.
  const notifFiredRef = useRef(false);

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

  // Fire an OS-level notification once when the result arrives, IF the user
  // pre-granted permission via the toggle on the progress screen. Page can
  // be backgrounded or in another tab — the toast still surfaces. Email is
  // the durable channel; this is the "I'm watching now" channel.
  useEffect(() => {
    if (!result || notifFiredRef.current) return;
    if (typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;
    notifFiredRef.current = true;
    const rec = result.aggregate.recommendation;
    const isKo = locale === "ko";
    const title = isKo ? "Market Twin · 분석 완료" : "Market Twin · Analysis complete";
    const body = isKo
      ? `추천: ${rec.country} (${rec.consensusPercent}% ${rec.confidence})`
      : `Top market: ${rec.country} (${rec.consensusPercent}% ${rec.confidence})`;
    try {
      const n = new Notification(title, {
        body,
        // Same tag = browsers replace any earlier one for this ensemble
        // instead of stacking duplicates.
        tag: `ensemble-${ensembleId}`,
      });
      n.onclick = () => {
        window.focus();
        n.close();
      };
    } catch (err) {
      console.warn("[notification]", err);
    }
  }, [result, ensembleId, locale]);

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
    return <EnsembleProgress status={status} pollError={error} locale={locale} />;
  }

  return <EnsembleDashboard projectId={projectId} result={result} locale={locale} />;
}

/* ────────────────────────────────── progress ─── */
function EnsembleProgress({
  status,
  pollError,
  locale,
}: {
  status: EnsembleStatus;
  pollError: string | null;
  locale: string;
}) {
  const { counts } = status;
  const pct = counts.total > 0 ? Math.round((counts.completed / counts.total) * 100) : 0;
  // Subline gives the user a "something is moving right now" cue when the
  // top number ("0/25 완료") would otherwise feel frozen for several minutes.
  const activitySubline =
    counts.running > 0 || counts.pending > 0
      ? `${counts.running}개 진행 중 · ${counts.pending}개 대기${counts.failed > 0 ? ` · ${counts.failed}개 실패` : ""}`
      : null;
  return (
    <div className="max-w-2xl mx-auto py-12">
      <div className="card p-10">
        <div className="text-xs uppercase tracking-wide text-accent-600 mb-2 text-center">
          정밀 검증 진행 중
        </div>
        <h2 className="text-2xl font-semibold text-center mb-1">
          {counts.completed}/{counts.total} 시뮬레이션 완료
        </h2>
        <p className="text-sm text-slate-500 text-center mb-1">
          {status.parallel_sims}개 독립 시뮬레이션을 병렬 실행하여 신뢰도 있는 결과를 도출합니다.
        </p>
        {activitySubline && (
          <p className="text-xs text-slate-400 text-center mb-6">{activitySubline}</p>
        )}
        {!activitySubline && <div className="mb-6" />}

        {/* Per-sim status grid — N small bars. Running sims pulse so the
            user has a clear "this is alive" signal during the 5–10 min
            that 25 deep-tier sims take to settle. */}
        <div className="grid grid-cols-5 sm:grid-cols-10 gap-2 mb-6">
          {status.sims.map((sim) => (
            <div
              key={sim.id}
              className={clsx(
                "h-2 rounded-full transition-colors",
                sim.status === "completed" && "bg-success",
                sim.status === "running" && "bg-success/60 animate-pulse",
                sim.status === "failed" && "bg-risk",
                sim.status === "pending" && "bg-slate-200",
              )}
              title={`Sim ${(sim.ensemble_index ?? 0) + 1}: ${sim.status}${sim.current_stage ? ` (${sim.current_stage})` : ""}`}
            />
          ))}
        </div>

        {/* Aggregate progress bar — pulse the leading edge while sims are
            still in flight so the bar visibly "breathes" even between
            completion bumps. */}
        <div className="relative h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={clsx(
              "h-full bg-brand transition-all duration-500",
              counts.running > 0 && "animate-pulse",
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-2 text-xs text-slate-500 text-center">{pct}%</div>

        {pollError && (
          <p className="mt-4 text-xs text-warn text-center">{pollError}</p>
        )}

        <NotificationToggle locale={locale} />
      </div>
    </div>
  );
}

/**
 * Single self-contained control for opting into OS-level notifications.
 * Hidden when the browser doesn't support Notifications, when the user
 * has explicitly denied (no point pushing the prompt at them again), or
 * after permission is granted. The actual fire-on-completion happens in
 * EnsembleView's effect — this component only handles the permission
 * handshake.
 */
function NotificationToggle({ locale }: { locale: string }) {
  const isKo = locale === "ko";
  const [perm, setPerm] = useState<NotificationPermission | "unsupported" | "loading">(
    "loading",
  );

  useEffect(() => {
    if (typeof window === "undefined" || typeof Notification === "undefined") {
      setPerm("unsupported");
      return;
    }
    setPerm(Notification.permission);
  }, []);

  const request = async () => {
    if (typeof Notification === "undefined") return;
    try {
      const result = await Notification.requestPermission();
      setPerm(result);
    } catch (err) {
      console.warn("[notification permission]", err);
    }
  };

  if (perm === "loading" || perm === "unsupported" || perm === "denied") return null;
  if (perm === "granted") {
    return (
      <p className="mt-5 text-xs text-success text-center">
        {isKo
          ? "✓ 알림 권한 완료 — 분석이 끝나면 브라우저 알림으로 알려드립니다."
          : "✓ Notifications enabled — we'll ping you when the analysis finishes."}
      </p>
    );
  }
  return (
    <div className="mt-5 text-center">
      <button
        type="button"
        onClick={request}
        className="text-xs text-brand hover:underline"
      >
        {isKo
          ? "🔔 완료 시 브라우저 알림 받기"
          : "🔔 Notify me when it's done"}
      </button>
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
    narrative,
    personas,
    pricing,
    creative,
    effectivePersonas,
    simCount,
  } = aggregate;
  const isKo = locale === "ko";
  const [activeTab, setActiveTab] = useState<TabKey>("summary");

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
              {tierBadgeLabel(tier, isKo)}
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

      <TabsNav
        active={activeTab}
        onChange={setActiveTab}
        aggregate={aggregate}
        isKo={isKo}
      />

      {activeTab === "summary" && (
        <SummaryTab
          recommendation={recommendation}
          confidenceColor={confidenceColor}
          bestCountryDistribution={bestCountryDistribution}
          simCount={simCount}
          varianceAssessment={varianceAssessment}
          locale={locale}
          isKo={isKo}
        />
      )}
      {activeTab === "overview" && (
        <OverviewTab
          narrative={narrative}
          recommendation={recommendation}
          confidenceColor={confidenceColor}
          simCount={simCount}
          effectivePersonas={effectivePersonas}
          tier={tier}
          isKo={isKo}
        />
      )}
      {activeTab === "countries" && (
        <CountriesTab
          countryStats={countryStats}
          segments={segments}
          bestCountryDistribution={bestCountryDistribution}
          recommendation={recommendation}
          simCount={simCount}
          locale={locale}
          isKo={isKo}
        />
      )}
      {activeTab === "personas" && (
        <PersonasTab personas={personas} isKo={isKo} locale={locale} />
      )}
      {activeTab === "pricing" && (
        <PricingTab pricing={pricing} isKo={isKo} />
      )}
      {activeTab === "risks" && (
        <RisksTab narrative={narrative} isKo={isKo} />
      )}
      {activeTab === "actions" && (
        <ActionsTab narrative={narrative} isKo={isKo} />
      )}
      {activeTab === "data" && (
        <DataTab
          providerBreakdown={providerBreakdown}
          varianceAssessment={varianceAssessment}
          countryStats={countryStats}
          creative={creative}
          ensembleId={result.id}
          tier={tier}
          parallelSims={parallel_sims}
          effectivePersonas={effectivePersonas}
          llmProviders={llm_providers}
          locale={locale}
          isKo={isKo}
        />
      )}

      <p className="text-xs text-slate-400 text-center">
        {isKo ? "앙상블 ID" : "Ensemble ID"}: {result.id}
      </p>
    </div>
  );
}

/* ────────────────────────────────── tabs ─── */

type TabKey =
  | "summary"
  | "overview"
  | "countries"
  | "personas"
  | "pricing"
  | "risks"
  | "actions"
  | "data";

function TabsNav({
  active,
  onChange,
  aggregate,
  isKo,
}: {
  active: TabKey;
  onChange: (k: TabKey) => void;
  aggregate: EnsembleAggregate;
  isKo: boolean;
}) {
  // Hide tabs that have no underlying data so we don't show an empty
  // "페르소나" tab when the snapshot didn't carry persona records (legacy
  // ensembles, or hypothesis tier without the new capture).
  const tabs: Array<{ key: TabKey; label: string; show: boolean }> = [
    { key: "summary", label: isKo ? "요약" : "Summary", show: true },
    { key: "overview", label: isKo ? "개요" : "Overview", show: !!aggregate.narrative?.executiveSummary },
    { key: "countries", label: isKo ? "국가" : "Countries", show: aggregate.countryStats.length > 0 },
    { key: "personas", label: isKo ? "페르소나" : "Personas", show: !!aggregate.personas },
    { key: "pricing", label: isKo ? "가격" : "Pricing", show: !!aggregate.pricing },
    { key: "risks", label: isKo ? "리스크" : "Risks", show: !!aggregate.narrative?.mergedRisks?.length },
    { key: "actions", label: isKo ? "추천 액션" : "Actions", show: !!aggregate.narrative?.mergedActions?.length },
    { key: "data", label: isKo ? "데이터" : "Data", show: true },
  ];
  return (
    <div className="border-b border-slate-200 -mb-px">
      <div className="flex flex-wrap gap-x-1 gap-y-1">
        {tabs
          .filter((t) => t.show)
          .map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => onChange(t.key)}
              className={clsx(
                "px-3 py-2 text-sm font-medium border-b-2 transition-colors",
                active === t.key
                  ? "border-brand text-brand"
                  : "border-transparent text-slate-500 hover:text-slate-800",
              )}
            >
              {t.label}
            </button>
          ))}
      </div>
    </div>
  );
}

function SummaryTab({
  recommendation,
  confidenceColor,
  bestCountryDistribution,
  simCount,
  varianceAssessment,
  locale,
  isKo,
}: {
  recommendation: EnsembleAggregate["recommendation"];
  confidenceColor: string;
  bestCountryDistribution: EnsembleAggregate["bestCountryDistribution"];
  simCount: number;
  varianceAssessment: EnsembleAggregate["varianceAssessment"];
  locale: string;
  isKo: boolean;
}) {
  return (
    <div className="space-y-6">
      <div className="card p-6 bg-gradient-to-br from-brand-50/40 to-white border-brand/20">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">
              {isKo ? "추천 진출국" : "Recommended market"}
            </div>
            <div className="flex items-baseline gap-3">
              <div className="text-4xl font-bold text-slate-900">
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
          <CheckCircle2 className={confidenceColor} size={32} />
        </div>
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
          <p className="text-sm text-slate-700 leading-relaxed">
            {varianceCopy(varianceAssessment.label, locale)}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {isKo
              ? `최대 점수 변동: ${varianceAssessment.maxFinalScoreRange}점 · 평균 변동: ${varianceAssessment.meanFinalScoreRange}점`
              : `Max score range: ${varianceAssessment.maxFinalScoreRange}pt · Mean range: ${varianceAssessment.meanFinalScoreRange}pt`}
          </p>
        </div>
      </div>
    </div>
  );
}

function OverviewTab({
  narrative,
  recommendation,
  confidenceColor,
  simCount,
  effectivePersonas,
  tier,
  isKo,
}: {
  narrative: EnsembleAggregate["narrative"];
  recommendation: EnsembleAggregate["recommendation"];
  confidenceColor: string;
  simCount: number;
  effectivePersonas: number;
  tier: string;
  isKo: boolean;
}) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard
          label={isKo ? "추천 진출국" : "Recommended"}
          value={recommendation.country}
          accent={confidenceColor}
        />
        <KpiCard
          label={isKo ? "합의도" : "Consensus"}
          value={`${recommendation.consensusPercent}%`}
          sub={recommendation.confidence}
          accent={confidenceColor}
        />
        <KpiCard
          label={isKo ? "시뮬 수" : "Sims"}
          value={String(simCount)}
          sub={tierBadgeLabel(tier, isKo)}
        />
        <KpiCard
          label={isKo ? "유효 페르소나" : "Effective personas"}
          value={effectivePersonas.toLocaleString()}
        />
      </div>

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
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={clsx("text-2xl font-bold mt-1", accent)}>{value}</div>
      {sub && <div className="text-[10px] uppercase font-semibold text-slate-400 mt-1">{sub}</div>}
    </div>
  );
}

function CountriesTab({
  countryStats,
  segments,
  bestCountryDistribution,
  recommendation,
  simCount,
  locale,
  isKo,
}: {
  countryStats: EnsembleAggregate["countryStats"];
  segments: EnsembleAggregate["segments"];
  bestCountryDistribution: EnsembleAggregate["bestCountryDistribution"];
  recommendation: EnsembleAggregate["recommendation"];
  simCount: number;
  locale: string;
  isKo: boolean;
}) {
  void locale;
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-slate-900 mb-3">
          {isKo ? "전략별 추천" : "Picks by priority"}
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

      <div>
        <h2 className="text-base font-semibold text-slate-900 mb-3">
          {isKo ? "1위 국가 분포" : "Best-country distribution"}
        </h2>
        <div className="card p-4 space-y-2">
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

      <div>
        <h2 className="text-base font-semibold text-slate-900 mb-3">
          {isKo ? "국가별 점수 분포" : "Per-country score distribution"}
        </h2>
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 text-left">{isKo ? "국가" : "Country"}</th>
                <th className="px-4 py-2 text-right">{isKo ? "평균 점수" : "Mean"}</th>
                <th className="px-4 py-2 text-right">{isKo ? "중앙값" : "Median"}</th>
                <th className="px-4 py-2 text-right">{isKo ? "표준편차" : "Std"}</th>
                <th className="px-4 py-2 text-right">{isKo ? "범위" : "Range"}</th>
                <th className="px-4 py-2 text-right">{isKo ? "수요" : "Demand"}</th>
                <th className="px-4 py-2 text-right">{isKo ? "경쟁" : "Comp"}</th>
                <th className="px-4 py-2 text-right">CAC</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {countryStats.map((c) => (
                <tr key={c.country}>
                  <td className="px-4 py-2 font-medium text-slate-900">{c.country}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{c.finalScore.mean.toFixed(1)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{c.finalScore.median.toFixed(1)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-500">
                    {c.finalScore.std.toFixed(1)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-500">
                    {c.finalScore.min.toFixed(0)}–{c.finalScore.max.toFixed(0)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-500">
                    {c.demandScore.median.toFixed(0)}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-500">
                    {c.competitionScore.median.toFixed(0)}
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
    </div>
  );
}

function PersonasTab({
  personas,
  isKo,
  locale,
}: {
  personas: EnsembleAggregate["personas"];
  isKo: boolean;
  locale: string;
}) {
  void locale;
  if (!personas) {
    return (
      <div className="card p-8 text-center text-slate-500">
        {isKo
          ? "이 앙상블에는 페르소나 통합 데이터가 없습니다 (이전 버전에서 생성된 결과)."
          : "No aggregated persona data on this ensemble (legacy run)."}
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard
          label={isKo ? "총 페르소나" : "Total"}
          value={personas.total.toLocaleString()}
        />
        <KpiCard
          label={isKo ? "평균 구매의향" : "Mean intent"}
          value={`${personas.intentMean.toFixed(0)}%`}
          sub={isKo ? `중앙값 ${personas.intentMedian}%` : `Median ${personas.intentMedian}%`}
        />
        <KpiCard
          label={isKo ? "강한 관심 (≥70)" : "High intent (≥70)"}
          value={personas.highIntentCount.toLocaleString()}
          accent="text-success"
        />
        <KpiCard
          label={isKo ? "약한 관심 (<35)" : "Low intent (<35)"}
          value={personas.lowIntentCount.toLocaleString()}
          accent="text-warn"
        />
      </div>

      <div>
        <h2 className="text-base font-semibold text-slate-900 mb-3">
          {isKo ? "구매의향 분포 (히스토그램)" : "Intent distribution"}
        </h2>
        <div className="card p-4">
          <div className="flex items-end gap-1 h-32">
            {personas.intentHistogram.map((b) => {
              const max = Math.max(...personas.intentHistogram.map((x) => x.count));
              const h = max > 0 ? (b.count / max) * 100 : 0;
              return (
                <div key={b.binStart} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className={clsx(
                      "w-full rounded-t",
                      b.binStart >= 70
                        ? "bg-success"
                        : b.binStart < 35
                          ? "bg-warn"
                          : "bg-slate-300",
                    )}
                    style={{ height: `${h}%` }}
                    title={`${b.binStart}–${b.binEnd}: ${b.count}`}
                  />
                  <div className="text-[10px] text-slate-400 tabular-nums">{b.binStart}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-base font-semibold text-slate-900 mb-3">
          {isKo ? "국가별 평균 구매의향" : "Per-country mean intent"}
        </h2>
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 text-left">{isKo ? "국가" : "Country"}</th>
                <th className="px-4 py-2 text-right">{isKo ? "페르소나" : "Personas"}</th>
                <th className="px-4 py-2 text-right">{isKo ? "평균 의향" : "Mean intent"}</th>
                <th className="px-4 py-2 text-right">{isKo ? "중앙값" : "Median"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {personas.byCountry.map((c) => (
                <tr key={c.country}>
                  <td className="px-4 py-2 font-medium text-slate-900">{c.country}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-600">
                    {c.count.toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{c.meanIntent}%</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-500">
                    {c.medianIntent}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <VoiceList
          title={isKo ? "긍정 페르소나의 목소리" : "Positive voices"}
          voices={personas.topPositiveVoices}
          accent="success"
        />
        <VoiceList
          title={isKo ? "부정 페르소나의 목소리" : "Negative voices"}
          voices={personas.topNegativeVoices}
          accent="warn"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-900 mb-2">
            {isKo ? "연령대 분포" : "Age distribution"}
          </h3>
          <div className="card p-4 space-y-1">
            {personas.ageDistribution.length === 0 ? (
              <div className="text-xs text-slate-400">—</div>
            ) : (
              personas.ageDistribution.map((b) => {
                const max = Math.max(...personas.ageDistribution.map((x) => x.count));
                const w = max > 0 ? (b.count / max) * 100 : 0;
                return (
                  <div key={b.bucket} className="flex items-center gap-2 text-xs">
                    <div className="w-10 text-slate-600">{b.bucket}</div>
                    <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-brand/60" style={{ width: `${w}%` }} />
                    </div>
                    <div className="w-10 text-right text-slate-500 tabular-nums">{b.count}</div>
                  </div>
                );
              })
            )}
          </div>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-900 mb-2">
            {isKo ? "직업 분포 (Top 12)" : "Top occupations"}
          </h3>
          <div className="card p-4 space-y-1">
            {personas.occupationTopN.length === 0 ? (
              <div className="text-xs text-slate-400">—</div>
            ) : (
              personas.occupationTopN.map((o) => (
                <div key={o.occupation} className="flex items-center justify-between text-xs">
                  <div className="text-slate-700 truncate">{o.occupation}</div>
                  <div className="text-slate-500 tabular-nums shrink-0 ml-2">{o.count}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function VoiceList({
  title,
  voices,
  accent,
}: {
  title: string;
  voices: NonNullable<EnsembleAggregate["personas"]>["topPositiveVoices"];
  accent: "success" | "warn";
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-900 mb-2">{title}</h3>
      <div className="card p-4 space-y-3">
        {voices.length === 0 ? (
          <div className="text-xs text-slate-400">—</div>
        ) : (
          voices.map((v, i) => (
            <div key={i} className="text-sm">
              <p className="text-slate-700 leading-relaxed">"{v.text}"</p>
              <div className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                <span>{v.country}</span>
                <span>·</span>
                <span
                  className={clsx(
                    accent === "success" ? "text-success" : "text-warn",
                    "font-semibold tabular-nums",
                  )}
                >
                  {v.intent}%
                </span>
                {v.occupation && (
                  <>
                    <span>·</span>
                    <span className="truncate">{v.occupation}</span>
                  </>
                )}
                {typeof v.age === "number" && (
                  <>
                    <span>·</span>
                    <span>{v.age}</span>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function PricingTab({
  pricing,
  isKo,
}: {
  pricing: EnsembleAggregate["pricing"];
  isKo: boolean;
}) {
  if (!pricing) {
    return (
      <div className="card p-8 text-center text-slate-500">
        {isKo
          ? "이 앙상블에는 가격 통합 데이터가 없습니다."
          : "No aggregated pricing data on this ensemble."}
      </div>
    );
  }
  const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;
  const maxConv = Math.max(...pricing.curve.map((p) => p.meanConversionProbability), 0.0001);
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard
          label={isKo ? "추천 가격 (중앙값)" : "Recommended price"}
          value={fmt(pricing.recommendedPriceCents)}
        />
        <KpiCard
          label="P25 — P75"
          value={`${fmt(pricing.recommendedPriceP25)} – ${fmt(pricing.recommendedPriceP75)}`}
        />
        <KpiCard
          label={isKo ? "마진 추정 (최빈)" : "Margin estimate"}
          value={pricing.marginEstimate}
        />
        <KpiCard
          label={isKo ? "가격 포인트" : "Curve points"}
          value={String(pricing.curve.length)}
        />
      </div>

      <div>
        <h2 className="text-base font-semibold text-slate-900 mb-3">
          {isKo ? "가격별 평균 전환률 (시뮬 합산)" : "Mean conversion by price"}
        </h2>
        <div className="card p-4">
          <div className="space-y-1">
            {pricing.curve.map((p) => (
              <div key={p.priceCents} className="flex items-center gap-3 text-xs">
                <div className="w-16 tabular-nums text-slate-700 font-medium">
                  {fmt(p.priceCents)}
                </div>
                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-brand"
                    style={{ width: `${(p.meanConversionProbability / maxConv) * 100}%` }}
                  />
                </div>
                <div className="w-14 text-right text-slate-600 tabular-nums">
                  {(p.meanConversionProbability * 100).toFixed(1)}%
                </div>
                <div className="w-12 text-right text-slate-400 tabular-nums">
                  n={p.sampleCount}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function RisksTab({
  narrative,
  isKo,
}: {
  narrative: EnsembleAggregate["narrative"];
  isKo: boolean;
}) {
  if (!narrative?.mergedRisks?.length) {
    return (
      <div className="card p-8 text-center text-slate-500">
        {isKo ? "통합 리스크 데이터가 없습니다." : "No merged risks available."}
      </div>
    );
  }
  const riskLevelLabel =
    narrative.overallRiskLevel === "high"
      ? isKo ? "높음" : "HIGH"
      : narrative.overallRiskLevel === "medium"
        ? isKo ? "보통" : "MEDIUM"
        : isKo ? "낮음" : "LOW";
  const riskLevelClass =
    narrative.overallRiskLevel === "high"
      ? "text-risk"
      : narrative.overallRiskLevel === "medium"
        ? "text-warn"
        : "text-success";
  return (
    <div className="space-y-4">
      <div className="card p-4 flex items-center justify-between">
        <div className="text-sm text-slate-600">
          {isKo ? "종합 리스크 수준" : "Overall risk level"}
        </div>
        <div className={clsx("text-lg font-bold", riskLevelClass)}>{riskLevelLabel}</div>
      </div>
      <div className="card divide-y divide-slate-100">
        {narrative.mergedRisks.map((r, i) => {
          const sevClass =
            r.severity === "high"
              ? "text-risk"
              : r.severity === "medium"
                ? "text-warn"
                : "text-slate-500";
          return (
            <div key={i} className="p-4 flex gap-3 items-start">
              <div className={clsx("shrink-0 w-16 text-[10px] font-bold uppercase tracking-wider pt-0.5", sevClass)}>
                {r.severity}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-slate-900 mb-0.5">{r.factor}</div>
                <p className="text-sm text-slate-600 leading-relaxed">{r.description}</p>
                <div className="text-xs text-slate-400 mt-1">
                  {isKo
                    ? `${r.surfacedInSims}개 시뮬에서 언급`
                    : `Surfaced in ${r.surfacedInSims} sim${r.surfacedInSims === 1 ? "" : "s"}`}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ActionsTab({
  narrative,
  isKo,
}: {
  narrative: EnsembleAggregate["narrative"];
  isKo: boolean;
}) {
  if (!narrative?.mergedActions?.length) {
    return (
      <div className="card p-8 text-center text-slate-500">
        {isKo ? "통합 액션 데이터가 없습니다." : "No merged actions available."}
      </div>
    );
  }
  return (
    <ol className="card divide-y divide-slate-100">
      {narrative.mergedActions.map((a, i) => (
        <li key={i} className="p-4 flex gap-3 items-start">
          <div className="shrink-0 w-6 text-sm font-bold text-brand">{i + 1}.</div>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-slate-700 leading-relaxed">{a.action}</p>
            <div className="text-xs text-slate-400 mt-1">
              {isKo
                ? `${a.surfacedInSims}개 시뮬에서 권장`
                : `Recommended by ${a.surfacedInSims} sim${a.surfacedInSims === 1 ? "" : "s"}`}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

function DataTab({
  providerBreakdown,
  varianceAssessment,
  countryStats,
  creative,
  ensembleId,
  tier,
  parallelSims,
  effectivePersonas,
  llmProviders,
  locale,
  isKo,
}: {
  providerBreakdown: EnsembleAggregate["providerBreakdown"];
  varianceAssessment: EnsembleAggregate["varianceAssessment"];
  countryStats: EnsembleAggregate["countryStats"];
  creative: EnsembleAggregate["creative"];
  ensembleId: string;
  tier: string;
  parallelSims: number;
  effectivePersonas: number;
  llmProviders: string[];
  locale: string;
  isKo: boolean;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-slate-900 mb-3">
          {isKo ? "분석 메타데이터" : "Analysis metadata"}
        </h2>
        <div className="card divide-y divide-slate-100 text-sm">
          <MetaRow label={isKo ? "Tier" : "Tier"} value={tierBadgeLabel(tier, isKo)} />
          <MetaRow label={isKo ? "병렬 시뮬" : "Parallel sims"} value={String(parallelSims)} />
          <MetaRow
            label={isKo ? "유효 페르소나" : "Effective personas"}
            value={effectivePersonas.toLocaleString()}
          />
          <MetaRow
            label={isKo ? "LLM 라인업" : "LLM providers"}
            value={llmProviders.map(providerLabel).join(", ")}
          />
          <MetaRow label={isKo ? "앙상블 ID" : "Ensemble ID"} value={ensembleId} />
          <MetaRow label={isKo ? "로케일" : "Locale"} value={locale} />
        </div>
      </div>

      {providerBreakdown && providerBreakdown.length > 0 && (
        <div>
          <h2 className="text-base font-semibold text-slate-900 mb-3">
            {isKo ? "LLM별 합의도" : "Cross-model consensus"}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {providerBreakdown.map((pb) => {
              const top = pb.bestCountryDistribution[0];
              const aligned = pb.agreementWithOverallPercent;
              return (
                <div key={pb.provider} className="card p-4">
                  <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">
                    {providerLabel(pb.provider)} · {pb.simCount}{isKo ? "개 시뮬" : " sims"}
                  </div>
                  <div className="text-xl font-bold text-slate-900">{top?.country ?? "—"}</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {top ? `${top.percent}% ${isKo ? "지지" : "support"}` : ""}
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
                      {isKo ? "전체 합의와 일치" : "agreement w/ overall"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <h2 className="text-base font-semibold text-slate-900 mb-3">
          {isKo ? "변동성 통계" : "Variance statistics"}
        </h2>
        <div className="card divide-y divide-slate-100 text-sm">
          <MetaRow
            label={isKo ? "최대 점수 변동" : "Max score range"}
            value={`${varianceAssessment.maxFinalScoreRange}pt`}
          />
          <MetaRow
            label={isKo ? "평균 변동" : "Mean range"}
            value={`${varianceAssessment.meanFinalScoreRange}pt`}
          />
          <MetaRow
            label={isKo ? "변동성 등급" : "Variance label"}
            value={varianceAssessment.label.toUpperCase()}
          />
          <MetaRow
            label={isKo ? "분석 국가 수" : "Markets analyzed"}
            value={String(countryStats.length)}
          />
        </div>
      </div>

      {creative && creative.assets.length > 0 && (
        <div>
          <h2 className="text-base font-semibold text-slate-900 mb-3">
            {isKo ? "크리에이티브 분석" : "Creative analysis"}
          </h2>
          <div className="space-y-3">
            {creative.assets.map((a) => (
              <div key={a.assetName} className="card p-4">
                <div className="flex items-baseline justify-between mb-2">
                  <div className="text-sm font-semibold text-slate-900">{a.assetName}</div>
                  <div className="text-lg font-bold text-brand tabular-nums">
                    {a.meanScore.toFixed(0)}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <div className="text-slate-500 uppercase tracking-wide mb-1">
                      {isKo ? "강점" : "Strengths"}
                    </div>
                    <ul className="space-y-1">
                      {a.topStrengths.map((s, i) => (
                        <li key={i} className="text-slate-700">
                          • {s.point}{" "}
                          <span className="text-slate-400">({s.surfacedInSims})</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <div className="text-slate-500 uppercase tracking-wide mb-1">
                      {isKo ? "약점" : "Weaknesses"}
                    </div>
                    <ul className="space-y-1">
                      {a.topWeaknesses.map((s, i) => (
                        <li key={i} className="text-slate-700">
                          • {s.point}{" "}
                          <span className="text-slate-400">({s.surfacedInSims})</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between p-3">
      <div className="text-slate-500">{label}</div>
      <div className="text-slate-900 font-medium font-mono text-xs">{value}</div>
    </div>
  );
}

// Tier badge label for the dashboard header. Mirrors the TIER_LABELS map
// in the project detail page and the TIER_DISPLAY map in ensemble-pdf.tsx
// so all three surfaces (badge, list row, PDF eyebrow) print the same
// Korean / English name.
function tierBadgeLabel(tier: string, isKo: boolean): string {
  const map: Record<string, { ko: string; en: string }> = {
    hypothesis: { ko: "초기검증", en: "Hypothesis" },
    decision: { ko: "검증분석", en: "Decision" },
    decision_plus: { ko: "검증분석+", en: "Decision+" },
    deep: { ko: "심층분석", en: "Deep" },
    deep_pro: { ko: "심층분석 Pro", en: "Deep Pro" },
  };
  const entry = map[tier];
  if (!entry) return tier.toUpperCase();
  return isKo ? entry.ko : entry.en.toUpperCase();
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

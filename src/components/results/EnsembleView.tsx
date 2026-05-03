"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, CheckCircle2, AlertCircle, TrendingUp, Download, ChevronRight } from "lucide-react";
import { clsx } from "clsx";
import type { EnsembleAggregate } from "@/lib/simulation/ensemble";
import { friendlyApiError, friendlyClientError } from "@/lib/api/error-message";
import {
  BestCountryPieChart,
  CountryIntentChart,
  CountryScoreChart,
  IntentHistogramChart,
  PricingCurveChart,
} from "./charts";

interface EnsembleStatus {
  id: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  tier: "hypothesis" | "decision" | "decision_plus" | "deep" | "deep_pro";
  parallel_sims: number;
  per_sim_personas: number;
  counts: {
    total: number;
    completed: number;
    running: number;
    pending: number;
    failed: number;
    cancelled?: number;
  };
  sims: Array<{
    id: string;
    status: string;
    current_stage: string | null;
    ensemble_index: number | null;
  }>;
  error_message?: string | null;
  created_at?: string | null;
  completed_at?: string | null;
}

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

interface EnsembleResult {
  id: string;
  tier: string;
  parallel_sims: number;
  per_sim_personas: number;
  llm_providers: string[];
  aggregate: EnsembleAggregate;
  created_at?: string;
  completed_at?: string | null;
  project?: ProjectInfo | null;
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
        if (!res.ok) throw new Error(await friendlyApiError(res, locale === "ko" ? "ko" : "en"));
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
        setError(friendlyClientError(err, locale === "ko" ? "ko" : "en"));
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
          <h2 className="text-xl font-semibold mt-4 mb-2">
            {locale === "ko" ? "앙상블 분석 실패" : "Ensemble failed"}
          </h2>
          <p className="text-sm text-slate-500">
            {status.error_message ?? "일부 시뮬레이션 또는 집계 단계에서 오류가 발생했습니다."}
          </p>
        </div>
      </div>
    );
  }

  if (status.status === "cancelled") {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <div className="card text-center p-12">
          <AlertCircle className="mx-auto text-slate-400" size={32} />
          <h2 className="text-xl font-semibold mt-4 mb-2">
            {locale === "ko" ? "분석이 중단되었습니다" : "Analysis cancelled"}
          </h2>
          <p className="text-sm text-slate-500">
            {locale === "ko"
              ? `사용자 요청으로 분석이 중단되었습니다. 완료된 시뮬: ${status.counts.completed}/${status.counts.total}.`
              : `Cancelled by user. Sims completed: ${status.counts.completed}/${status.counts.total}.`}
          </p>
        </div>
      </div>
    );
  }

  if (status.status !== "completed" || !result) {
    return (
      <EnsembleProgress
        status={status}
        pollError={error}
        locale={locale}
        ensembleId={ensembleId}
      />
    );
  }

  return <EnsembleDashboard projectId={projectId} result={result} locale={locale} />;
}

/* ────────────────────────────────── progress ─── */
function EnsembleProgress({
  status,
  pollError,
  locale,
  ensembleId,
}: {
  status: EnsembleStatus;
  pollError: string | null;
  locale: string;
  ensembleId: string;
}) {
  const { counts } = status;
  const pct = counts.total > 0 ? Math.round((counts.completed / counts.total) * 100) : 0;
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const isKo = locale === "ko";
  const tierLabel = tierBadgeLabel(status.tier, isKo);

  // Tick once per second so the elapsed-time readout stays current. Falls
  // back to no-op when the row hasn't recorded a created_at yet (legacy).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!status.created_at) return;
    const handle = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(handle);
  }, [status.created_at]);
  const startedMs = status.created_at ? new Date(status.created_at).getTime() : null;
  const elapsedSec = startedMs ? Math.max(0, Math.floor((now - startedMs) / 1000)) : 0;
  const elapsedLabel = formatElapsedHMS(elapsedSec);
  const submitCancel = async () => {
    setCancelling(true);
    setCancelError(null);
    try {
      const res = await fetch(`/api/ensembles/${ensembleId}/cancel`, { method: "POST" });
      if (!res.ok) throw new Error(await friendlyApiError(res, locale === "ko" ? "ko" : "en"));
      // The polling tick on the parent will pick up status='cancelled' on
      // its next pass and switch the view; no need to navigate here.
      setConfirmCancel(false);
    } catch (err) {
      setCancelError(friendlyClientError(err, locale === "ko" ? "ko" : "en"));
    } finally {
      setCancelling(false);
    }
  };
  // Subline gives the user a "something is moving right now" cue when the
  // top number ("0/25 완료") would otherwise feel frozen for several minutes.
  const activitySubline =
    counts.running > 0 || counts.pending > 0
      ? isKo
        ? `${counts.running}개 진행 중 · ${counts.pending}개 대기${counts.failed > 0 ? ` · ${counts.failed}개 실패` : ""}`
        : `${counts.running} running · ${counts.pending} pending${counts.failed > 0 ? ` · ${counts.failed} failed` : ""}`
      : null;
  return (
    <div className="max-w-2xl mx-auto py-12">
      <div className="card p-10">
        <div className="text-xs uppercase tracking-wide text-accent-600 mb-2 text-center">
          {isKo ? `${tierLabel} 진행 중` : `${tierLabel} in progress`}
        </div>
        <h2 className="text-2xl font-semibold text-center mb-1">
          {isKo
            ? `${counts.completed}/${counts.total} 시뮬레이션 완료`
            : `${counts.completed}/${counts.total} simulations done`}
        </h2>
        <p className="text-sm text-slate-500 text-center mb-1">
          {isKo
            ? `${status.parallel_sims}개 독립 시뮬레이션을 병렬 실행하여 신뢰도 있는 결과를 도출합니다.`
            : `Running ${status.parallel_sims} independent simulations in parallel for confidence-grade results.`}
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
        <div className="mt-2 flex items-baseline justify-center gap-3 text-xs text-slate-500 tabular-nums">
          <span>{pct}%</span>
          {startedMs && (
            <span className="text-slate-400">
              {isKo ? `${elapsedLabel} 경과` : `${elapsedLabel} elapsed`}
            </span>
          )}
        </div>

        {pollError && (
          <p className="mt-4 text-xs text-warn text-center">{pollError}</p>
        )}

        <NotificationToggle locale={locale} />

        <div className="mt-6 pt-5 border-t border-slate-100 text-center">
          <button
            type="button"
            onClick={() => setConfirmCancel(true)}
            disabled={cancelling}
            className="text-xs text-slate-400 hover:text-risk transition-colors"
          >
            {isKo ? "분석 중단" : "Cancel analysis"}
          </button>
        </div>
      </div>

      {confirmCancel && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4"
          onClick={() => !cancelling && setConfirmCancel(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-slate-900 mb-2">
              {isKo ? "분석을 중단하시겠습니까?" : "Cancel this analysis?"}
            </h3>
            <p className="text-sm text-slate-600 mb-3">
              {isKo
                ? `${counts.completed}/${counts.total} 시뮬이 완료된 상태입니다.`
                : `${counts.completed}/${counts.total} sims have completed.`}
            </p>
            {/* Make the consequences visible — bullet list with severity
                color so the user can't miss what they're agreeing to. */}
            <div className="rounded-lg border border-warn/30 bg-warn-soft/30 p-3 space-y-1.5">
              <div className="flex items-start gap-2 text-sm text-slate-700">
                <span className="text-warn font-bold shrink-0">⚠</span>
                <span>{isKo ? "진행 중인 시뮬레이션은 즉시 멈춥니다." : "In-flight sims stop immediately."}</span>
              </div>
              <div className="flex items-start gap-2 text-sm text-slate-700">
                <span className="text-warn font-bold shrink-0">⚠</span>
                <span>{isKo ? "지금까지의 부분 결과는 저장되지 않습니다." : "Partial results are not saved."}</span>
              </div>
              <div className="flex items-start gap-2 text-sm text-slate-700">
                <span className="text-warn font-bold shrink-0">⚠</span>
                <span>{isKo ? "이 동작은 되돌릴 수 없습니다." : "This action cannot be undone."}</span>
              </div>
            </div>
            {cancelError && (
              <p className="mt-3 text-xs text-risk">{cancelError}</p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmCancel(false)}
                disabled={cancelling}
                className="btn-ghost text-sm"
              >
                {isKo ? "계속 진행" : "Keep running"}
              </button>
              <button
                type="button"
                onClick={submitCancel}
                disabled={cancelling}
                className="text-sm px-3 py-1.5 rounded-md bg-risk text-white font-medium hover:bg-risk/90 disabled:opacity-60"
              >
                {cancelling
                  ? isKo
                    ? "중단 중..."
                    : "Cancelling..."
                  : isKo
                    ? "분석 중단"
                    : "Cancel"}
              </button>
            </div>
          </div>
        </div>
      )}
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
      if (!res.ok) throw new Error(await friendlyApiError(res, locale === "ko" ? "ko" : "en"));
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
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareToast, setShareToast] = useState<string | null>(null);

  const generateShare = async () => {
    if (shareBusy) return;
    setShareBusy(true);
    setShareToast(null);
    try {
      const res = await fetch(`/api/ensembles/${result.id}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(await friendlyApiError(res, isKo ? "ko" : "en"));
      const data = (await res.json()) as { token: string; expiresAt: string };
      const url = `${window.location.origin}/${locale}/share/ensemble/${data.token}`;
      setShareUrl(url);
      try {
        await navigator.clipboard.writeText(url);
        setShareToast(isKo ? "공유 링크를 클립보드에 복사했습니다." : "Share URL copied to clipboard.");
      } catch {
        // Clipboard write can fail silently in non-HTTPS contexts; URL still
        // visible in the toast so the user can copy by hand.
        setShareToast(isKo ? "공유 링크가 생성되었습니다." : "Share URL generated.");
      }
    } catch (err) {
      setShareToast(friendlyClientError(err, isKo ? "ko" : "en"));
    } finally {
      setShareBusy(false);
    }
  };

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
          <div className="flex items-center gap-2">
            <button
              onClick={generateShare}
              disabled={shareBusy}
              className="btn-ghost text-sm disabled:opacity-60"
            >
              {shareBusy
                ? isKo
                  ? "생성 중..."
                  : "Generating..."
                : isKo
                  ? "공유 링크"
                  : "Share link"}
            </button>
            <button
              onClick={exportPdf}
              disabled={pdfBusy}
              className="btn-primary disabled:opacity-60"
            >
              {pdfBusy ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
              {pdfBusy
                ? isKo
                  ? "PDF 생성 중..."
                  : "Generating PDF..."
                : isKo
                  ? "PDF 리포트"
                  : "PDF report"}
            </button>
          </div>
          {pdfError && <p className="text-xs text-risk">{pdfError}</p>}
          {shareToast && (
            <p className="text-xs text-slate-600 max-w-xs break-all text-right">
              {shareToast}
              {shareUrl && (
                <span className="block text-[10px] text-slate-400 mt-0.5 font-mono">
                  {shareUrl}
                </span>
              )}
            </p>
          )}
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
          effectivePersonas={effectivePersonas}
          tier={tier}
          llmProviders={llm_providers}
          parallelSims={parallel_sims}
          completedAt={result.completed_at ?? null}
          project={result.project ?? null}
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
          bestCountryDistribution={bestCountryDistribution}
          countryStats={countryStats}
          segments={segments}
          varianceAssessment={varianceAssessment}
          providerBreakdown={providerBreakdown}
          pricing={pricing}
          personas={personas}
          locale={locale}
        />
      )}
      {activeTab === "countries" && (
        <CountriesTab
          countryStats={countryStats}
          segments={segments}
          bestCountryDistribution={bestCountryDistribution}
          recommendation={recommendation}
          simCount={simCount}
          sources={aggregate.sources ?? []}
          locale={locale}
          isKo={isKo}
        />
      )}
      {activeTab === "personas" && (
        <PersonasTab
          personas={personas}
          isKo={isKo}
          locale={locale}
          ensembleId={result.id}
        />
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
  effectivePersonas,
  tier,
  llmProviders,
  parallelSims,
  completedAt,
  project,
  varianceAssessment,
  locale,
  isKo,
}: {
  recommendation: EnsembleAggregate["recommendation"];
  confidenceColor: string;
  bestCountryDistribution: EnsembleAggregate["bestCountryDistribution"];
  simCount: number;
  effectivePersonas: number;
  tier: string;
  llmProviders: string[];
  parallelSims: number;
  completedAt: string | null;
  project: ProjectInfo | null;
  varianceAssessment: EnsembleAggregate["varianceAssessment"];
  locale: string;
  isKo: boolean;
}) {
  return (
    <div className="space-y-6">
      {project && (
        <ProjectInfoCard project={project} locale={locale} isKo={isKo} />
      )}

      <SimRunInfoCard
        tier={tier}
        simCount={simCount}
        parallelSims={parallelSims}
        effectivePersonas={effectivePersonas}
        llmProviders={llmProviders}
        completedAt={completedAt}
        isKo={isKo}
        locale={locale}
      />

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
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
          <div className="sm:col-span-1">
            <BestCountryPieChart
              data={bestCountryDistribution}
              winner={recommendation.country}
            />
          </div>
          <div className="sm:col-span-2 space-y-2">
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

/**
 * Quick "what was this analysis about" card — product name, category,
 * pricing, the candidate market list. Sits at the very top of the
 * Summary tab so the user reading the report later doesn't have to
 * jump back to the project page to remember what they ran.
 */
function ProjectInfoCard({
  project,
  locale,
  isKo,
}: {
  project: ProjectInfo;
  locale: string;
  isKo: boolean;
}) {
  void locale;
  const fmtPrice = () => {
    if (project.base_price_cents == null) return "—";
    const v = project.base_price_cents / 100;
    return `${v.toFixed(2)} ${project.currency ?? "USD"}`;
  };
  const objectiveLabel = (() => {
    if (!project.objective) return "—";
    if (!isKo) return project.objective;
    const map: Record<string, string> = {
      conversion: "전환",
      awareness: "인지도",
      retention: "유지",
      expansion: "확장",
    };
    return map[project.objective] ?? project.objective;
  })();
  return (
    <div className="card p-5">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-base font-semibold text-slate-900">
          {isKo ? "프로젝트 개요" : "Project info"}
        </h2>
        <span className="text-xs text-slate-400">{project.name}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">
            {isKo ? "제품" : "Product"}
          </div>
          <div className="text-sm font-medium text-slate-900">
            {project.product_name}
          </div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">
            {isKo ? "카테고리" : "Category"}
          </div>
          <div className="text-sm text-slate-900">{project.category ?? "—"}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">
            {isKo ? "기본 가격" : "Base price"}
          </div>
          <div className="text-sm text-slate-900 tabular-nums">{fmtPrice()}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">
            {isKo ? "출시 목표" : "Objective"}
          </div>
          <div className="text-sm text-slate-900">{objectiveLabel}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">
            {isKo ? "출시 국가" : "Origin"}
          </div>
          <div className="text-sm text-slate-900">
            {project.originating_country ?? "—"}
          </div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">
            {isKo ? "후보 진출국" : "Target markets"}
          </div>
          <div className="text-sm text-slate-900">
            {(project.candidate_countries ?? []).join(", ") || "—"}
          </div>
        </div>
        {project.description && (
          <div className="sm:col-span-2 pt-3 border-t border-slate-100">
            <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">
              {isKo ? "설명" : "Description"}
            </div>
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
              {project.description}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Snapshot of how this analysis was actually executed — tier label, sim
 * count, total effective personas, providers used, completion timestamp.
 * Complements the project-info card by answering "what was the budget /
 * setup of THIS run" once the user has more than one ensemble per project.
 */
function SimRunInfoCard({
  tier,
  simCount,
  parallelSims,
  effectivePersonas,
  llmProviders,
  completedAt,
  isKo,
  locale,
}: {
  tier: string;
  simCount: number;
  parallelSims: number;
  effectivePersonas: number;
  llmProviders: string[];
  completedAt: string | null;
  isKo: boolean;
  locale: string;
}) {
  const completed = completedAt
    ? new Date(completedAt).toLocaleString(locale, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
  const successRate = parallelSims > 0
    ? Math.round((simCount / parallelSims) * 100)
    : 0;
  return (
    <div className="card p-5">
      <h2 className="text-base font-semibold text-slate-900 mb-4">
        {isKo ? "실행 요약" : "Run summary"}
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard
          label={isKo ? "분석 단계" : "Tier"}
          value={tierBadgeLabel(tier, isKo)}
        />
        <KpiCard
          label={isKo ? "완료 시뮬" : "Completed sims"}
          value={`${simCount}/${parallelSims}`}
          sub={`${successRate}%`}
          accent={
            successRate >= 90 ? "text-success" : successRate >= 60 ? "text-warn" : "text-risk"
          }
        />
        <KpiCard
          label={isKo ? "유효 페르소나" : "Effective personas"}
          value={effectivePersonas.toLocaleString()}
        />
        <KpiCard
          label="LLM"
          value={llmProviders.map(providerLabel).join(" · ")}
          sub={completed}
        />
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
  bestCountryDistribution,
  countryStats,
  segments,
  varianceAssessment,
  providerBreakdown,
  pricing,
  personas,
  locale,
}: {
  narrative: EnsembleAggregate["narrative"];
  recommendation: EnsembleAggregate["recommendation"];
  confidenceColor: string;
  simCount: number;
  effectivePersonas: number;
  tier: string;
  isKo: boolean;
  bestCountryDistribution: EnsembleAggregate["bestCountryDistribution"];
  countryStats: EnsembleAggregate["countryStats"];
  segments: EnsembleAggregate["segments"];
  varianceAssessment: EnsembleAggregate["varianceAssessment"];
  providerBreakdown: EnsembleAggregate["providerBreakdown"];
  pricing: EnsembleAggregate["pricing"];
  personas: EnsembleAggregate["personas"];
  locale: string;
}) {
  void locale;
  const runnerUp = bestCountryDistribution[1];
  const winnerStats = countryStats.find((c) => c.country === recommendation.country);
  const overallSeg = segments.find((s) => s.id === "overall");
  const topRisk = narrative?.mergedRisks?.[0];
  const topAction = narrative?.mergedActions?.[0];
  const fmtPrice = (cents?: number) =>
    typeof cents === "number" ? `$${(cents / 100).toFixed(2)}` : "—";
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

      {/* Key findings — bullet list of the 5-7 most-actionable headlines.
          Each bullet should leave the reader knowing what to do next, not
          just what the number is. */}
      <div>
        <h2 className="text-base font-semibold text-slate-900 mb-3">
          {isKo ? "핵심 발견" : "Key findings"}
        </h2>
        <ul className="card p-5 space-y-3 text-sm text-slate-700 leading-relaxed">
          <li className="flex gap-3">
            <span className="shrink-0 text-brand font-bold">·</span>
            <span>
              {isKo ? (
                <>
                  <span className="font-semibold text-slate-900">{recommendation.country}</span>
                  {" "}진출이 합의 우위 ({recommendation.consensusPercent}% / {recommendation.confidence})
                  {winnerStats &&
                    ` — 평균 점수 ${winnerStats.finalScore.mean.toFixed(0)}, 표준편차 ${winnerStats.finalScore.std.toFixed(1)}`}
                  .
                </>
              ) : (
                <>
                  <span className="font-semibold text-slate-900">{recommendation.country}</span>
                  {" "}leads consensus ({recommendation.consensusPercent}% / {recommendation.confidence})
                  {winnerStats &&
                    ` — mean score ${winnerStats.finalScore.mean.toFixed(0)}, std ${winnerStats.finalScore.std.toFixed(1)}`}
                  .
                </>
              )}
            </span>
          </li>
          {runnerUp && (
            <li className="flex gap-3">
              <span className="shrink-0 text-brand font-bold">·</span>
              <span>
                {isKo
                  ? `차순위는 ${runnerUp.country} (${runnerUp.percent}%) — 1순위가 막혔을 때 즉시 대안.`
                  : `Runner-up: ${runnerUp.country} (${runnerUp.percent}%) — immediate fallback if the winner is blocked.`}
              </span>
            </li>
          )}
          {overallSeg && overallSeg.bestCountry !== recommendation.country && (
            <li className="flex gap-3">
              <span className="shrink-0 text-warn font-bold">·</span>
              <span>
                {isKo
                  ? `종합 점수 1위는 ${overallSeg.bestCountry} (${overallSeg.bestValue.toFixed(0)}) — 합의도 1위와 다르므로 의사결정 시 참고.`
                  : `Top-scored market is ${overallSeg.bestCountry} (${overallSeg.bestValue.toFixed(0)}) — diverges from consensus winner; review before committing.`}
              </span>
            </li>
          )}
          {pricing && (
            <li className="flex gap-3">
              <span className="shrink-0 text-brand font-bold">·</span>
              <span>
                {isKo
                  ? `권장 가격 ${fmtPrice(pricing.recommendedPriceCents)} (시뮬 50% 구간 ${fmtPrice(pricing.recommendedPriceP25)}–${fmtPrice(pricing.recommendedPriceP75)}).`
                  : `Recommended price ${fmtPrice(pricing.recommendedPriceCents)} (mid-50% range ${fmtPrice(pricing.recommendedPriceP25)}–${fmtPrice(pricing.recommendedPriceP75)}).`}
              </span>
            </li>
          )}
          {personas && (
            <li className="flex gap-3">
              <span className="shrink-0 text-brand font-bold">·</span>
              <span>
                {isKo
                  ? `${personas.total.toLocaleString()}명 페르소나 평균 구매의향 ${personas.intentMean.toFixed(0)}% (강한 관심 ${personas.highIntentCount.toLocaleString()}명, 약한 관심 ${personas.lowIntentCount.toLocaleString()}명).`
                  : `${personas.total.toLocaleString()} personas with mean intent ${personas.intentMean.toFixed(0)}% (high ≥70: ${personas.highIntentCount}, low <35: ${personas.lowIntentCount}).`}
              </span>
            </li>
          )}
          {topRisk && (
            <li className="flex gap-3">
              <span
                className={clsx(
                  "shrink-0 font-bold",
                  topRisk.severity === "high"
                    ? "text-risk"
                    : topRisk.severity === "medium"
                      ? "text-warn"
                      : "text-slate-500",
                )}
              >
                ·
              </span>
              <span>
                {isKo ? "최우선 리스크: " : "Top risk: "}
                <span className="font-semibold text-slate-900">{topRisk.factor}</span>{" "}
                ({topRisk.severity}, {isKo ? `${topRisk.surfacedInSims}개 시뮬에서 언급` : `surfaced in ${topRisk.surfacedInSims}`}).
              </span>
            </li>
          )}
          {topAction && (
            <li className="flex gap-3">
              <span className="shrink-0 text-success font-bold">·</span>
              <span>
                {isKo ? "1순위 액션: " : "First action: "}
                <span className="font-medium text-slate-900">{topAction.action}</span>
              </span>
            </li>
          )}
          <li className="flex gap-3">
            <span className="shrink-0 text-slate-400 font-bold">·</span>
            <span className="text-slate-500">
              {isKo
                ? `시뮬 간 변동성: ${varianceAssessment.label.toUpperCase()} (최대 점수 변동 ${varianceAssessment.maxFinalScoreRange}점) — ${varianceCopy(varianceAssessment.label, isKo ? "ko" : "en")}`
                : `Variance: ${varianceAssessment.label.toUpperCase()} (max range ${varianceAssessment.maxFinalScoreRange}pt) — ${varianceCopy(varianceAssessment.label, "en")}`}
            </span>
          </li>
        </ul>
      </div>

      {/* Cross-model consensus mini-strip — only when multi-LLM. Just a
          headline read; the data tab carries the full breakdown. */}
      {providerBreakdown && providerBreakdown.length > 0 && (
        <div>
          <h2 className="text-base font-semibold text-slate-900 mb-3">
            {isKo ? "모델 합의 신호" : "Cross-model agreement"}
          </h2>
          <div className="card p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
            {providerBreakdown.map((pb) => (
              <div key={pb.provider} className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs text-slate-500">
                    {providerLabel(pb.provider)} · {pb.simCount}{isKo ? "개 시뮬" : " sims"}
                  </div>
                  <div className="text-sm font-semibold text-slate-900">
                    {pb.bestCountryDistribution[0]?.country ?? "—"}
                  </div>
                </div>
                <div
                  className={clsx(
                    "text-lg font-bold tabular-nums",
                    pb.agreementWithOverallPercent === 100
                      ? "text-success"
                      : pb.agreementWithOverallPercent >= 50
                        ? "text-slate-700"
                        : "text-warn",
                  )}
                >
                  {pb.agreementWithOverallPercent}%
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {narrative?.executiveSummary && (
        <div>
          <h2 className="text-base font-semibold text-slate-900 mb-2">
            {isKo ? "종합 의견 (시뮬 통합)" : "Executive summary (cross-sim consensus)"}
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
  sources,
  locale,
  isKo,
}: {
  countryStats: EnsembleAggregate["countryStats"];
  segments: EnsembleAggregate["segments"];
  bestCountryDistribution: EnsembleAggregate["bestCountryDistribution"];
  recommendation: EnsembleAggregate["recommendation"];
  simCount: number;
  sources: string[];
  locale: string;
  isKo: boolean;
}) {
  void locale;
  const [expandedCountry, setExpandedCountry] = useState<string | null>(null);
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-slate-900 mb-3">
          {isKo ? "전략별 추천" : "Picks by priority"}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {segments.map((seg) => (
            <div key={seg.id} className="card p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500 mb-1 flex items-center gap-1.5">
                <span>{seg.labelKo}</span>
                <span
                  className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-slate-200 text-slate-500 text-[10px] font-bold cursor-help"
                  title={segmentTooltip(seg.id, isKo)}
                >
                  ?
                </span>
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
          {isKo ? "국가별 점수 (평균)" : "Per-country mean score"}
        </h2>
        <div className="card p-4">
          <CountryScoreChart
            data={countryStats.map((c) => ({
              country: c.country,
              mean: c.finalScore.mean,
              min: c.finalScore.min,
              max: c.finalScore.max,
            }))}
          />
        </div>
      </div>

      <div>
        <h2 className="text-base font-semibold text-slate-900 mb-3">
          {isKo ? "국가별 점수 분포 (전체 통계)" : "Per-country full statistics"}
        </h2>
        <p className="text-xs text-slate-500 mb-2">
          {isKo
            ? "행을 클릭하면 선정 사유 · 페르소나 요약 · 거부 요인을 펼칠 수 있습니다."
            : "Click a row to expand rationale, persona summary, and objections."}
        </p>
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="w-8 px-3 py-2" />
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
              {countryStats.map((c) => {
                const isOpen = expandedCountry === c.country;
                const hasDetail = !!c.detail;
                return (
                  <Fragment key={c.country}>
                    <tr
                      className={clsx(
                        "transition-colors",
                        hasDetail ? "cursor-pointer hover:bg-slate-50" : "",
                      )}
                      onClick={() => hasDetail && setExpandedCountry(isOpen ? null : c.country)}
                    >
                      <td className="px-3 py-2 text-slate-400">
                        {hasDetail && (
                          <ChevronRight
                            size={14}
                            className={clsx("transition-transform", isOpen && "rotate-90")}
                          />
                        )}
                      </td>
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
                    {isOpen && c.detail && (
                      <tr className="bg-slate-50/50">
                        <td colSpan={9} className="px-8 py-5">
                          <CountryDrilldown
                            detail={c.detail}
                            rationaleSamples={c.detail.rationaleSamples}
                            sources={sources}
                            isKo={isKo}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function CountryDrilldown({
  detail,
  rationaleSamples,
  sources,
  isKo,
}: {
  detail: NonNullable<EnsembleAggregate["countryStats"][number]["detail"]>;
  rationaleSamples: string[];
  sources: string[];
  isKo: boolean;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2 space-y-4">
        {rationaleSamples.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">
              {isKo
                ? `선정 사유 (시뮬 샘플 ${rationaleSamples.length}건)`
                : `Selection rationale (${rationaleSamples.length} sim samples)`}
            </div>
            <ul className="space-y-2">
              {rationaleSamples.map((r, i) => (
                <li
                  key={i}
                  className="text-sm text-slate-700 leading-relaxed border-l-2 border-slate-200 pl-3 whitespace-pre-wrap"
                >
                  {r}
                </li>
              ))}
            </ul>
          </div>
        )}
        {detail.topObjections.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-2">
              {isKo ? "공통 거부 요인 TOP 5" : "Top objections"}
            </div>
            <ul className="space-y-1.5 text-sm">
              {detail.topObjections.map((o) => (
                <li key={o.text} className="flex items-start gap-2">
                  <span className="badge bg-slate-100 text-slate-600 shrink-0 tabular-nums">{o.count}</span>
                  <span className="text-slate-700">{o.text}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <div className="space-y-4">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-2">
            {isKo ? "이 국가 페르소나 요약" : "Persona summary"}
          </div>
          {detail.persona.count === 0 ? (
            <p className="text-xs text-slate-500">
              {isKo ? "이 국가의 페르소나 데이터 없음." : "No personas for this country."}
            </p>
          ) : (
            <ul className="space-y-1 text-sm tabular-nums">
              <li className="flex justify-between">
                <span className="text-slate-500">{isKo ? "페르소나 수" : "Personas"}</span>
                <span className="text-slate-900">{detail.persona.count.toLocaleString()}</span>
              </li>
              <li className="flex justify-between">
                <span className="text-slate-500">{isKo ? "평균 구매의향" : "Mean intent"}</span>
                <span className="text-slate-900">{detail.persona.meanIntent}/100</span>
              </li>
              <li className="flex justify-between">
                <span className="text-slate-500">{isKo ? "고의향 (≥70)" : "High (≥70)"}</span>
                <span className="text-success">{detail.persona.highIntent}</span>
              </li>
              <li className="flex justify-between">
                <span className="text-slate-500">{isKo ? "저의향 (<35)" : "Low (<35)"}</span>
                <span className="text-risk">{detail.persona.lowIntent}</span>
              </li>
            </ul>
          )}
        </div>
        {sources.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">
              {isKo ? "통계 근거" : "Data sources"}
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">{sources.join(" · ")}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function PersonasTab({
  personas,
  isKo,
  locale,
  ensembleId,
}: {
  personas: EnsembleAggregate["personas"];
  isKo: boolean;
  locale: string;
  ensembleId: string;
}) {
  void locale;
  const [showAll, setShowAll] = useState(false);
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
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-base font-semibold text-slate-900">
          {isKo
            ? `페르소나 통계 (총 ${personas.total.toLocaleString()}명)`
            : `Persona statistics (${personas.total.toLocaleString()} total)`}
        </h2>
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="btn-primary text-sm"
        >
          {isKo
            ? `모든 페르소나 보기 (${personas.total.toLocaleString()}명)`
            : `View all ${personas.total.toLocaleString()} personas`}
        </button>
      </div>

      {showAll && (
        <AllPersonasModal
          ensembleId={ensembleId}
          totalKnown={personas.total}
          isKo={isKo}
          onClose={() => setShowAll(false)}
          countries={personas.byCountry.map((c) => c.country)}
        />
      )}

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
          <IntentHistogramChart data={personas.intentHistogram} />
        </div>
      </div>

      <div>
        <h2 className="text-base font-semibold text-slate-900 mb-3">
          {isKo ? "국가별 평균 구매의향" : "Per-country mean intent"}
        </h2>
        <div className="card p-4">
          <CountryIntentChart data={personas.byCountry} />
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
            {isKo ? "직업 분포 (Top 12)" : "Top professions"}
          </h3>
          <div className="card p-4 space-y-1">
            {personas.professionTopN.length === 0 ? (
              <div className="text-xs text-slate-400">—</div>
            ) : (
              personas.professionTopN.map((o) => (
                <div key={o.profession} className="flex items-center justify-between text-xs">
                  <div className="text-slate-700 truncate">{o.profession}</div>
                  <div className="text-slate-500 tabular-nums shrink-0 ml-2">{o.count}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Channel / brand mentions extracted from persona free-text
          (voice + trustFactors + objections). High-mention + high-intent
          channels are the existing touchpoints worth prioritising. */}
      {personas.channelMentions && personas.channelMentions.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-slate-900 mb-2">
            {isKo ? "채널·브랜드 언급" : "Channel / brand mentions"}
          </h3>
          <div className="card p-4">
            <p className="text-xs text-slate-500 mb-3 leading-relaxed">
              {isKo
                ? "페르소나가 신뢰 요인 / 거부 요인 / 코멘트에서 직접 언급한 채널입니다. 언급량과 평균 구매의향을 같이 보면 \"이미 잠재 고객이 있는 채널\"이 보입니다."
                : "Channels personas mention in their voice / trust / objections. Mentions × intent surfaces existing-touchpoint priorities."}
            </p>
            <table className="w-full text-xs">
              <thead className="text-slate-500">
                <tr>
                  <th className="text-left py-1 pr-2 font-medium">{isKo ? "채널" : "Channel"}</th>
                  <th className="text-right py-1 px-1 font-medium">{isKo ? "언급" : "Mentions"}</th>
                  <th className="text-right py-1 px-1 font-medium">{isKo ? "비중" : "Share"}</th>
                  <th className="text-right py-1 pl-2 font-medium">{isKo ? "평균 의향" : "Mean intent"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {personas.channelMentions.map((c) => (
                  <tr key={c.channel}>
                    <td className="py-1.5 pr-2 text-slate-800 font-medium">{c.channel}</td>
                    <td className="py-1.5 px-1 text-right tabular-nums text-slate-700">
                      {c.mentions.toLocaleString()}
                    </td>
                    <td className="py-1.5 px-1 text-right tabular-nums text-slate-500">{c.share}%</td>
                    <td
                      className={clsx(
                        "py-1.5 pl-2 text-right tabular-nums font-semibold",
                        c.meanIntent >= 70
                          ? "text-success"
                          : c.meanIntent < 35
                            ? "text-warn"
                            : "text-slate-700",
                      )}
                    >
                      {c.meanIntent}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Segment intent breakdown — gender / age / income cuts. Each
          row buckets personas by that demographic and shows mean intent
          + which country members of that bucket most often picked.
          Buckets with <10 personas are dropped server-side so the means
          stay actionable. */}
      {personas.segmentBreakdown &&
        (personas.segmentBreakdown.byGender.length > 0 ||
          personas.segmentBreakdown.byAge.length > 0 ||
          personas.segmentBreakdown.byIncome.length > 0) && (
          <div>
            <h3 className="text-sm font-semibold text-slate-900 mb-2">
              {isKo ? "세그먼트별 구매의향 (10명 이상 그룹만)" : "Intent by segment (groups ≥10 only)"}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <SegmentTable
                title={isKo ? "성별" : "Gender"}
                rows={personas.segmentBreakdown.byGender}
                isKo={isKo}
              />
              <SegmentTable
                title={isKo ? "연령" : "Age"}
                rows={personas.segmentBreakdown.byAge}
                isKo={isKo}
              />
              <SegmentTable
                title={isKo ? "소득" : "Income"}
                rows={personas.segmentBreakdown.byIncome}
                isKo={isKo}
              />
            </div>
            <SegmentGuide isKo={isKo} />
          </div>
        )}
    </div>
  );
}

/**
 * Collapsible reading-guide for the segment intent breakdown. Lives
 * directly under the gender/age/income grid because new users routinely
 * misread "1순위 시장" as "the country this segment most wants to buy
 * in" — actually it's "the country this segment is most concentrated
 * in" (persona's own home market, not a preference). Keep it closed by
 * default so the dashboard doesn't get long, but make the open state
 * comprehensive enough to settle interpretation questions on the spot.
 */
function SegmentGuide({ isKo }: { isKo: boolean }) {
  return (
    <details className="mt-3 group">
      <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-700 inline-flex items-center gap-1 select-none">
        <ChevronRight size={12} className="transition-transform group-open:rotate-90" />
        <span>{isKo ? "이 표 어떻게 읽나요?" : "How to read this table"}</span>
      </summary>
      <div className="mt-3 rounded-md border border-slate-200 bg-slate-50/60 p-4 text-xs text-slate-700 leading-relaxed space-y-4">
        <section>
          <div className="font-semibold text-slate-900 mb-1">
            {isKo ? "공통 정의" : "Common definitions"}
          </div>
          <ul className="list-disc pl-5 space-y-0.5">
            {isKo ? (
              <>
                <li>대상: 이번 앙상블에 등장한 페르소나 전체</li>
                <li>버킷팅 — 성별: female / male / other 정규화</li>
                <li>버킷팅 — 연령: 20-29 / 30-39 / 40-49 / 50-59 / 60+ (범위는 중간값 기준)</li>
                <li>버킷팅 — 소득: USD 환산 후 &lt;$30k / $30-60k / $60-100k / $100-150k / $150k+</li>
                <li>10명 미만 그룹은 제외 (means 노이즈가 커서)</li>
              </>
            ) : (
              <>
                <li>Scope: every persona in this ensemble</li>
                <li>Gender bucketing: normalised to female / male / other</li>
                <li>Age bucketing: 20-29 / 30-39 / 40-49 / 50-59 / 60+ (range midpoint)</li>
                <li>Income bucketing: USD-normalised &lt;$30k / $30-60k / $60-100k / $100-150k / $150k+</li>
                <li>Buckets with &lt;10 personas are dropped (means too noisy)</li>
              </>
            )}
          </ul>
        </section>

        <section>
          <div className="font-semibold text-slate-900 mb-1">
            {isKo ? "컬럼 의미" : "What each column means"}
          </div>
          <ul className="list-disc pl-5 space-y-0.5">
            {isKo ? (
              <>
                <li><span className="font-medium">그룹</span> — 위 정규화 결과 라벨</li>
                <li><span className="font-medium">n</span> — 이 세그먼트에 속한 페르소나 수</li>
                <li><span className="font-medium">평균</span> — 이 세그먼트의 평균 구매의향 (0-100). 70 이상 강한 관심, 35 미만 약한 관심</li>
                <li><span className="font-medium">1순위 시장</span> — 이 세그먼트가 <span className="font-semibold text-slate-900">가장 많이 분포한 모집단 국가</span> + 해당 비중. 즉 "이 세그먼트의 페르소나 중 X%가 그 국가 출신"</li>
              </>
            ) : (
              <>
                <li><span className="font-medium">Bucket</span> — normalised label</li>
                <li><span className="font-medium">n</span> — persona count in this segment</li>
                <li><span className="font-medium">Mean</span> — average purchase intent (0-100). ≥70 strong, &lt;35 weak</li>
                <li><span className="font-medium">Top market</span> — the <span className="font-semibold text-slate-900">home country</span> where this segment is most concentrated, with that share %</li>
              </>
            )}
          </ul>
        </section>

        <section>
          <div className="font-semibold text-slate-900 mb-1">
            {isKo ? "자주 오해하는 포인트" : "Common misreadings"}
          </div>
          <ol className="list-decimal pl-5 space-y-1">
            {isKo ? (
              <>
                <li>
                  <span className="font-medium">"1순위 시장" ≠ "이 세그먼트가 사고 싶은 1위 국가"</span>
                  <br />페르소나의 country 필드는 거주국 / 모집단입니다. 즉 "30-39대 페르소나가 가장 많이 발생한 국가"이지 "30-39대가 사고 싶어하는 1위 시장"이 아닙니다.
                </li>
                <li>
                  <span className="font-medium">n 비율 ≠ 모집단 인구통계</span>
                  <br />페르소나 분포는 LLM이 시뮬마다 어떻게 배치했느냐의 결과지, 실제 시장 인구비를 반영하지 않습니다.
                </li>
                <li>
                  <span className="font-medium">평균 구매의향 비교 — n이 작으면 신뢰도 낮음</span>
                  <br />n이 20 이하인 행은 큰 결론 내리지 마세요.
                </li>
                <li>
                  <span className="font-medium">세그먼트 표 = 상관 신호, 인과 분석 아님</span>
                  <br />"남성 의향이 높음"이 성별 자체의 효과인지 남성 페르소나 풀에 친화적 직군이 더 많이 배치된 결과인지 구분하지 않습니다.
                </li>
              </>
            ) : (
              <>
                <li>
                  <span className="font-medium">"Top market" is NOT "preferred country"</span>
                  <br />A persona&apos;s country field is their home market, not a preference. So "Top market: TH" means "30-39 personas are most concentrated in Thailand", not "30-39 most want to buy in Thailand".
                </li>
                <li>
                  <span className="font-medium">n share ≠ real population mix</span>
                  <br />Persona distribution reflects how the LLM allocated rows per sim, not real demographics.
                </li>
                <li>
                  <span className="font-medium">Don&apos;t over-read low-n means</span>
                  <br />Rows with n ≤ 20 carry low confidence — treat as directional only.
                </li>
                <li>
                  <span className="font-medium">Correlation, not causation</span>
                  <br />Higher male intent might be the gender effect — or it might be that male personas in this run skewed toward food-creator / spice-curious professions.
                </li>
              </>
            )}
          </ol>
        </section>

        <section>
          <div className="font-semibold text-slate-900 mb-1">
            {isKo ? "의사결정에 쓰는 법" : "How to use this for decisions"}
          </div>
          <ul className="list-disc pl-5 space-y-0.5">
            {isKo ? (
              <>
                <li>
                  <span className="font-medium">광고 타기팅</span> — 평균 의향이 높고 n도 충분한 그룹 (예: 30-39대 + $30-60k) 우선.
                </li>
                <li>
                  <span className="font-medium">시장 진출 우선순위</span> — 1순위 시장 비중이 한 국가에 집중된 그룹 (예: $60-100k → US 72%)은 그 국가에서 그 세그먼트를 핀포인트.
                </li>
                <li>
                  <span className="font-medium">광고 제외 후보</span> — 평균 의향 &lt; 35점이고 n ≥ 50인 그룹은 예산 낭비 가능성 높음.
                </li>
              </>
            ) : (
              <>
                <li>
                  <span className="font-medium">Ad targeting</span> — Prioritise segments with high mean intent AND meaningful n (e.g., 30-39 + $30-60k).
                </li>
                <li>
                  <span className="font-medium">Market entry sequence</span> — Segments concentrated in one country (e.g., $60-100k → US 72%) are easy to pinpoint in that market.
                </li>
                <li>
                  <span className="font-medium">Suppression candidates</span> — Segments with mean &lt; 35 and n ≥ 50 are likely wasted spend.
                </li>
              </>
            )}
          </ul>
        </section>
      </div>
    </details>
  );
}

function SegmentTable({
  title,
  rows,
  isKo,
}: {
  title: string;
  rows: NonNullable<NonNullable<EnsembleAggregate["personas"]>["segmentBreakdown"]>["byGender"];
  isKo: boolean;
}) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
        {title}
      </div>
      <div className="card p-3">
        {rows.length === 0 ? (
          <div className="text-xs text-slate-400 text-center py-2">—</div>
        ) : (
          <table className="w-full text-xs">
            <thead className="text-slate-500">
              <tr>
                <th className="text-left py-1 pr-2 font-medium">{isKo ? "그룹" : "Bucket"}</th>
                <th className="text-right py-1 px-1 font-medium">n</th>
                <th className="text-right py-1 px-1 font-medium">{isKo ? "평균" : "Mean"}</th>
                <th className="text-left py-1 pl-2 font-medium">{isKo ? "1순위 시장" : "Top market"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.bucket}>
                  <td className="py-1.5 pr-2 text-slate-800 truncate max-w-[100px]" title={r.bucket}>
                    {r.bucket}
                  </td>
                  <td className="py-1.5 px-1 text-right tabular-nums text-slate-600">{r.count}</td>
                  <td className="py-1.5 px-1 text-right tabular-nums font-semibold text-slate-900">
                    {r.meanIntent}%
                  </td>
                  <td className="py-1.5 pl-2 text-slate-700">
                    <span className="font-medium">{r.topCountry}</span>
                    <span className="text-slate-400 text-[10px] ml-1">{r.topCountryShare}%</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

interface PersonaApiRow {
  simIndex: number;
  name?: string;
  ageRange?: string;
  gender?: string;
  country: string;
  profession?: string;
  incomeBand?: string;
  purchaseIntent: number;
  voice?: string;
  trustFactors?: string[];
  objections?: string[];
}

/**
 * Full-page-ish modal that paginates through every persona generated by
 * every sim in this ensemble. We don't ship the full set with the result
 * payload (10K+ rows × ~500 bytes = MB-sized), so the modal lazy-fetches
 * pages as the user navigates. Filters live entirely server-side so the
 * page count and sort order stay accurate without re-tallying client-side.
 */
function AllPersonasModal({
  ensembleId,
  totalKnown,
  isKo,
  onClose,
  countries,
}: {
  ensembleId: string;
  totalKnown: number;
  isKo: boolean;
  onClose: () => void;
  countries: string[];
}) {
  const [page, setPage] = useState(0);
  const [country, setCountry] = useState<string>("");
  const [intentFilter, setIntentFilter] = useState<"all" | "high" | "low">("all");
  const [data, setData] = useState<{
    page: number;
    perPage: number;
    total: number;
    pageCount: number;
    personas: PersonaApiRow[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({
      page: String(page),
      perPage: "50",
    });
    if (country) params.set("country", country);
    if (intentFilter === "high") params.set("minIntent", "70");
    if (intentFilter === "low") params.set("maxIntent", "34");
    fetch(`/api/ensembles/${ensembleId}/personas?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(await friendlyApiError(res, isKo ? "ko" : "en"));
        return res.json();
      })
      .then((d) => {
        if (active) setData(d);
      })
      .catch((err) => {
        if (active) setError(friendlyClientError(err, isKo ? "ko" : "en"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [ensembleId, page, country, intentFilter]);

  // Reset to page 0 when filters change so we don't sit on an out-of-range
  // page after the result count shrinks.
  const resetAndSet = <T,>(setter: (v: T) => void, value: T) => {
    setter(value);
    setPage(0);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-[96vw] w-full max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline justify-between p-5 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              {isKo ? "모든 페르소나" : "All personas"}
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              {isKo
                ? `이 앙상블에 포함된 모든 페르소나 (예상 ${totalKnown.toLocaleString()}명, 구매의향 내림차순 정렬)`
                : `Every persona across all sims in this ensemble (~${totalKnown.toLocaleString()}, sorted by intent desc)`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 text-2xl leading-none"
            aria-label="close"
          >
            ×
          </button>
        </div>

        <div className="px-5 py-3 border-b border-slate-100 flex flex-wrap items-center gap-3 bg-slate-50">
          <select
            className="input text-sm py-1"
            value={country}
            onChange={(e) => resetAndSet(setCountry, e.target.value)}
          >
            <option value="">{isKo ? "모든 국가" : "All countries"}</option>
            {countries.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            className="input text-sm py-1"
            value={intentFilter}
            onChange={(e) => resetAndSet(setIntentFilter, e.target.value as "all" | "high" | "low")}
          >
            <option value="all">{isKo ? "구매의향 전체" : "All intent levels"}</option>
            <option value="high">{isKo ? "강한 관심 (≥70)" : "High intent (≥70)"}</option>
            <option value="low">{isKo ? "약한 관심 (<35)" : "Low intent (<35)"}</option>
          </select>
          {data && (
            <span className="text-xs text-slate-500 ml-auto">
              {isKo
                ? `${data.total.toLocaleString()}명 일치 · 페이지 ${data.page + 1} / ${data.pageCount}`
                : `${data.total.toLocaleString()} matches · page ${data.page + 1} of ${data.pageCount}`}
            </span>
          )}
        </div>

        <div className="flex-1 overflow-auto">
          {loading && (
            <div className="p-12 text-center text-slate-500">
              <Loader2 className="animate-spin mx-auto" size={20} />
            </div>
          )}
          {error && (
            <div className="p-6 text-sm text-risk">
              {isKo ? `오류: ${error}` : `Error: ${error}`}
            </div>
          )}
          {!loading && !error && data && data.personas.length === 0 && (
            <div className="p-12 text-center text-slate-400 text-sm">
              {isKo ? "해당 조건의 페르소나가 없습니다." : "No personas match these filters."}
            </div>
          )}
          {!loading && !error && data && data.personas.length > 0 && (
            <table className="w-full text-sm table-fixed">
              <colgroup>
                {/* Narrow demographic columns up front, voice eats the
                    remaining width so quotes are readable without
                    truncation. table-fixed locks these widths so a long
                    profession string can't shove voice off-screen. */}
                <col className="w-[120px]" />
                <col className="w-[60px]" />
                <col className="w-[70px]" />
                <col className="w-[70px]" />
                <col className="w-[160px]" />
                <col className="w-[180px]" />
                <col className="w-[70px]" />
                <col />
              </colgroup>
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 sticky top-0">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">{isKo ? "이름" : "Name"}</th>
                  <th className="text-left px-4 py-2 font-medium">{isKo ? "국가" : "Country"}</th>
                  <th className="text-left px-4 py-2 font-medium">{isKo ? "나이" : "Age"}</th>
                  <th className="text-left px-4 py-2 font-medium">{isKo ? "성별" : "Gender"}</th>
                  <th className="text-left px-4 py-2 font-medium">{isKo ? "직업" : "Profession"}</th>
                  <th className="text-left px-4 py-2 font-medium">{isKo ? "소득" : "Income"}</th>
                  <th className="text-right px-4 py-2 font-medium">{isKo ? "의향" : "Intent"}</th>
                  <th className="text-left px-4 py-2 font-medium">{isKo ? "코멘트" : "Voice"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.personas.map((p, i) => (
                  <tr key={i} className="hover:bg-slate-50 align-top">
                    <td
                      className="px-4 py-2 text-slate-900 font-medium truncate"
                      title={p.name ?? ""}
                    >
                      {p.name ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-slate-700">{p.country}</td>
                    <td className="px-4 py-2 text-slate-600 whitespace-nowrap">
                      {p.ageRange ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-slate-600">{p.gender ?? "—"}</td>
                    <td
                      className="px-4 py-2 text-slate-600 truncate"
                      title={p.profession ?? ""}
                    >
                      {p.profession ?? "—"}
                    </td>
                    <td
                      className="px-4 py-2 text-slate-600 truncate text-xs"
                      title={p.incomeBand ?? ""}
                    >
                      {p.incomeBand ?? "—"}
                    </td>
                    <td
                      className={clsx(
                        "px-4 py-2 text-right tabular-nums font-semibold",
                        p.purchaseIntent >= 70
                          ? "text-success"
                          : p.purchaseIntent < 35
                            ? "text-warn"
                            : "text-slate-700",
                      )}
                    >
                      {p.purchaseIntent}%
                    </td>
                    <td className="px-4 py-2 text-slate-700 text-sm leading-relaxed">
                      {p.voice ? `"${p.voice}"` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {data && data.pageCount > 1 && (
          <div className="border-t border-slate-100 p-3 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0 || loading}
              className="btn-ghost text-sm disabled:opacity-40"
            >
              {isKo ? "← 이전" : "← Previous"}
            </button>
            <span className="text-xs text-slate-500">
              {page + 1} / {data.pageCount}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(data.pageCount - 1, p + 1))}
              disabled={page >= data.pageCount - 1 || loading}
              className="btn-ghost text-sm disabled:opacity-40"
            >
              {isKo ? "다음 →" : "Next →"}
            </button>
          </div>
        )}
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
                {v.profession && (
                  <>
                    <span>·</span>
                    <span className="truncate">{v.profession}</span>
                  </>
                )}
                {v.ageRange && (
                  <>
                    <span>·</span>
                    <span>{v.ageRange}</span>
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

  // Best-conversion price point — surface separately from the median so
  // the user sees both "consensus recommended" and "highest-converting"
  // and can spot when those diverge (e.g. a price below recommended
  // converts more but margin pressure forces the higher anchor).
  const peakPoint = pricing.curve.reduce<typeof pricing.curve[number] | null>(
    (best, p) => (best === null || p.meanConversionProbability > best.meanConversionProbability ? p : best),
    null,
  );

  return (
    <div className="space-y-6">
      {/* Hero: recommended price + range + margin in one row. Compact
          single-row card so the pricing tab opens with the headline answer
          immediately visible — no large dead vertical space. */}
      <div className="card p-5 bg-gradient-to-br from-brand-50/40 to-white border-brand/20">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">
              {isKo ? "권장 가격 (시뮬 합산 중앙값)" : "Recommended price (median across sims)"}
            </div>
            <div className="flex items-baseline gap-3 flex-wrap">
              <div className="text-4xl font-bold text-brand tabular-nums leading-none">
                {fmt(pricing.recommendedPriceCents)}
              </div>
              <div className="text-sm text-slate-500">
                {isKo
                  ? `중간 50%: ${fmt(pricing.recommendedPriceP25)} – ${fmt(pricing.recommendedPriceP75)}`
                  : `Mid-50%: ${fmt(pricing.recommendedPriceP25)} – ${fmt(pricing.recommendedPriceP75)}`}
              </div>
            </div>
          </div>
          {peakPoint && (
            <div className="rounded-lg bg-white border border-slate-200 px-4 py-3 shrink-0 min-w-[140px]">
              <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-0.5">
                {isKo ? "최고 전환 가격" : "Peak conversion"}
              </div>
              <div className="text-base font-semibold text-slate-900 tabular-nums">
                {fmt(peakPoint.priceCents)}
              </div>
              <div className="text-[10px] text-slate-400">
                {(peakPoint.meanConversionProbability * 100).toFixed(1)}%
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Margin narrative — separate row because the LLM often returns a
          multi-sentence rationale here, which would overflow the hero
          metric strip and make the card unreadable. */}
      {pricing.marginEstimate && pricing.marginEstimate !== "—" && (
        <div className="card p-5">
          <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">
            {isKo ? "예상 마진 분석" : "Margin analysis"}
          </div>
          <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap break-words">
            {pricing.marginEstimate}
          </p>
        </div>
      )}

      <div>
        <h2 className="text-base font-semibold text-slate-900 mb-3">
          {isKo ? "가격–전환 곡선" : "Price–conversion curve"}
        </h2>
        <div className="card p-4">
          <PricingCurveChart data={pricing.curve} />
          <p className="text-xs text-slate-500 mt-3 leading-relaxed">
            {isKo
              ? "각 가격대에서 모든 시뮬의 평균 전환 확률입니다. 곡선의 정점이 가장 많은 페르소나가 구매로 이어진 지점이며, 곡선이 완만하면 가격 민감도가 낮음을 의미합니다."
              : "Mean conversion probability at each price point across every sim. The peak shows where the most personas convert; a flat curve means low price sensitivity."}
          </p>
        </div>
      </div>

      <details className="card p-4">
        <summary className="text-sm text-slate-600 cursor-pointer hover:text-slate-800 font-medium">
          {isKo
            ? "원본 가격 포인트 데이터 보기"
            : "View raw price-point data"}
        </summary>
        <div className="mt-3 space-y-1.5">
          {pricing.curve.map((p) => (
            <div key={p.priceCents} className="flex items-center gap-3 text-xs">
              <div className="w-16 tabular-nums text-slate-700 font-medium">
                {fmt(p.priceCents)}
              </div>
              <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand/70"
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
      </details>
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
  const exportTypes: Array<{ type: string; label: string }> = [
    { type: "countries", label: isKo ? "국가별 점수" : "Country scores" },
    { type: "risks", label: isKo ? "통합 리스크" : "Merged risks" },
    { type: "actions", label: isKo ? "권장 액션" : "Recommended actions" },
    { type: "personas", label: isKo ? "페르소나 (전체)" : "All personas" },
  ];
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-slate-900 mb-3">
          {isKo ? "데이터 내보내기 (CSV)" : "Data export (CSV)"}
        </h2>
        <div className="card p-4">
          <p className="text-xs text-slate-500 mb-3 leading-relaxed">
            {isKo
              ? "Excel · Google Sheets · Notion에서 바로 열 수 있는 UTF-8 CSV로 다운로드합니다. 한글 표시는 BOM이 자동 포함되어 있습니다."
              : "Downloads as UTF-8 CSV (BOM included) — opens directly in Excel / Google Sheets / Notion."}
          </p>
          <div className="flex flex-wrap gap-2">
            {exportTypes.map((e) => (
              <a
                key={e.type}
                href={`/api/ensembles/${ensembleId}/export?type=${e.type}&locale=${locale}`}
                className="text-xs px-3 py-1.5 rounded-md border border-slate-200 hover:border-brand hover:text-brand text-slate-700 transition-colors"
              >
                {e.label} ↓
              </a>
            ))}
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-base font-semibold text-slate-900 mb-3">
          {isKo ? "분석 메타데이터" : "Analysis metadata"}
        </h2>
        <div className="card divide-y divide-slate-100 text-sm">
          <MetaRow
            label="Tier"
            value={tierBadgeLabel(tier, isKo)}
            tooltip={
              isKo
                ? "분석의 깊이 등급. 초기검증(1 시뮬) → 검증분석(5) → 검증분석+(15) → 심층분석(25, 멀티 LLM) → 심층분석 Pro(50, 멀티 LLM)."
                : "Analysis depth. Hypothesis(1) → Decision(5) → Decision+(15) → Deep(25, multi-LLM) → Deep Pro(50, multi-LLM)."
            }
          />
          <MetaRow
            label={isKo ? "병렬 시뮬" : "Parallel sims"}
            value={String(parallelSims)}
            tooltip={
              isKo
                ? "동시에 실행한 독립 시뮬 수. 시뮬마다 다른 페르소나 샘플을 사용해 합의도와 변동성을 측정합니다."
                : "Number of independent simulations run in parallel. Each uses a different persona sample to measure consensus + variance."
            }
          />
          <MetaRow
            label={isKo ? "유효 페르소나" : "Effective personas"}
            value={effectivePersonas.toLocaleString()}
            tooltip={
              isKo
                ? "모든 시뮬에 걸쳐 생성된 총 페르소나 수. 통계적 신뢰도의 직접 척도."
                : "Total personas generated across every sim. Direct measure of statistical confidence."
            }
          />
          <MetaRow
            label={isKo ? "LLM 라인업" : "LLM providers"}
            value={llmProviders.map(providerLabel).join(", ")}
            tooltip={
              isKo
                ? "분석에 참여한 AI 모델. 심층분석 이상은 여러 모델을 번갈아 활용해 단일 모델 편향을 줄입니다."
                : "AI models that produced this analysis. Deep tiers round-robin across providers to dampen single-model bias."
            }
          />
          <MetaRow
            label={isKo ? "앙상블 ID" : "Ensemble ID"}
            value={ensembleId}
            tooltip={
              isKo
                ? "이 분석의 고유 식별자. 지원 문의나 API 호출 시 참조하세요."
                : "Unique identifier for this analysis. Reference when contacting support or calling the API."
            }
          />
          <MetaRow
            label={isKo ? "로케일" : "Locale"}
            value={locale}
            tooltip={
              isKo
                ? "분석에 사용된 언어. 페르소나 voice / 리스크 / 액션 모두 이 언어로 생성됩니다."
                : "Language used throughout the analysis (persona voices, risks, actions all in this locale)."
            }
          />
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
            tooltip={
              isKo
                ? "한 국가 점수가 시뮬마다 얼마나 다르게 나왔는지의 최대 차이. 30점 이상이면 단일 시뮬은 신뢰하기 어렵습니다."
                : "Largest spread of a single country's score across sims. >30 means a lone sim is unreliable."
            }
          />
          <MetaRow
            label={isKo ? "평균 변동" : "Mean range"}
            value={`${varianceAssessment.meanFinalScoreRange}pt`}
            tooltip={
              isKo
                ? "모든 국가의 점수 변동을 평균한 값. 전반적인 시뮬 안정성을 보여줍니다."
                : "Average of every country's score range. A general read on sim-to-sim stability."
            }
          />
          <MetaRow
            label={isKo ? "변동성 등급" : "Variance label"}
            value={varianceAssessment.label.toUpperCase()}
            tooltip={
              isKo
                ? "LOW(낮음)·MODERATE(보통)·HIGH(높음). HIGH면 단일 시뮬 결과는 노이즈에 휩쓸릴 수 있으니 앙상블 합의도를 더 무겁게 보세요."
                : "LOW · MODERATE · HIGH. HIGH means a single sim could be noisy — trust the ensemble consensus more heavily."
            }
          />
          <MetaRow
            label={isKo ? "분석 국가 수" : "Markets analyzed"}
            value={String(countryStats.length)}
            tooltip={
              isKo
                ? "최종 점수가 산출된 후보 진출국 수. 규제 단계에서 차단된 국가는 여기서 제외됩니다."
                : "Candidate markets that received a final score. Regulatory-blocked countries are excluded here."
            }
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

function MetaRow({
  label,
  value,
  tooltip,
}: {
  label: string;
  value: string;
  tooltip?: string;
}) {
  return (
    <div className="flex items-center justify-between p-3 gap-3">
      <div className="text-slate-500 flex items-center gap-1.5 min-w-0">
        <span>{label}</span>
        {tooltip && (
          <span
            className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-slate-200 text-slate-500 text-[10px] font-bold cursor-help shrink-0"
            title={tooltip}
          >
            ?
          </span>
        )}
      </div>
      <div className="text-slate-900 font-medium font-mono text-xs text-right break-all">
        {value}
      </div>
    </div>
  );
}

/**
 * Plain-language explanation for each strategy segment shown on the
 * Countries tab. Surfaced on hover as a (?) tooltip — these labels are
 * dense enough that "수요 우선" alone doesn't tell a non-analyst why
 * they should consider that market.
 */
function segmentTooltip(id: string, isKo: boolean): string {
  if (isKo) {
    switch (id) {
      case "volume":
        return "수요 점수가 가장 높은 시장. 매출을 빨리 확대하고 싶거나 인지도부터 쌓으려는 경우에 추천합니다.";
      case "cac":
        return "고객 1명을 데려오는 비용(CAC)이 가장 낮은 시장. 마케팅 예산이 제한적일 때 효율을 우선시하는 선택지입니다.";
      case "competition":
        return "경쟁 강도가 가장 약한 시장. 정착이 쉽고 점유율을 빨리 가져갈 수 있지만 시장 자체가 작을 수도 있습니다.";
      case "overall":
        return "수요 / 경쟁 / 비용을 가중평균한 종합 점수가 가장 높은 시장. 균형 잡힌 의사결정이 필요할 때 1순위 후보입니다.";
      default:
        return "";
    }
  }
  switch (id) {
    case "volume":
      return "Highest demand score — best for fast revenue growth or brand-building entries.";
    case "cac":
      return "Lowest customer-acquisition cost — favor this when the marketing budget is tight.";
    case "competition":
      return "Lowest competitive density — easier to land in, though the market itself may be smaller.";
    case "overall":
      return "Highest weighted score (demand × competition × cost). The balanced default pick.";
    default:
      return "";
  }
}

// Format seconds as H:MM:SS (drop the H block if zero) — used by the
// progress modal so the user always has a "this has been running for X"
// signal alongside the percentage.
function formatElapsedHMS(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const mm = m.toString().padStart(2, "0");
  const ss = s.toString().padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
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

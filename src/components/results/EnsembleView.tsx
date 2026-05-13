"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, CheckCircle2, AlertCircle, TrendingUp, Download, ChevronRight, HelpCircle, Lightbulb, MessageCircle, Send, X, RefreshCw, Gift } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { clsx } from "clsx";
import type { EnsembleAggregate } from "@/lib/simulation/ensemble";
import { categoryLabel } from "@/lib/simulation/taxonomy";
import { friendlyApiError, friendlyClientError } from "@/lib/api/error-message";
import { formatPrice } from "@/lib/format/price";
import { normalizeLLMText } from "@/lib/format/normalize";
import {
  buildObjectionRows,
  demoteDominantClusters,
  isBareAdjectiveSignal,
  isFactuallyWrongCompetitorPriceClaim,
  isGenericLaunchConcern,
  isGenericPriceObjection,
  isGenericTrustFactor,
} from "@/lib/simulation/surfaced-recount";
import {
  computePricingSensitivity,
  computeCurveRevenueMaxCents,
  getDisplayPriceCents,
} from "@/lib/simulation/pricing-sensitivity";
import { analyzeIncomeIntent } from "@/lib/simulation/segment-analysis";
import {
  COMPONENT_LABEL,
  COMPONENT_STRESS_SCENARIOS,
  flipThresholdPt,
  type ComponentKey,
} from "@/lib/decision-aid/stress-scenarios";
import { BackToTop } from "@/components/ui/BackToTop";
import { HelpModal } from "@/components/ui/HelpModal";
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
  /** Resolved competitor list — user-named + LLM-discovered, with
   *  per-entry source attribution. Empty for legacy projects created
   *  before the resolver shipped. */
  competitors_resolved?: Array<{
    name: string;
    url: string;
    source: "user" | "llm";
    reason?: string;
  }> | null;
  /** Verbatim names the user typed in the wizard. */
  competitor_names_user?: string[] | null;
}

interface EnsembleResult {
  id: string;
  project_id?: string;
  tier: string;
  parallel_sims: number;
  per_sim_personas: number;
  llm_providers: string[];
  aggregate: EnsembleAggregate;
  created_at?: string;
  completed_at?: string | null;
  project?: ProjectInfo | null;
  is_free_rerun?: boolean;
  parent_ensemble_id?: string | null;
  child_rerun_id?: string | null;
}

/**
 * Help content for the Income × Intent matrix. Lives next to the
 * matrix render so the rules cited (e.g. lowSample threshold of n<100)
 * stay in sync if the threshold changes. Two parallel components for
 * KO / EN — neutral copy, no marketing fluff, geared at non-marketing
 * founders reading the report.
 */
function IncomeIntentHelpKo() {
  return (
    <>
      <section>
        <h4 className="font-semibold text-slate-900 mb-1.5">컬럼 의미</h4>
        <ul className="space-y-1 list-disc pl-5">
          <li><strong>소득대</strong> — USD-K 환산 5개 구간 (&lt;$30k, $30-60k, $60-100k, $100-150k, $150k+)</li>
          <li><strong>평균 구매의향</strong> — 그 구간 페르소나의 평균 의향 점수 (0-100). 색상: <span className="text-success font-medium">초록 ≥65</span>, <span className="text-warn font-medium">노랑 50-64</span>, <span className="text-risk font-medium">빨강 &lt;50</span></li>
          <li><strong>n=</strong> — 그 구간의 페르소나 수 (sample size)</li>
          <li><strong>→ 국가코드 (X%)</strong> — 그 소득대 페르소나 중 <strong>가장 많이 거주하는 국가</strong> + 그 비율. 시장 선호도가 아니라 <strong>인구 분포</strong> 신호</li>
        </ul>
      </section>

      <section>
        <h4 className="font-semibold text-slate-900 mb-1.5">"→ 국가 (X%)" 깊이 읽기</h4>
        <p>이 % 는 흔히 오해됩니다. 정확히는: <em>"이 소득대 페르소나가 사는 국가의 분포"</em> 입니다.</p>
        <ul className="space-y-1 list-disc pl-5 mt-2">
          <li><strong>15-30%</strong>: 분산형 — 페르소나가 여러 시장에 고루 분포</li>
          <li><strong>40-60%</strong>: 한 시장에 집중 분포</li>
          <li><strong>60%+</strong>: 그 소득대는 거의 한 시장에 한정</li>
          <li><strong>100%</strong>: 그 소득대 페르소나가 단 한 시장에만 존재 (다른 후보국에 0명) — 인구통계 한계 또는 샘플링 결과</li>
        </ul>
        <p className="mt-2 text-slate-600 text-xs">예: <code>$150k+ → TW (100%)</code> = 슈퍼리치 페르소나 전부가 대만 거주자. 다른 후보국에 $150k+ 슬롯이 0개라는 뜻이지, "TW 가 슈퍼리치에게 매력적" 이라는 뜻 아님.</p>
      </section>

      <section>
        <h4 className="font-semibold text-slate-900 mb-1.5">의사결정 활용</h4>
        <ol className="space-y-1.5 list-decimal pl-5">
          <li><strong>타겟 소득대 결정</strong> — 평균 의향 가장 높은 구간이 ICP. 65+ 면 강한 신호, 50-64 면 잠재 타겟, 50 미만이면 어려움.</li>
          <li><strong>가격 포지셔닝</strong> — 타겟 소득대 평균 의향 50+ 면 그 가격대 OK. 50 미만이면 가격 너무 비쌀 수 있음.</li>
          <li><strong>시장별 ICP</strong> — 소득대 × 거주국 매트릭스. 예: BR 진입 시 저소득 ICP, US 진입 시 중상 ICP.</li>
        </ol>
      </section>

      <section>
        <h4 className="font-semibold text-slate-900 mb-1.5">⚠ 주의 신호</h4>
        <ul className="space-y-1 list-disc pl-5">
          <li><strong>n &lt; 100 (소표본 라벨)</strong> — 신뢰구간 ±5점 이상. 단정적 해석 자제, 다음 시뮬에서 personaCount 늘려 재검증.</li>
          <li><strong>topCountryShare 100%</strong> — 그 소득대 인구가 실제로 한 시장에 한정된 경우 (예: 정말 그 후보국 set 안에서 슈퍼리치가 한 곳에만 분포). 후보국에 US/UK/JP 같은 선진국이 있는데도 100% 가 한 곳이면 페르소나 생성 단계의 편향 가능성 — 그 소득대 페르소나 voice 와 profession 분포 검토 권장.</li>
          <li><strong>전 구간 의향 50점대</strong> — "관심은 있지만 결정타 없음". USP 강화 또는 메시지 재포지셔닝 필요.</li>
        </ul>
        <p className="mt-2 text-xs text-slate-500">참고: 2026-05-09 이전 ensemble 은 income bucketing 로직 (range 의 low end 사용) 의 버그로 $150k+ 집중도가 부풀려졌을 수 있습니다. 그 이후 시뮬은 midpoint 기반으로 보정됨.</p>
      </section>
    </>
  );
}

function IncomeIntentHelpEn() {
  return (
    <>
      <section>
        <h4 className="font-semibold text-slate-900 mb-1.5">Column meanings</h4>
        <ul className="space-y-1 list-disc pl-5">
          <li><strong>Income bracket</strong> — USD-K equivalent, 5 buckets</li>
          <li><strong>Mean intent</strong> — Average purchase intent (0-100) for personas in this bracket. Color: <span className="text-success font-medium">green ≥65</span>, <span className="text-warn font-medium">amber 50-64</span>, <span className="text-risk font-medium">red &lt;50</span></li>
          <li><strong>n=</strong> — Persona count in that bracket</li>
          <li><strong>→ Country (X%)</strong> — The most common <strong>residence country</strong> among personas in this bracket and its share. This is a <strong>demographic distribution</strong> signal, NOT a market preference.</li>
        </ul>
      </section>

      <section>
        <h4 className="font-semibold text-slate-900 mb-1.5">Reading "→ Country (X%)" correctly</h4>
        <p>Common misread: this is NOT "X% of this income bracket prefers Country Y as their launch market". It IS: "X% of personas in this income bracket happen to live in Country Y."</p>
        <ul className="space-y-1 list-disc pl-5 mt-2">
          <li><strong>15-30%</strong>: dispersed — personas spread evenly across markets</li>
          <li><strong>40-60%</strong>: concentrated in one market</li>
          <li><strong>60%+</strong>: this income bracket is heavily one-market</li>
          <li><strong>100%</strong>: this bracket exists in only one candidate country in the sample — demographic ceiling or sampling artifact</li>
        </ul>
        <p className="mt-2 text-slate-600 text-xs">Example: <code>$150k+ → TW (100%)</code> = all $150k+ personas live in Taiwan. It does NOT mean "Taiwan appeals to the rich" — it means no other candidate country had $150k+ slots in this run.</p>
      </section>

      <section>
        <h4 className="font-semibold text-slate-900 mb-1.5">Decision use</h4>
        <ol className="space-y-1.5 list-decimal pl-5">
          <li><strong>Target bracket</strong> — Highest-intent bracket is ICP. 65+ strong, 50-64 latent, &lt;50 hard.</li>
          <li><strong>Price positioning</strong> — Target bracket mean intent 50+ ⇒ price tier is OK. Below 50 ⇒ likely overpriced.</li>
          <li><strong>Per-market ICP</strong> — Income × residence matrix tells you who to target IN each candidate market.</li>
        </ol>
      </section>

      <section>
        <h4 className="font-semibold text-slate-900 mb-1.5">⚠ Caveats</h4>
        <ul className="space-y-1 list-disc pl-5">
          <li><strong>n &lt; 100 (low-n label)</strong> — Wide confidence interval. Don't over-interpret; rerun with larger personaCount.</li>
          <li><strong>topCountryShare = 100%</strong> — Possible when this bracket's population is genuinely concentrated in one candidate market. If candidates include US/UK/JP and yet the bracket lands 100% in one country, suspect persona-generation bias — review that bracket's voices and profession distribution.</li>
          <li><strong>All brackets at 50-something</strong> — "Interest without conviction." USP needs strengthening or repositioning.</li>
        </ul>
        <p className="mt-2 text-xs text-slate-500">Note: ensembles run before 2026-05-09 may show inflated $150k+ concentration due to a bucketing bug (income range parsed at low end). Sims after that date use midpoint and are corrected.</p>
      </section>
    </>
  );
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
        // Tighten polling once all sims have reported done — the ensemble
        // row only flips to 'completed' after aggregateAndPersist + the
        // narrative-merge LLM call (~30-60s), and the user shouldn't
        // wait an extra full poll cycle to see the dashboard appear.
        const allSimsDone =
          data.counts.total > 0 && data.counts.completed === data.counts.total;
        if (active) setTimeout(tick, allSimsDone ? 2000 : 5000);
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
        <p className="mt-4 text-sm text-slate-500">
          {locale === "ko" ? "앙상블 상태 로딩 중..." : "Loading ensemble status..."}
        </p>
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
  // Sims-done-but-ensemble-row-still-running window: aggregateAndPersist
  // + mergeNarrative is an LLM round-trip after the last sim finishes,
  // so the dashboard only flips when ensemble.status='completed'. Without
  // this state, the UI showed "5/5 완료" frozen for ~30-60s and looked
  // hung. Surface the synthesis step explicitly so the wait is intentional.
  const synthesizing =
    counts.total > 0 && counts.completed === counts.total && status.status === "running";
  return (
    <div className="max-w-2xl mx-auto py-12">
      <div className="card p-10">
        <div className="text-xs uppercase tracking-wide text-accent-600 mb-2 text-center">
          {synthesizing
            ? isKo
              ? `${tierLabel} 결과 통합 중`
              : `${tierLabel} synthesizing results`
            : isKo
              ? `${tierLabel} 진행 중`
              : `${tierLabel} in progress`}
        </div>
        <h2 className="text-2xl font-semibold text-center mb-1">
          {synthesizing
            ? isKo
              ? "결과 통합 중..."
              : "Synthesizing results..."
            : isKo
              ? `${counts.completed}/${counts.total} 시뮬레이션 완료`
              : `${counts.completed}/${counts.total} simulations done`}
        </h2>
        <p className="text-sm text-slate-500 text-center mb-1">
          {synthesizing
            ? isKo
              ? "AI가 모든 시뮬 결과를 합성해 최종 narrative를 작성 중입니다 (보통 2~3분)."
              : "AI is merging every sim into the final narrative (usually 2–3 min)."
            : isKo
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
            still in flight (or the synthesis LLM call is running) so the
            bar visibly "breathes" even between completion bumps. */}
        <div className="relative h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={clsx(
              "h-full bg-brand transition-all duration-500",
              (counts.running > 0 || synthesizing) && "animate-pulse",
            )}
            style={{ width: `${synthesizing ? 100 : pct}%` }}
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
  const { aggregate, llm_providers, tier, parallel_sims } = result;
  const [pdfBusy, setPdfBusy] = useState<"executive" | "detailed" | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfMenuOpen, setPdfMenuOpen] = useState(false);
  // Elapsed-seconds counter while a PDF is being built. Reassures the
  // user that the request is alive (the detailed report is 2-5s on
  // typical ensembles, longer on deep / deep_pro). Resets to 0 each
  // time pdfBusy flips on; the button label below reads "...2초" so
  // the count is visible without an extra UI element.
  const [pdfElapsed, setPdfElapsed] = useState(0);
  useEffect(() => {
    if (!pdfBusy) {
      setPdfElapsed(0);
      return;
    }
    const startedAt = Date.now();
    const tick = setInterval(() => {
      setPdfElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 250);
    return () => clearInterval(tick);
  }, [pdfBusy]);

  // Same blob-fetch pattern as ResultsDashboard.exportPdf — lets us show
  // an inline error if generation fails instead of opening a tab to a
  // raw JSON 4xx page. The variant param forks server-side to a 2-3
  // page executive deck or the full analyst-grade detailed report.
  const exportPdf = async (variant: "executive" | "detailed") => {
    if (pdfBusy) return;
    setPdfBusy(variant);
    setPdfError(null);
    setPdfMenuOpen(false);
    try {
      const res = await fetch(
        `/api/ensembles/${result.id}/pdf?locale=${locale}&variant=${variant}`,
      );
      if (!res.ok) throw new Error(await friendlyApiError(res, locale === "ko" ? "ko" : "en"));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const filename =
        res.headers
          .get("content-disposition")
          ?.match(/filename="?([^"]+)"?/)?.[1] ?? `market-twin-${variant}-${result.id.slice(0, 8)}.pdf`;
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[ensemble pdf]", err);
      // Show the underlying server message when one came back from
      // the API route — without it the user just sees a generic
      // "PDF 생성에 실패" with no clue what to retry or report.
      const detail =
        err instanceof Error && err.message && err.message !== "Failed to fetch"
          ? err.message.slice(0, 200)
          : null;
      const base =
        locale === "ko" ? "PDF 생성에 실패했습니다." : "Couldn't generate PDF.";
      setPdfError(detail ? `${base} (${detail})` : base);
    } finally {
      setPdfBusy(null);
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

  // Welcome / "how to read this" modal. Two trigger paths:
  //  1. Auto-open on the user's FIRST completed ensemble (gated by
  //     workspace_members.first_result_seen_at being null)
  //  2. Manual re-open via the HelpCircle button in the dashboard
  //     header — always works, regardless of dismissal state
  // Dismissal calls POST /api/me/onboarding which is idempotent: it
  // early-returns when first_result_seen_at is already set, so manual
  // re-opens don't re-trigger the seen-state write.
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/me/onboarding");
        if (!res.ok) return;
        const data = (await res.json()) as { firstResultSeenAt: string | null };
        if (!cancelled && data.firstResultSeenAt === null) setWelcomeOpen(true);
      } catch {
        // Non-fatal — modal just won't auto-fire. The HelpCircle button
        // still opens it manually.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  const dismissWelcome = async () => {
    setWelcomeOpen(false);
    try {
      await fetch("/api/me/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "firstResultSeen" }),
      });
    } catch {
      // Silently ignore — worst case the modal auto-fires once more on
      // their next ensemble load.
    }
  };
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
          <h1 className="text-2xl font-semibold">
            {locale === "ko" ? "앙상블 분석 결과" : "Ensemble analysis"}
          </h1>
        </div>
        <div className="flex flex-col items-stretch sm:items-end gap-1 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setWelcomeOpen(true)}
              className="btn-ghost text-sm inline-flex items-center gap-1.5"
              title={isKo ? "결과 읽는 법 가이드" : "How to read this result"}
              aria-label={isKo ? "결과 읽는 법 가이드" : "How to read this result"}
            >
              <HelpCircle size={14} />
              <span>{isKo ? "도움말" : "Guide"}</span>
            </button>
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
            <div className="relative">
              <button
                type="button"
                onClick={() => setPdfMenuOpen((v) => !v)}
                disabled={!!pdfBusy}
                className="btn-primary disabled:opacity-60 inline-flex items-center gap-2"
                aria-haspopup="menu"
                aria-expanded={pdfMenuOpen}
              >
                {pdfBusy ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                {pdfBusy
                  ? isKo
                    ? `PDF 생성 중 (${pdfBusy === "executive" ? "임원용" : "전체"})… ${pdfElapsed}초`
                    : `Generating PDF (${pdfBusy})… ${pdfElapsed}s`
                  : isKo
                    ? "PDF 리포트 ▾"
                    : "PDF report ▾"}
              </button>
              {pdfMenuOpen && !pdfBusy && (
                <>
                  {/* Click-outside scrim — relies on portal-free overlap; an
                      explicit invisible backdrop captures the next click and
                      closes the menu. Keeps the dropdown self-contained. */}
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setPdfMenuOpen(false)}
                  />
                  <div
                    role="menu"
                    className="absolute right-0 mt-1 w-72 z-20 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => exportPdf("executive")}
                      className="w-full text-left px-4 py-3 hover:bg-slate-50 border-b border-slate-100"
                    >
                      <div className="text-sm font-semibold text-slate-900">
                        {isKo ? "임원용 (2-3 페이지)" : "Executive (2-3 pages)"}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {isKo
                          ? "Hot take · 추천국 · 핵심 액션 · 가격"
                          : "Hot take · pick · key actions · price"}
                      </div>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => exportPdf("detailed")}
                      className="w-full text-left px-4 py-3 hover:bg-slate-50"
                    >
                      <div className="text-sm font-semibold text-slate-900">
                        {detailedReportSummary(tier, isKo).title}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {detailedReportSummary(tier, isKo).body}
                      </div>
                    </button>
                  </div>
                </>
              )}
            </div>
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
        tier={tier}
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
          hotTake={narrative?.hotTake}
          quality={aggregate.quality ?? undefined}
          ensembleId={result.id}
          projectId={projectId}
          isFreeRerun={result.is_free_rerun ?? false}
          parentEnsembleId={result.parent_ensemble_id ?? null}
          childRerunId={result.child_rerun_id ?? null}
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
          currency={result.project?.currency ?? "USD"}
        />
      )}
      {activeTab === "countries" && (
        <CountriesTab
          countryStats={countryStats}
          segments={segments}
          bestCountryDistribution={bestCountryDistribution}
          recommendation={recommendation}
          simCount={simCount}
          effectivePersonas={effectivePersonas}
          sources={aggregate.sources ?? []}
          productPriceCents={result.project?.base_price_cents ?? 0}
          competitorPrices={aggregate.pricing?.competitorPrices ?? []}
          locale={locale}
          isKo={isKo}
        />
      )}
      {activeTab === "marketProfile" && (
        <MarketProfileTab
          profile={aggregate.marketProfile}
          recommendedCountry={recommendation.country}
          ensembleId={result.id}
          basePriceCents={result.project?.base_price_cents ?? null}
          currency={result.project?.currency ?? "USD"}
          tier={tier}
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
          project={result.project ?? null}
        />
      )}
      {activeTab === "pricing" && (
        <PricingTab
          pricing={pricing}
          basePriceCents={result.project?.base_price_cents ?? null}
          simCount={simCount}
          competitorsResolved={result.project?.competitors_resolved ?? null}
          isKo={isKo}
          currency={result.project?.currency ?? "USD"}
        />
      )}
      {activeTab === "decisionAid" && (
        <DecisionAidTab
          aggregate={aggregate}
          currency={result.project?.currency ?? "USD"}
          isKo={isKo}
        />
      )}
      {activeTab === "risks" && (
        <RisksTab
          narrative={narrative}
          simCount={simCount}
          crossCountry={aggregate.crossCountryDistribution}
          isKo={isKo}
        />
      )}
      {activeTab === "actions" && (
        <ActionsTab
          narrative={narrative}
          simCount={simCount}
          actionCoverage={aggregate.actionCategoryCoverage}
          isKo={isKo}
        />
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

      {welcomeOpen && (
        <WelcomeModal
          isKo={isKo}
          onDismiss={dismissWelcome}
          onJumpTo={(tab) => {
            setActiveTab(tab);
            void dismissWelcome();
          }}
        />
      )}
      <BackToTop />
    </div>
  );
}

/* ────────────────────────────────── tabs ─── */

type TabKey =
  | "summary"
  | "overview"
  | "countries"
  | "marketProfile"
  | "personas"
  | "pricing"
  | "decisionAid"
  | "risks"
  | "actions"
  | "data";

function TabsNav({
  active,
  onChange,
  aggregate,
  tier,
  isKo,
}: {
  active: TabKey;
  onChange: (k: TabKey) => void;
  aggregate: EnsembleAggregate;
  /** Tier of the ensemble — used to gate decision-aid tab to Decision+. */
  tier: string;
  isKo: boolean;
}) {
  // Hide tabs that have no underlying data so we don't show an empty
  // "페르소나" tab when the snapshot didn't carry persona records (legacy
  // ensembles, or hypothesis tier without the new capture).
  const tabs: Array<{ key: TabKey; label: string; show: boolean }> = [
    { key: "summary", label: isKo ? "요약" : "Summary", show: true },
    { key: "overview", label: isKo ? "개요" : "Overview", show: !!aggregate.narrative?.executiveSummary },
    { key: "countries", label: isKo ? "국가" : "Countries", show: aggregate.countryStats.length > 0 },
    {
      // Always visible when the ensemble has persona data — we render
      // either the profile or a "generate" empty-state CTA inside the
      // tab. This way users with legacy ensembles can backfill on
      // demand without re-running the simulation.
      key: "marketProfile",
      label: isKo ? "시장 분석" : "Market profile",
      show: aggregate.countryStats.length > 0,
    },
    { key: "personas", label: isKo ? "페르소나" : "Personas", show: !!aggregate.personas },
    { key: "pricing", label: isKo ? "가격" : "Pricing", show: !!aggregate.pricing },
    {
      // Decision-aid tab: investment + ROI projection and recommendation
      // robustness. Gated to Decision+ tier and above to mirror the PDF's
      // tier-exclusive content. Hides on hypothesis / decision tier so
      // the tier ladder feels meaningful in the UI just like in the PDF.
      key: "decisionAid",
      label: isKo ? "의사결정" : "Decision aid",
      show:
        (tier === "decision_plus" || tier === "deep" || tier === "deep_pro") &&
        aggregate.countryStats.length > 0,
    },
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
  quality,
  locale,
  isKo,
  hotTake,
  ensembleId,
  projectId,
  isFreeRerun,
  parentEnsembleId,
  childRerunId,
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
  hotTake?: string;
  quality?: NonNullable<EnsembleAggregate["quality"]>;
  ensembleId: string;
  projectId: string;
  isFreeRerun: boolean;
  parentEnsembleId: string | null;
  childRerunId: string | null;
}) {
  // Free-rerun threshold mirrors the server-side gate. Kept hardcoded
  // here rather than threaded through the API so the badge logic stays
  // co-located with the UI; the server will still 400 if the user
  // somehow forces a rerun above threshold.
  const FREE_RERUN_THRESHOLD = 60;
  const showFreeRerunCta =
    !!quality &&
    quality.confidenceScore < FREE_RERUN_THRESHOLD &&
    !isFreeRerun &&
    !childRerunId;

  return (
    <div className="space-y-6">
      {isFreeRerun && parentEnsembleId && (
        <FreeRerunBadge parentId={parentEnsembleId} locale={locale} isKo={isKo} />
      )}

      {hotTake && <HotTakeCard hotTake={hotTake} isKo={isKo} />}

      {quality && <QualityBanner quality={quality} isKo={isKo} />}

      {showFreeRerunCta && quality && (
        <FreeRerunCta
          confidence={quality.confidenceScore}
          threshold={FREE_RERUN_THRESHOLD}
          ensembleId={ensembleId}
          projectId={projectId}
          tier={tier}
          locale={locale}
          isKo={isKo}
        />
      )}

      {childRerunId && (
        <ChildRerunNotice rerunId={childRerunId} locale={locale} isKo={isKo} />
      )}

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
        <div className="flex-1 min-w-0">
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
          <ChartGuide isKo={isKo} label={isKo ? "변동성 평가가 뭔가요?" : "What is variance assessment?"}>
            <GuideSection title={isKo ? "왜 측정?" : "Why measure it"}>
              <p className="m-0">
                {isKo
                  ? "동일한 입력으로 N번 시뮬을 돌렸을 때, 국가 점수가 시뮬마다 얼마나 흔들리는지를 측정합니다. 변동이 크면 \"한 번만 돌렸으면 잘못된 결정을 했을 수도\" 있다는 뜻."
                  : "How much country scores wobble across the N independent sims you ran on the same inputs. High variance means \"a single sim could have led you to the wrong call\"."}
              </p>
            </GuideSection>
            <GuideSection title={isKo ? "라벨 기준" : "Label thresholds"}>
              <ul className="list-disc pl-5 space-y-0.5 m-0">
                {isKo ? (
                  <>
                    <li><span className="text-success font-semibold">LOW</span> (최대 변동 ≤15점) — 결과 신뢰. 단일 시뮬도 충분했을 만큼 일관됨.</li>
                    <li><span className="text-slate-700 font-semibold">MODERATE</span> (15–30점) — 앙상블이 의미 있는 신뢰도 추가. 단일 시뮬은 위험.</li>
                    <li><span className="text-warn font-semibold">HIGH</span> (&gt;30점) — 시뮬마다 결과가 크게 달라짐. 앙상블 결과만 믿을 것.</li>
                  </>
                ) : (
                  <>
                    <li><span className="text-success font-semibold">LOW</span> (max range ≤15pt) — trust the result; a single sim would have been reliable.</li>
                    <li><span className="text-slate-700 font-semibold">MODERATE</span> (15–30pt) — ensemble adds meaningful confidence; a single sim would be risky.</li>
                    <li><span className="text-warn font-semibold">HIGH</span> (&gt;30pt) — same fixture produces very different scores per run; trust the ensemble only.</li>
                  </>
                )}
              </ul>
            </GuideSection>
            <GuideSection title={isKo ? "HIGH일 때 뭘 해야 하나" : "What to do when HIGH"}>
              <p className="m-0">
                {isKo
                  ? "더 깊은 티어(decision_plus / deep / deep_pro)로 시뮬 수를 늘려 합의도를 끌어올리거나, 입력 (페르소나 카테고리·가격·국가)을 다듬어 모호함을 줄이세요."
                  : "Bump up to a deeper tier (decision_plus / deep / deep_pro) to add more sims and tighten consensus, or refine inputs (persona category, price, market list) to reduce ambiguity."}
              </p>
            </GuideSection>
          </ChartGuide>
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
    return formatPrice(project.base_price_cents, project.currency);
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
  currency,
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
  currency: string;
}) {
  void locale;
  const runnerUp = bestCountryDistribution[1];
  const winnerStats = countryStats.find((c) => c.country === recommendation.country);
  const overallSeg = segments.find((s) => s.id === "overall");
  const topRisk = narrative?.mergedRisks?.[0];
  const topAction = narrative?.mergedActions?.[0];
  const fmtPrice = (cents?: number) =>
    typeof cents === "number" ? formatPrice(cents, currency) : "—";
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
              {(() => {
                // Three cases for the suffix after the consensus line:
                //  1. simCount === 1 (hypothesis tier) → "all sims" framing
                //     reads weird with one sim, and the consensus-100% header
                //     already says it. Just show the score + within-sim
                //     noise from the LLM resampling rolls.
                //  2. across-sim std = 0 with simCount > 1 → all per-sim
                //     medians collapsed to the same number (clear-winner
                //     LLM convergence). Show "unanimous" + within-sim noise.
                //  3. otherwise → traditional "mean X, std Y" reading.
                const fs = winnerStats?.finalScore;
                if (!fs) return null;
                const withinStd = fs.withinSimStdMean;
                const noiseSuffix =
                  withinStd && withinStd > 0
                    ? isKo
                      ? `, 시뮬 내부 noise ±${withinStd.toFixed(1)}`
                      : `, within-sim noise ±${withinStd.toFixed(1)}`
                    : "";
                // Use the law-of-total-variance combined std when the
                // runner emitted within-sim variance — across-sim std
                // alone understates the ensemble's true noise.
                const noiseStd = fs.combinedStd ?? fs.std;
                if (simCount === 1) {
                  return isKo ? (
                    <>
                      <span className="font-semibold text-slate-900">{recommendation.country}</span>
                      {" "}진출이 합의 우위 ({recommendation.consensusPercent}% / {recommendation.confidence})
                      {` — 점수 ${fs.mean.toFixed(0)}점${noiseSuffix}`}.
                    </>
                  ) : (
                    <>
                      <span className="font-semibold text-slate-900">{recommendation.country}</span>
                      {" "}leads consensus ({recommendation.consensusPercent}% / {recommendation.confidence})
                      {` — score ${fs.mean.toFixed(0)}${noiseSuffix}`}.
                    </>
                  );
                }
                const acrossZero = fs.std < 0.05;
                if (acrossZero) {
                  return isKo ? (
                    <>
                      <span className="font-semibold text-slate-900">{recommendation.country}</span>
                      {" "}진출이 합의 우위 ({recommendation.consensusPercent}% / {recommendation.confidence})
                      {` — 모든 시뮬이 ${fs.mean.toFixed(0)}점으로 수렴${noiseSuffix}`}.
                    </>
                  ) : (
                    <>
                      <span className="font-semibold text-slate-900">{recommendation.country}</span>
                      {" "}leads consensus ({recommendation.consensusPercent}% / {recommendation.confidence})
                      {` — all sims converged on ${fs.mean.toFixed(0)}${noiseSuffix}`}.
                    </>
                  );
                }
                return isKo ? (
                  <>
                    <span className="font-semibold text-slate-900">{recommendation.country}</span>
                    {" "}진출이 합의 우위 ({recommendation.consensusPercent}% / {recommendation.confidence})
                    {` — 평균 점수 ${fs.mean.toFixed(0)}, 표준편차 ${noiseStd.toFixed(1)}`}.
                  </>
                ) : (
                  <>
                    <span className="font-semibold text-slate-900">{recommendation.country}</span>
                    {" "}leads consensus ({recommendation.consensusPercent}% / {recommendation.confidence})
                    {` — mean score ${fs.mean.toFixed(0)}, std ${noiseStd.toFixed(1)}`}.
                  </>
                );
              })()}
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
                {(() => {
                  // Headline price stays in sync with the Pricing tab via
                  // the shared helper — auto-corrects when LLM is anchored
                  // on the base price.
                  const { displayCents } = getDisplayPriceCents(
                    pricing.recommendedPriceCents,
                    pricing.curve,
                    pricing.curveRevenueMaxCents,
                    pricing.recommendedPriceP75,
                  );
                  const unanimous = pricing.recommendedPriceUnanimousAt;
                  const withinStd = pricing.recommendedPriceWithinSimStdMean ?? 0;
                  const noiseSuffix = withinStd > 0
                    ? (isKo
                        ? ` · 시뮬 내부 noise ±${fmtPrice(withinStd)}`
                        : ` · within-sim noise ±${fmtPrice(withinStd)}`)
                    : "";
                  // Hypothesis tier (1 sim): the "all sims converged" framing
                  // is misleading and the legacy mid-50% range collapses to
                  // "$X – $X". Show price + within-sim noise only.
                  if (simCount === 1) {
                    return isKo
                      ? `권장 가격 ${fmtPrice(displayCents)}${noiseSuffix}.`
                      : `Recommended price ${fmtPrice(displayCents)}${noiseSuffix}.`;
                  }
                  if (unanimous != null && unanimous > 0) {
                    const noise = withinStd > 0
                      ? (isKo
                          ? `, 시뮬 내부 noise ±${fmtPrice(withinStd)}`
                          : `, within-sim noise ±${fmtPrice(withinStd)}`)
                      : "";
                    return isKo
                      ? `권장 가격 ${fmtPrice(displayCents)} — 모든 시뮬이 ${fmtPrice(unanimous)}로 수렴${noise}.`
                      : `Recommended price ${fmtPrice(displayCents)} — all sims converged on ${fmtPrice(unanimous)}${noise}.`;
                  }
                  return isKo
                    ? `권장 가격 ${fmtPrice(displayCents)} (시뮬 50% 구간 ${fmtPrice(pricing.recommendedPriceP25)}–${fmtPrice(pricing.recommendedPriceP75)}).`
                    : `Recommended price ${fmtPrice(displayCents)} (mid-50% range ${fmtPrice(pricing.recommendedPriceP25)}–${fmtPrice(pricing.recommendedPriceP75)}).`;
                })()}
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

/**
 * 30-second hot take — the LLM-merged provocative one-liner that sits at
 * the very top of the Summary tab. Designed to be the first thing a busy
 * founder reads: action-oriented decision in a single sentence, with the
 * tone-signaling emoji the prompt asks for. Falls through silently when
 * the field is absent (legacy ensembles created before this field landed).
 */
/**
 * Quality banner showing the ensemble's confidence score and any
 * systemic warnings that surfaced in ≥30% of sims. Sits right under
 * the hot take so the user reads "what we recommend → how confident
 * are we" in one glance.
 *
 * Color logic:
 *   confidence ≥ 80 → success (green)
 *   60-79          → neutral (amber)
 *   < 60           → risk (red)
 *
 * Quarantine banner (separate red callout) fires when even one sim
 * tripped a critical sanity check — explicit + scary so the user
 * never silently builds a launch on garbage.
 */
function QualityBanner({
  quality,
  isKo,
}: {
  quality: NonNullable<EnsembleAggregate["quality"]>;
  isKo: boolean;
}) {
  const score = quality.confidenceScore;
  const tone = score >= 80 ? "success" : score >= 60 ? "warn" : "risk";
  const toneClasses = {
    success: "bg-success-soft/40 border-success/30 text-slate-900",
    warn: "bg-warn-soft/40 border-warn/30 text-slate-900",
    risk: "bg-risk-soft/40 border-risk/30 text-slate-900",
  };
  const scoreClasses = {
    success: "text-success",
    warn: "text-warn",
    risk: "text-risk",
  };
  const iconClass = scoreClasses[tone];

  return (
    <div className={clsx("rounded-xl border p-4 sm:p-5", toneClasses[tone])}>
      <div className="flex items-start sm:items-center gap-4 flex-col sm:flex-row">
        <div className="flex items-center gap-3">
          <div
            className={clsx(
              "shrink-0 inline-flex items-center justify-center w-14 h-14 rounded-full bg-white border-2 font-bold text-2xl tabular-nums",
              tone === "success"
                ? "border-success"
                : tone === "warn"
                  ? "border-warn"
                  : "border-risk",
              iconClass,
            )}
          >
            {score}
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">
              {isKo ? "결과 신뢰도" : "Result confidence"}
            </div>
            <div className="text-sm sm:text-base font-semibold mt-0.5">
              {tone === "success"
                ? isKo
                  ? "신뢰할 만한 결과"
                  : "Trustworthy result"
                : tone === "warn"
                  ? isKo
                    ? "참고용 — 추가 검증 권장"
                    : "Use as guidance — consider another run"
                  : isKo
                    ? "신뢰도 낮음 — 결과 해석 시 주의"
                    : "Low confidence — interpret with care"}
            </div>
            <div className="text-xs text-slate-600 mt-1">
              {isKo
                ? `${quality.simCount}개 시뮬 평균 · ${quality.quarantinedCount}개 격리`
                : `${quality.simCount}-sim mean · ${quality.quarantinedCount} quarantined`}
            </div>
          </div>
        </div>
        {quality.systemicWarnings.length > 0 && (
          <div className="flex-1 sm:border-l sm:border-slate-300/40 sm:pl-4 w-full">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
              {isKo ? "시스템적 경고" : "Systemic warnings"}
            </div>
            <ul className="space-y-1 text-xs text-slate-700 leading-relaxed">
              {quality.systemicWarnings.slice(0, 3).map((w) => (
                <li key={w.code} className="flex items-start gap-1.5">
                  <span
                    className={clsx(
                      "shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full",
                      w.severity === "critical"
                        ? "bg-risk"
                        : w.severity === "warning"
                          ? "bg-warn"
                          : "bg-slate-400",
                    )}
                  />
                  <span>
                    {w.message}{" "}
                    <span className="text-slate-400">
                      ({isKo ? `${w.simShare}% 시뮬에서` : `${w.simShare}% of sims`})
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Free-rerun CTA. Renders only when:
 *   - confidenceScore is below threshold (default 60), AND
 *   - this ensemble isn't itself a rerun, AND
 *   - no child rerun has been spawned yet
 *
 * Same inputs, same tier — the user just gets a fresh persona sample
 * on the house. Confirmation modal explains the offer up front so the
 * user doesn't burn quota by accident clicking through.
 */
function FreeRerunCta({
  confidence,
  threshold,
  ensembleId,
  projectId,
  tier,
  locale,
  isKo,
}: {
  confidence: number;
  threshold: number;
  ensembleId: string;
  projectId: string;
  tier: string;
  locale: string;
  isKo: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const startRerun = async () => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/run-ensemble`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tier,
          locale,
          parentEnsembleId: ensembleId,
        }),
      });
      if (!res.ok) {
        throw new Error(await friendlyApiError(res, isKo ? "ko" : "en"));
      }
      const data = (await res.json()) as { ensembleId: string };
      router.push(`/projects/${projectId}/results?ensemble=${data.ensembleId}`);
    } catch (e) {
      setErr(friendlyClientError(e, isKo ? "ko" : "en"));
      setBusy(false);
    }
  };

  return (
    <>
      <div className="rounded-xl border-2 border-dashed border-accent/50 bg-gradient-to-br from-accent-50/40 to-brand-50/30 p-5">
        <div className="flex items-start gap-4 flex-col sm:flex-row">
          <div className="shrink-0 inline-flex items-center justify-center w-12 h-12 rounded-full bg-accent/10 text-accent">
            <Gift size={22} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-accent mb-1">
              {isKo ? "무료 재실행 가능" : "Free rerun available"}
            </div>
            <h3 className="text-base sm:text-lg font-semibold text-slate-900">
              {isKo
                ? `신뢰도가 낮습니다 (${confidence}점 / 기준 ${threshold}점)`
                : `Low confidence (${confidence} / threshold ${threshold})`}
            </h3>
            <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">
              {isKo
                ? "동일한 입력으로 한 번 더 실행해 결과를 검증해 보세요. 쿼터에 차감되지 않으며 추가 비용도 없습니다."
                : "Run the same analysis once more to validate the result. It won't count against your quota — no extra charge."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            disabled={busy}
            className="btn-primary shrink-0 inline-flex items-center gap-2 disabled:opacity-60"
          >
            <RefreshCw size={14} />
            {isKo ? "무료로 재실행" : "Rerun for free"}
          </button>
        </div>
        {err && <p className="text-xs text-risk mt-3">{err}</p>}
      </div>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4"
          onClick={() => !busy && setOpen(false)}
        >
          <div
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-accent/10 text-accent">
                <Gift size={18} />
              </div>
              <h3 className="text-lg font-semibold text-slate-900">
                {isKo ? "무료 재실행 확인" : "Confirm free rerun"}
              </h3>
            </div>
            <ul className="space-y-2 text-sm text-slate-700 mb-5">
              <li className="flex gap-2">
                <CheckCircle2 size={16} className="text-success shrink-0 mt-0.5" />
                <span>
                  {isKo
                    ? "동일한 제품·국가·티어로 새 페르소나 표본을 다시 추출합니다."
                    : "Same product, countries, and tier — with a fresh persona sample."}
                </span>
              </li>
              <li className="flex gap-2">
                <CheckCircle2 size={16} className="text-success shrink-0 mt-0.5" />
                <span>
                  {isKo
                    ? "월 쿼터/체험 한도에 차감되지 않습니다."
                    : "Doesn't count against your monthly quota or trial limit."}
                </span>
              </li>
              <li className="flex gap-2">
                <AlertCircle size={16} className="text-warn shrink-0 mt-0.5" />
                <span>
                  {isKo
                    ? "이 분석당 1회만 가능합니다. 재실행 결과에 대해서는 추가 무료 재실행이 제공되지 않습니다."
                    : "One free rerun per analysis. The rerun itself is not eligible for another free rerun."}
                </span>
              </li>
            </ul>
            {err && <p className="text-xs text-risk mb-3">{err}</p>}
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={busy}
                className="btn-ghost text-sm disabled:opacity-60"
              >
                {isKo ? "취소" : "Cancel"}
              </button>
              <button
                type="button"
                onClick={startRerun}
                disabled={busy}
                className="btn-primary text-sm inline-flex items-center gap-2 disabled:opacity-60"
              >
                {busy ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    {isKo ? "시작 중..." : "Starting..."}
                  </>
                ) : (
                  <>
                    <RefreshCw size={14} />
                    {isKo ? "재실행 시작" : "Start rerun"}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Inline notice on the parent ensemble showing that the free rerun
 * has already been used (and linking to it). Rendered in place of
 * FreeRerunCta once a child rerun exists.
 */
function ChildRerunNotice({
  rerunId,
  locale,
  isKo,
}: {
  rerunId: string;
  locale: string;
  isKo: boolean;
}) {
  void locale;
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 flex items-start gap-3">
      <RefreshCw size={16} className="text-slate-500 shrink-0 mt-0.5" />
      <div className="flex-1 text-sm text-slate-700">
        <span className="font-medium">
          {isKo ? "무료 재실행 이미 사용됨" : "Free rerun already used"}
        </span>
        <span className="text-slate-500 ml-2 text-xs font-mono">
          → {rerunId.slice(0, 8)}
        </span>
      </div>
    </div>
  );
}

/**
 * Badge shown at the top of a free-rerun result page so the user
 * knows this is a rerun (not a fresh run) and what triggered it.
 */
function FreeRerunBadge({
  parentId,
  locale,
  isKo,
}: {
  parentId: string;
  locale: string;
  isKo: boolean;
}) {
  void locale;
  return (
    <div className="rounded-xl border border-accent/30 bg-accent-50/50 p-3 flex items-center gap-3">
      <Gift size={16} className="text-accent shrink-0" />
      <div className="flex-1 text-sm text-slate-700">
        <span className="font-medium text-accent">
          {isKo ? "무료 재실행 분석" : "Free rerun analysis"}
        </span>
        <span className="text-slate-500 ml-2">
          {isKo ? "원본 신뢰도 부족으로 동일 입력 재검증" : "rerun of a low-confidence parent"}
        </span>
        <span className="text-slate-400 ml-2 text-xs font-mono">
          ← {parentId.slice(0, 8)}
        </span>
      </div>
    </div>
  );
}

function HotTakeCard({ hotTake, isKo }: { hotTake: string; isKo: boolean }) {
  return (
    <div className="rounded-xl bg-gradient-to-r from-brand-50 to-accent-50 border-2 border-accent/30 p-5 shadow-sm">
      <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-accent mb-2">
        {isKo ? "30초 핫테이크" : "30-second hot take"}
      </div>
      <p className="text-lg sm:text-xl font-semibold text-slate-900 leading-snug break-keep">
        {hotTake}
      </p>
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
  effectivePersonas,
  sources,
  productPriceCents,
  competitorPrices,
  locale,
  isKo,
}: {
  countryStats: EnsembleAggregate["countryStats"];
  segments: EnsembleAggregate["segments"];
  bestCountryDistribution: EnsembleAggregate["bestCountryDistribution"];
  recommendation: EnsembleAggregate["recommendation"];
  simCount: number;
  /** Ensemble-wide persona count — passed down to CountryDrilldown
   *  for the "personas / total (N%)" share annotation. */
  effectivePersonas: number;
  sources: string[];
  /** This product's base price in cents, for fact-checking the
   *  per-persona "we are more/less expensive than X" objections
   *  against the extracted competitor prices below. */
  productPriceCents: number;
  /** Competitor retail prices extracted server-side from user-supplied
   *  URLs at sim time. Same data the persona prompts were fed; passed
   *  here so the renderer can drop LLM-emitted objections whose
   *  directional comparison contradicts the extracted reality. */
  competitorPrices: NonNullable<EnsembleAggregate["pricing"]>["competitorPrices"];
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
                <span>{segmentLabel(seg.id, isKo)}</span>
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
        <ChartGuide isKo={isKo}>
          <GuideSection title={isKo ? "막대가 의미하는 것" : "What the bar shows"}>
            <p className="m-0">
              {isKo
                ? "각 국가의 final score (수요 + 비용 효율 + 경쟁 강도 종합)을 모든 시뮬에서 평균낸 값. 막대 끝의 얇은 선은 최소~최대 범위로 시뮬 간 변동성을 보여줍니다."
                : "Mean final score (demand + cost efficiency + competition) across every sim. The thin tail line shows min–max range — i.e., run-to-run variability."}
            </p>
          </GuideSection>
          <GuideSection title={isKo ? "어떻게 활용?" : "How to use"}>
            <ul className="list-disc pl-5 space-y-0.5 m-0">
              {isKo ? (
                <>
                  <li>막대가 길고 변동선이 짧음 → 어느 시뮬에서나 일관되게 높은 점수 → 신뢰할 만한 1순위.</li>
                  <li>막대 길이는 비슷한데 변동선이 큰 두 국가 → 시뮬에 따라 결과 갈림 → 추가 검증 필요.</li>
                  <li>점수 자체는 0–100 스케일이지만 절대값보다 <strong>국가 간 상대 차이</strong>가 의사결정에 중요.</li>
                </>
              ) : (
                <>
                  <li>Long bar + short range → consistently high across sims → trustworthy #1.</li>
                  <li>Two countries with similar bars but wide ranges → results split by sim → add more sims.</li>
                  <li>Score is on a 0–100 scale but the <strong>relative gap between countries</strong> matters more than the absolute value.</li>
                </>
              )}
            </ul>
          </GuideSection>
        </ChartGuide>
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
                        {(c.finalScore.combinedStd ?? c.finalScore.std).toFixed(1)}
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
                        {/* Prefer the server-computed cacRange (persona-derived,
                            calibrated against channel-costs benchmarks) over the
                            LLM-emitted median — same rule the Investment + ROI
                            card already follows. cacRange is undefined on legacy
                            ensembles or when per-country persona sample is too
                            thin (<5), in which case we fall back to the LLM. */}
                        ${(c.cacRange?.medianUsd ?? c.cacEstimateUsd.median).toFixed(2)}
                      </td>
                    </tr>
                    {isOpen && c.detail && (
                      <tr className="bg-slate-50/50">
                        <td colSpan={9} className="px-8 py-5">
                          <CountryDrilldown
                            detail={c.detail}
                            rationaleSamples={c.detail.rationaleSamples}
                            components={c.components}
                            finalScoreMean={c.finalScore.mean}
                            totalPersonas={effectivePersonas}
                            productPriceCents={productPriceCents}
                            competitorPrices={competitorPrices}
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

      {/* Project-wide reference data sources — flat list of every gov-stats
          and competitor-IR source consulted across all candidate markets.
          Lives at the tab footer (not inside per-country drilldown) because
          the underlying `aggregate.sources` is a project-wide Set, not
          country-tagged. Showing it under one country's expand row would
          imply otherwise. */}
      {sources.length > 0 && (
        <div>
          <h2 className="text-base font-semibold text-slate-900 mb-3">
            {isKo ? "통계 근거" : "Data sources"}
          </h2>
          <div className="card p-4">
            <p className="text-xs text-slate-500 leading-relaxed mb-2">
              {isKo
                ? "이번 분석에서 검토한 모든 후보국에 사용된 정부 통계·시장 조사·IR 자료 통합 목록입니다."
                : "Combined list of every government statistic, market study, and IR source consulted across all candidate markets in this analysis."}
            </p>
            <p className="text-xs text-slate-500 leading-relaxed">
              {sources.join(" · ")}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function CountryDrilldown({
  detail,
  rationaleSamples,
  components,
  finalScoreMean,
  totalPersonas,
  productPriceCents,
  competitorPrices,
  isKo,
}: {
  detail: NonNullable<EnsembleAggregate["countryStats"][number]["detail"]>;
  rationaleSamples: string[];
  components?: NonNullable<EnsembleAggregate["countryStats"][number]["components"]>;
  finalScoreMean: number;
  /** Ensemble-wide effective persona count — denominator for the
   *  per-country share-of-pool annotation. */
  totalPersonas: number;
  productPriceCents: number;
  competitorPrices: NonNullable<EnsembleAggregate["pricing"]>["competitorPrices"];
  isKo: boolean;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2 space-y-4">
        {detail.funnel && <FunnelStrip funnel={detail.funnel} isKo={isKo} />}
        {components && (
          <CountryComponentBreakdown
            components={components}
            finalScoreMean={finalScoreMean}
            isKo={isKo}
          />
        )}
        {rationaleSamples.length > 0 && (
          <div>
            <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">
              {isKo
                ? `선정 사유 (시뮬 샘플 ${rationaleSamples.length}건)`
                : `Selection rationale (${rationaleSamples.length} sim samples)`}
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed mb-2">
              {isKo
                ? "각 sim이 emit한 원문 그대로 — 본문 내 수치(가격·CAC·기간 등)는 해당 sim의 자체 추정치이며 위 헤더의 합산 평균과 차이가 있을 수 있습니다."
                : "Verbatim from each sim — internal numbers (price / CAC / timelines) reflect that sim's own estimate and may differ from the aggregate above."}
            </p>
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
        {(() => {
          // Prefer Phase-2 categoryDistribution when present — collapses
          // the "비싸다 / 가격 부담 / 더 저렴한 대안 있음" fragmentation
          // that fuzzy clustering can't fully merge into one
          // price_relative + price_absolute pair. Falls back to the
          // fuzzy path with the same filter + anti-dominance defenses
          // for legacy aggregates predating the taxonomy rollout.
          let rows = buildObjectionRows(
            detail.topObjections,
            detail.objectionCategoryDistribution,
            isKo ? "ko" : "en",
            {
              limit: 5,
              fuzzyFilter: (text) =>
                isGenericPriceObjection(text) ||
                isGenericLaunchConcern(text) ||
                isBareAdjectiveSignal(text) ||
                isFactuallyWrongCompetitorPriceClaim(
                  text,
                  productPriceCents,
                  competitorPrices,
                ),
            },
          );
          // Anti-dominance pass still useful for fuzzy rows — taxonomy
          // rows are pre-grouped and don't need it.
          if (rows.length > 0 && rows[0].source === "fuzzy") {
            const demoted = demoteDominantClusters(
              rows.map((r) => ({ text: r.label, count: r.count })),
              detail.persona.count,
            );
            rows = demoted.map((d) => ({
              label: d.text,
              detail: "",
              count: d.count,
              source: "fuzzy" as const,
            }));
          }
          if (rows.length === 0) return null;
          const usingTaxonomy = rows[0]?.source === "taxonomy";
          return (
          <div>
            <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-2">
              {isKo ? "공통 거부 요인 TOP 5" : "Top objections"}
            </div>
            <ul className="space-y-1.5 text-sm">
              {rows.map((o) => {
                // Count = unique personas (post e01b025 fix) clustered
                // by fuzzy overlap. Showing as % of the country pool
                // makes magnitude immediately readable. NOT mutually
                // exclusive — one persona may raise multiple objections,
                // so the column sums can exceed 100%.
                const rawShare =
                  detail.persona.count > 0
                    ? (o.count / detail.persona.count) * 100
                    : null;
                // Non-zero clusters with <0.5% share were rounding to
                // "0%", which reads as "0 personas raised this" even
                // though the cluster wouldn't be in top-5 if zero
                // personas had raised it. Floor the display at "<1%".
                const shareLabel =
                  rawShare == null
                    ? `${o.count}`
                    : rawShare >= 1
                      ? `${Math.round(rawShare)}%`
                      : "<1%";
                return (
                  <li key={`${o.source}:${o.label}`} className="flex items-start gap-2">
                    <span className="badge bg-slate-100 text-slate-600 shrink-0 tabular-nums">
                      {shareLabel}
                    </span>
                    <span className="text-slate-700">
                      <span className={o.detail ? "font-medium" : undefined}>
                        {o.label}
                      </span>
                      {o.detail && (
                        <span className="text-slate-500 text-xs">
                          {" — "}
                          {o.detail}
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="text-[10px] text-slate-400 mt-2">
              {isKo
                ? `% = 국가 페르소나 중 해당 거부 요인을 제기한 비율. 한 페르소나가 여러 거부 요인을 들 수 있어 합이 100%를 넘을 수 있습니다.${usingTaxonomy ? " 분류 기반 집계 (Phase 2 taxonomy)." : ""}`
                : `% = share of country personas who raised the concern. One persona can list multiple, so the column may sum above 100%.${usingTaxonomy ? " Grouped by taxonomy category." : ""}`}
            </p>
          </div>
          );
        })()}
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
          ) : (() => {
            const sharePct =
              totalPersonas > 0
                ? ((detail.persona.count / totalPersonas) * 100).toFixed(1)
                : null;
            const highIntentPct =
              detail.persona.count > 0
                ? (detail.persona.highIntent / detail.persona.count) * 100
                : 0;
            const lowAbsoluteDemand = highIntentPct < 5;
            return (
              <>
                <ul className="space-y-1 text-sm tabular-nums">
                  <li className="flex justify-between">
                    <span className="text-slate-500">{isKo ? "페르소나 수" : "Personas"}</span>
                    <span className="text-slate-900">
                      {sharePct
                        ? `${detail.persona.count.toLocaleString()} / ${totalPersonas.toLocaleString()} (${sharePct}%)`
                        : detail.persona.count.toLocaleString()}
                    </span>
                  </li>
                  <li className="flex justify-between">
                    <span className="text-slate-500">{isKo ? "평균 구매의향" : "Mean intent"}</span>
                    <span className="text-slate-900">{detail.persona.meanIntent}/100</span>
                  </li>
                  <li className="flex justify-between">
                    <span className="text-slate-500">{isKo ? "고의향 (≥70)" : "High (≥70)"}</span>
                    <span className="text-success">
                      {detail.persona.highIntent} ({highIntentPct.toFixed(1)}%)
                    </span>
                  </li>
                  <li className="flex justify-between">
                    <span className="text-slate-500">{isKo ? "저의향 (<35)" : "Low (<35)"}</span>
                    <span className="text-risk">{detail.persona.lowIntent}</span>
                  </li>
                </ul>
                {lowAbsoluteDemand && (
                  <p className="text-[11px] text-risk leading-relaxed mt-2">
                    {isKo
                      ? `⚠ 고의향 비율 ${highIntentPct.toFixed(1)}% (5% 미만) — 상대 순위는 1위지만 절대 수요는 매우 낮음. 진출 결정 전 추가 검증 권장.`
                      : `⚠ High-intent share ${highIntentPct.toFixed(1)}% (<5%) — top-ranked market but absolute demand is thin. Verify before commit.`}
                  </p>
                )}
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

/**
 * Per-country score decomposition. Six dimensions answer "why does this
 * country score where it does?". Renders as a horizontal bar list — same
 * pattern as bestCountryDistribution for visual consistency. Skipped when
 * legacy aggregates don't carry per-component data.
 *
 * Rendering choice: bars (not radar) because:
 *   - Bars give exact value at a glance, radar makes 60 vs 65 hard to read
 *   - Bars are language-agnostic for accessibility (screen readers)
 *   - Radar in this codebase would need a new chart dep
 */
function CountryComponentBreakdown({
  components,
  finalScoreMean,
  isKo,
}: {
  components: NonNullable<EnsembleAggregate["countryStats"][number]["components"]>;
  finalScoreMean: number;
  isKo: boolean;
}) {
  const rows = [
    {
      key: "marketSize",
      label: isKo ? "시장 크기" : "Market size",
      hint: isKo
        ? "인구 × 구매력 × 카테고리 침투율"
        : "Population × purchasing power × category penetration",
      value: components.marketSize.mean,
    },
    {
      key: "culturalFit",
      label: isKo ? "문화 적합" : "Cultural fit",
      hint: isKo
        ? "언어·라이프스타일·브랜드 친숙도"
        : "Language, lifestyle, brand familiarity",
      value: components.culturalFit.mean,
    },
    {
      key: "channelMatch",
      label: isKo ? "채널 매치" : "Channel match",
      hint: isKo
        ? "유통 채널 가용성 + 페르소나 채널 선호 일치"
        : "Distribution availability + persona channel preference",
      value: components.channelMatch.mean,
    },
    {
      key: "priceCompat",
      label: isKo ? "가격 수용" : "Price fit",
      hint: isKo
        ? "현지 구매력 + 경쟁사 가격 + 페르소나 가격민감도"
        : "Local purchasing power + competitor anchors + price sensitivity",
      value: components.priceCompat.mean,
    },
    {
      key: "competition",
      label: isKo ? "경쟁 (역치)" : "Competition (inv)",
      hint: isKo
        ? "높을수록 덜 혼잡, 지배 incumbent 부재"
        : "Higher = less crowded / no dominant incumbent",
      value: components.competition.mean,
    },
    {
      key: "regulatory",
      label: isKo ? "규제 (역치)" : "Regulatory (inv)",
      hint: isKo
        ? "높을수록 진입 장벽 적음 (관세·인증·제한)"
        : "Higher = fewer barriers (duties, certs, restrictions)",
      value: components.regulatory.mean,
    },
  ];

  // Drag the eye to the lowest score — the user wants to know "what's
  // weakest about this country?" first, not what's average.
  const lowest = rows.reduce((a, b) => (a.value <= b.value ? a : b));

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
          {isKo ? "점수 분해 (왜 이 점수인가)" : "Score decomposition (why this score)"}
        </div>
        <div className="text-[11px] text-slate-500">
          {isKo ? "최종 평균" : "Final mean"}{" "}
          <span className="font-semibold text-slate-700 tabular-nums">
            {finalScoreMean.toFixed(1)}
          </span>
        </div>
      </div>
      <ul className="space-y-1.5">
        {rows.map((r) => {
          const tone =
            r.value >= 70 ? "bg-success" : r.value >= 50 ? "bg-warn" : "bg-risk";
          const isLowest = r.key === lowest.key;
          return (
            <li key={r.key} className="flex items-center gap-3 text-sm" title={r.hint}>
              <div
                className={clsx(
                  "w-28 shrink-0 text-xs flex items-center gap-1",
                  isLowest ? "text-risk font-semibold" : "text-slate-600",
                )}
              >
                {r.label}
                {isLowest && <AlertCircle size={11} className="text-risk shrink-0" />}
              </div>
              <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={clsx("h-full transition-all", tone)}
                  style={{ width: `${Math.max(0, Math.min(100, r.value))}%` }}
                />
              </div>
              <div className="w-10 text-right text-xs tabular-nums text-slate-600">
                {r.value.toFixed(0)}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
        {isKo
          ? "각 항목 0–100. 경쟁·규제는 역치 (높을수록 좋음). 가장 낮은 항목에 주목 — 그 부분이 진출의 약점입니다."
          : "Each metric 0–100. Competition and regulatory are inverted (higher = better). The lowest score is your weakness — focus there."}
      </p>
    </div>
  );
}

/**
 * Two-stage funnel strip — ad impression → click → buy. Reads
 * detail.funnel which the aggregator computed from Persona.adReaction
 * (the new schema field). Renders 3 stacked horizontal bars where
 * each subsequent bar is the percentage of personas that survived
 * the previous step.
 *
 * The buy stage uses the same ≥60 purchaseIntent threshold as the
 * marketing-funnel "would buy" bucket. Drop-offs between stages
 * surface where the offer is leaking — high curiosity + low buy
 * rate means the AD is good but the OFFER isn't, etc.
 */
function FunnelStrip({
  funnel,
  isKo,
}: {
  funnel: NonNullable<
    NonNullable<EnsembleAggregate["countryStats"][number]["detail"]>["funnel"]
  >;
  isKo: boolean;
}) {
  const rows = [
    {
      key: "curiosity",
      label: isKo ? "광고 호기심" : "Ad curiosity",
      value: funnel.curiosityMean,
      tone: funnel.curiosityMean >= 60 ? "bg-success" : funnel.curiosityMean >= 40 ? "bg-warn" : "bg-risk",
      hint: isKo ? "광고를 보고 멈춰서 봤을 페르소나 평균 점수 (0-100)" : "Mean attention score on the ad (0-100)",
    },
    {
      key: "click",
      label: isKo ? "클릭 의향" : "Click rate",
      value: funnel.clickRatePct,
      tone: funnel.clickRatePct >= 50 ? "bg-success" : funnel.clickRatePct >= 30 ? "bg-warn" : "bg-risk",
      hint: isKo ? "랜딩페이지로 넘어갈 의향이 있는 페르소나 비율" : "% of personas who would tap to learn more",
    },
    {
      key: "buy",
      label: isKo ? "구매 의향" : "Buy rate",
      value: funnel.buyRatePct,
      tone: funnel.buyRatePct >= 40 ? "bg-success" : funnel.buyRatePct >= 25 ? "bg-warn" : "bg-risk",
      hint: isKo ? "구매 의향 60+ (전체 페르소나의 비율)" : "% with purchase intent ≥ 60",
    },
  ];

  // Compute drop-offs to highlight where the funnel leaks. Curiosity is
  // 0-100, the others are %. When the click rate is far below curiosity
  // (e.g. 65 vs 25), that's an ad-vs-landing mismatch worth flagging.
  const dropoffMessage: { text: string; tooltip: string } | null = (() => {
    const curiosityClickGap = funnel.curiosityMean - funnel.clickRatePct;
    const clickBuyGap = funnel.clickRatePct - funnel.buyRatePct;
    if (curiosityClickGap >= 25) {
      return {
        text: isKo
          ? "광고는 시선을 끌지만 클릭으로 이어지지 않음 → 카피·CTA 점검"
          : "Ad catches eye but doesn't earn the click — review copy + CTA",
        tooltip: isKo
          ? `광고 호기심(${funnel.curiosityMean.toFixed(0)}) − 클릭률(${funnel.clickRatePct.toFixed(0)}%) = ${curiosityClickGap.toFixed(0)}p. 25p 이상 차이가 나면 경고가 뜹니다 — 광고에 시선은 끌지만 다음 행동이 안 일어나는 패턴이라, 카피·CTA의 다음-행동 hook을 강화하세요.`
          : `Ad curiosity (${funnel.curiosityMean.toFixed(0)}) − click rate (${funnel.clickRatePct.toFixed(0)}%) = ${curiosityClickGap.toFixed(0)}pp. Triggers at ≥25pp. Ad catches eye but the next-action hook is weak — sharpen copy and CTA.`,
      };
    }
    if (clickBuyGap >= 25) {
      return {
        text: isKo
          ? "클릭은 받지만 구매로 이어지지 않음 → 가격·랜딩 컨텐츠 점검"
          : "Clicks don't convert to buys — review pricing + landing content",
        tooltip: isKo
          ? `클릭률(${funnel.clickRatePct.toFixed(0)}%) − 구매률(${funnel.buyRatePct.toFixed(0)}%) = ${clickBuyGap.toFixed(0)}p. 25p 이상 차이가 나면 경고가 뜹니다 — 광고는 통하지만 랜딩에서 이탈하는 패턴이라, 가격 정당화·가치제안·신뢰 신호(리뷰·인증·보증)를 점검하세요.`
          : `Click rate (${funnel.clickRatePct.toFixed(0)}%) − buy rate (${funnel.buyRatePct.toFixed(0)}%) = ${clickBuyGap.toFixed(0)}pp. Triggers at ≥25pp. Ad lands but landing page loses them — review price justification, value prop, and trust signals (reviews, certs, guarantee).`,
      };
    }
    return null;
  })();

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-baseline justify-between mb-2.5">
        <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
          {isKo ? "구매 퍼널 (광고 → 클릭 → 구매)" : "Conversion funnel (ad → click → buy)"}
        </div>
        <div className="text-[11px] text-slate-500">
          {isKo ? `샘플 ${funnel.sample.toLocaleString()}명` : `${funnel.sample.toLocaleString()} personas`}
        </div>
      </div>
      <ul className="space-y-1.5">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center gap-3 text-sm" title={r.hint}>
            <div className="w-24 shrink-0 text-xs text-slate-600">{r.label}</div>
            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={clsx("h-full transition-all", r.tone)}
                style={{ width: `${Math.max(0, Math.min(100, r.value))}%` }}
              />
            </div>
            <div className="w-12 text-right text-xs tabular-nums text-slate-600">
              {r.key === "curiosity" ? r.value.toFixed(0) : `${r.value}%`}
            </div>
          </li>
        ))}
      </ul>
      {dropoffMessage && (
        <p className="text-[11px] text-warn mt-2 leading-relaxed flex items-start gap-1.5">
          <AlertCircle size={12} className="shrink-0 mt-0.5" />
          <span>
            {dropoffMessage.text}
            <span
              className="ml-1.5 inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-warn/15 text-warn text-[9px] font-bold cursor-help align-middle"
              title={dropoffMessage.tooltip}
            >
              ?
            </span>
          </span>
        </p>
      )}
    </div>
  );
}

/**
 * Market profile tab — competitor analysis, channel landscape,
 * regulatory, pricing benchmarks, cultural insights, and GTM
 * strategy for the recommended country. Mirrors the PDF's market
 * profile page but rendered with web-native styling.
 *
 * Each section conditionally renders based on whether the LLM
 * provided that field. Empty sections silently hide rather than
 * showing placeholder text — better sparse than misleading.
 */
function MarketProfileTab({
  profile,
  recommendedCountry,
  ensembleId,
  basePriceCents,
  currency,
  tier,
  locale,
  isKo,
}: {
  profile: EnsembleAggregate["marketProfile"];
  recommendedCountry: string;
  ensembleId: string;
  /** User-input base price — fallback for legacy sims whose
   *  yourPositionPriceCents is undefined (pre-2026-05-07 sims always
   *  anchored yourPosition on the input price). */
  basePriceCents: number | null;
  currency: string;
  /** Ensemble tier — drives the empty-state copy. Hypothesis skips
   *  market-profile generation by design (cost), so the empty state
   *  there should explain "tier-gated, click to backfill" rather than
   *  the misleading "feature was introduced after this sim". */
  tier: string;
  locale: string;
  isKo: boolean;
}) {
  void locale;
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const generate = async () => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/ensembles/${ensembleId}/market-profile`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(await friendlyApiError(res, isKo ? "ko" : "en"));
      // Refresh the page so the result API re-fetches with the
      // newly persisted marketProfile.
      router.refresh();
      // The page-level state is set from the polling effect on
      // first load. After router.refresh() the effect doesn't
      // re-run because status hasn't changed; the simplest fix
      // is a full reload to re-seed the result hook.
      window.location.reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  // Empty state — no profile yet. Offer a one-click backfill.
  if (!profile) {
    return (
      <div className="card p-12 text-center max-w-2xl mx-auto">
        <Lightbulb size={32} className="text-brand mx-auto mb-3" />
        <h2 className="text-xl font-semibold text-slate-900 mb-2">
          {isKo
            ? `${recommendedCountry} 시장 상황 + 경쟁자 분석을 생성하세요`
            : `Generate market profile for ${recommendedCountry}`}
        </h2>
        <p className="text-sm text-slate-500 leading-relaxed mb-6 max-w-md mx-auto">
          {isKo
            ? "추천 진출국에 대한 시장 규모, 명명된 경쟁자, 채널 환경, 규제, 가격 벤치마크, GTM 전략을 한 번의 LLM 호출로 채워줍니다. 약 30초-1분 소요."
            : "Fill in market size, named competitors, channels, regulatory, pricing benchmarks, and GTM strategy via a single LLM call. Takes about 30-60 seconds."}
        </p>
        <button
          type="button"
          onClick={generate}
          disabled={busy}
          className="btn-primary inline-flex items-center gap-2 disabled:opacity-60"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Lightbulb size={16} />}
          {busy
            ? isKo
              ? "생성 중... (LLM 호출)"
              : "Generating... (LLM call)"
            : isKo
              ? "시장 분석 생성"
              : "Generate market profile"}
        </button>
        {err && <p className="text-xs text-risk mt-4">{err}</p>}
        <p className="text-[11px] text-slate-400 mt-6 leading-relaxed">
          {tier === "hypothesis"
            ? isKo
              ? "Hypothesis tier는 비용 절감을 위해 시장 분석을 자동 생성하지 않습니다. 위 버튼으로 바로 생성하거나, Consensus tier 이상으로 다시 돌리면 자동 포함됩니다."
              : "Hypothesis tier skips market-profile generation by design (cost). Click the button above to fill it in now, or rerun on Consensus tier or higher to include it automatically."
            : isKo
              ? "이 ensemble의 시장 분석이 아직 채워지지 않았습니다. 위 버튼으로 즉시 생성하거나, 새로 시뮬을 돌리면 자동 포함됩니다."
              : "Market profile hasn't been generated for this ensemble yet. Click the button above to backfill it now, or run a new simulation to include it automatically."}
        </p>
      </div>
    );
  }

  const competitors = profile.competitors ?? [];
  const channels = profile.channels;
  const cult = profile.culturalNotes;
  const reg = profile.regulatory;
  const pricing = profile.pricingBenchmarks;
  const gtm = profile.goToMarketStrategy;
  const ms = profile.marketSize;

  const threatToneClass = (t: string) =>
    t === "high"
      ? "bg-risk text-white"
      : t === "medium"
        ? "bg-warn text-white"
        : "bg-slate-300 text-slate-700";
  const threatBorder = (t: string) =>
    t === "high" ? "border-risk" : t === "medium" ? "border-warn" : "border-slate-300";
  const sevToneClass = (s: string) =>
    s === "high"
      ? "bg-risk text-white"
      : s === "medium"
        ? "bg-warn text-white"
        : "bg-slate-300 text-slate-700";
  const compTypeLabel = (t: string) => {
    if (t === "direct") return isKo ? "직접 경쟁" : "Direct";
    if (t === "indirect") return isKo ? "간접" : "Indirect";
    return isKo ? "대체재" : "Substitute";
  };
  const threatLabel = (t: string) => {
    if (t === "high") return isKo ? "위협 높음" : "HIGH threat";
    if (t === "medium") return isKo ? "위협 중" : "MEDIUM threat";
    return isKo ? "위협 낮음" : "LOW threat";
  };

  return (
    <div className="space-y-6">
      {/* Header context */}
      <div>
        <h2 className="text-xl font-semibold text-slate-900">
          {isKo
            ? `${recommendedCountry} — 시장 상황 + 경쟁자 분석`
            : `${recommendedCountry} — Market profile + competitive analysis`}
        </h2>
        <p className="text-sm text-slate-500 mt-1 leading-relaxed">
          {isKo
            ? "추천 진출국에 대한 시장 규모, 명명된 경쟁자, 채널 환경, 규제, 가격 벤치마크, GTM 전략 요약. 진출 의사결정의 실세계 맥락."
            : "Recommended-market deep-dive: TAM, named competitors, channel landscape, regulatory, pricing benchmarks, and GTM strategy."}
        </p>
      </div>

      {/* Market sizing */}
      {ms && (ms.estimateUsd || ms.growthTrend || ms.addressableSegment) && (
        <div className="card p-5">
          <div className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-3">
            {isKo ? "시장 규모" : "Market size"}
          </div>
          {ms.groundingFlag?.status === "mismatch" && (
            <div className="mb-3 rounded-md border border-warn/30 bg-warn-soft/40 px-3 py-2 text-xs text-slate-900 leading-relaxed">
              <span className="font-semibold">
                {isKo ? "⚠ 출처 범위와 차이 큼" : "⚠ Outside cited-source range"}
              </span>
              {ms.groundingFlag.snippetRangeUsdB && ms.groundingFlag.claimedValueUsdB && (
                <span className="ml-1 text-slate-700">
                  {isKo
                    ? `— 추정치 ~$${ms.groundingFlag.claimedValueUsdB.toFixed(1)}B vs 출처 ${ms.groundingFlag.snippetRangeUsdB.low.toFixed(1)}–${ms.groundingFlag.snippetRangeUsdB.high.toFixed(1)}B (${ms.groundingFlag.direction === "above" ? "과대" : "과소"} 추정 가능성). 아래 출처 링크와 직접 대조하세요.`
                    : `— estimate ~$${ms.groundingFlag.claimedValueUsdB.toFixed(1)}B vs cited ${ms.groundingFlag.snippetRangeUsdB.low.toFixed(1)}–${ms.groundingFlag.snippetRangeUsdB.high.toFixed(1)}B (likely ${ms.groundingFlag.direction === "above" ? "over" : "under"}-estimate). Verify against the source links below.`}
                </span>
              )}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {ms.estimateUsd && (
              <div>
                <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">
                  {isKo ? "TAM 추정" : "TAM"}
                </div>
                {/* Length-aware sizing: a short ≤50-char figure like "$3.5B
                    annually" still deserves the bold-headline treatment.
                    Anything longer (Tavily-grounded estimates often run as
                    full-paragraph prose) renders in the same body style as
                    the sibling growthTrend / addressableSegment columns
                    so the three sit visually balanced as a unified block. */}
                <div
                  className={clsx(
                    "text-balance break-keep",
                    ms.estimateUsd.length <= 50
                      ? "text-2xl font-bold tabular-nums text-slate-900"
                      : "text-sm text-slate-700 leading-relaxed",
                  )}
                >
                  {ms.estimateUsd}
                </div>
              </div>
            )}
            {ms.growthTrend && (
              <div>
                <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">
                  {isKo ? "성장 추세" : "Growth trend"}
                </div>
                <div className="text-sm text-slate-700 leading-relaxed text-balance break-keep">{ms.growthTrend}</div>
              </div>
            )}
            {ms.addressableSegment && (
              <div>
                <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">
                  {isKo ? "도달 세그먼트" : "Addressable segment"}
                </div>
                <div className="text-sm text-slate-700 leading-relaxed text-balance break-keep">{ms.addressableSegment}</div>
              </div>
            )}
          </div>
          {(ms.citations?.length ?? 0) > 0 ? (
            <div className="mt-4 pt-3 border-t border-slate-100">
              <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-2">
                {isKo ? "출처" : "Sources"}
              </div>
              <ul className="space-y-1">
                {ms.citations!.slice(0, 3).map((c, i) => (
                  <li key={i} className="text-xs">
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent-600 hover:underline break-all"
                    >
                      {`${i + 1}. ${c.title}`}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="mt-3 pt-3 border-t border-slate-100 text-[11px] text-slate-400">
              {isKo
                ? "AI 추정 — 외부 시장조사 데이터로 검증되지 않음"
                : "AI estimate — not externally sourced"}
            </div>
          )}
        </div>
      )}

      {/* Competitors */}
      {competitors.length > 0 && (
        <div>
          <h3 className="text-base font-semibold text-slate-900 mb-3">
            {isKo ? "경쟁자 분석" : "Competitive landscape"}
          </h3>
          <div className="space-y-3">
            {competitors.map((c, i) => (
              <div
                key={i}
                className={clsx(
                  "card p-4 border-l-4",
                  threatBorder(c.threatLevel),
                )}
              >
                <div className="flex items-baseline gap-3 flex-wrap mb-2">
                  <span className="text-lg font-bold text-slate-900">{c.name}</span>
                  <span className="text-xs text-slate-500">{compTypeLabel(c.type)}</span>
                  <span
                    className={clsx(
                      "text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full",
                      threatToneClass(c.threatLevel),
                    )}
                  >
                    {threatLabel(c.threatLevel)}
                  </span>
                  {c.pricePoint && (
                    <span className="ml-auto text-sm text-slate-700 tabular-nums font-medium">
                      {c.pricePoint}
                    </span>
                  )}
                </div>
                {/* Brand identity row — origin country chip + one-line
                    establishment context. Hidden on legacy ensembles
                    where neither field is populated. */}
                {(c.originCountry || c.brandContext) && (
                  <div className="flex items-baseline gap-2 flex-wrap mb-2">
                    {c.originCountry && (
                      <span className="text-[10px] font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                        {isKo ? `원산지 ${c.originCountry}` : `Origin ${c.originCountry}`}
                      </span>
                    )}
                    {c.brandContext && (
                      <span className="text-xs text-slate-600 leading-snug flex-1 min-w-[12rem]">
                        {c.brandContext}
                      </span>
                    )}
                  </div>
                )}
                {c.marketShareEstimate && (
                  <div className="text-xs text-slate-500 mb-2">{c.marketShareEstimate}</div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {c.strengths.length > 0 && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-success font-bold mb-1">
                        {isKo ? "강점" : "Strengths"}
                      </div>
                      <ul className="space-y-0.5">
                        {c.strengths.map((s, idx) => (
                          <li key={idx} className="text-sm text-slate-700 leading-snug">
                            • {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {c.weaknesses.length > 0 && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-risk font-bold mb-1">
                        {isKo ? "약점" : "Weaknesses"}
                      </div>
                      <ul className="space-y-0.5">
                        {c.weaknesses.map((w, idx) => (
                          <li key={idx} className="text-sm text-slate-700 leading-snug">
                            • {w}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pricing benchmarks */}
      {pricing &&
        (pricing.entryLevel || pricing.mid || pricing.premium || pricing.yourPosition) && (
          <div>
            <h3 className="text-base font-semibold text-slate-900 mb-3">
              {isKo ? "현지 가격 벤치마크" : "Local pricing benchmarks"}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
              {pricing.entryLevel && (
                <div className="card p-4">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">
                    {isKo ? "엔트리" : "Entry"}
                  </div>
                  <div className="text-base font-semibold text-slate-900 tabular-nums">
                    {pricing.entryLevel}
                  </div>
                </div>
              )}
              {pricing.mid && (
                <div className="card p-4">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">
                    {isKo ? "미드" : "Mid"}
                  </div>
                  <div className="text-base font-semibold text-slate-900 tabular-nums">
                    {pricing.mid}
                  </div>
                </div>
              )}
              {pricing.premium && (
                <div className="card p-4">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">
                    {isKo ? "프리미엄" : "Premium"}
                  </div>
                  <div className="text-base font-semibold text-slate-900 tabular-nums">
                    {pricing.premium}
                  </div>
                </div>
              )}
            </div>
            {pricing.yourPosition && (() => {
              // Anchor price for the label — what the LLM actually
              // analyzed in `yourPosition`. New sims emit
              // yourPositionPriceCents (pricing-stage recommendation);
              // legacy sims fall back to the user's input base price.
              const anchorCents =
                pricing.yourPositionPriceCents ?? basePriceCents ?? null;
              const anchorLabel = anchorCents != null
                ? formatPrice(anchorCents, currency)
                : null;
              return (
                <div className="rounded-xl border-l-4 border-brand bg-brand-50/40 p-4">
                  <div className="text-[10px] uppercase tracking-wide text-brand font-bold mb-1">
                    {isKo
                      ? anchorLabel
                        ? `${anchorLabel} 기준 포지션`
                        : "포지션"
                      : anchorLabel
                        ? `Position at ${anchorLabel}`
                        : "Price position"}
                  </div>
                  <p className="text-sm text-slate-700 leading-relaxed">{pricing.yourPosition}</p>
                </div>
              );
            })()}
          </div>
        )}

      {/* Channels */}
      {channels &&
        ((channels.primary?.length ?? 0) > 0 ||
          (channels.secondary?.length ?? 0) > 0 ||
          (channels.emerging?.length ?? 0) > 0) && (
          <div>
            <h3 className="text-base font-semibold text-slate-900 mb-3">
              {isKo ? "채널 환경" : "Channel landscape"}
            </h3>
            <div className="card p-5 space-y-4">
              {(["primary", "secondary", "emerging"] as const).map((tier) => {
                const items = channels[tier] ?? [];
                if (items.length === 0) return null;
                const tierLabel =
                  tier === "primary"
                    ? isKo
                      ? "1차 (필수)"
                      : "Primary (must-have)"
                    : tier === "secondary"
                      ? isKo
                        ? "2차 (확장)"
                        : "Secondary (expand)"
                      : isKo
                        ? "신흥 (실험)"
                        : "Emerging (test)";
                const tierTone =
                  tier === "primary"
                    ? "text-success"
                    : tier === "secondary"
                      ? "text-brand"
                      : "text-warn";
                return (
                  <div key={tier}>
                    <div
                      className={clsx(
                        "text-[10px] uppercase tracking-wide font-bold mb-2",
                        tierTone,
                      )}
                    >
                      {tierLabel}
                    </div>
                    <ul className="space-y-1.5">
                      {items.map((item, idx) => (
                        <li key={idx} className="text-sm text-slate-700 leading-relaxed">
                          • <span className="font-semibold">{normalizeLLMText(item.name)}</span>
                          {item.rationale && (
                            <span className="text-slate-500"> — {normalizeLLMText(item.rationale)}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      {/* Regulatory */}
      {reg && ((reg.barriers?.length ?? 0) > 0 || (reg.requirements?.length ?? 0) > 0) && (
        <div>
          <h3 className="text-base font-semibold text-slate-900 mb-3">
            {isKo ? "규제 / 진입 장벽" : "Regulatory / entry barriers"}
          </h3>
          <div className="card p-5 space-y-3">
            {(reg.barriers ?? []).map((b, i) => (
              <div key={i} className="flex items-start gap-3">
                <span
                  className={clsx(
                    "shrink-0 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full mt-0.5",
                    sevToneClass(b.severity),
                  )}
                >
                  {b.severity.toUpperCase()}
                </span>
                <div>
                  <div className="text-sm font-semibold text-slate-900">{b.name}</div>
                  {b.description && (
                    <div className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                      {b.description}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {(reg.requirements?.length ?? 0) > 0 && (
              <div className="pt-3 border-t border-slate-100">
                <div className="text-[10px] uppercase tracking-wide text-slate-500 font-bold mb-1.5">
                  {isKo ? "필수 요구사항" : "Required"}
                </div>
                <ul className="space-y-0.5">
                  {(reg.requirements ?? []).map((r, i) => (
                    <li key={i} className="text-sm text-slate-700">
                      • {r}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {reg.timeToCompliance && (
              <div className="pt-3 border-t border-slate-100 text-xs text-slate-600">
                <span className="font-semibold">
                  {isKo ? "준수 소요시간:" : "Time to compliance:"}
                </span>{" "}
                {reg.timeToCompliance}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Cultural notes */}
      {cult &&
        (cult.valuesAlignment ||
          cult.purchaseBehavior ||
          cult.languageNotes ||
          cult.seasonality) && (
          <div>
            <h3 className="text-base font-semibold text-slate-900 mb-3">
              {isKo ? "문화 / 소비자 인사이트" : "Cultural & consumer insights"}
            </h3>
            <div className="card p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {cult.valuesAlignment && (
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-slate-500 font-bold mb-1">
                    {isKo ? "가치관" : "Values"}
                  </div>
                  <p className="text-sm text-slate-700 leading-relaxed">{cult.valuesAlignment}</p>
                </div>
              )}
              {cult.purchaseBehavior && (
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-slate-500 font-bold mb-1">
                    {isKo ? "구매 행동" : "Purchase behavior"}
                  </div>
                  <p className="text-sm text-slate-700 leading-relaxed">{cult.purchaseBehavior}</p>
                </div>
              )}
              {cult.languageNotes && (
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-slate-500 font-bold mb-1">
                    {isKo ? "언어 / 네이밍" : "Language / naming"}
                  </div>
                  <p className="text-sm text-slate-700 leading-relaxed">{cult.languageNotes}</p>
                </div>
              )}
              {cult.seasonality && (
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-slate-500 font-bold mb-1">
                    {isKo ? "시즌성" : "Seasonality"}
                  </div>
                  <p className="text-sm text-slate-700 leading-relaxed">{cult.seasonality}</p>
                </div>
              )}
            </div>
          </div>
        )}

      {/* GTM strategy summary */}
      {gtm &&
        (gtm.keyMessage ||
          gtm.primaryAudience ||
          (gtm.differentiators?.length ?? 0) > 0 ||
          (gtm.risks?.length ?? 0) > 0) && (
          <div className="rounded-xl border-t-4 border-success bg-success-soft/30 p-5">
            <div className="text-[10px] uppercase tracking-wide text-success font-bold mb-3">
              {isKo ? "GTM 전략 요약" : "GTM strategy summary"}
            </div>
            <div className="space-y-4">
              {gtm.keyMessage && (
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">
                    {isKo ? "핵심 메시지" : "Key message"}
                  </div>
                  <p className="text-base font-semibold text-slate-900 leading-relaxed">
                    {gtm.keyMessage}
                  </p>
                </div>
              )}
              {gtm.primaryAudience && (
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">
                    {isKo ? "1차 타겟 (ICP)" : "Primary audience (ICP)"}
                  </div>
                  <p className="text-sm text-slate-700 leading-relaxed">{gtm.primaryAudience}</p>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {(gtm.differentiators?.length ?? 0) > 0 && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-success font-bold mb-1.5">
                      {isKo ? "차별화 요소" : "Differentiators"}
                    </div>
                    <ul className="space-y-1">
                      {(gtm.differentiators ?? []).map((d, i) => (
                        <li key={i} className="text-sm text-slate-700 leading-snug">
                          ✓ {d}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {(gtm.risks?.length ?? 0) > 0 && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-risk font-bold mb-1.5">
                      {isKo ? "주요 시장 진입 리스크" : "Market-entry risks"}
                    </div>
                    <ul className="space-y-1">
                      {(gtm.risks ?? []).map((r, i) => (
                        <li key={i} className="text-sm text-slate-700 leading-snug">
                          ⚠ {r}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
    </div>
  );
}

function PersonasTab({
  personas,
  isKo,
  locale,
  ensembleId,
  project,
}: {
  personas: EnsembleAggregate["personas"];
  isKo: boolean;
  locale: string;
  ensembleId: string;
  project: ProjectInfo | null;
}) {
  void locale;
  const [showAll, setShowAll] = useState(false);
  const [chatPersona, setChatPersona] = useState<
    NonNullable<EnsembleAggregate["personas"]>["topPositiveVoices"][number] | null
  >(null);
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
        <ChartGuide isKo={isKo}>
          <GuideSection title={isKo ? "0–100 스케일의 의미" : "What the 0–100 scale means"}>
            <p className="m-0">
              {isKo
                ? "각 페르소나가 \"이 제품을 구매할 의향\"을 0(절대 안 산다) ~ 100(반드시 산다)으로 자기 평가한 점수의 분포. 막대 색은 강도 단계를 표시합니다."
                : "Each persona self-rates intent from 0 (never buy) to 100 (will definitely buy). Bar color marks the intensity tier."}
            </p>
            <ul className="list-disc pl-5 space-y-0.5 mt-2 mb-0">
              {isKo ? (
                <>
                  <li><span className="text-success font-semibold">≥70 (강한 관심)</span> — 적극적 마케팅 타깃</li>
                  <li><span className="text-warn font-semibold">35–69 (관심 있음)</span> — 추가 설득 필요</li>
                  <li><span className="text-risk font-semibold">&lt;35 (약한 관심)</span> — 광고 제외 후보</li>
                </>
              ) : (
                <>
                  <li><span className="text-success font-semibold">≥70 (high)</span> — active acquisition targets</li>
                  <li><span className="text-warn font-semibold">35–69 (warm)</span> — needs more persuasion</li>
                  <li><span className="text-risk font-semibold">&lt;35 (low)</span> — likely suppression candidates</li>
                </>
              )}
            </ul>
          </GuideSection>
          <GuideSection title={isKo ? "분포 모양 읽기" : "Reading the shape"}>
            <ul className="list-disc pl-5 space-y-0.5 m-0">
              {isKo ? (
                <>
                  <li><strong>오른쪽 치우침</strong> — 강한 수요. 출시 추천.</li>
                  <li><strong>중앙 봉우리</strong> — 모호함. 포지셔닝 다듬어 갈라낼 필요.</li>
                  <li><strong>두 봉우리 (양극화)</strong> — 사랑하는 층 + 거부 층. 타깃 좁히기.</li>
                  <li><strong>왼쪽 치우침</strong> — 시장 부적합. 페르소나 풀 / 가격 / 카테고리 재검토.</li>
                </>
              ) : (
                <>
                  <li><strong>Right-skewed</strong> — strong demand → ship it.</li>
                  <li><strong>Middle peak</strong> — ambiguous → tighten positioning to split the audience.</li>
                  <li><strong>Bimodal</strong> — lovers + rejectors → narrow your target.</li>
                  <li><strong>Left-skewed</strong> — market mismatch → revisit persona pool / price / category.</li>
                </>
              )}
            </ul>
          </GuideSection>
        </ChartGuide>
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
          isKo={isKo}
          onChat={setChatPersona}
        />
        <VoiceList
          title={isKo ? "부정 페르소나의 목소리" : "Negative voices"}
          voices={personas.topNegativeVoices}
          accent="warn"
          isKo={isKo}
          onChat={setChatPersona}
        />
      </div>

      {chatPersona && (
        <PersonaChatModal
          persona={chatPersona}
          project={project}
          locale={locale}
          isKo={isKo}
          onClose={() => setChatPersona(null)}
        />
      )}

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
          <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
            {isKo
              ? "각 연령대별로 시뮬레이션에 참여한 페르소나 수입니다. 추천국의 실제 인구 분포(정부 통계 기반) × 본 카테고리의 구매층 적합도로 가중되어 생성됩니다 — 가장 많은 cohort가 헤드라인 의향·objection 신호를 주도합니다."
              : "Number of personas in each age bucket. Sampled from the recommended country's real demographic distribution (gov-stats grounded) weighted by category fit — the dominant cohort drives the headline intent + objection signal."}
          </p>
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
                  <th className="text-right py-1 px-1 font-medium">{isKo ? "언급 (명)" : "Mentions"}</th>
                  <th className="text-right py-1 px-1 font-medium">{isKo ? "전체 비중" : "Share"}</th>
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
                rows={personas.segmentBreakdown.byGender.map((r) => ({
                  ...r,
                  // The aggregator collapses non-binary / 기타 / NB into
                  // a single "other" bucket — readable in code, opaque
                  // in the UI. Expand the label so the segment card
                  // doesn't leave a reader wondering whether "other"
                  // means "unknown" / "didn't specify" / "non-binary".
                  bucket:
                    r.bucket === "other"
                      ? isKo
                        ? "기타·논바이너리"
                        : "Non-binary / other"
                      : isKo
                        ? r.bucket === "female"
                          ? "여성"
                          : r.bucket === "male"
                            ? "남성"
                            : r.bucket
                        : r.bucket === "female"
                          ? "Female"
                          : r.bucket === "male"
                            ? "Male"
                            : r.bucket,
                }))}
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
 * Generic collapsible reading-guide. Used to demystify dashboard sections
 * for first-time users — each chart that needs interpretation context
 * gets one of these directly underneath. Closed by default so the
 * dashboard doesn't grow vertically; expanded content goes as wide as
 * the parent.
 */
function ChartGuide({
  isKo,
  label,
  children,
}: {
  isKo: boolean;
  /** Optional override for the trigger text. Defaults to "이 차트 어떻게 읽나요?" / "How to read this chart". */
  label?: string;
  children: React.ReactNode;
}) {
  void isKo;
  return (
    <details className="mt-3 group">
      <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-700 inline-flex items-center gap-1 select-none">
        <ChevronRight size={12} className="transition-transform group-open:rotate-90" />
        <span>{label ?? (isKo ? "이 차트 어떻게 읽나요?" : "How to read this chart")}</span>
      </summary>
      <div className="mt-3 rounded-md border border-slate-200 bg-slate-50/60 p-4 text-xs text-slate-700 leading-relaxed space-y-3">
        {children}
      </div>
    </details>
  );
}

function GuideSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="font-semibold text-slate-900 mb-1">{title}</div>
      {children}
    </section>
  );
}

/**
 * One-time welcome modal that fires the FIRST time a workspace member
 * lands on a completed ensemble result. Three jump-to-tab cards walk
 * the user through the canonical reading order — Recommendation →
 * Personas → Risks. Dismissal POSTs to /api/me/onboarding so the
 * modal never opens again for this user.
 */
function WelcomeModal({
  isKo,
  onDismiss,
  onJumpTo,
}: {
  isKo: boolean;
  onDismiss: () => void;
  onJumpTo: (tab: TabKey) => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4"
      onClick={onDismiss}
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-xs uppercase tracking-wider text-accent-600 font-semibold mb-1">
          {isKo ? "첫 분석 결과 가이드" : "First-result guide"}
        </div>
        <h3 className="text-xl font-semibold text-slate-900 mb-1">
          {isKo ? "결과 읽는 3단계" : "Three steps to read this"}
        </h3>
        <p className="text-sm text-slate-500 mb-5 leading-relaxed">
          {isKo
            ? "처음이시면 이 순서대로 보세요. 각 카드를 누르면 해당 탭으로 바로 이동합니다."
            : "First time here? Tap a card to jump straight to that section."}
        </p>

        <div className="space-y-2 mb-6">
          <WelcomeStep
            num={1}
            title={isKo ? "추천 (Summary)" : "Recommendation (Summary)"}
            desc={
              isKo
                ? "어느 시장이 1순위인지 + 합의도 + 변동성 평가를 먼저 봅니다."
                : "Start with the #1 market, consensus, and variance assessment."
            }
            onClick={() => onJumpTo("summary")}
          />
          <WelcomeStep
            num={2}
            title={isKo ? "페르소나 (Personas)" : "Personas"}
            desc={
              isKo
                ? "왜 그 시장인가 — 구매의향 분포, 세그먼트, 채널·브랜드 멘션을 확인."
                : "Why that market — intent distribution, segments, channels they already mention."
            }
            onClick={() => onJumpTo("personas")}
          />
          <WelcomeStep
            num={3}
            title={isKo ? "리스크 (Risks)" : "Risks"}
            desc={
              isKo
                ? "출시 전에 반드시 봐야 할 것 — HIGH 리스크부터 우선 처리."
                : "Must-read before launch — start with HIGH severity items."
            }
            onClick={() => onJumpTo("risks")}
          />
        </div>

        <div className="flex items-start gap-2.5 rounded-md bg-accent-50 border border-accent-200 px-3.5 py-3 mb-4">
          <Lightbulb size={16} className="text-accent shrink-0 mt-0.5" />
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-wider text-accent mb-1">
              {isKo ? "팁" : "Tip"}
            </div>
            <p className="text-xs text-slate-700 leading-relaxed m-0">
              {isKo
                ? "차트 아래 \"이 차트 어떻게 읽나요?\" 링크를 누르면 컬럼·임계값·해석법을 펼쳐 볼 수 있습니다."
                : "Every chart has a \"How to read this chart\" link below it — click to expand thresholds and interpretation."}
            </p>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onDismiss}
            className="btn-primary text-sm"
          >
            {isKo ? "확인" : "Got it"}
          </button>
        </div>
      </div>
    </div>
  );
}

function WelcomeStep({
  num,
  title,
  desc,
  onClick,
}: {
  num: number;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left flex items-start gap-3 rounded-lg border border-slate-200 hover:border-accent-300 hover:bg-accent-50/40 transition-colors p-3"
    >
      <span className="shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-full bg-accent text-white text-xs font-bold">
        {num}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-slate-900">{title}</span>
        <span className="block text-xs text-slate-500 mt-0.5 leading-relaxed">{desc}</span>
      </span>
      <ChevronRight size={16} className="text-slate-400 mt-1 shrink-0" />
    </button>
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
    <details className="mt-3 group" open>
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
  isKo,
  onChat,
}: {
  title: string;
  voices: NonNullable<EnsembleAggregate["personas"]>["topPositiveVoices"];
  accent: "success" | "warn";
  isKo: boolean;
  onChat?: (v: NonNullable<EnsembleAggregate["personas"]>["topPositiveVoices"][number]) => void;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-900 mb-2">{title}</h3>
      <div className="card p-4 space-y-3">
        {voices.length === 0 ? (
          <div className="text-xs text-slate-400">—</div>
        ) : (
          voices.map((v, i) => (
            <div key={i} className="text-sm group">
              <p className="text-slate-700 leading-relaxed">"{v.text}"</p>
              <div className="text-xs text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
                <span>{v.country}</span>
                <span>·</span>
                <span
                  className={clsx(
                    accent === "success" ? "text-success" : "text-warn",
                    "font-semibold tabular-nums",
                  )}
                >
                  {isKo ? `의향 ${v.intent}` : `intent ${v.intent}`}
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
                {onChat && (
                  <button
                    type="button"
                    onClick={() => onChat(v)}
                    className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium text-brand bg-brand/5 border border-brand/20 hover:bg-brand/10 transition-colors"
                    title={isKo ? "이 페르소나에게 질문하기" : "Ask this persona"}
                  >
                    <MessageCircle size={11} />
                    <span>{isKo ? "질문하기" : "Ask"}</span>
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/**
 * Wow-factor follow-up chat with a single persona surfaced in the voice
 * list. The user clicks "질문하기" on a voice card → modal opens with
 * that persona's profile pinned at the top → user types follow-up
 * questions ("왜 이 가격이 비싸다고 했어요?") → LLM responds in 1st
 * person staying in character. Stateless on the backend; conversation
 * history lives in this component's state and is sent every request.
 */
function PersonaChatModal({
  persona,
  project,
  locale,
  isKo,
  onClose,
}: {
  persona: NonNullable<EnsembleAggregate["personas"]>["topPositiveVoices"][number];
  project: ProjectInfo | null;
  locale: string;
  isKo: boolean;
  onClose: () => void;
}) {
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll the transcript to the latest reply on every change.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [history, busy]);

  // ESC closes the modal — standard modal-dismiss affordance the
  // dialog was missing. Backdrop click still works as before.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Click-to-prefill suggestion chips. Replaces the previous text-only
  // example block — one click fills the input and the user can edit
  // before pressing Enter, lower friction than typing the prompt
  // verbatim.
  const sampleQuestions = isKo
    ? [
        "왜 이 가격이 비싸다고 생각해요?",
        "어떤 채널에서 사는 걸 선호하세요?",
        "어떤 점이 가장 마음에 들어요?",
      ]
    : [
        "Why do you think the price is too high?",
        "Where do you prefer to buy this?",
        "What about it appeals to you most?",
      ];

  const submit = async () => {
    const q = input.trim();
    if (!q || busy) return;
    setBusy(true);
    setError(null);
    const nextHistory: Array<{ role: "user" | "assistant"; content: string }> = [
      ...history,
      { role: "user", content: q },
    ];
    setHistory(nextHistory);
    setInput("");
    try {
      const res = await fetch("/api/persona-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          persona: {
            voice: persona.text,
            country: persona.country,
            intent: persona.intent,
            profession: persona.profession,
            ageRange: persona.ageRange,
          },
          question: q,
          // history sent EXCLUDES the just-added user message; the API
          // appends it explicitly to the prompt
          history: history,
          productName: project?.product_name,
          productCategory: project?.category ?? undefined,
          basePrice:
            project?.base_price_cents != null && project?.currency
              ? `${(project.base_price_cents / 100).toLocaleString()} ${project.currency}`
              : undefined,
          locale,
        }),
      });
      if (!res.ok) {
        throw new Error(await friendlyApiError(res, isKo ? "ko" : "en"));
      }
      const data = (await res.json()) as { reply: string };
      setHistory([...nextHistory, { role: "assistant", content: data.reply }]);
    } catch (err) {
      setError(friendlyClientError(err, isKo ? "ko" : "en"));
      // Roll back the optimistic user message on failure so the user
      // can resend without seeing it duplicated.
      setHistory(history);
      setInput(q);
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-2xl w-full flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — pinned persona profile */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-wider text-accent mb-1">
              {isKo ? "이 페르소나에게 질문하기" : "Ask this persona"}
            </div>
            <div className="text-sm font-semibold text-slate-900 flex items-center gap-2 flex-wrap">
              <span>{persona.country}</span>
              {persona.profession && (
                <>
                  <span className="text-slate-300">·</span>
                  <span className="font-normal text-slate-700">{persona.profession}</span>
                </>
              )}
              {persona.ageRange && (
                <>
                  <span className="text-slate-300">·</span>
                  <span className="font-normal text-slate-700">{persona.ageRange}</span>
                </>
              )}
              <span className="text-slate-300">·</span>
              <span className="text-xs font-semibold text-brand">
                {isKo ? "구매의향" : "intent"} {persona.intent}/100
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-2 leading-relaxed line-clamp-2 italic">
              "{persona.text}"
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 transition-colors"
            aria-label={isKo ? "닫기" : "Close"}
          >
            <X size={18} />
          </button>
        </div>

        {/* Transcript */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-3 min-h-[160px]">
          {history.length === 0 && !busy && (
            <div className="py-4 space-y-3">
              <p className="text-xs text-slate-500 leading-relaxed text-center">
                {isKo
                  ? "이 페르소나에게 자유롭게 질문해보세요. 예시 클릭으로 시작:"
                  : "Ask this persona anything. Tap an example to start:"}
              </p>
              <div className="flex flex-col gap-2">
                {sampleQuestions.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => setInput(q)}
                    className="text-left text-xs px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-brand-50 hover:border-brand/40 hover:text-brand transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
          {history.map((turn, i) => (
            <div
              key={i}
              className={clsx(
                "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                turn.role === "user"
                  ? "ml-auto bg-brand text-white rounded-br-sm"
                  : "mr-auto bg-slate-100 text-slate-800 rounded-bl-sm",
              )}
            >
              {turn.content}
            </div>
          ))}
          {busy && (
            <div className="mr-auto bg-slate-100 text-slate-500 rounded-2xl rounded-bl-sm px-3.5 py-2.5 text-sm flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" />
              <span>{isKo ? "답변 작성 중..." : "Thinking..."}</span>
            </div>
          )}
          {error && (
            <div className="text-xs text-risk bg-risk-soft/40 border border-risk/20 rounded-md px-3 py-2">
              {error}
            </div>
          )}
        </div>

        {/* Input */}
        <div className="px-5 py-3 border-t border-slate-200 flex gap-2 items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={
              isKo ? "질문 입력 (Enter로 전송, Shift+Enter 줄바꿈)" : "Ask anything (Enter to send, Shift+Enter for newline)"
            }
            rows={2}
            className="input flex-1 resize-none text-sm"
            disabled={busy}
          />
          <button
            type="button"
            onClick={submit}
            disabled={busy || !input.trim()}
            className="btn-primary px-3 py-2.5 disabled:opacity-50"
            aria-label={isKo ? "전송" : "Send"}
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Pricing sensitivity matrix — surfaces the deterministic thresholds
 * + ±10% what-if scenarios computed from the consensus curve. Three
 * threshold rows (comfort ceiling / inflection / rejection floor) +
 * two scenario rows answer the questions the curve alone doesn't:
 *   - "Where can I price without losing demand?"
 *   - "Where does demand break?"
 *   - "What if I raised/lowered 10%?"
 *
 * Each threshold row is gated on its source field being non-null; the
 * panel hides individual rows when the curve doesn't span the range.
 */
function PricingSensitivityPanel({
  sensitivity,
  recommendedPriceCents,
  currency,
  isKo,
  curveRevenueMaxCents,
  curveMaxRejectedAsExtrapolation,
  curve,
}: {
  sensitivity: NonNullable<NonNullable<EnsembleAggregate["pricing"]>["sensitivity"]>;
  recommendedPriceCents: number;
  currency: string;
  isKo: boolean;
  /** Aggregated-curve revenue maximum (already trust-ceiling clamped
   *  upstream — null when extrapolation rejected). Lets the panel
   *  surface a "revenue-priority alternative" callout when the median
   *  recommended price diverges from the curve's actual revenue max
   *  by 3-10% (under the auto-correction threshold but enough to be
   *  visible to a user who sees the +10% scenario yields +X% revenue). */
  curveRevenueMaxCents?: number | null;
  curveMaxRejectedAsExtrapolation?: boolean;
  curve?: NonNullable<EnsembleAggregate["pricing"]>["curve"];
}) {
  const fmt = (cents: number) => formatPrice(cents, currency);

  const thresholds: Array<{
    key: string;
    label: string;
    value: number | null;
    tone: "success" | "warn" | "risk" | "neutral";
    description: string;
  }> = [
    {
      key: "comfort",
      label: isKo ? "안심 상한" : "Comfort ceiling",
      value: sensitivity.comfortCeilingCents,
      tone: "success",
      description: isKo
        ? "이 가격 이하 → 50% 이상의 페르소나가 구매 (강한 수요)"
        : "Below this price → ≥ 50% of personas convert (strong demand)",
    },
    {
      key: "inflection",
      label: isKo ? "수요 변곡점" : "Demand knee",
      value: sensitivity.inflectionCents,
      tone: "warn",
      description: isKo
        ? "이 가격에서 전환이 가장 가파르게 떨어짐 — 위로 더 올리면 수요 급락"
        : "Conversion drops most steeply at this price — pricing above it loses demand fast",
    },
    {
      key: "rejection",
      label: isKo ? "거부 하한" : "Rejection floor",
      value: sensitivity.rejectionFloorCents,
      tone: "risk",
      description: isKo
        ? "이 가격 이상 → 페르소나의 90% 이상이 거부"
        : "Above this price → ≥ 90% of personas reject",
    },
  ];

  const toneClass = (tone: "success" | "warn" | "risk" | "neutral") =>
    tone === "success"
      ? "bg-success-soft/40 border-success/30 text-success"
      : tone === "warn"
        ? "bg-warn-soft/40 border-warn/30 text-warn-foreground"
        : tone === "risk"
          ? "bg-risk-soft/40 border-risk/30 text-risk"
          : "bg-slate-50 border-slate-200 text-slate-700";

  const visibleThresholds = thresholds.filter((t) => t.value != null);

  return (
    <div className="card p-5">
      <h2 className="text-base font-semibold text-slate-900 mb-1">
        {isKo ? "가격 민감도 매트릭스" : "Pricing sensitivity matrix"}
      </h2>
      <p className="text-xs text-slate-500 mb-4 leading-relaxed">
        {isKo
          ? "가격 곡선에서 도출한 의사결정 임계점 + ±10% 시나리오 — 권장가에서 위/아래로 움직이면 어떻게 될지 미리 보기."
          : "Decision thresholds derived from the curve + ±10% what-ifs — preview what moves up or down from the recommended price."}
      </p>

      {visibleThresholds.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
          {visibleThresholds.map((t) => (
            <div
              key={t.key}
              className={clsx(
                "rounded-lg border p-3",
                toneClass(t.tone),
              )}
              title={t.description}
            >
              <div className="text-[10px] uppercase tracking-wide font-bold mb-1">
                {t.label}
              </div>
              <div className="text-xl font-bold tabular-nums text-slate-900">
                {fmt(t.value!)}
              </div>
              <p className="text-[11px] text-slate-600 mt-1.5 leading-snug">
                {t.description}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Revenue-priority alternative — surfaces when the curve's actual
          revenue max diverges from the median recommended price by 3-10%
          (under the auto-correction threshold but enough that a sharp
          reader will spot it via the +10% scenario showing positive
          revenue delta). Median-of-argmaxes ≠ argmax-of-mean-curve is a
          real aggregation artifact; this callout makes the alternative
          explicit so the user can choose between the safer median and
          the revenue-max alternative without the system silently
          picking one. Hidden when curve max was rejected as
          extrapolation (trust ceiling) or curve missing. */}
      {(() => {
        if (!curveRevenueMaxCents || curveMaxRejectedAsExtrapolation) return null;
        if (recommendedPriceCents <= 0) return null;
        const ratio = curveRevenueMaxCents / recommendedPriceCents;
        const divergence = Math.abs(ratio - 1) * 100; // %
        // Show only when divergence is 3-10%. Below 3% = not meaningful;
        // above 10% would already trigger getDisplayPriceCents auto-
        // correction and the headline number would already be the curve max.
        if (divergence < 3 || divergence > 10) return null;
        // Compute projected revenue uplift via the same revenueAt
        // interpolation getDisplayPriceCents uses.
        const sortedAsc = curve
          ? [...curve].sort((a, b) => a.priceCents - b.priceCents)
          : [];
        const interpolate = (price: number): number | null => {
          if (sortedAsc.length === 0) return null;
          if (
            price < sortedAsc[0].priceCents ||
            price > sortedAsc[sortedAsc.length - 1].priceCents
          ) return null;
          for (let i = 1; i < sortedAsc.length; i++) {
            const a = sortedAsc[i - 1];
            const b = sortedAsc[i];
            if (price >= a.priceCents && price <= b.priceCents) {
              if (b.priceCents === a.priceCents)
                return a.meanConversionProbability;
              const t = (price - a.priceCents) / (b.priceCents - a.priceCents);
              return (
                a.meanConversionProbability +
                t *
                  (b.meanConversionProbability - a.meanConversionProbability)
              );
            }
          }
          return null;
        };
        const cAtRec = interpolate(recommendedPriceCents);
        const cAtMax = interpolate(curveRevenueMaxCents);
        if (cAtRec == null || cAtMax == null) return null;
        const baselineRev = recommendedPriceCents * cAtRec;
        const altRev = curveRevenueMaxCents * cAtMax;
        if (baselineRev <= 0) return null;
        const revenueUpliftPct = ((altRev - baselineRev) / baselineRev) * 100;
        // Only surface if the alternative actually yields > +1% revenue.
        // (Tiny positive deltas aren't decision-grade.)
        if (revenueUpliftPct < 1) return null;
        const priceDeltaPct = (ratio - 1) * 100;
        const direction = ratio > 1 ? "↑" : "↓";
        return (
          <div className="rounded-lg border border-brand/30 bg-brand-50/40 px-4 py-3 mb-4">
            <div className="flex items-baseline justify-between gap-2 flex-wrap mb-1">
              <div className="text-[11px] uppercase tracking-wide font-bold text-brand">
                {isKo ? "매출 우선 시나리오" : "Revenue-priority alternative"}
              </div>
              <div className="text-[10px] text-slate-500">
                {isKo
                  ? `권장가는 25개 sim 의 중앙값 — 곡선의 실제 매출 최대점은 약간 다름`
                  : `Median across 25 sims; the curve's actual revenue peak sits slightly elsewhere`}
              </div>
            </div>
            <div className="flex items-baseline gap-3 flex-wrap">
              <div className="text-2xl font-bold text-slate-900 tabular-nums">
                {fmt(curveRevenueMaxCents)}
              </div>
              <div className="text-xs text-slate-700">
                <span className="font-semibold">
                  {isKo ? "권장가 대비 " : "vs recommended "}
                </span>
                <span className="tabular-nums">
                  {direction} {Math.abs(priceDeltaPct).toFixed(1)}%
                </span>
                <span className="mx-2 text-slate-300">·</span>
                <span className="font-semibold text-success">
                  {isKo ? "매출 +" : "revenue +"}
                  {revenueUpliftPct.toFixed(1)}%
                </span>
              </div>
            </div>
            <p className="text-[11px] text-slate-600 mt-2 leading-relaxed">
              {isKo
                ? `이 가격에서 매출이 더 높지만, 권장가가 중앙값으로 결정된 이유는 sims 간 의견 분산이 있어서임. 매출 우선이면 ${fmt(curveRevenueMaxCents)}, 보수적·합의 우위면 ${fmt(recommendedPriceCents)}. 첫 100명 small-batch 로 시장 반응 검증 후 결정 권장.`
                : `Revenue is higher at this price, but the recommendation defaulted to the median because the 25 sims dispersed. For revenue priority pick ${fmt(curveRevenueMaxCents)}; for consensus-safety stick with ${fmt(recommendedPriceCents)}. Validate via a first-100 small-batch test before committing.`}
            </p>
          </div>
        );
      })()}

      {/* Elasticity + ±10% what-if scenarios */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {sensitivity.ifPriceDown10Pct && (
          <ScenarioCard
            arrow="↓"
            label={isKo ? "권장가에서 -10%" : "−10% from recommended"}
            price={fmt(recommendedPriceCents * 0.9)}
            scenario={sensitivity.ifPriceDown10Pct}
            isKo={isKo}
            isUp={false}
          />
        )}
        {sensitivity.ifPriceUp10Pct && (
          <ScenarioCard
            arrow="↑"
            label={isKo ? "권장가에서 +10%" : "+10% from recommended"}
            price={fmt(recommendedPriceCents * 1.1)}
            scenario={sensitivity.ifPriceUp10Pct}
            isKo={isKo}
            isUp={true}
          />
        )}
      </div>

      {sensitivity.elasticityAtRec != null && (
        <div className="mt-4 pt-4 border-t border-slate-100 flex items-baseline gap-2 text-xs">
          <span className="text-slate-500 uppercase tracking-wide font-semibold text-[10px]">
            {isKo ? "권장가 탄력성" : "Elasticity at recommended"}
          </span>
          <span className="tabular-nums font-semibold text-slate-700">
            {sensitivity.elasticityAtRec.toFixed(2)}
          </span>
          <span className="text-slate-500">
            {isKo
              ? `(가격 1% 변화 → 전환 ${Math.abs(sensitivity.elasticityAtRec).toFixed(2)}% ${sensitivity.elasticityAtRec < 0 ? "감소" : "증가"})`
              : `(1% price change → ${Math.abs(sensitivity.elasticityAtRec).toFixed(2)}% conversion ${sensitivity.elasticityAtRec < 0 ? "drop" : "rise"})`}
          </span>
          <span className="ml-auto text-slate-400">
            {Math.abs(sensitivity.elasticityAtRec) >= 1
              ? isKo
                ? "탄력적 (할인 효과 큼)"
                : "Elastic (discounts move volume)"
              : isKo
                ? "비탄력적 (프리미엄 가능)"
                : "Inelastic (premium pricing viable)"}
          </span>
        </div>
      )}
    </div>
  );
}

function ScenarioCard({
  arrow,
  label,
  price,
  scenario,
  isKo,
  isUp,
}: {
  arrow: "↑" | "↓";
  label: string;
  price: string;
  scenario: { conversionPct: number; revenueIndexDelta: number };
  isKo: boolean;
  isUp: boolean;
}) {
  // Revenue delta colour: positive = green, negative = red. Different
  // from "is this price up?" — a 10% price reduction can still grow
  // revenue (elastic demand), and we want the user to see that clearly.
  const revColor =
    scenario.revenueIndexDelta > 0
      ? "text-success"
      : scenario.revenueIndexDelta < 0
        ? "text-risk"
        : "text-slate-700";
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-baseline gap-2 mb-1">
        <span className={clsx("text-base font-bold", isUp ? "text-risk" : "text-success")}>
          {arrow}
        </span>
        <span className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
          {label}
        </span>
      </div>
      <div className="text-lg font-bold text-slate-900 tabular-nums">{price}</div>
      <div className="grid grid-cols-2 gap-3 mt-2 text-xs">
        <div>
          <div className="text-slate-500">{isKo ? "전환율" : "Conversion"}</div>
          <div className="text-slate-900 font-semibold tabular-nums">
            {scenario.conversionPct.toFixed(1)}%
          </div>
        </div>
        <div>
          <div className="text-slate-500">{isKo ? "매출 변화" : "Revenue Δ"}</div>
          <div className={clsx("font-semibold tabular-nums", revColor)}>
            {scenario.revenueIndexDelta > 0 ? "+" : ""}
            {scenario.revenueIndexDelta.toFixed(1)}%
          </div>
        </div>
      </div>
    </div>
  );
}

function PricingTab({
  pricing,
  basePriceCents,
  simCount,
  competitorsResolved,
  isKo,
  currency,
}: {
  pricing: EnsembleAggregate["pricing"];
  /** User-input base price — used to surface the user-input vs
      curve-max vs LLM-rec relationship explicitly. Nullable for
      legacy projects. */
  basePriceCents: number | null;
  /** Sim count from the parent ensemble — drives the 1-sim
   *  hypothesis-tier branch where the "all sims converged" framing is
   *  misleading and we just want to show the price + within-sim noise. */
  simCount: number;
  /** Resolved competitor list with source attribution (user-named vs
   *  AI-discovered). Used to group competitor-price rows so the user
   *  always sees which competitors they themselves added vs which ones
   *  the AI suggested. Nullable for legacy projects. */
  competitorsResolved?: Array<{
    name: string;
    url: string;
    source: "user" | "llm";
    reason?: string;
  }> | null;
  isKo: boolean;
  currency: string;
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
  const fmt = (cents: number) => formatPrice(cents, currency);
  const maxConv = Math.max(...pricing.curve.map((p) => p.meanConversionProbability), 0.0001);

  // Best-conversion price point — surface separately from the median so
  // the user sees both "consensus recommended" and "highest-converting"
  // and can spot when those diverge (e.g. a price below recommended
  // converts more but margin pressure forces the higher anchor).
  const peakPoint = pricing.curve.reduce<typeof pricing.curve[number] | null>(
    (best, p) => (best === null || p.meanConversionProbability > best.meanConversionProbability ? p : best),
    null,
  );

  // Auto-corrected recommended price — when the curve's revenue-max
  // point disagrees with what the LLM claimed, trust the data. The
  // LLM tends to anchor on the input base price; the curve is what
  // it actually generated, so the argmax is more honest.
  //
  // We RECOMPUTE curveRevenueMaxCents at render time using the
  // monotonic-envelope helper. Legacy ensembles persisted a naive-
  // argmax value that picked up high-price noise bumps as "max".
  // Render-time recompute fixes those without re-aggregating.
  const recomputedCurveMax = computeCurveRevenueMaxCents(pricing.curve);
  const effectiveCurveMax = recomputedCurveMax ?? pricing.curveRevenueMaxCents;
  const recComputedMatchesCurve =
    effectiveCurveMax != null && pricing.recommendedPriceCents > 0
      ? Math.abs(effectiveCurveMax / pricing.recommendedPriceCents - 1) <= 0.1
      : null;
  // Trust ceiling — reject curve max as headline when it lands above
  // 1.5× the higher of (P75 of per-sim recs, LLM rec). The monotonic-
  // envelope walk above can still pick up high-price points the LLM
  // included for completeness but personas never actually evaluated.
  // Le Mouton 2026-05-09 sim: LLM rec ₩158,900, IQR ₩116,900-₩216,000,
  // but curve max landed at ₩480,000 — 2.2× P75. The auto-correction
  // surfaced ₩480k as the headline, which is meaningless because no
  // persona's willingness-to-pay supports that level. Same logic
  // mirrors getDisplayPriceCents in pricing-sensitivity.ts.
  const trustCeilingBase = Math.max(
    pricing.recommendedPriceP75 ?? 0,
    pricing.recommendedPriceCents > 0 ? pricing.recommendedPriceCents : 0,
  );
  const trustCeilingCents =
    trustCeilingBase > 0 ? trustCeilingBase * 1.5 : Infinity;
  const curveMaxRejectedAsExtrapolation =
    effectiveCurveMax != null && effectiveCurveMax > trustCeilingCents;
  const headlinePriceCents =
    recComputedMatchesCurve === false &&
    effectiveCurveMax != null &&
    !curveMaxRejectedAsExtrapolation
      ? effectiveCurveMax
      : pricing.recommendedPriceCents;
  const wasCorrected = headlinePriceCents !== pricing.recommendedPriceCents;

  // Three-way relationship between user-input base price, LLM
  // recommendation, and curve revenue max. Used to drive a clear
  // "are these all the same?" message that addresses the common
  // user concern: "did you just hand back my input?".
  const within2pct = (a: number, b: number) =>
    a > 0 && Math.abs(a / b - 1) <= 0.02;
  const baseEqRec =
    basePriceCents != null && within2pct(basePriceCents, pricing.recommendedPriceCents);
  const baseEqCurve =
    basePriceCents != null &&
    effectiveCurveMax != null &&
    within2pct(basePriceCents, effectiveCurveMax);
  const recEqCurve = recComputedMatchesCurve === true;
  const allThreeAlign = baseEqRec && baseEqCurve && recEqCurve;
  const baseAlignsButLLMNot = baseEqCurve && !baseEqRec;

  // Top revenue index points — let the user verify themselves that
  // the "curve max" is genuinely the highest-revenue point. Compute
  // revenue index = price × meanConversionProbability per curve
  // point (using monotonic envelope for honesty), sort desc, top 5.
  const sortedAsc = [...pricing.curve].sort(
    (a, b) => a.priceCents - b.priceCents,
  );
  let runningMin = Infinity;
  const envelopeRevenue = sortedAsc.map((p) => {
    runningMin = Math.min(runningMin, p.meanConversionProbability);
    return {
      priceCents: p.priceCents,
      conv: runningMin,
      revenueIndex: p.priceCents * runningMin,
    };
  });
  const sortedAllRevenue = [...envelopeRevenue].sort(
    (a, b) => b.revenueIndex - a.revenueIndex,
  );
  const topRevenue = sortedAllRevenue.slice(0, 5);
  const maxRevenue = topRevenue[0]?.revenueIndex ?? 0;

  // Map the LLM-recommended price onto the nearest envelope point so
  // the user can see where the recommendation lands on the curve. The
  // LLM emits prices like $49.95 that may not exactly match a sampled
  // curve point ($51, $54, …); closest-by-price is what they'd care
  // about for "is my recommendation near the revenue max?".
  const recPoint =
    pricing.recommendedPriceCents > 0 && envelopeRevenue.length > 0
      ? envelopeRevenue.reduce((best, p) =>
          Math.abs(p.priceCents - pricing.recommendedPriceCents) <
          Math.abs(best.priceCents - pricing.recommendedPriceCents)
            ? p
            : best,
        )
      : null;
  const recInTop5 =
    recPoint != null &&
    topRevenue.some((r) => r.priceCents === recPoint.priceCents);
  const recRank =
    recPoint != null
      ? sortedAllRevenue.findIndex((p) => p.priceCents === recPoint.priceCents) +
        1
      : null;

  return (
    <div className="space-y-6">
      {/* Hero: recommended price + range + margin in one row. Compact
          single-row card so the pricing tab opens with the headline answer
          immediately visible — no large dead vertical space. */}
      <div className="card p-5 bg-gradient-to-br from-brand-50/40 to-white border-brand/20">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">
              {wasCorrected
                ? isKo
                  ? "권장 가격 (곡선 매출 최대점)"
                  : "Recommended price (curve revenue max)"
                : isKo
                  ? "권장 가격 (시뮬 합산 중앙값)"
                  : "Recommended price (median across sims)"}
            </div>
            <div className="flex items-baseline gap-3 flex-wrap">
              <div className="text-4xl font-bold text-brand tabular-nums leading-none">
                {fmt(headlinePriceCents)}
              </div>
              <div className="text-sm text-slate-500">
                {(() => {
                  const unanimous = pricing.recommendedPriceUnanimousAt;
                  const withinStd = pricing.recommendedPriceWithinSimStdMean ?? 0;
                  const noise = withinStd > 0 ? ` · within-sim noise ±${fmt(withinStd)}` : "";
                  const noiseKo = withinStd > 0 ? ` · 시뮬 내부 noise ±${fmt(withinStd)}` : "";
                  // Hypothesis tier (1 sim): show within-sim noise only —
                  // the "all sims converged" framing is misleading and
                  // the legacy mid-50% range collapses to "$X – $X".
                  if (simCount === 1) {
                    return isKo
                      ? `시뮬 내부 noise ${withinStd > 0 ? `±${fmt(withinStd)}` : "0"}`
                      : `Within-sim noise ${withinStd > 0 ? `±${fmt(withinStd)}` : "0"}`;
                  }
                  if (unanimous != null && unanimous > 0) {
                    return isKo
                      ? `${simCount}개 시뮬 모두 ${fmt(unanimous)}로 수렴${noiseKo}`
                      : `All ${simCount} sims converged on ${fmt(unanimous)}${noise}`;
                  }
                  return isKo
                    ? `중간 50%: ${fmt(pricing.recommendedPriceP25)} – ${fmt(pricing.recommendedPriceP75)}`
                    : `Mid-50%: ${fmt(pricing.recommendedPriceP25)} – ${fmt(pricing.recommendedPriceP75)}`;
                })()}
              </div>
            </div>
            {wasCorrected && (
              <div className="text-[11px] text-slate-500 mt-2 leading-relaxed max-w-md">
                {isKo
                  ? `LLM 안내가는 ${fmt(pricing.recommendedPriceCents)}였으나 기본가에 anchor된 것으로 보여 곡선 매출 최대점으로 자동 보정되었습니다.`
                  : `LLM said ${fmt(pricing.recommendedPriceCents)}, but it appears anchored on the base price — auto-corrected to the curve revenue-max point.`}
              </div>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            {/* Independent verification tile — shows the curve's revenue-max
                point alongside the headline so the user sees that the
                recommendation is data-supported, not just "happens to equal
                the input". Green ✓ when LLM-rec and curve-max agree, amber
                ⚠ when they don't (the auto-correction case). */}
            {effectiveCurveMax != null && (
              <div
                className={clsx(
                  "rounded-lg border px-4 py-3 shrink-0 min-w-[140px]",
                  curveMaxRejectedAsExtrapolation
                    ? "bg-slate-100 border-slate-300"
                    : recComputedMatchesCurve === true
                      ? "bg-success-soft/40 border-success/30"
                      : "bg-warn-soft/40 border-warn/30",
                )}
                title={
                  curveMaxRejectedAsExtrapolation
                    ? isKo
                      ? `곡선 최댓값이 시뮬 권장가 IQR(${fmt(pricing.recommendedPriceP25)}–${fmt(pricing.recommendedPriceP75)})의 1.5배를 초과 — 페르소나가 평가하지 않은 외삽 영역으로 판단해 헤드라인에서 제외했습니다.`
                      : `Curve max exceeds 1.5× IQR upper bound (${fmt(pricing.recommendedPriceP25)}–${fmt(pricing.recommendedPriceP75)}) — treated as extrapolation past the personas' evaluated range and excluded from the headline.`
                    : isKo
                      ? "곡선 데이터에서 (가격 × 전환)이 최대가 되는 지점 — monotonic 가정 적용. LLM의 권장가와 일치하면 ✓, 다르면 ⚠."
                      : "Where (price × conversion) peaks on the curve under monotonic assumption. ✓ if matches LLM rec; ⚠ if differs."
                }
              >
                <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-0.5">
                  {isKo ? "곡선 매출 최대점" : "Curve revenue max"}
                </div>
                <div className="text-base font-semibold text-slate-900 tabular-nums">
                  {fmt(effectiveCurveMax)}
                </div>
                <div
                  className={clsx(
                    "text-[10px] font-semibold",
                    curveMaxRejectedAsExtrapolation
                      ? "text-slate-500"
                      : recComputedMatchesCurve === true
                        ? "text-success"
                        : "text-warn",
                  )}
                >
                  {curveMaxRejectedAsExtrapolation
                    ? isKo
                      ? "외삽 영역 (참고만)"
                      : "Extrapolated (reference)"
                    : recComputedMatchesCurve === true
                      ? isKo
                        ? "권장가와 일치 ✓"
                        : "Matches rec ✓"
                      : isKo
                        ? "권장가와 차이"
                        : "Differs from rec"}
                </div>
              </div>
            )}
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
      </div>

      {/* Three-way relationship — explicit "did the LLM just give back
          your input?" answer. Renders only when basePriceCents is
          known. Different message for each alignment pattern so
          users always get a clear interpretation of what they're
          looking at. */}
      {basePriceCents != null && (
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-3">
            {isKo ? "본인 입력가 vs 분석 결과" : "Your input vs analysis"}
          </h3>
          {/* Tile layout collapses when LLM rec and curve max agree (±10%):
              the curve becomes a verification badge under the recommendation
              instead of a third "competing" green-highlighted tile. Three
              full tiles only render when the values genuinely diverge —
              that's the real moment of decision. */}
          {recEqCurve && effectiveCurveMax != null ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">
                  {isKo ? "본인 입력 가격" : "Your input"}
                </div>
                <div className="text-base font-bold text-slate-900 tabular-nums">
                  {fmt(basePriceCents)}
                </div>
              </div>
              <div className="rounded-lg border border-brand/30 bg-brand-50/40 px-4 py-3">
                <div className="text-[10px] uppercase tracking-wide text-brand font-semibold mb-1">
                  {isKo ? "추천 가격" : "Recommended"}
                </div>
                <div className="text-base font-bold text-slate-900 tabular-nums">
                  {fmt(pricing.recommendedPriceCents)}
                </div>
                <div className="text-[10px] text-success mt-0.5 inline-flex items-center gap-1">
                  <span>✓</span>
                  <span>
                    {isKo
                      ? `곡선 매출 최대점(${fmt(effectiveCurveMax)})이 독립 검증`
                      : `Confirmed by curve max (${fmt(effectiveCurveMax)})`}
                  </span>
                </div>
                {baseEqRec && (
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {isKo ? "본인 입력가와 일치" : "matches input"}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">
                  {isKo ? "본인 입력 가격" : "Your input"}
                </div>
                <div className="text-base font-bold text-slate-900 tabular-nums">
                  {fmt(basePriceCents)}
                </div>
              </div>
              <div className="rounded-lg border border-brand/30 bg-brand-50/40 px-4 py-3">
                <div className="text-[10px] uppercase tracking-wide text-brand font-semibold mb-1">
                  {isKo ? "LLM 추천" : "LLM rec"}
                </div>
                <div className="text-base font-bold text-slate-900 tabular-nums">
                  {fmt(pricing.recommendedPriceCents)}
                </div>
                {baseEqRec && (
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {isKo ? "본인 입력가와 일치" : "matches input"}
                  </div>
                )}
              </div>
              {effectiveCurveMax != null && (
                <div className="rounded-lg border border-success/30 bg-success-soft/30 px-4 py-3">
                  <div className="text-[10px] uppercase tracking-wide text-success font-semibold mb-1">
                    {isKo ? "곡선 매출 최대점" : "Curve max"}
                  </div>
                  <div className="text-base font-bold text-slate-900 tabular-nums">
                    {fmt(effectiveCurveMax)}
                  </div>
                  {baseEqCurve && (
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      {isKo ? "본인 입력가와 일치" : "matches input"}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          {/* Interpretation message — varies by alignment pattern */}
          <div
            className={clsx(
              "rounded-md px-3 py-2.5 text-sm leading-relaxed",
              allThreeAlign
                ? "bg-success-soft/40 border border-success/30 text-slate-800"
                : baseAlignsButLLMNot
                  ? "bg-warn-soft/40 border border-warn/30 text-slate-800"
                  : !baseEqCurve && !baseEqRec
                    ? "bg-brand-50/40 border border-brand/20 text-slate-800"
                    : "bg-slate-50 border border-slate-200 text-slate-700",
            )}
          >
            {allThreeAlign
              ? isKo
                ? `✓ 세 값이 모두 ±2% 이내 일치합니다. 본인이 입력한 가격이 곡선 매출 최대점이고 LLM도 같은 결론에 도달 — 가격 설정이 잘 됐다는 강한 신호입니다. (LLM이 anchor했을 가능성도 있으나 곡선 데이터가 독립적으로 확인.)`
                : `✓ All three values agree within ±2%. Your input is the curve revenue max, and the LLM landed on the same answer — strong signal that your pricing is well-calibrated. (LLM anchor bias is possible but the curve confirms independently.)`
              : baseAlignsButLLMNot
                ? isKo
                  ? `⚠ 곡선상 매출 최대점은 본인 입력가(${fmt(basePriceCents)})와 일치하지만, LLM이 다른 가격(${fmt(pricing.recommendedPriceCents)})을 추천. 곡선 데이터에 따르면 본인 입력가가 더 적절.`
                  : `⚠ The curve max matches your input (${fmt(basePriceCents)}), but the LLM recommended a different price (${fmt(pricing.recommendedPriceCents)}). The curve data suggests your input is more optimal.`
                : !baseEqCurve && !baseEqRec
                  ? isKo
                    ? `분석 결과가 본인 입력가(${fmt(basePriceCents)})와 다른 가격(${fmt(headlinePriceCents)})을 권장. 시뮬 데이터 기반 가격으로 변경 검토 권장.`
                    : `Analysis recommends a different price (${fmt(headlinePriceCents)}) than your input (${fmt(basePriceCents)}). Consider adjusting based on the simulation data.`
                  : isKo
                    ? `세 값이 부분적으로 일치. 아래 매출 인덱스 표에서 실제 매출 최대점을 직접 확인하세요.`
                    : `Partial alignment. Verify against the revenue index table below.`}
          </div>
        </div>
      )}

      {/* Top revenue index — transparency: let the user see WHY
          the curve max is what it is. We compute revenue =
          price × monotonic-envelope conversion per point, sort
          descending, show top 5. The bar makes the gap between
          #1 and runner-ups visually obvious. */}
      {topRevenue.length >= 2 && (
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-slate-900 mb-1">
            {isKo ? "매출 인덱스 Top 5" : "Top 5 revenue index"}
          </h3>
          <p className="text-xs text-slate-500 mb-4 leading-relaxed">
            {isKo
              ? "각 가격대의 (가격 × 전환율). 가장 높은 값이 매출 최대 — 본인이 직접 검증 가능. monotonic envelope 적용으로 노이즈 bump 제외."
              : "Revenue index (price × conversion) per price point — verify the curve max yourself. Monotonic envelope removes high-price noise bumps."}
          </p>
          <div className="space-y-1.5">
            {topRevenue.map((r, i) => {
              const pct = maxRevenue > 0 ? (r.revenueIndex / maxRevenue) * 100 : 0;
              const isTop = i === 0;
              const isRec = recPoint != null && r.priceCents === recPoint.priceCents;
              return (
                <div key={r.priceCents} className="flex items-center gap-3 text-sm">
                  <div
                    className={clsx(
                      "w-6 text-center text-xs font-bold tabular-nums",
                      isTop ? "text-success" : "text-slate-400",
                    )}
                  >
                    {isTop ? "★" : `${i + 1}`}
                  </div>
                  <div className="w-24 shrink-0 font-medium text-slate-900 tabular-nums flex items-center gap-1.5">
                    {fmt(r.priceCents)}
                    {isRec && (
                      <span className="text-[9px] uppercase tracking-wide text-brand font-bold bg-brand-50 border border-brand/30 rounded px-1 py-0.5">
                        rec
                      </span>
                    )}
                  </div>
                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={clsx(
                        "h-full transition-all",
                        isTop ? "bg-success" : "bg-slate-300",
                      )}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="w-16 text-right text-xs text-slate-500 tabular-nums">
                    {`${(r.conv * 100).toFixed(1)}%`}
                  </div>
                  <div className="w-24 text-right text-xs text-slate-700 tabular-nums font-medium">
                    {fmt(Math.round(r.revenueIndex))}
                  </div>
                </div>
              );
            })}
            {/* Recommended-price row when not already in top 5 — gives the
                user direct visual comparison: "where does the recommendation
                actually rank on the revenue curve?". Bar still scaled to the
                top's maxRevenue so the gap is honest. */}
            {recPoint != null && !recInTop5 && (
              <div className="flex items-center gap-3 text-sm pt-1.5 mt-1 border-t border-slate-200">
                <div className="w-6 text-center text-xs font-bold tabular-nums text-brand">
                  {recRank}
                </div>
                <div className="w-24 shrink-0 font-medium text-slate-900 tabular-nums flex items-center gap-1.5">
                  {fmt(recPoint.priceCents)}
                  <span className="text-[9px] uppercase tracking-wide text-brand font-bold bg-brand-50 border border-brand/30 rounded px-1 py-0.5">
                    rec
                  </span>
                </div>
                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-brand/60 transition-all"
                    style={{
                      width: `${maxRevenue > 0 ? (recPoint.revenueIndex / maxRevenue) * 100 : 0}%`,
                    }}
                  />
                </div>
                <div className="w-16 text-right text-xs text-slate-500 tabular-nums">
                  {`${(recPoint.conv * 100).toFixed(1)}%`}
                </div>
                <div className="w-24 text-right text-xs text-slate-700 tabular-nums font-medium">
                  {fmt(Math.round(recPoint.revenueIndex))}
                </div>
              </div>
            )}
          </div>
          <p className="text-[11px] text-slate-400 mt-3">
            {isKo
              ? "열: 가격 / 전환율 (envelope) / 매출 인덱스. ★ = 매출 최대점, rec = 권장 가격에 가장 가까운 곡선 포인트."
              : "Cols: price / envelope conversion / revenue index. ★ = revenue max, rec = nearest curve point to the recommended price."}
          </p>
        </div>
      )}

      {/* Competitor price anchors — extracted at sim time from user-
          provided URLs. Shown alongside the recommendation so users
          see the basis (real retail prices), not just LLM intuition.
          When the array is empty (no URLs provided OR extraction
          failed), surface an empty-state card explaining why instead
          of silently hiding — the user wonders where the data went. */}
      {pricing.competitorPrices && pricing.competitorPrices.length > 0 ? (
        (() => {
          // Group extracted prices by attribution source. Each price
          // row's URL is matched against competitors_resolved to find
          // its origin (user-named or LLM-discovered). Rows that don't
          // match (legacy projects without resolved data, OR LLM
          // suggested URL that differs from the extracted URL) fall
          // into "unknown" — rendered alongside user rows since both
          // are pre-resolver inputs.
          const sourceByUrl = new Map<string, "user" | "llm">();
          const reasonByUrl = new Map<string, string>();
          (competitorsResolved ?? []).forEach((c) => {
            if (c.url) {
              sourceByUrl.set(c.url, c.source);
              if (c.reason) reasonByUrl.set(c.url, c.reason);
            }
          });
          type Price = NonNullable<typeof pricing.competitorPrices>[number];
          const userRows: Price[] = [];
          const llmRows: Price[] = [];
          for (const p of pricing.competitorPrices) {
            const src = sourceByUrl.get(p.url);
            if (src === "llm") llmRows.push(p);
            else userRows.push(p);
          }
          const renderRow = (c: Price, i: number) => {
            const reason = reasonByUrl.get(c.url);
            return (
              <div key={i} className="flex items-center gap-3 text-sm border-l-2 border-slate-200 pl-3">
                <div className="w-24 font-semibold text-slate-900 tabular-nums shrink-0">
                  {fmt(c.priceCents)}
                </div>
                <div className="flex-1 min-w-0">
                  {c.productName && (
                    <div className="text-slate-700 truncate">{c.productName}</div>
                  )}
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-xs text-slate-400 truncate block hover:text-brand transition-colors"
                  >
                    {c.url}
                  </a>
                  {reason && (
                    <div className="text-[11px] text-slate-500 italic mt-0.5">
                      {isKo ? "AI 발굴 이유: " : "AI rationale: "}{reason}
                    </div>
                  )}
                </div>
                {c.sourceCurrency && c.sourceCurrency.toUpperCase() !== currency.toUpperCase() && (
                  <div className="text-[10px] text-slate-400 shrink-0">
                    {isKo ? `원화 ${c.sourceCurrency}` : `from ${c.sourceCurrency}`}
                  </div>
                )}
              </div>
            );
          };
          return (
            <div className="card p-5">
              <div className="flex items-baseline justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-900">
                  {isKo ? "경쟁사 retail 가격 (anchor 데이터)" : "Competitor retail prices (anchor data)"}
                </h3>
                <span className="text-xs text-slate-500">
                  {isKo
                    ? `${pricing.competitorPrices.length}개 URL에서 추출`
                    : `Extracted from ${pricing.competitorPrices.length} URL${pricing.competitorPrices.length === 1 ? "" : "s"}`}
                </span>
              </div>
              {userRows.length > 0 && (
                <div className="mb-4">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-2">
                    {isKo ? `사용자 입력 (${userRows.length})` : `Your input (${userRows.length})`}
                  </div>
                  <div className="space-y-2">{userRows.map(renderRow)}</div>
                </div>
              )}
              {llmRows.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-brand font-semibold mb-2">
                    {isKo ? `AI 발굴 (${llmRows.length})` : `AI-discovered (${llmRows.length})`}
                  </div>
                  <div className="space-y-2">{llmRows.map(renderRow)}</div>
                </div>
              )}
              <p className="text-[11px] text-slate-500 mt-3 leading-relaxed">
                {isKo
                  ? "사용자 입력 이름(또는 URL)과 AI가 추가 발굴한 경쟁사 URL에서 자동 추출. 이 가격대를 anchor 삼아 LLM이 가격 곡선을 생성했습니다."
                  : "Auto-extracted from URLs resolved from your input names and from AI-discovered competitors. The pricing curve was anchored against these real retail prices."}
              </p>
            </div>
          );
        })()
      ) : (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/60 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle size={14} className="shrink-0 mt-0.5 text-slate-400" />
            <div className="text-xs text-slate-600 leading-relaxed">
              <span className="font-semibold text-slate-700">
                {isKo ? "경쟁사 anchor 데이터 없음" : "No competitor anchor data"}
              </span>
              {" — "}
              {isKo
                ? "이번 분석은 LLM이 추정한 카테고리 가격대로 곡선을 생성했습니다. 더 정확한 anchor가 필요하면 프로젝트 편집에서 경쟁사 URL을 추가하세요 (URL이 이미 있었다면 추출에 실패했을 수 있습니다)."
                : "The pricing curve was generated from LLM category estimates. To anchor against real retail prices, add competitor URLs in project setup (if URLs were provided, extraction may have failed)."}
            </div>
          </div>
        </div>
      )}

      {/* Pricing range rationale — visible when range was dynamically
          adjusted from the default 0.5x-2.0x band. */}
      {pricing.range && pricing.range.rationale && pricing.range.rationale.length > 0 && (
        <div className="rounded-lg border border-brand/20 bg-brand-50/40 px-4 py-3 text-xs text-slate-700 leading-relaxed">
          <span className="font-semibold text-brand mr-1.5">
            {isKo ? "가격 곡선 탐색 범위:" : "Curve range:"}
          </span>
          {fmt(pricing.range.minCents)} – {fmt(pricing.range.maxCents)}
          <span className="text-slate-500 ml-2">— {pricing.range.rationale.join("; ")}</span>
        </div>
      )}

      {/* Margin narrative — separate row because the LLM often returns a
          multi-sentence rationale here, which would overflow the hero
          metric strip and make the card unreadable. Hidden when the
          headline price was auto-corrected because the LLM wrote this
          narrative assuming base = optimal, which now contradicts the
          corrected recommendation. */}
      {pricing.marginEstimate && pricing.marginEstimate !== "—" && !wasCorrected && (
        <div className="card p-5">
          <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">
            {isKo ? "예상 마진 분석" : "Margin analysis"}
          </div>
          <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap break-words">
            {pricing.marginEstimate}
          </p>
          {/* Margin source citations — surfaces when ≥1 sim cited a
              Tavily margin-benchmark snippet AND the source survived
              the cross-sim aggregation (≥2 sims cited it, OR it's the
              only signal we have). Without this the margin number
              looks authoritative but has no traceability. */}
          {pricing.marginEstimateSources &&
            pricing.marginEstimateSources.length > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-100">
                <div className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold mb-1.5">
                  {isKo ? "출처" : "Sources"}
                </div>
                <ul className="space-y-1 text-[11px]">
                  {pricing.marginEstimateSources.map((s, i) => (
                    <li key={s.url} className="text-slate-500">
                      <span className="text-slate-400">[{i + 1}]</span>{" "}
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand hover:underline break-all"
                      >
                        {s.title || s.url}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          {/* Honest framing: when no sources made it through aggregation,
              tell the user this is calibration-anchor based not sourced. */}
          {(!pricing.marginEstimateSources ||
            pricing.marginEstimateSources.length === 0) && (
            <p className="text-[11px] text-slate-400 mt-3 pt-3 border-t border-slate-100 leading-relaxed">
              {isKo
                ? "출처: AI 추정 (카테고리 평균 기준 prompt anchor 기반). 외부 소스 grounding 실패 시 fallback."
                : "Source: AI estimate (prompt-anchored category average). External-source grounding unavailable for this run."}
            </p>
          )}
        </div>
      )}

      {wasCorrected && pricing.marginEstimate && (
        <div className="card p-5 bg-slate-50 border-slate-200">
          <div className="text-xs uppercase tracking-wide text-slate-500 mb-2">
            {isKo ? "예상 마진 분석" : "Margin analysis"}
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            {isKo
              ? `LLM 마진 분석은 기본가(${fmt(pricing.recommendedPriceCents)}) anchor 가정 하에 작성되어 보정된 권장가(${fmt(headlinePriceCents)})와 모순됩니다. 보정된 권장가 기준 마진 분석은 새 시뮬에서 LLM이 anchor를 벗어나야 신뢰 가능 — 현재 분석은 표시 생략.`
              : `The LLM margin analysis was written assuming the base price (${fmt(pricing.recommendedPriceCents)}) was optimal, which contradicts the auto-corrected recommendation (${fmt(headlinePriceCents)}). Skipped — a fresh sim with the LLM not anchored on base would produce a margin analysis grounded in the corrected price.`}
          </p>
        </div>
      )}

      <div>
        <h2 className="text-base font-semibold text-slate-900 mb-3">
          {isKo ? "가격–전환 곡선" : "Price–conversion curve"}
        </h2>
        <div className="card p-4">
          <PricingCurveChart data={pricing.curve} currency={currency} />
          <p className="text-xs text-slate-500 mt-3 leading-relaxed">
            {isKo
              ? "각 가격대에서 모든 시뮬의 평균 전환 확률입니다. 곡선의 정점이 가장 많은 페르소나가 구매로 이어진 지점이며, 곡선이 완만하면 가격 민감도가 낮음을 의미합니다."
              : "Mean conversion probability at each price point across every sim. The peak shows where the most personas convert; a flat curve means low price sensitivity."}
          </p>
        </div>
        <ChartGuide isKo={isKo}>
          <GuideSection title={isKo ? "Peak conversion vs Recommended price" : "Peak conversion vs Recommended price"}>
            <p className="m-0">
              {isKo
                ? "둘은 다른 개념입니다. Peak는 \"가장 많은 사람이 사는 가격\"이고 Recommended는 \"매출 = 가격 × 전환을 최대화하는 가격\"입니다. 일반적으로 Recommended > Peak — 약간 비싸도 매출 총액이 더 큼."
                : "These are different. Peak = price where the most people convert. Recommended = price that maximises revenue (price × conversion). Recommended is usually slightly above Peak — modest price hike, more revenue."}
            </p>
          </GuideSection>
          <GuideSection title={isKo ? "곡선 모양 읽기" : "Reading the shape"}>
            <ul className="list-disc pl-5 space-y-0.5 m-0">
              {isKo ? (
                <>
                  <li><strong>가파른 하락</strong> — 가격 민감도 높음. 할인 / 프로모션 효과 큼.</li>
                  <li><strong>완만한 곡선</strong> — 가격 민감도 낮음. 프리미엄 가격 가능.</li>
                  <li><strong>중간 50% 구간 (P25–P75)</strong> — 시뮬마다 권장가가 흔들리는 안전 범위. 이 안에서 결정하면 무난.</li>
                </>
              ) : (
                <>
                  <li><strong>Steep drop-off</strong> — high price sensitivity → discounts / promos hit hard.</li>
                  <li><strong>Flat curve</strong> — low sensitivity → premium pricing viable.</li>
                  <li><strong>Mid-50% band (P25–P75)</strong> — the safe zone where recommendations cluster across sims. Anything here is defensible.</li>
                </>
              )}
            </ul>
          </GuideSection>
        </ChartGuide>
      </div>

      {(() => {
        // When auto-correction kicks in, recompute sensitivity against
        // the corrected price — the persisted sensitivity uses the
        // LLM's anchor-biased baseline, which would show ±10%
        // scenarios from the wrong starting point.
        const effectiveSensitivity = wasCorrected
          ? computePricingSensitivity(pricing.curve, headlinePriceCents)
          : pricing.sensitivity;
        if (!effectiveSensitivity) return null;
        return (
          <PricingSensitivityPanel
            sensitivity={effectiveSensitivity}
            recommendedPriceCents={headlinePriceCents}
            currency={currency}
            isKo={isKo}
            curveRevenueMaxCents={effectiveCurveMax ?? null}
            curveMaxRejectedAsExtrapolation={curveMaxRejectedAsExtrapolation}
            curve={pricing.curve}
          />
        );
      })()}

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

/**
 * Decision-aid tab — Decision+ tier exclusive. Mirrors the two
 * decision-critical PDF pages (Investment + ROI projection,
 * Recommendation robustness + sensitivity) with the same math but
 * web-native styling. No new aggregations — pure derivations from
 * the persisted aggregate.
 */
function DecisionAidTab({
  aggregate,
  currency,
  isKo,
}: {
  aggregate: EnsembleAggregate;
  currency: string;
  isKo: boolean;
}) {
  const fmt = (cents: number) => formatPrice(cents, currency);
  const recCountry = aggregate.recommendation.country;
  const recCountryStats = aggregate.countryStats.find(
    (c) => c.country.toUpperCase() === recCountry.toUpperCase(),
  );

  // ── Investment + ROI computation ────────────────────────────────
  // Prefer server-computed CAC range over the LLM-emitted median when
  // available (cacRange is the persona-derived authoritative value;
  // legacy ensembles or thin per-country pools fall back to the LLM
  // value). Median used as the legacy fallback — same precedence as
  // the country score-stats table, CSV export and ShareViewer, so a
  // KOTRA-style reviewer cross-checking the Decision-Aid headline CAC
  // against the country table sees the same number on every surface.
  const cacRange = recCountryStats?.cacRange ?? null;
  const cacUsd = cacRange?.medianUsd ?? recCountryStats?.cacEstimateUsd.median ?? null;
  const usdToTarget: Record<string, number> = {
    USD: 1, KRW: 1390, JPY: 152, CNY: 7.2, TWD: 32, HKD: 7.8,
    SGD: 1.35, THB: 36, VND: 25500, IDR: 16200, MYR: 4.7, PHP: 58,
    INR: 84, GBP: 0.79, EUR: 0.93, CAD: 1.4, AUD: 1.55,
  };
  const usdRate = usdToTarget[currency.toUpperCase()] ?? 1;
  const cacInTargetCents = cacUsd != null ? Math.round(cacUsd * 100 * usdRate) : null;
  // Headline price routes through getDisplayPriceCents — the single
  // source of truth shared with PricingTab and the PDF. Critically,
  // this applies the trust-ceiling check (rejects curve max when it
  // exceeds 1.5× max(P75, LLM rec)). Earlier inline logic here only
  // checked matchesCurve and surfaced the curve max unconditionally,
  // producing the ₩480,000 단가 the user flagged on 2026-05-09 (LLM
  // rec ₩158,900, P75 ₩216,000 → ceiling ₩324k, but curve max ₩480k
  // got through and headlined the Investment + ROI page).
  const pricingDisplay = aggregate.pricing
    ? getDisplayPriceCents(
        aggregate.pricing.recommendedPriceCents,
        aggregate.pricing.curve,
        aggregate.pricing.curveRevenueMaxCents,
        aggregate.pricing.recommendedPriceP75,
      )
    : null;
  const headlinePrice = pricingDisplay?.displayCents ?? 0;
  const volumeTiers = [100, 1000, 10000];
  const showInvestment = cacInTargetCents != null && headlinePrice > 0;

  // ── Robustness / sensitivity ───────────────────────────────────
  const sortedStats = [...aggregate.countryStats].sort(
    (a, b) => b.finalScore.mean - a.finalScore.mean,
  );
  const top = sortedStats[0];
  const runnerUp = sortedStats[1];
  const showRobustness = !!top && !!runnerUp;
  const gap = showRobustness ? top.finalScore.mean - runnerUp.finalScore.mean : 0;
  const gapPct =
    showRobustness && top.finalScore.mean > 0
      ? (gap / top.finalScore.mean) * 100
      : 0;
  const robustnessLabel: { ko: string; en: string; tone: string } = (() => {
    if (gap >= 15) return { ko: "매우 견고", en: "Very robust", tone: "success" };
    if (gap >= 8) return { ko: "견고", en: "Robust", tone: "success" };
    if (gap >= 4) return { ko: "보통", en: "Moderate", tone: "warn" };
    return { ko: "취약", en: "Fragile", tone: "risk" };
  })();
  const toneClass: Record<string, string> = {
    success: "text-success",
    warn: "text-warn",
    risk: "text-risk",
  };
  const toneBg: Record<string, string> = {
    success: "border-success/40 bg-success-soft/30",
    warn: "border-warn/40 bg-warn-soft/30",
    risk: "border-risk/40 bg-risk-soft/30",
  };

  return (
    <div className="space-y-8">
      {/* ── Investment + ROI ──────────────────────────────────── */}
      {showInvestment && (
        <div>
          <h2 className="text-xl font-semibold text-slate-900 mb-1">
            {isKo ? "투자 요구치 + ROI 추정" : "Investment + ROI projection"}
          </h2>
          <p className="text-sm text-slate-500 leading-relaxed mb-4">
            {isKo
              ? `추천 시장 ${recCountry} 기준. 각 볼륨 티어별 마케팅 예산 + 예상 매출 + 시나리오별 변동. 실제 결과는 ±30% 변동 가능.`
              : `Based on the recommended market ${recCountry}. Marketing budget + projected revenue per volume tier, with optimistic / base / pessimistic scenarios.`}
          </p>

          {/* Key inputs — only the values that actually feed the volume
              tier table below. CAC is per-customer-acquired and already
              encodes the full reach→impression→click→conversion funnel,
              so a separate "high-intent ratio" card here would imply a
              scaling factor that doesn't exist (CAC × N already = total
              cost for N customers). High-intent share is shown in the
              persona / country detail tabs as a viability signal, not
              here as a calculation input. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
            <div className="card p-4">
              <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">
                {isKo ? "단가" : "Unit price"}
              </div>
              <div className="text-xl font-bold text-slate-900 tabular-nums">
                {fmt(headlinePrice)}
              </div>
            </div>
            <div className="card p-4">
              <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">
                {isKo ? "CAC (고객 획득 비용)" : "CAC"}
              </div>
              {cacRange ? (
                <>
                  {/* Persona-derived CAC range — primary display when the
                      server-computed range is available. Shows median
                      prominently with low-high band underneath, plus a
                      benchmark sanity badge when the median sits outside
                      the category's typical band. */}
                  <div className="text-xl font-bold text-slate-900 tabular-nums">
                    {fmt(cacInTargetCents!)}
                    <span className="text-xs font-normal text-slate-400 ml-1.5">
                      {isKo ? "median" : "median"}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                    {isKo
                      ? `범위 ${fmt(Math.round(cacRange.lowUsd * 100 * usdRate))} – ${fmt(Math.round(cacRange.highUsd * 100 * usdRate))}`
                      : `Range ${fmt(Math.round(cacRange.lowUsd * 100 * usdRate))} – ${fmt(Math.round(cacRange.highUsd * 100 * usdRate))}`}
                    {currency.toUpperCase() !== "USD" && (
                      <span className="text-slate-400 ml-1">
                        {`($${cacRange.lowUsd.toFixed(0)}–$${cacRange.highUsd.toFixed(0)})`}
                      </span>
                    )}
                  </div>
                  {cacRange.benchmarkFlag.status !== "in-range" && (
                    <div
                      className={clsx(
                        "text-[11px] mt-2 px-2 py-1 rounded leading-snug",
                        cacRange.benchmarkFlag.status === "below-range"
                          ? "bg-warn-soft/40 text-warn"
                          : "bg-risk-soft/40 text-risk",
                      )}
                    >
                      {cacRange.benchmarkFlag.message}
                    </div>
                  )}
                  <details className="mt-2 group">
                    <summary className="cursor-pointer text-[11px] text-slate-500 hover:text-slate-700 inline-flex items-center gap-1 select-none">
                      <ChevronRight size={10} className="transition-transform group-open:rotate-90" />
                      <span>{isKo ? "산출 근거 보기" : "Show rationale"}</span>
                    </summary>
                    <p className="text-[11px] text-slate-600 leading-relaxed mt-1.5 pl-3 border-l-2 border-slate-200">
                      {isKo ? cacRange.rationaleKo : cacRange.rationaleEn}
                    </p>
                    <div className="text-[10px] text-slate-400 mt-1.5 pl-3">
                      {isKo
                        ? `페르소나 ${cacRange.personaSampleSize}명 · 채널 ${cacRange.components.length}개 · multiplier ${cacRange.newBrandMultiplier}× · 벤치마크 $${cacRange.benchmark.rangeLow}-${cacRange.benchmark.rangeHigh}`
                        : `${cacRange.personaSampleSize} personas · ${cacRange.components.length} channels · multiplier ${cacRange.newBrandMultiplier}× · benchmark $${cacRange.benchmark.rangeLow}-${cacRange.benchmark.rangeHigh}`}
                    </div>
                  </details>
                </>
              ) : (
                <>
                  {/* Legacy fallback — LLM-emitted median when server-
                      computed range is unavailable (legacy ensembles or
                      thin per-country persona pool < 5). */}
                  <div className="text-xl font-bold text-slate-900 tabular-nums">
                    {fmt(cacInTargetCents!)}
                  </div>
                  {currency.toUpperCase() !== "USD" && (
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {`($${cacUsd!.toFixed(2)})`}
                    </div>
                  )}
                  {recCountryStats?.cacRationale && (
                    <details className="mt-2 group">
                      <summary className="cursor-pointer text-[11px] text-slate-500 hover:text-slate-700 inline-flex items-center gap-1 select-none">
                        <ChevronRight size={10} className="transition-transform group-open:rotate-90" />
                        <span>{isKo ? "산출 근거 보기" : "Show rationale"}</span>
                      </summary>
                      <p className="text-[11px] text-slate-600 leading-relaxed mt-1.5 pl-3 border-l-2 border-slate-200">
                        {recCountryStats.cacRationale}
                      </p>
                    </details>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Marketing-efficiency callout — M:R ratio (CAC / price) is
              constant across all volume tiers (just 18.50/56), so
              showing it as a per-row column was tautological. Pulled
              out to a single colored callout above the volume table
              with explicit health bands so the user understands what
              33% actually means. */}
          {(() => {
            const ratio = cacInTargetCents! / headlinePrice;
            const ratioPct = (ratio * 100).toFixed(0);
            const tone =
              ratio < 0.3 ? "success" : ratio < 0.6 ? "warn" : "risk";
            const toneClasses: Record<string, string> = {
              success: "border-success/40 bg-success-soft/30 text-success",
              warn: "border-warn/40 bg-warn-soft/40 text-warn",
              risk: "border-risk/40 bg-risk-soft/40 text-risk",
            };
            const verdict =
              tone === "success"
                ? isKo
                  ? "건강 (acquisition 부담 낮음)"
                  : "Healthy (acquisition cost is light)"
                : tone === "warn"
                  ? isKo
                    ? "주의 (LTV uplift 없으면 압박)"
                    : "Caution (tight without LTV uplift)"
                  : isKo
                    ? "위험 (재구매·LTV 없이 지속 불가)"
                    : "Unsustainable without repeat / LTV";
            return (
              <div
                className={clsx(
                  "rounded-lg border px-4 py-3 mb-3 flex flex-wrap items-center gap-x-4 gap-y-1",
                  toneClasses[tone],
                )}
              >
                <div className="flex items-baseline gap-2">
                  <span className="text-[10px] uppercase tracking-wide font-semibold opacity-80">
                    {isKo ? "마케팅 효율 (M:R)" : "Marketing efficiency (M:R)"}
                  </span>
                  <span className="text-xl font-bold tabular-nums">{ratioPct}%</span>
                </div>
                <div className="text-xs text-slate-700 leading-relaxed flex-1 min-w-[12rem]">
                  {isKo
                    ? `매출 ${fmt(headlinePrice)}당 마케팅 ${fmt(cacInTargetCents!)} 소요 → ${verdict}. 기준: <30% 건강, 30-60% 주의, 60%+ 위험.`
                    : `Every ${fmt(headlinePrice)} of revenue requires ${fmt(cacInTargetCents!)} in marketing → ${verdict}. Bands: <30% healthy, 30-60% caution, 60%+ risk.`}
                </div>
              </div>
            );
          })()}

          {/* Volume tier table */}
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left">{isKo ? "고객 수" : "Customers"}</th>
                  <th className="px-4 py-2 text-right">{isKo ? "마케팅 예산 (CAC × N)" : "Marketing (CAC × N)"}</th>
                  <th className="px-4 py-2 text-right">{isKo ? "예상 매출 (기본)" : "Revenue (base)"}</th>
                  <th className="px-4 py-2 text-right">
                    {isKo ? "예상 매출 (비관 −30% / 낙관 +30%)" : "Revenue (pess −30% / opt +30%)"}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {volumeTiers.map((vol) => {
                  const marketing = cacInTargetCents! * vol;
                  const revenueBase = headlinePrice * vol;
                  const revenuePess = Math.round(revenueBase * 0.7);
                  const revenueOpt = Math.round(revenueBase * 1.3);
                  return (
                    <tr key={vol}>
                      <td className="px-4 py-3 font-bold text-slate-900 tabular-nums">
                        {vol.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-700 tabular-nums">
                        {fmt(marketing)}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-slate-900 tabular-nums">
                        {fmt(revenueBase)}
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-slate-500 tabular-nums">
                        {fmt(revenuePess)} / {fmt(revenueOpt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Break-even sensitivity table — three margin scenarios so
              the user sees viability across realistic ranges, not a
              single hardcoded assumption. Anchors on LLM-emitted
              category margin (marginEstimatePct) when present; falls
              back to 35% for legacy sims. ±10pp brackets give
              pessimistic / base / optimistic. */}
          <div className="card p-4 mt-4">
            {(() => {
              const llmMarginPct = aggregate.pricing?.marginEstimatePct;
              const baseMarginPct = llmMarginPct ?? 35;
              const clamp = (n: number) => Math.max(10, Math.min(85, n));
              const scenarios = [
                {
                  key: "pess",
                  labelKo: "비관 (마진 −10pp)",
                  labelEn: "Pessimistic (−10pp)",
                  marginPct: clamp(baseMarginPct - 10),
                },
                {
                  key: "base",
                  labelKo: llmMarginPct != null ? "기본 (AI 추정)" : "기본",
                  labelEn: llmMarginPct != null ? "Base (AI-estimated)" : "Base",
                  marginPct: baseMarginPct,
                },
                {
                  key: "opt",
                  labelKo: "낙관 (마진 +10pp)",
                  labelEn: "Optimistic (+10pp)",
                  marginPct: clamp(baseMarginPct + 10),
                },
              ];
              const rows = scenarios.map((s) => {
                const margin = s.marginPct / 100;
                const grossPerUnit = Math.round(headlinePrice * margin);
                const netPerUnit = grossPerUnit - cacInTargetCents!;
                const breakEvenN =
                  netPerUnit > 0
                    ? Math.ceil((cacInTargetCents! / netPerUnit) * 1000)
                    : null;
                return { ...s, grossPerUnit, netPerUnit, breakEvenN };
              });
              return (
                <>
                  <div className="flex items-baseline justify-between mb-2 gap-2 flex-wrap">
                    <div className="text-xs uppercase tracking-wide text-slate-500 font-semibold">
                      {isKo ? "Break-even 시나리오 (마진별)" : "Break-even sensitivity (by margin)"}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {isKo
                        ? `${llmMarginPct != null ? "AI 추정" : "기본값"} 마진 ${baseMarginPct}% 기준 ±10pp`
                        : `${llmMarginPct != null ? "AI-estimated" : "Default"} ${baseMarginPct}% margin ± 10pp`}
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-[10px] uppercase tracking-wide text-slate-500">
                        <tr className="border-b border-slate-200">
                          <th className="px-2 py-1.5 text-left font-semibold">
                            {isKo ? "시나리오" : "Scenario"}
                          </th>
                          <th className="px-2 py-1.5 text-right font-semibold">
                            {isKo ? "마진" : "Margin"}
                          </th>
                          <th className="px-2 py-1.5 text-right font-semibold">
                            {isKo ? "개당 총이익" : "Gross/unit"}
                          </th>
                          <th className="px-2 py-1.5 text-right font-semibold">
                            {isKo ? "개당 순이익 (−CAC)" : "Net/unit (after CAC)"}
                          </th>
                          <th className="px-2 py-1.5 text-right font-semibold">
                            {isKo ? "1,000명 모객비 회수 (개)" : "BE @ 1,000 spend"}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {rows.map((r) => (
                          <tr key={r.key}>
                            <td className="px-2 py-2 text-slate-700">
                              {isKo ? r.labelKo : r.labelEn}
                            </td>
                            <td className="px-2 py-2 text-right tabular-nums text-slate-700">
                              {r.marginPct}%
                            </td>
                            <td className="px-2 py-2 text-right tabular-nums text-slate-700">
                              {fmt(r.grossPerUnit)}
                            </td>
                            <td
                              className={clsx(
                                "px-2 py-2 text-right tabular-nums font-semibold",
                                r.netPerUnit > 0 ? "text-success" : "text-risk",
                              )}
                            >
                              {fmt(r.netPerUnit)}
                            </td>
                            <td className="px-2 py-2 text-right tabular-nums text-slate-700">
                              {r.breakEvenN != null
                                ? r.breakEvenN.toLocaleString()
                                : isKo
                                  ? "불가"
                                  : "n/a"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-3 leading-relaxed">
                    <strong className="font-semibold text-slate-700">
                      {isKo ? "가정: 1인당 1개 구매." : "Assumes single unit per customer."}
                    </strong>{" "}
                    {isKo
                      ? "마지막 컬럼은 1,000명 모객 마케팅비(CAC × 1,000)를 개당 순이익으로 회수하는 데 필요한 누적 판매량(개). 재구매·LTV는 미반영 — 실제 LTV가 단가의 1.3배 이상이면 위 break-even은 보수적입니다. 음수 net은 \"이 마진 가정에서 수학적 불가\"이지 절대 불가가 아님."
                      : "The last column is the total units required to recoup CAC × 1,000 of marketing spend at the column's net contribution per unit. Repeat purchases / LTV not modeled — if actual LTV exceeds unit price ×1.3, the break-even above is conservative. Negative net means \"impossible at this margin assumption\", not absolutely unviable."}
                  </p>
                </>
              );
            })()}
          </div>

          <p className="text-[11px] text-slate-500 mt-3 leading-relaxed">
            {isKo
              ? "메타: 위 추정치는 페르소나 시그널 기반의 단순 모델 — 실제 CAC는 채널/시즌/광고 효율에 따라 ±50% 변동 가능. 실 투자 전 첫 100명 대상 small-batch test로 검증 권장."
              : "Meta: estimates are first-order from persona signal. Real CAC varies ±50% with channel/season/ad efficiency. Run a 100-customer small-batch test to validate before scaling."}
          </p>
        </div>
      )}

      {/* ── Recommendation robustness + sensitivity ──────────── */}
      {showRobustness && (
        <div>
          <h2 className="text-xl font-semibold text-slate-900 mb-1">
            {isKo ? "추천 견고성 + 민감도 분석" : "Recommendation robustness + sensitivity"}
          </h2>
          <p className="text-sm text-slate-500 leading-relaxed mb-4">
            {isKo
              ? "추천 시장이 흔들리지 않는지 검증. 1순위와 2순위의 점수 격차, 각 component dimension의 취약성, 어떤 변동에서 추천이 flip될지 분석."
              : "Stress-test the recommendation. Gap to runner-up, per-component vulnerability, and what changes would flip the call."}
          </p>

          {/* Robustness hero */}
          <div
            className={clsx(
              "rounded-xl border-t-4 p-5",
              toneBg[robustnessLabel.tone],
              robustnessLabel.tone === "success"
                ? "border-success"
                : robustnessLabel.tone === "warn"
                  ? "border-warn"
                  : "border-risk",
            )}
          >
            <div
              className={clsx(
                "text-[10px] uppercase tracking-wide font-bold mb-2",
                toneClass[robustnessLabel.tone],
              )}
            >
              {isKo ? "추천 견고성" : "RECOMMENDATION ROBUSTNESS"}
            </div>
            <div className="flex items-baseline flex-wrap gap-3 mb-3">
              <span
                className={clsx(
                  "text-3xl font-bold",
                  toneClass[robustnessLabel.tone],
                )}
              >
                {isKo ? robustnessLabel.ko : robustnessLabel.en}
              </span>
              <span className="text-sm text-slate-700">
                {isKo
                  ? `1순위(${top.country}) ${top.finalScore.mean.toFixed(1)}점 vs 2순위(${runnerUp.country}) ${runnerUp.finalScore.mean.toFixed(1)}점 — 격차 ${gap.toFixed(1)}점 (${gapPct.toFixed(0)}%)`
                  : `Top (${top.country}) ${top.finalScore.mean.toFixed(1)} vs runner-up (${runnerUp.country}) ${runnerUp.finalScore.mean.toFixed(1)} — gap ${gap.toFixed(1)}pt (${gapPct.toFixed(0)}%)`}
              </span>
            </div>
            <p className="text-sm text-slate-700 leading-relaxed">
              {gap >= 15
                ? isKo
                  ? "1순위가 충분히 앞서 있어 component 변동에 영향받기 어려움. 추가 검증 우선순위 낮음 — 진출 결정 가능."
                  : "Top is far enough ahead that component shifts won't flip it. Low priority for further validation — proceed with launch."
                : gap >= 8
                  ? isKo
                    ? "1순위가 앞서 있으나 큰 component 변동(15pt+)이 발생하면 flip 가능성 있음. 핵심 component(아래) 추가 검증 권장."
                    : "Top is ahead but a 15pt+ component shift could flip the call. Validate the key components below."
                  : gap >= 4
                    ? isKo
                      ? "격차가 좁아 추천이 흔들릴 수 있음. 1순위 진출 전 핵심 가정 (가격, 채널, 규제) 별도 확인 강력 권장."
                      : "Gap is tight — recommendation could flip with modest changes. Strongly verify key assumptions before commit."
                    : isKo
                      ? "1순위와 2순위가 사실상 동률. 단일 추천보다 두 시장 동시 진출 또는 추가 시뮬 검증을 통한 격차 확보 권장."
                      : "Top and runner-up are statistically tied. Consider parallel launch or additional sims to widen the gap."}
            </p>
          </div>

          {/* Component vulnerability — concrete stress scenarios per
              component. Replaces the prior generic "10pt → flip"
              annotation with: (1) accurate flip threshold (gap × 6,
              from equal-weight assumption), (2) named plausible
              scenarios with estimated drops, (3) per-scenario flip
              determination, (4) cumulative worst-case across scenarios. */}
          {top.components && (
            <div className="card overflow-hidden mt-5">
              <div className="px-5 py-3 bg-slate-50 border-b border-slate-200">
                <div className="text-xs uppercase tracking-wide text-slate-500 font-semibold">
                  {isKo ? `${top.country}의 component별 취약성` : `${top.country} component vulnerability`}
                </div>
                <div className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                  {(() => {
                    const threshold = Math.round(flipThresholdPt(gap));
                    return isKo
                      ? `2순위까지의 격차가 ${gap.toFixed(1)}pt. 6개 component 균등 가중 가정 시, 한 component가 단독으로 ${threshold}pt 하락하면 추천이 flip. 아래는 각 component의 plausible stress 시나리오 — 추정 drop이 임계값을 넘으면 단독으로 flip 발생.`
                      : `Gap to runner-up is ${gap.toFixed(1)}pt. Under equal-weight components (1/6 each), a single component must drop ${threshold}pt for the recommendation to flip. Each row lists plausible stress scenarios with estimated drop — if any single scenario exceeds the threshold, it alone would flip the call.`;
                  })()}
                </div>
              </div>
              <div className="divide-y divide-slate-100 px-5 py-3 space-y-3">
                {(() => {
                  const threshold = flipThresholdPt(gap);
                  const dims: Array<{ key: ComponentKey; score: number }> = (
                    [
                      { key: "marketSize", score: top.components!.marketSize.mean },
                      { key: "culturalFit", score: top.components!.culturalFit.mean },
                      { key: "channelMatch", score: top.components!.channelMatch.mean },
                      { key: "priceCompat", score: top.components!.priceCompat.mean },
                      { key: "competition", score: top.components!.competition.mean },
                      { key: "regulatory", score: top.components!.regulatory.mean },
                    ] as Array<{ key: ComponentKey; score: number }>
                  ).sort((a, b) => a.score - b.score);
                  return dims.map((d) => {
                    const label = COMPONENT_LABEL[d.key];
                    const scenarios = COMPONENT_STRESS_SCENARIOS[d.key];
                    const tone =
                      d.score >= 65 ? "bg-success" : d.score >= 50 ? "bg-warn" : "bg-risk";
                    const textTone =
                      d.score >= 65 ? "text-success" : d.score >= 50 ? "text-warn" : "text-risk";
                    const cumulative = scenarios.reduce((s, sc) => s + sc.dropPt, 0);
                    const cumulativeFlips = cumulative >= threshold;
                    return (
                      <div key={d.key} className="pt-2 first:pt-0">
                        {/* Header row — same compact look as before. */}
                        <div className="flex items-center gap-3 text-sm mb-2">
                          <div className="w-36 shrink-0 font-medium text-slate-700">
                            {isKo ? label.ko : label.en}
                          </div>
                          <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={clsx("h-full transition-all", tone)}
                              style={{ width: `${Math.max(0, Math.min(100, d.score))}%` }}
                            />
                          </div>
                          <div className={clsx("w-12 text-right font-bold tabular-nums", textTone)}>
                            {d.score.toFixed(0)}
                          </div>
                        </div>
                        {/* Scenario rows — concrete content. */}
                        <ul className="ml-36 space-y-1">
                          {scenarios.map((sc, j) => {
                            const flips = sc.dropPt >= threshold;
                            return (
                              <li
                                key={j}
                                className="flex items-center gap-2 text-[11px] text-slate-600 leading-relaxed"
                              >
                                <span className="shrink-0 text-slate-400">•</span>
                                <span className="flex-1">{isKo ? sc.ko : sc.en}</span>
                                <span className="shrink-0 tabular-nums text-slate-500 w-12 text-right">
                                  −{sc.dropPt}pt
                                </span>
                                <span
                                  className={clsx(
                                    "shrink-0 w-12 text-right font-semibold",
                                    flips ? "text-risk" : "text-slate-400",
                                  )}
                                >
                                  {flips
                                    ? isKo ? "→ flip" : "→ flip"
                                    : isKo ? "안정" : "stable"}
                                </span>
                              </li>
                            );
                          })}
                          {/* Cumulative worst-case — multiple scenarios stacking. */}
                          <li className="flex items-center gap-2 text-[11px] leading-relaxed pt-1 border-t border-dashed border-slate-200 mt-1">
                            <span className="shrink-0 text-slate-400">∑</span>
                            <span className="flex-1 text-slate-700 italic">
                              {isKo ? "동시 다발 (누적 worst case)" : "All hit simultaneously (cumulative worst case)"}
                            </span>
                            <span className="shrink-0 tabular-nums text-slate-500 w-12 text-right">
                              −{cumulative}pt
                            </span>
                            <span
                              className={clsx(
                                "shrink-0 w-12 text-right font-semibold",
                                cumulativeFlips ? "text-risk" : "text-slate-400",
                              )}
                            >
                              {cumulativeFlips
                                ? isKo ? "→ flip" : "→ flip"
                                : isKo ? "안정" : "stable"}
                            </span>
                          </li>
                        </ul>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          )}

          {/* Confidence overlay */}
          {aggregate.quality?.confidenceScore != null && (
            <div className="card p-4 mt-5">
              <div className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-2">
                {isKo ? "결과 신뢰도 overlay" : "Confidence overlay"}
              </div>
              <p className="text-sm text-slate-700 leading-relaxed">
                {(() => {
                  const conf = aggregate.quality!.confidenceScore;
                  if (conf >= 75 && gap >= 8) {
                    return isKo
                      ? `결과 신뢰도 ${conf}점 + 견고한 격차(${gap.toFixed(1)}pt). 추천을 의사결정에 사용 가능 — 추가 검증 우선순위 낮음.`
                      : `Confidence ${conf} + robust gap (${gap.toFixed(1)}pt). Recommendation is decision-ready — low priority for further validation.`;
                  }
                  if (conf < 60 && gap < 4) {
                    return isKo
                      ? `⚠ 결과 신뢰도 ${conf}점 + 격차 거의 없음(${gap.toFixed(1)}pt). 무료 재실행 또는 더 높은 tier 시뮬로 검증 강력 권장.`
                      : `⚠ Confidence ${conf} + tight gap (${gap.toFixed(1)}pt). Strongly recommend a free rerun or higher-tier sim before committing.`;
                  }
                  return isKo
                    ? `결과 신뢰도 ${conf}점 + 격차 ${gap.toFixed(1)}pt. 일반적 검증 절차(액션 plan 실행 + 첫 100명 small-batch test)로 충분.`
                    : `Confidence ${conf} + gap ${gap.toFixed(1)}pt. Standard validation path is sufficient.`;
                })()}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Income × Intent matrix + analysis ─────────────────── */}
      {(() => {
        const incomeRowsRaw = aggregate.personas?.segmentBreakdown?.byIncome ?? [];
        if (incomeRowsRaw.length === 0) return null;
        // Sort by income ascending (<$30k → $30-60k → … → $150k+) so the
        // user reads the income-vs-intent relationship monotonically. Raw
        // data comes back ordered by count which scrambles the trend.
        // Bracket order is hardcoded; unknown buckets fall to end.
        const incomeOrder: Record<string, number> = {
          "<$30k": 0,
          "$30-60k": 1,
          "$60-100k": 2,
          "$100-150k": 3,
          "$150k+": 4,
        };
        const incomeRows = [...incomeRowsRaw].sort((a, b) => {
          const ai = incomeOrder[a.bucket] ?? 99;
          const bi = incomeOrder[b.bucket] ?? 99;
          return ai - bi;
        });
        const analysis = analyzeIncomeIntent(incomeRows, isKo ? "ko" : "en");
        const overallMean =
          incomeRows.reduce((s, r) => s + r.meanIntent * r.count, 0) /
          Math.max(1, incomeRows.reduce((s, r) => s + r.count, 0));
        const headlineColorClass =
          analysis.tone === "success"
            ? "text-success border-success"
            : analysis.tone === "warn"
              ? "text-warn border-warn"
              : analysis.tone === "risk"
                ? "text-risk border-risk"
                : "text-brand border-brand";
        return (
          <div>
            <div className="flex items-baseline gap-2 mb-1">
              <h2 className="text-xl font-semibold text-slate-900">
                {isKo ? "소득대 × 구매의향 매트릭스" : "Income × intent matrix"}
              </h2>
              <HelpModal
                title={
                  isKo
                    ? "소득대 × 구매의향 매트릭스 — 해석 가이드"
                    : "Income × intent matrix — interpretation guide"
                }
              >
                {isKo ? (
                  <IncomeIntentHelpKo />
                ) : (
                  <IncomeIntentHelpEn />
                )}
              </HelpModal>
            </div>
            <p className="text-sm text-slate-500 leading-relaxed mb-4">
              {isKo
                ? "소득대별 평균 구매의향과 그 세그먼트의 거주 시장 분포. 가격 포지셔닝 + 시장별 ICP 결정의 input."
                : "Mean intent per income bracket and the residence-country distribution of personas in that bracket. Drives price positioning + per-market ICP."}
            </p>
            <div className="card overflow-hidden mb-5">
              <div className="divide-y divide-slate-100">
                {incomeRows.map((r) => {
                  const tone =
                    r.meanIntent >= 65
                      ? "bg-success"
                      : r.meanIntent >= 50
                        ? "bg-warn"
                        : "bg-risk";
                  // Sample-size caveat — buckets <100 personas have wide
                  // CIs vs neighbours that have 500+. Mark them so the
                  // user doesn't over-interpret a "strongest segment"
                  // headline driven by 32 personas.
                  const lowSample = r.count < 100;
                  return (
                    <div
                      key={r.bucket}
                      className="flex items-center gap-3 px-5 py-3 text-sm"
                    >
                      <div className="w-28 shrink-0 font-medium text-slate-700">
                        {r.bucket}
                      </div>
                      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={clsx("h-full transition-all", tone)}
                          style={{ width: `${Math.max(0, Math.min(100, r.meanIntent))}%` }}
                        />
                      </div>
                      <div className="w-16 text-right text-slate-700 tabular-nums font-medium">
                        {r.meanIntent.toFixed(1)}/100
                      </div>
                      <div
                        className={clsx(
                          "w-24 text-right text-xs tabular-nums flex items-center justify-end gap-1",
                          lowSample ? "text-warn" : "text-slate-500",
                        )}
                        title={
                          lowSample
                            ? isKo
                              ? "표본 100명 미만 — 신뢰구간이 다른 구간보다 넓음. 단정적 해석 자제."
                              : "Sample <100 — confidence interval wider than neighbours. Interpret cautiously."
                            : undefined
                        }
                      >
                        <span>n={r.count}</span>
                        {lowSample && (
                          <span className="text-[10px] font-bold uppercase">
                            {isKo ? "소표본" : "low-n"}
                          </span>
                        )}
                      </div>
                      {/* Make the denominator of `topCountryShare` explicit
                          so it doesn't read as a preference share. NN% here =
                          fraction of THIS income bucket's personas whose home
                          market is XX, not "NN% chose XX". Same disambiguation
                          pattern as the channel-priority "X명 (전체의 Y%)" fix. */}
                      <div className="w-40 text-right text-xs text-slate-600">
                        → {r.topCountry} {isKo ? `(이 구간의 ${r.topCountryShare}%)` : `(${r.topCountryShare}% of bucket)`}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <p className="text-[11px] text-slate-500 mb-4">
              {isKo
                ? `메타: 막대 색은 의향 임계점입니다 (65+ 강 / 50-64 보통 / 50 미만 약). 전체 평균 ${overallMean.toFixed(1)}/100.`
                : `Bar tone: 65+ strong / 50-64 moderate / <50 weak. Overall mean ${overallMean.toFixed(1)}/100.`}
            </p>

            {/* Analysis commentary */}
            {analysis.bullets.length > 0 && (
              <div className="card p-5">
                <div className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-3">
                  {isKo ? "분석 해석" : "Analysis"}
                </div>
                <div
                  className={clsx(
                    "border-l-3 pl-4 mb-4 py-1",
                    headlineColorClass.split(" ").pop(),
                  )}
                  style={{ borderLeftWidth: 3 }}
                >
                  <div
                    className={clsx(
                      "text-base font-semibold leading-relaxed",
                      headlineColorClass.split(" ")[0],
                    )}
                  >
                    {analysis.headline}
                  </div>
                </div>
                <ol className="space-y-2.5">
                  {analysis.bullets.map((b, i) => (
                    <li key={i} className="flex gap-2 text-sm text-slate-700 leading-relaxed">
                      <span className="text-slate-400 font-medium tabular-nums shrink-0">
                        {i + 1}.
                      </span>
                      <span>{b.replace(/\*\*/g, "")}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

function RisksTab({
  narrative,
  simCount,
  crossCountry,
  isKo,
}: {
  narrative: EnsembleAggregate["narrative"];
  /** Total ensemble sim count — used as the denominator on each risk
   *  card so "surfaced in 1 sim" reads as "1/15 sims" with consensus
   *  context, not as a faint footnote that hides low-confidence items. */
  simCount: number;
  /** Cross-country category distribution from the aggregator. When a
   *  risk's personaCategory matches a row in either objections or
   *  trustFactors, the meta line below the description shows persona
   *  coverage from this matrix instead of the sim-frequency count. */
  crossCountry: EnsembleAggregate["crossCountryDistribution"];
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
          // Persona-coverage metric — pulled from the cross-country
          // distribution matrix when the merge LLM tagged personaCategory.
          // Replaces the old "X/Y sims" framing because a sim count is
          // a parser artifact (Jaccard recount on rewritten cross-market
          // factor text consistently underflows to 1) while persona
          // coverage measures real signal strength. Falls back to the
          // sim count when no personaCategory or no matrix match.
          const matrixRow = (() => {
            if (!r.personaCategory || !crossCountry) return null;
            return (
              crossCountry.objections.find((row) => row.category === r.personaCategory) ??
              crossCountry.trustFactors.find((row) => row.category === r.personaCategory) ??
              null
            );
          })();
          const ratio = simCount > 0 ? r.surfacedInSims / simCount : 1;
          const consensusInfo =
            !matrixRow && simCount > 1
              ? ratio >= 0.5
                ? { label: isKo ? "강한 합의" : "strong consensus", className: "text-success" }
                : ratio >= 0.25
                  ? { label: isKo ? "부분 합의" : "partial consensus", className: "text-warn" }
                  : { label: isKo ? "단일/소수 시뮬" : "low consensus", className: "text-slate-500" }
              : null;
          const coverageInfo = (() => {
            if (!matrixRow) return null;
            const total = matrixRow.totalRatePct.toFixed(0);
            if (matrixRow.scope === "cross-market") {
              return {
                primary: isKo
                  ? `${matrixRow.countriesAboveBaseline}개 시장 평균 ${total}% 페르소나 언급`
                  : `Mean ${total}% personas across ${matrixRow.countriesAboveBaseline} markets`,
              };
            }
            if (matrixRow.scope === "country-specific") {
              const dom = matrixRow.dominantCountry;
              const domRow = matrixRow.perCountry.find((c) => c.country === dom);
              const others = matrixRow.perCountry.filter((c) => c.country !== dom && c.count > 0);
              const otherMean =
                others.length > 0
                  ? Math.round(others.reduce((s, c) => s + c.ratePct, 0) / others.length)
                  : 0;
              return {
                primary: isKo
                  ? `${dom} 페르소나 ${domRow?.ratePct.toFixed(0) ?? "?"}% 언급 (타 시장 평균 ${otherMean}%)`
                  : `${domRow?.ratePct.toFixed(0) ?? "?"}% of ${dom} personas (other markets mean ${otherMean}%)`,
              };
            }
            // narrow
            const top = matrixRow.perCountry.filter((c) => c.count > 0).slice(0, 5);
            const meanPct = top.length > 0
              ? Math.round(top.reduce((s, c) => s + c.ratePct, 0) / top.length)
              : 0;
            const list = top.map((c) => c.country).join("·");
            return {
              primary: isKo
                ? `${list} 평균 ${meanPct}% 페르소나 언급`
                : `${list} mean ${meanPct}% personas`,
            };
          })();
          // Scope badge — tells the reader at a glance whether a risk
          // is universal across markets or country-specific. The merge
          // LLM tags it from the cross-country distribution matrix
          // (added 2026-05-09 to stop "TW 17명 중 5명" hallucinations
          // from labelling universal cross-border friction as a single-
          // country risk). Optional + lenient — legacy narratives
          // without scope simply hide the badge.
          const scopeBadge = (() => {
            if (!r.scope) return null;
            if (r.scope === "cross-market") {
              return {
                label: isKo ? "전 시장 공통" : "Cross-market",
                className: "bg-slate-100 text-slate-700 border border-slate-200",
                detail: isKo
                  ? "후보 진출국 전반에서 비슷한 비율로 surface"
                  : "Surfaces at similar rates across all candidate markets",
              };
            }
            if (r.scope === "country-specific") {
              const country = r.affectedCountries?.[0];
              return {
                label: country
                  ? isKo ? `${country} 단일 시장` : `${country} only`
                  : isKo ? "단일 시장" : "Country-specific",
                className: "bg-amber-50 text-amber-700 border border-amber-200",
                detail: isKo
                  ? "한 국가가 통계적으로 outlier (다른 국가 대비 1.5배 이상)"
                  : "One country is a statistical outlier (≥1.5× other markets)",
              };
            }
            return {
              label: isKo
                ? `일부 시장${r.affectedCountries && r.affectedCountries.length > 0 ? ` (${r.affectedCountries.join(", ")})` : ""}`
                : `Select markets${r.affectedCountries && r.affectedCountries.length > 0 ? ` (${r.affectedCountries.join(", ")})` : ""}`,
              className: "bg-blue-50 text-blue-700 border border-blue-200",
              detail: isKo
                ? "특정 국가군에서만 surface — 단일 dominant 국가는 없음"
                : "Surfaces only in select markets — no single dominant country",
            };
          })();

          return (
            <div key={i} className="p-4 flex gap-3 items-start">
              <div className={clsx("shrink-0 w-16 text-[10px] font-bold uppercase tracking-wider pt-0.5", sevClass)}>
                {r.severity}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2 mb-0.5">
                  <div className="text-sm font-semibold text-slate-900 min-w-0">{r.factor}</div>
                  {scopeBadge && (
                    <span
                      className={clsx(
                        "shrink-0 text-[10px] font-medium px-2 py-0.5 rounded",
                        scopeBadge.className,
                      )}
                      title={scopeBadge.detail}
                    >
                      {scopeBadge.label}
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-600 leading-relaxed">{r.description}</p>
                <div className="text-xs mt-1 flex items-center gap-2 flex-wrap">
                  {coverageInfo ? (
                    <span className="text-slate-500">{coverageInfo.primary}</span>
                  ) : (
                    <>
                      <span className="text-slate-500">
                        {isKo
                          ? `${r.surfacedInSims}/${simCount}개 시뮬에서 언급`
                          : `Surfaced in ${r.surfacedInSims}/${simCount} sim${simCount === 1 ? "" : "s"}`}
                      </span>
                      {consensusInfo && (
                        <>
                          <span className="text-slate-300">·</span>
                          <span className={clsx("font-medium", consensusInfo.className)}>
                            {consensusInfo.label} ({(ratio * 100).toFixed(0)}%)
                          </span>
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <ChartGuide isKo={isKo} label={isKo ? "심각도(severity)와 빈도(surfacedInSims) 어떻게 읽나요?" : "How to read severity & frequency"}>
        <GuideSection title={isKo ? "심각도 분류" : "Severity tiers"}>
          <ul className="list-disc pl-5 space-y-0.5 m-0">
            {isKo ? (
              <>
                <li><span className="text-risk font-semibold">HIGH</span> — 출시 자체를 좌우. 미해결 시 매출/고객 신뢰에 직접 타격. 런칭 전 선결.</li>
                <li><span className="text-warn font-semibold">MEDIUM</span> — 성과 저해. 모니터링 + Phase 2까지는 대응책 마련.</li>
                <li><span className="text-slate-500 font-semibold">LOW</span> — 사소한 갈등. 인지만 하고 진행.</li>
              </>
            ) : (
              <>
                <li><span className="text-risk font-semibold">HIGH</span> — could derail launch. Resolve before shipping.</li>
                <li><span className="text-warn font-semibold">MEDIUM</span> — drags performance. Monitor + plan a fix by Phase 2.</li>
                <li><span className="text-slate-500 font-semibold">LOW</span> — minor friction. Acknowledge and proceed.</li>
              </>
            )}
          </ul>
        </GuideSection>
        <GuideSection title={isKo ? "정렬 우선순위" : "Sort order"}>
          <p className="m-0">
            {isKo
              ? "심각도 (HIGH > MED > LOW)가 1순위, 시뮬 빈도 (surfacedInSims)는 2순위. 즉 \"한 시뮬에서만 발견된 HIGH\"가 \"모든 시뮬에 등장한 LOW\"보다 위에 표시됩니다 — 빈도가 낮아도 위험 자체가 크면 우선 처리해야 하기 때문."
              : "Severity (HIGH > MED > LOW) sorts first; frequency (surfacedInSims) is the tiebreaker. So a HIGH risk surfaced in just one sim still ranks above a LOW that hit every sim — magnitude beats frequency for triage."}
          </p>
        </GuideSection>
        <GuideSection title={isKo ? "surfacedInSims 의 의미" : "What surfacedInSims tells you"}>
          <p className="m-0">
            {isKo
              ? "여러 시뮬에서 같은 의미의 리스크를 발견한 횟수. 높을수록 LLM 모델이 일관되게 우려한다는 신호 — 1-2회는 노이즈일 수 있고, 5회 이상은 강한 합의."
              : "How many sims independently flagged a semantically equivalent risk. Higher = stronger model agreement — 1–2 may be noise; 5+ is strong consensus."}
          </p>
        </GuideSection>
      </ChartGuide>
    </div>
  );
}

function ActionsTab({
  narrative,
  simCount,
  actionCoverage,
  isKo,
}: {
  narrative: EnsembleAggregate["narrative"];
  /** Total ensemble sim count — used as denominator for the
   *  "recommended by N/M sims" hint so consensus is visible. */
  simCount: number;
  /** Per-ACTION_CATEGORIES sim coverage from aggregator. When a
   *  merged action's actionCategory matches a row, the renderer
   *  shows category-level coverage in place of textual sim count. */
  actionCoverage: EnsembleAggregate["actionCategoryCoverage"];
  isKo: boolean;
}) {
  if (!narrative?.mergedActions?.length) {
    return (
      <div className="card p-8 text-center text-slate-500">
        {isKo ? "통합 액션 데이터가 없습니다." : "No merged actions available."}
      </div>
    );
  }
  // Surface the priority matrix only when at least one action has
  // impact/effort scores — legacy narratives (pre-F-batch) skip the
  // matrix and fall back to the plain ranked list.
  const hasScores = narrative.mergedActions.some(
    (a) => typeof a.impact === "number" && typeof a.effort === "number",
  );

  return (
    <div className="space-y-6">
      {hasScores && <ActionPriorityMatrix actions={narrative.mergedActions} isKo={isKo} />}
      <div>
        {hasScores && (
          <h2 className="text-base font-semibold text-slate-900 mb-2">
            {isKo ? "전체 액션 (우선순위 정렬)" : "All actions (sorted)"}
          </h2>
        )}
        <ol className="card divide-y divide-slate-100">
          {narrative.mergedActions.map((a, i) => {
            const quad = quadrantFor(a.impact, a.effort);
            // Category-level coverage replaces the misleading textual
            // recount. When the merge LLM tagged actionCategory, we
            // look it up in the aggregator's coverage table — that
            // count survives action-text rewrites because it's
            // computed off the per-sim actionPlanCategorized arrays,
            // not Jaccard text matching.
            const coverageRow =
              a.actionCategory && actionCoverage
                ? actionCoverage.find((r) => r.category === a.actionCategory) ?? null
                : null;
            const coverageText = coverageRow
              ? isKo
                ? `${coverageRow.surfacedInSims}/${simCount}개 시뮬이 '${categoryLabel("action", coverageRow.category, "ko")}' 액션 권장`
                : `${coverageRow.surfacedInSims}/${simCount} sim${simCount === 1 ? "" : "s"} recommended a ${categoryLabel("action", coverageRow.category, "en").toLowerCase()} action`
              : null;
            return (
              <li key={i} className="p-4 flex gap-3 items-start">
                <div className="shrink-0 w-6 text-sm font-bold text-brand">{i + 1}.</div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-700 leading-relaxed">{a.action}</p>
                  <div className="text-xs text-slate-400 mt-1 flex items-center gap-2 flex-wrap">
                    <span className="text-slate-500">
                      {coverageText
                        ? coverageText
                        : isKo
                          ? `${a.surfacedInSims}/${simCount}개 시뮬에서 권장`
                          : `Recommended by ${a.surfacedInSims}/${simCount} sim${simCount === 1 ? "" : "s"}`}
                    </span>
                    {quad && (
                      <>
                        <span className="text-slate-300">·</span>
                        <span
                          className={clsx(
                            "px-1.5 py-0.5 rounded-full font-semibold text-[10px]",
                            quad.badgeClass,
                          )}
                        >
                          {quad.label[isKo ? "ko" : "en"]}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {isKo
                            ? `영향 ${a.impact} · 난이도 ${a.effort}`
                            : `impact ${a.impact} · effort ${a.effort}`}
                        </span>
                      </>
                    )}
                    {a.specificity && (
                      <>
                        <span className="text-slate-300">·</span>
                        <SpecificityBadge specificity={a.specificity} isKo={isKo} />
                      </>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

/**
 * Concreteness badge on a single merged action. Shows the 0-100 score
 * + a tooltip listing which of the 4 dimensions are present (channel /
 * metric / timeline / measurable). Tone:
 *   ≥ 75 → success (green) "구체적"
 *   50-74 → warn (amber) "부분"
 *   < 50 → risk (red) "추상적" — actionable warning to the user
 */
function SpecificityBadge({
  specificity,
  isKo,
}: {
  specificity: NonNullable<
    NonNullable<EnsembleAggregate["narrative"]>["mergedActions"][number]["specificity"]
  >;
  isKo: boolean;
}) {
  const tone =
    specificity.score >= 75
      ? "bg-success/15 text-success"
      : specificity.score >= 50
        ? "bg-warn/20 text-warn-foreground"
        : "bg-risk/15 text-risk";
  const label =
    specificity.score >= 75
      ? isKo
        ? "구체적"
        : "Concrete"
      : specificity.score >= 50
        ? isKo
          ? "부분"
          : "Partial"
        : isKo
          ? "추상적"
          : "Vague";
  // Tooltip lists the dimensions that ARE missing — that's the actionable
  // information ("missing channel + timeline" tells the user what to ask
  // for next). When all four are present, simply confirm "all 4 met".
  const missing: string[] = [];
  if (!specificity.hasChannel) missing.push(isKo ? "채널" : "channel");
  if (!specificity.hasMetric) missing.push(isKo ? "숫자" : "metric");
  if (!specificity.hasTimeline) missing.push(isKo ? "타임라인" : "timeline");
  if (!specificity.hasMeasurable) missing.push(isKo ? "측정 KPI" : "KPI");
  const tooltip =
    missing.length === 0
      ? isKo
        ? "채널 · 숫자 · 타임라인 · 측정 KPI 모두 포함"
        : "Channel + metric + timeline + measurable KPI all present"
      : isKo
        ? `누락: ${missing.join(" · ")}`
        : `Missing: ${missing.join(", ")}`;
  return (
    <span
      className={clsx(
        "px-1.5 py-0.5 rounded-full font-semibold text-[10px] tabular-nums",
        tone,
      )}
      title={tooltip}
    >
      {label} {specificity.score}
    </span>
  );
}

/**
 * 2×2 priority matrix for the merged action list. X-axis = effort
 * (left = easy, right = hard); Y-axis = impact (top = high). Quick
 * wins land top-left and get highlighted because that's what most
 * teams should sequence first.
 *
 * Each action is a small dot positioned by its (impact, effort) score.
 * Multiple actions in the same cell stack vertically — we don't try
 * to scatter them precisely because the underlying scores are 1-3
 * integers, not continuous, so jitter would imply false precision.
 */
function ActionPriorityMatrix({
  actions,
  isKo,
}: {
  actions: NonNullable<EnsembleAggregate["narrative"]>["mergedActions"];
  isKo: boolean;
}) {
  // Index actions by their target cell (impact × effort), preserving
  // their position in the sorted list so the dot label can show "1."
  // matching the list below.
  const cells = new Map<string, Array<{ idx: number; action: string }>>();
  actions.forEach((a, i) => {
    if (typeof a.impact !== "number" || typeof a.effort !== "number") return;
    const key = `${a.impact}-${a.effort}`;
    const arr = cells.get(key) ?? [];
    arr.push({ idx: i + 1, action: a.action });
    cells.set(key, arr);
  });

  const QUADS: Array<{
    cells: Array<[number, number]>; // [impact, effort] pairs
    label: { ko: string; en: string };
    bg: string;
    border: string;
    text: string;
  }> = [
    {
      // Quick wins: high impact (2-3) + low effort (1)
      cells: [
        [3, 1],
        [2, 1],
      ],
      label: { ko: "Quick Wins", en: "Quick Wins" },
      bg: "bg-success-soft/40",
      border: "border-success/30",
      text: "text-success",
    },
    {
      // Strategic: high impact (3) + medium-high effort (2-3)
      cells: [
        [3, 2],
        [3, 3],
      ],
      label: { ko: "Strategic", en: "Strategic" },
      bg: "bg-accent-50/50",
      border: "border-accent/30",
      text: "text-accent",
    },
    {
      // Marginal: low-medium impact (1-2) + low-medium effort (1-2)
      cells: [
        [1, 1],
        [2, 2],
      ],
      label: { ko: "Marginal", en: "Marginal" },
      bg: "bg-slate-50",
      border: "border-slate-200",
      text: "text-slate-500",
    },
    {
      // Avoid: low impact + high effort
      cells: [
        [1, 2],
        [1, 3],
        [2, 3],
      ],
      label: { ko: "Avoid", en: "Avoid" },
      bg: "bg-warn-soft/30",
      border: "border-warn/30",
      text: "text-warn",
    },
  ];

  function quadFor(impact: number, effort: number) {
    return QUADS.find((q) => q.cells.some(([i, e]) => i === impact && e === effort));
  }

  return (
    <div>
      <h2 className="text-base font-semibold text-slate-900 mb-2">
        {isKo ? "액션 우선순위 매트릭스" : "Action priority matrix"}
      </h2>
      <p className="text-xs text-slate-500 leading-relaxed mb-3 break-keep">
        {isKo
          ? "각 액션을 영향도 × 실행 난이도로 배치합니다. 좌상단 (영향 큼 + 쉬움)부터 시작하세요."
          : "Each action plotted by impact × effort. Start with the top-left (high impact + low effort)."}
      </p>
      <div className="card p-3 sm:p-5">
        <div className="grid grid-cols-[auto_1fr_1fr_1fr] grid-rows-[1fr_1fr_1fr_auto] gap-2 min-h-[280px]">
          {/* Row labels (impact axis, top to bottom: 3 → 1) */}
          {[3, 2, 1].map((impact) => (
            <Fragment key={`row-${impact}`}>
              <div className="text-[10px] text-slate-500 font-semibold tracking-wider flex items-center justify-end pr-2">
                {impact === 3
                  ? isKo
                    ? "영향 ↑"
                    : "Impact ↑"
                  : impact === 1
                    ? isKo
                      ? "영향 ↓"
                      : "Impact ↓"
                    : ""}
              </div>
              {[1, 2, 3].map((effort) => {
                const items = cells.get(`${impact}-${effort}`) ?? [];
                const q = quadFor(impact, effort);
                return (
                  <div
                    key={`cell-${impact}-${effort}`}
                    className={clsx(
                      "rounded-md border p-2 min-h-[72px]",
                      q?.bg ?? "bg-slate-50",
                      q?.border ?? "border-slate-200",
                    )}
                  >
                    {q && items.length > 0 && (
                      <div className={clsx("text-[9px] font-bold uppercase tracking-wider mb-1.5", q.text)}>
                        {q.label[isKo ? "ko" : "en"]}
                      </div>
                    )}
                    <div className="space-y-1">
                      {items.map((it) => (
                        <div
                          key={`${it.idx}`}
                          className="flex items-start gap-1.5"
                          title={it.action}
                        >
                          <span
                            className={clsx(
                              "shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold",
                              q
                                ? `${q.bg} ${q.text} border ${q.border}`
                                : "bg-slate-100 text-slate-600 border border-slate-200",
                            )}
                          >
                            {it.idx}
                          </span>
                          <span className="text-[11px] text-slate-700 leading-snug truncate">
                            {it.action}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </Fragment>
          ))}
          {/* Bottom row: x-axis labels */}
          <div />
          <div className="text-[10px] text-slate-500 font-semibold tracking-wider text-center">
            {isKo ? "쉬움 (며칠)" : "Easy (days)"}
          </div>
          <div className="text-[10px] text-slate-500 font-semibold tracking-wider text-center">
            {isKo ? "보통 (몇 주)" : "Medium (weeks)"}
          </div>
          <div className="text-[10px] text-slate-500 font-semibold tracking-wider text-center">
            {isKo ? "어려움 (몇 달)" : "Hard (months)"}
          </div>
        </div>
        <div className="mt-3 text-[10px] text-slate-400 text-center">
          {isKo ? "← 실행 난이도 →" : "← Effort →"}
        </div>
      </div>
    </div>
  );
}

function quadrantFor(
  impact?: number,
  effort?: number,
):
  | {
      label: { ko: string; en: string };
      badgeClass: string;
    }
  | null {
  if (typeof impact !== "number" || typeof effort !== "number") return null;
  // High impact + low effort = Quick Win
  if (impact >= 2 && effort === 1) {
    return {
      label: { ko: "Quick Win", en: "Quick Win" },
      badgeClass: "bg-success-soft text-success",
    };
  }
  // High impact + medium-hard = Strategic
  if (impact === 3 && effort >= 2) {
    return {
      label: { ko: "Strategic", en: "Strategic" },
      badgeClass: "bg-accent/15 text-accent",
    };
  }
  // Low impact + high effort = Avoid
  if (impact === 1 && effort >= 2) {
    return {
      label: { ko: "Avoid", en: "Avoid" },
      badgeClass: "bg-warn-soft text-warn",
    };
  }
  // Everything else = Marginal
  return {
    label: { ko: "Marginal", en: "Marginal" },
    badgeClass: "bg-slate-100 text-slate-500",
  };
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
                : "Analysis depth. Hypothesis(1) → Consensus(5) → Consensus+(15) → Triangulated(25, multi-LLM) → Triangulated Pro(50, multi-LLM)."
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
                : "AI models that produced this analysis. Triangulated tiers round-robin across providers to dampen single-model bias."
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

      <div>
        <h2 className="text-base font-semibold text-slate-900 mb-3">
          {isKo ? "LLM별 합의도" : "Cross-model consensus"}
        </h2>
        {!providerBreakdown || providerBreakdown.length === 0 ? (
          // Single-provider tiers (hypothesis / decision) carry no
          // cross-model signal — providerBreakdown is empty by design.
          // Previously the whole section was hidden, which made the
          // Data tab look mysteriously shorter for those tiers.
          // Surface an explanation so the user knows it's tier-driven,
          // not a missing-data bug.
          <div className="card p-4 text-xs text-slate-500">
            {isKo
              ? "이 분석은 단일 LLM 등급(초기검증·검증분석)이라 모델 간 합의도가 산출되지 않습니다. 검증분석+ 이상 등급에서 여러 모델을 라운드로빈하면 여기에 모델별 1순위 추천과 전체 합의 일치율이 표시됩니다."
              : "Single-LLM tier (Hypothesis / Consensus) — no cross-model signal to render. Run Consensus+ or higher to see per-provider top picks and agreement rates here."}
          </div>
        ) : (
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
        )}
      </div>

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

      <div>
        <h2 className="text-base font-semibold text-slate-900 mb-3">
          {isKo ? "크리에이티브 분석" : "Creative analysis"}
        </h2>
        {!creative || creative.assets.length === 0 ? (
          // Project ran without uploaded creative assets — the runner
          // skips this stage entirely, so the aggregate has no
          // creative.assets to render. Previously the section was
          // hidden silently; users assumed it was missing/broken when
          // it was actually a result of not uploading anything to
          // grade. Surface an explicit hint with the relevant project
          // action ("upload creatives to populate this section").
          <div className="card p-4 text-xs text-slate-500">
            {isKo
              ? "이 프로젝트는 크리에이티브(광고/패키지/이미지 등)를 업로드하지 않아 분석 대상이 없습니다. 프로젝트 설정에서 자산을 추가하고 다시 분석하면 자산별 강점·약점·평균 점수가 여기에 표시됩니다."
              : "No creative assets were uploaded for this project, so there's nothing to grade here. Add assets in the project settings and re-run the analysis to see per-asset strengths, weaknesses, and mean scores."}
          </div>
        ) : (
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
        )}
      </div>
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
/**
 * Locale-aware segment header label. Uses `seg.id` (stable enum) instead
 * of `seg.labelKo` so existing aggregates persisted with hardcoded Korean
 * labels render correctly in the English locale too.
 */
function segmentLabel(id: string, isKo: boolean): string {
  if (isKo) {
    switch (id) {
      case "volume":
        return "속도 우선 (HIGHEST DEMAND)";
      case "cac":
        return "비용 효율 (LOWEST CAC)";
      case "competition":
        return "경쟁 회피 (LOWEST COMPETITION)";
      case "overall":
        return "종합 점수 (HIGHEST FINALSCORE)";
      default:
        return "";
    }
  }
  switch (id) {
    case "volume":
      return "Speed first (HIGHEST DEMAND)";
    case "cac":
      return "Cost efficient (LOWEST CAC)";
    case "competition":
      return "Avoid competition (LOWEST COMPETITION)";
    case "overall":
      return "Balanced (HIGHEST FINALSCORE)";
    default:
      return "";
  }
}

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
/**
 * Tier-aware preview text for the detailed-report dropdown option. The
 * page count + the feature list both grow as tier rises, so the user
 * sees what they're getting before they download. Mirrors TIER_BUDGET
 * in ensemble-pdf.tsx — keep these two lists in sync when adding new
 * pages.
 */
function detailedReportSummary(
  tier: string,
  isKo: boolean,
): { title: string; body: string } {
  // Estimated page counts per tier — based on the actual TIER_BUDGET
  // gates. Update if you add/remove tier-gated pages.
  const pageRange: Record<string, string> = {
    hypothesis: "~17p",
    decision: "~25p",
    decision_plus: "~30p",
    deep: "~34p",
    deep_pro: "~34p",
  };
  // Feature list per tier — only the items that this tier UNLOCKS
  // beyond the previous tier, plus a "+ everything below" pointer.
  const features: Record<string, { ko: string; en: string }> = {
    hypothesis: {
      ko: "기본 분석 (추천국 · 페르소나 · 가격 · 리스크 · 액션)",
      en: "Core analysis (pick · personas · pricing · risks · actions)",
    },
    decision: {
      ko: "+ Go/No-Go 판정 · 시장 상황+경쟁자 분석 · 국가 의사결정 매트릭스 · 30/60/90 실행 타임라인 · 챔피언vs회의론자",
      en: "+ Go/No-Go verdict · market profile + competitors · country decision matrix · 30/60/90 timeline · champion vs skeptic",
    },
    decision_plus: {
      ko: "+ 투자 요구치+ROI · 추천 견고성 분석 · 직업별 의향 · 채널 우선순위 · 리스크×액션",
      en: "+ Investment+ROI · recommendation robustness · profession · channels · risk-action",
    },
    deep: {
      ko: "+ 페르소나 아키타입 · 국가별 퍼널 비교 · LLM 교차 의견",
      en: "+ Persona archetypes · funnel comparison · cross-LLM",
    },
    deep_pro: {
      ko: "+ 페르소나 아키타입 · 국가별 퍼널 비교 · LLM 교차 의견 (Pro 깊이)",
      en: "+ Archetypes · funnel comparison · cross-LLM (Pro depth)",
    },
  };
  const range = pageRange[tier] ?? "";
  const f = features[tier] ?? features.decision;
  return {
    title: isKo
      ? `전체 분석 (${range}, ${tierBadgeLabel(tier, isKo)} 기준)`
      : `Detailed (${range}, ${tierBadgeLabel(tier, isKo)} tier)`,
    body: isKo ? f.ko : f.en,
  };
}

function tierBadgeLabel(tier: string, isKo: boolean): string {
  const map: Record<string, { ko: string; en: string }> = {
    hypothesis: { ko: "초기검증", en: "Hypothesis" },
    decision: { ko: "검증분석", en: "Consensus" },
    decision_plus: { ko: "검증분석+", en: "Consensus+" },
    deep: { ko: "심층분석", en: "Triangulated" },
    deep_pro: { ko: "심층분석 Pro", en: "Triangulated Pro" },
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

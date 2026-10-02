"use client";

import { useState } from "react";
import { useLocale } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Sparkles, Loader2 } from "lucide-react";
import { friendlyApiError, friendlyClientError } from "@/lib/api/error-message";

type Tier = "hypothesis" | "decision" | "decision_plus" | "deep" | "deep_pro";

interface Props {
  projectId: string;
  className?: string;
  /** Beta (free_trial) workspaces can only run Hypothesis — lock the
   *  higher tier options so they aren't selectable. */
  betaTrialOnly?: boolean;
}

/**
 * Compact "run another ensemble on this existing project" control. The
 * wizard creates fresh projects; this exists so the user can iterate on
 * the SAME fixture (different tier, comparison run) without re-entering
 * the form. Posts to the same /api/projects/:id/run-ensemble endpoint
 * the wizard uses, then routes to the live results page.
 */
export function RunEnsembleButton({ projectId, className, betaTrialOnly = false }: Props) {
  const locale = useLocale();
  const router = useRouter();
  const isKo = locale === "ko";
  const [tier, setTier] = useState<Tier>("hypothesis");
  const [notifyEmail, setNotifyEmail] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/run-ensemble`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tier,
          locale,
          notifyEmail: notifyEmail.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error(await friendlyApiError(res, isKo ? "ko" : "en"));
      const { ensembleId } = await res.json();
      router.push(`/projects/${projectId}/results?ensemble=${ensembleId}`);
    } catch (err) {
      setError(friendlyClientError(err, isKo ? "ko" : "en"));
      setRunning(false);
    }
  };

  return (
    <div className={className}>
      <div className="space-y-2">
        {/* Durations are measured, not estimated — median and p10/p90 of
            completed runs since 2026-09, outliers (zombies, instant
            failures) excluded:

              hypothesis     n=281   p10 6   median 8    p90 10
              decision       n=5     p10 17  median 18   p90 18
              decision_plus  n=1                 19

            Every published figure here had been too low: "5~6분" against
            a measured 6-10, "약 12분" against 17-18. Deep has no
            completed run to measure yet; its range is inferred from the
            others, which barely move with sim count because the sims run
            in parallel. Re-measure before quoting it as fact. */}
        <select
          className="input w-full"
          value={tier}
          disabled={running}
          onChange={(e) => setTier(e.target.value as Tier)}
        >
          <option value="hypothesis">
            {isKo
              ? "초기검증 · 600명 · 약 6~10분"
              : "Hypothesis · 600 personas · ~6-10 min"}
          </option>
          <option value="decision" disabled={betaTrialOnly}>
            {isKo
              ? "검증분석 · 1,200명 · 약 15~20분"
              : "Consensus · 1,200 personas · ~15-20 min"}
            {betaTrialOnly ? (isKo ? " · 베타 전용" : " · paid plan") : ""}
          </option>
          <option value="decision_plus" disabled={betaTrialOnly}>
            {isKo
              ? "검증분석 Plus · 3,000명 · 약 20분"
              : "Consensus Plus · 3,000 personas · ~20 min"}
            {betaTrialOnly ? (isKo ? " · 베타 전용" : " · paid plan") : ""}
          </option>
          <option value="deep" disabled={betaTrialOnly}>
            {isKo
              ? "심층분석 · 5,000명 · 멀티 LLM · 약 20~30분"
              : "Triangulated · 5,000 personas · multi-LLM · ~20-30 min"}
            {betaTrialOnly ? (isKo ? " · 베타 전용" : " · paid plan") : ""}
          </option>
          {/* deep_pro hidden until we redesign for sub-800s execution —
              50 sims × multi-LLM exceeds Vercel's maxDuration today. */}
        </select>
        <input
          type="email"
          className="input w-full"
          placeholder={
            isKo
              ? "완료 알림 이메일 (선택, 검증분석 이상 권장)"
              : "Notify email when done (optional, useful for Consensus and above)"
          }
          value={notifyEmail}
          disabled={running}
          onChange={(e) => setNotifyEmail(e.target.value)}
        />
        <button
          onClick={run}
          disabled={running}
          className="btn-primary w-full disabled:opacity-60"
        >
          {running ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {running
            ? isKo
              ? "분석 시작 중..."
              : "Starting analysis..."
            : isKo
              ? "새 앙상블 분석 실행"
              : "Run new ensemble"}
        </button>
        {error && <div className="text-xs text-risk">{error}</div>}
      </div>
    </div>
  );
}

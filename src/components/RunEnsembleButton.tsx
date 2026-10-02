"use client";

import { useState } from "react";
import { useLocale } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Sparkles, Loader2 } from "lucide-react";
import { friendlyApiError, friendlyClientError } from "@/lib/api/error-message";

import { SELECTABLE_TIERS, tierOptionLabel, type Tier } from "@/lib/simulation/tier-display";

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
        <select
          className="input w-full"
          value={tier}
          disabled={running}
          onChange={(e) => setTier(e.target.value as Tier)}
        >
          {SELECTABLE_TIERS.map((t: Tier) => {
            // Hypothesis stays available on the beta trial; everything
            // above it is gated the way it was before.
            const gated = betaTrialOnly && t !== "hypothesis";
            return (
              <option key={t} value={t} disabled={gated}>
                {tierOptionLabel(t, locale)}
                {gated ? (isKo ? " · 베타 전용" : " · paid plan") : ""}
              </option>
            );
          })}
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

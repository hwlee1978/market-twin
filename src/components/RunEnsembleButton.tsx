"use client";

import { useState } from "react";
import { useLocale } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Sparkles, Loader2 } from "lucide-react";

type Tier = "hypothesis" | "decision" | "decision_plus" | "deep" | "deep_pro";

interface Props {
  projectId: string;
  className?: string;
}

/**
 * Compact "run another ensemble on this existing project" control. The
 * wizard creates fresh projects; this exists so the user can iterate on
 * the SAME fixture (different tier, comparison run) without re-entering
 * the form. Posts to the same /api/projects/:id/run-ensemble endpoint
 * the wizard uses, then routes to the live results page.
 */
export function RunEnsembleButton({ projectId, className }: Props) {
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
      if (!res.ok) throw new Error(await res.text());
      const { ensembleId } = await res.json();
      router.push(`/projects/${projectId}/results?ensemble=${ensembleId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
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
          <option value="hypothesis">
            {isKo
              ? "초기검증 · 200명 · 약 5분"
              : "Hypothesis · 200 personas · ~5 min"}
          </option>
          <option value="decision">
            {isKo
              ? "검증분석 · 1,000명 · 약 10분"
              : "Decision · 1,000 personas · ~10 min"}
          </option>
          <option value="decision_plus">
            {isKo
              ? "검증분석+ · 3,000명 · 약 10–15분"
              : "Decision+ · 3,000 personas · ~10–15 min"}
          </option>
          <option value="deep">
            {isKo
              ? "심층분석 · 5,000명 · 멀티 LLM · 약 10–15분"
              : "Deep · 5,000 personas · multi-LLM · ~10–15 min"}
          </option>
          {/* deep_pro hidden until we redesign for sub-800s execution —
              50 sims × multi-LLM exceeds Vercel's maxDuration today. */}
        </select>
        <input
          type="email"
          className="input w-full"
          placeholder={
            isKo
              ? "완료 알림 이메일 (선택, Decision/Deep 권장)"
              : "Notify email when done (optional, useful for Decision/Deep)"
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

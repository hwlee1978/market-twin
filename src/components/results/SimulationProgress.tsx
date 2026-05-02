"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { clsx } from "clsx";
import { AlertCircle, Check, Loader2, X } from "lucide-react";

const STAGES = ["validating", "regulatory", "personas", "scoring", "pricing", "recommend"] as const;
type Stage = (typeof STAGES)[number];

// Stage weights derived from observed durations on a 50-persona run.
// personas dominates because it spawns N parallel LLM batches; recommend is
// the densest single call (16k token output). Tuning rule: if a stage routinely
// finishes faster/slower than its share, adjust here — keep total = 100.
const STAGE_WEIGHTS: Record<Stage, number> = {
  validating: 2,
  regulatory: 8,
  personas: 50,
  scoring: 12,
  pricing: 10,
  recommend: 18,
};

/** Cumulative percent at the midpoint of the current stage — keeps the bar
 *  moving between transitions instead of jumping in big steps. */
function progressPercent(stage: Stage): number {
  const idx = STAGES.indexOf(stage);
  if (idx < 0) return 0;
  let sum = 0;
  for (let i = 0; i < idx; i++) sum += STAGE_WEIGHTS[STAGES[i]];
  sum += STAGE_WEIGHTS[stage] / 2;
  return Math.min(99, Math.round(sum));
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function SimulationProgress({
  stage,
  startedAt,
  pollError,
  simulationId,
}: {
  stage: string;
  startedAt?: string | null;
  /** When the status poll hits a transient error, surface a soft warning so
   *  users know nothing is broken even if the bar momentarily stalls. */
  pollError?: string | null;
  /** When provided, render a Cancel control. The cancel API marks the row
   *  as cancelled — the runner picks this up at the next stage boundary and
   *  aborts. Without an id (legacy callers) the control is hidden. */
  simulationId?: string | null;
}) {
  const t = useTranslations();
  const stageKey = (STAGES as readonly string[]).includes(stage) ? (stage as Stage) : "validating";
  const idx = STAGES.indexOf(stageKey);
  const pct = progressPercent(stageKey);

  // Tick once per second so elapsed-time display stays current. Skip when no
  // startedAt to avoid pointless re-renders.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt) return;
    const handle = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(handle);
  }, [startedAt]);

  const startedMs = startedAt ? new Date(startedAt).getTime() : null;
  const elapsedSec = startedMs ? Math.max(0, Math.floor((now - startedMs) / 1000)) : 0;

  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const onCancel = async () => {
    if (!simulationId || cancelling) return;
    if (!window.confirm(t("simulation.cancelConfirm"))) return;
    setCancelling(true);
    setCancelError(null);
    try {
      const res = await fetch(`/api/simulations/${simulationId}/cancel`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(await res.text());
      // Status poll in ResultsView ticks every 3s and will pick up the
      // cancelled state — at which point ResultsView swaps to CancelledState.
      // No local state change needed here; just leave the disabled button
      // visible until that swap happens.
    } catch (err) {
      // Log raw cause for debugging; show user a friendly i18n string.
      console.error("[cancel] failed", err);
      setCancelError(t("simulation.cancelFailed"));
      setCancelling(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-12">
      <div className="card text-center p-12">
        <div className="text-xs uppercase tracking-wide text-accent-600 mb-2">
          {t("simulation.running")}
        </div>
        <h2 className="text-2xl font-semibold mb-2 break-keep leading-snug">
          {t("simulation.feelPremium")}
        </h2>
        <p className="text-sm text-slate-500 mb-6 break-keep">{t("simulation.etaShort")}</p>

        <div className="max-w-md mx-auto mb-8">
          <div className="flex items-baseline justify-between mb-1.5">
            <span className="text-base font-semibold text-slate-800 tabular-nums">{pct}%</span>
            {startedMs && (
              <span className="text-xs text-slate-500 tabular-nums">
                {t("simulation.elapsed", { time: formatElapsed(elapsedSec) })}
              </span>
            )}
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full bg-brand transition-all duration-500 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        <ol className="space-y-3 text-left max-w-md mx-auto">
          {STAGES.map((s, i) => {
            const done = i < idx;
            const active = i === idx;
            return (
              <li key={s} className="flex items-center gap-3">
                <span
                  className={clsx(
                    "flex h-7 w-7 items-center justify-center rounded-full",
                    done
                      ? "bg-success text-white"
                      : active
                        ? "bg-brand text-white"
                        : "bg-slate-100 text-slate-400",
                  )}
                >
                  {done ? <Check size={14} /> : active ? <Loader2 size={14} className="animate-spin" /> : i + 1}
                </span>
                <span
                  className={clsx(
                    "text-sm",
                    active ? "text-slate-900 font-medium" : done ? "text-slate-700" : "text-slate-400",
                  )}
                >
                  {t(`simulation.stages.${s}`)}
                </span>
              </li>
            );
          })}
        </ol>

        {pollError && (
          <div className="mt-6 max-w-md mx-auto flex items-start gap-2 rounded-md border border-warn-soft bg-warn-soft/40 px-3 py-2 text-left text-xs text-warn">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <span className="leading-relaxed">{t("simulation.pollWarning")}</span>
          </div>
        )}

        {simulationId && (
          <div className="mt-8">
            <button
              onClick={onCancel}
              disabled={cancelling}
              className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-risk transition-colors disabled:opacity-60"
            >
              {cancelling ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <X size={12} />
              )}
              {t(cancelling ? "simulation.cancelling" : "simulation.cancel")}
            </button>
            {cancelError && (
              <p className="mt-2 text-[11px] text-risk">{cancelError}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

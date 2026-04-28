"use client";

import { useTranslations } from "next-intl";
import { clsx } from "clsx";
import { Check, Loader2 } from "lucide-react";

const STAGES = ["validating", "regulatory", "personas", "scoring", "pricing", "creative", "risk", "recommend"] as const;
type Stage = (typeof STAGES)[number];

export function SimulationProgress({ stage }: { stage: string }) {
  const t = useTranslations();
  const currentIdx = STAGES.indexOf(stage as Stage);
  const idx = currentIdx === -1 ? 0 : currentIdx;

  return (
    <div className="max-w-2xl mx-auto py-12">
      <div className="card text-center p-12">
        <div className="text-xs uppercase tracking-wide text-accent-600 mb-2">
          {t("simulation.running")}
        </div>
        <h2 className="text-2xl font-semibold mb-2">{t("simulation.feelPremium")}</h2>
        <p className="text-sm text-slate-500 mb-8">{t("simulation.etaShort")}</p>

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
      </div>
    </div>
  );
}

"use client";

import { useTranslations } from "next-intl";
import type { Recommendation } from "@/lib/simulation/schemas";

export function RecommendationsTab({ rec }: { rec: Recommendation }) {
  const t = useTranslations();
  return (
    <div className="space-y-6">
      <div className="card">
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
          {t("report.executiveSummary")}
        </h3>
        <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
          {rec.executiveSummary}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
            {t("results.actionPlan")}
          </h3>
          <ol className="space-y-2 text-sm text-slate-800 list-decimal list-inside">
            {rec.actionPlan.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </div>

        <div className="card">
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
            {t("results.recommendedChannels")}
          </h3>
          <ul className="flex flex-wrap gap-2">
            {rec.channels.map((c, i) => (
              <li
                key={i}
                className="rounded-full bg-accent-50 text-accent-700 text-xs px-3 py-1 font-medium"
              >
                {c}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

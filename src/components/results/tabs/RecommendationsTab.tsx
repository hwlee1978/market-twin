"use client";

import { useTranslations } from "next-intl";
import type { Recommendation } from "@/lib/simulation/schemas";

export function RecommendationsTab({ rec }: { rec: Recommendation }) {
  const t = useTranslations();
  return (
    <div className="space-y-6">
      <div className="card">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">
          {t("report.executiveSummary")}
        </h3>
        <p className="prose-body whitespace-pre-wrap">{rec.executiveSummary}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">
            {t("results.actionPlan")}
          </h3>
          <ol className="space-y-3.5">
            {rec.actionPlan.map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="inline-flex items-center justify-center shrink-0 w-6 h-6 rounded-full bg-brand-50 text-brand text-xs font-semibold tabular-nums mt-0.5">
                  {i + 1}
                </span>
                <span className="prose-body flex-1">{step}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="card">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">
            {t("results.recommendedChannels")}
          </h3>
          <ul className="flex flex-wrap gap-2">
            {rec.channels.map((c, i) => (
              <li
                key={i}
                className="rounded-full bg-accent-50 text-accent-700 text-xs px-3 py-1.5 font-medium"
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

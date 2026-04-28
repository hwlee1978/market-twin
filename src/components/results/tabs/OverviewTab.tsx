"use client";

import { useTranslations } from "next-intl";
import { Database } from "lucide-react";
import { KpiCard } from "@/components/ui/KpiCard";
import type { SimulationResult } from "@/lib/simulation/schemas";

interface OverviewTabProps {
  result: SimulationResult;
  locale: string;
  /** Sources attached on persist (optional — older sims may not have it). */
  sources?: string[];
}

export function OverviewTab({ result, locale, sources }: OverviewTabProps) {
  const t = useTranslations();
  const { overview } = result;

  const riskTone = overview.riskLevel === "low" ? "success" : overview.riskLevel === "medium" ? "warn" : "risk";

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard
          label={t("results.overview.successScore")}
          value={`${overview.successScore}%`}
          tone={overview.successScore >= 60 ? "success" : overview.successScore >= 35 ? "warn" : "risk"}
        />
        <KpiCard label={t("results.overview.bestCountry")} value={overview.bestCountry} />
        <KpiCard label={t("results.overview.bestSegment")} value={overview.bestSegment} />
        <KpiCard
          label={t("results.overview.bestPrice")}
          value={(overview.bestPriceCents / 100).toLocaleString(locale, {
            style: "currency",
            currency: "USD",
          })}
        />
        <KpiCard
          label={t("results.overview.riskLevel")}
          value={overview.riskLevel.toUpperCase()}
          tone={riskTone}
        />
        <KpiCard label={t("results.overview.bestCreative")} value={overview.bestCreative ?? "—"} />
      </div>

      <div className="card">
        <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">
          {t("report.executiveSummary")}
        </h3>
        <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
          {result.recommendations.executiveSummary || overview.headline}
        </p>
      </div>

      {sources && sources.length > 0 && (
        <div className="card bg-slate-50 border-slate-200">
          <div className="flex items-start gap-3">
            <Database size={16} className="text-slate-400 mt-0.5" />
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                {t("results.dataSources")}
              </div>
              <ul className="space-y-1 text-xs text-slate-600">
                {sources.map((s, i) => (
                  <li key={i}>• {s}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

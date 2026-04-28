"use client";

import { useTranslations } from "next-intl";
import { AlertTriangle, Database, ShieldAlert } from "lucide-react";
import { clsx } from "clsx";
import { KpiCard } from "@/components/ui/KpiCard";
import type { SimulationResult } from "@/lib/simulation/schemas";

export interface RegulatoryWarning {
  country: string;
  status: "banned" | "restricted" | "allowed";
  reason?: string;
  source?: string;
}

export interface RegulatoryMeta {
  regulatedCategory?: string;
  excludedCountries: string[];
  restrictedCountries: string[];
  warnings: RegulatoryWarning[];
}

interface OverviewTabProps {
  result: SimulationResult;
  locale: string;
  /** Sources attached on persist (optional — older sims may not have it). */
  sources?: string[];
  /** Regulatory pre-check meta (optional — older sims won't have it). */
  regulatory?: RegulatoryMeta;
}

export function OverviewTab({ result, locale, sources, regulatory }: OverviewTabProps) {
  const t = useTranslations();
  const { overview } = result;

  const riskTone = overview.riskLevel === "low" ? "success" : overview.riskLevel === "medium" ? "warn" : "risk";

  const banned = regulatory?.warnings.filter((w) => w.status === "banned") ?? [];
  const restricted = regulatory?.warnings.filter((w) => w.status === "restricted") ?? [];
  const showRegulatory = !!regulatory && (banned.length > 0 || restricted.length > 0 || regulatory.regulatedCategory);

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

      {showRegulatory && (
        <div
          className={clsx(
            "card border-l-4",
            banned.length > 0
              ? "border-l-risk bg-risk-soft/30"
              : restricted.length > 0
                ? "border-l-warn bg-warn-soft/30"
                : "border-l-slate-300",
          )}
        >
          <div className="flex items-start gap-3">
            {banned.length > 0 ? (
              <ShieldAlert size={20} className="text-risk shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle size={20} className="text-warn shrink-0 mt-0.5" />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-semibold text-slate-900">
                  {t("results.regulatory.title")}
                </h3>
                {regulatory!.regulatedCategory && (
                  <span className="badge bg-slate-100 text-slate-700">
                    {t("results.regulatory.category")}: {regulatory!.regulatedCategory}
                  </span>
                )}
              </div>

              {banned.length > 0 && (
                <div className="mt-3">
                  <div className="text-xs font-semibold text-risk uppercase tracking-wide mb-1.5">
                    {t("results.regulatory.excluded")} ({banned.length})
                  </div>
                  <p className="text-xs text-slate-500 mb-2">
                    {t("results.regulatory.excludedDesc")}
                  </p>
                  <ul className="space-y-1.5 text-sm">
                    {banned.map((w) => (
                      <li key={w.country} className="flex items-start gap-2">
                        <span className="badge bg-risk-soft text-risk shrink-0">{w.country}</span>
                        <span className="text-slate-700">
                          {w.reason}
                          {w.source && (
                            <span className="text-slate-400 text-xs ml-1">({w.source})</span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {restricted.length > 0 && (
                <div className="mt-3">
                  <div className="text-xs font-semibold text-warn uppercase tracking-wide mb-1.5">
                    {t("results.regulatory.restricted")} ({restricted.length})
                  </div>
                  <p className="text-xs text-slate-500 mb-2">
                    {t("results.regulatory.restrictedDesc")}
                  </p>
                  <ul className="space-y-1.5 text-sm">
                    {restricted.map((w) => (
                      <li key={w.country} className="flex items-start gap-2">
                        <span className="badge bg-warn-soft text-warn shrink-0">{w.country}</span>
                        <span className="text-slate-700">
                          {w.reason}
                          {w.source && (
                            <span className="text-slate-400 text-xs ml-1">({w.source})</span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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

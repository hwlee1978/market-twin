"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { clsx } from "clsx";
import { Download } from "lucide-react";
import type { SimulationResult } from "@/lib/simulation/schemas";
import { OverviewTab } from "./tabs/OverviewTab";
import { CountriesTab } from "./tabs/CountriesTab";
import { PersonasTab } from "./tabs/PersonasTab";
import { PricingTab } from "./tabs/PricingTab";
import { RisksTab } from "./tabs/RisksTab";
import { RecommendationsTab } from "./tabs/RecommendationsTab";

const TABS = ["overview", "countries", "personas", "pricing", "risks", "recommendations"] as const;
type Tab = (typeof TABS)[number];

export function ResultsDashboard({
  projectId,
  simulationId,
  result,
  sources,
  regulatory,
  locale,
  pollError,
}: {
  projectId: string;
  simulationId: string;
  result: SimulationResult;
  sources: string[];
  regulatory?: import("./tabs/OverviewTab").RegulatoryMeta;
  locale: string;
  pollError: string | null;
}) {
  const t = useTranslations();
  const [tab, setTab] = useState<Tab>("overview");

  const exportPdf = () => {
    window.open(`/api/reports/${simulationId}/pdf?locale=${locale}`, "_blank");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t("dashboard.title")}</h1>
          <p className="text-slate-500 text-sm mt-1">{result.overview.headline}</p>
        </div>
        <button onClick={exportPdf} className="btn-primary">
          <Download size={16} />
          {t("results.exportPdf")}
        </button>
      </div>

      <div className="border-b border-slate-200">
        <nav className="-mb-px flex gap-6 text-sm">
          {TABS.map((key) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={clsx(
                "py-3 border-b-2 transition-colors",
                tab === key
                  ? "border-brand text-brand font-medium"
                  : "border-transparent text-slate-500 hover:text-slate-700",
              )}
            >
              {t(`results.tabs.${key}`)}
            </button>
          ))}
        </nav>
      </div>

      {pollError && <div className="text-xs text-risk">{pollError}</div>}

      <div>
        {tab === "overview" && (
          <OverviewTab result={result} locale={locale} sources={sources} regulatory={regulatory} />
        )}
        {tab === "countries" && (
          <CountriesTab
            countries={result.countries}
            personas={result.personas}
            regulatory={regulatory}
            sources={sources}
          />
        )}
        {tab === "personas" && <PersonasTab personas={result.personas} sources={sources} />}
        {tab === "pricing" && (
          <PricingTab pricing={result.pricing} currency="USD" personas={result.personas} />
        )}
        {tab === "risks" && (
          <RisksTab
            risks={result.risks}
            personas={result.personas}
            countries={result.countries}
            sources={sources}
          />
        )}
        {tab === "recommendations" && <RecommendationsTab rec={result.recommendations} />}
      </div>
    </div>
  );
}

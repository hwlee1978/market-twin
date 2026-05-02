"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { clsx } from "clsx";
import { Download, Loader2 } from "lucide-react";
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
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  // Fetch the PDF as a blob so we can show an inline error if generation
  // fails. The previous `window.open(...)` opened a tab to the API URL,
  // which would land users on a raw JSON error page when the report wasn't
  // ready yet (409) or had been deleted (404). Doing the fetch ourselves
  // lets us surface a friendly, retryable message in-place.
  const exportPdf = async () => {
    if (pdfBusy) return;
    setPdfBusy(true);
    setPdfError(null);
    try {
      const res = await fetch(`/api/reports/${simulationId}/pdf?locale=${locale}`);
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const filename =
        res.headers
          .get("content-disposition")
          ?.match(/filename="?([^"]+)"?/)?.[1] ?? `market-twin-${simulationId}.pdf`;
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[pdf export] failed", err);
      setPdfError(t("results.pdfFailed"));
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">{t("dashboard.title")}</h1>
          <p className="text-slate-500 text-sm mt-1">{result.overview.headline}</p>
        </div>
        <div className="flex flex-col items-end gap-1 self-start sm:self-auto shrink-0">
          <button
            onClick={exportPdf}
            disabled={pdfBusy}
            className="btn-primary disabled:opacity-60"
          >
            {pdfBusy ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            {t(pdfBusy ? "results.exportingPdf" : "results.exportPdf")}
          </button>
          {pdfError && <p className="text-xs text-risk">{pdfError}</p>}
        </div>
      </div>

      {/* Tab strip: horizontal-scroll on mobile so 6 tabs fit even when the
          viewport doesn't have room for all of them inline. */}
      <div className="border-b border-slate-200 overflow-x-auto">
        <nav className="-mb-px flex gap-6 text-sm whitespace-nowrap">
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

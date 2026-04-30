"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { SimulationResult } from "@/lib/simulation/schemas";
import { SimulationProgress } from "./SimulationProgress";
import { ResultsDashboard } from "./ResultsDashboard";
import { capture } from "@/lib/analytics/posthog";

interface SimStatus {
  id: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  current_stage: string | null;
  error_message: string | null;
}

export function ResultsView({
  projectId,
  simulationId,
  locale,
}: {
  projectId: string;
  simulationId: string | null;
  locale: string;
}) {
  const t = useTranslations();
  const [status, setStatus] = useState<SimStatus | null>(null);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [sources, setSources] = useState<string[]>([]);
  const [regulatory, setRegulatory] = useState<import("./tabs/OverviewTab").RegulatoryMeta | undefined>(undefined);
  const [pollError, setPollError] = useState<string | null>(null);
  // Guard so simulation_completed/failed only fires once per mount, even
  // though the status poll keeps ticking.
  const completionFiredRef = useRef(false);

  useEffect(() => {
    if (!simulationId) return;
    let active = true;

    const tick = async () => {
      try {
        const res = await fetch(`/api/simulations/${simulationId}/status`);
        if (!res.ok) throw new Error(await res.text());
        const data = (await res.json()) as SimStatus;
        if (!active) return;
        setStatus(data);
        if (data.status === "completed" && !completionFiredRef.current) {
          completionFiredRef.current = true;
          capture("simulation_completed", {
            simulation_id: simulationId,
            project_id: projectId,
          });
        } else if (data.status === "failed" && !completionFiredRef.current) {
          completionFiredRef.current = true;
          capture("simulation_failed", {
            simulation_id: simulationId,
            project_id: projectId,
            error: data.error_message ?? null,
          });
        }
        if (data.status === "completed") {
          const r = await fetch(`/api/results/${simulationId}`);
          if (r.ok) {
            const json = await r.json();
            if (active && json.result) {
              const overviewRaw = json.result.overview ?? {};
              // _sources and _regulatory are attached on persist by the runner;
              // strip them before handing to the schema-typed view.
              const { _sources, _regulatory, ...overviewClean } =
                overviewRaw as Record<string, unknown>;
              setResult({
                overview: overviewClean as SimulationResult["overview"],
                countries: json.result.countries,
                personas: json.result.personas,
                pricing: json.result.pricing,
                creative: json.result.creative ?? [],
                risks: json.result.risks ?? [],
                recommendations: json.result.recommendations,
              });
              setSources(Array.isArray(_sources) ? (_sources as string[]) : []);
              setRegulatory(
                _regulatory && typeof _regulatory === "object"
                  ? (_regulatory as import("./tabs/OverviewTab").RegulatoryMeta)
                  : undefined,
              );
            }
          }
        }
      } catch (err) {
        if (active) setPollError(err instanceof Error ? err.message : String(err));
      }
    };

    tick();
    const handle = setInterval(() => {
      if (status?.status === "completed" || status?.status === "failed") return;
      tick();
    }, 3000);
    return () => {
      active = false;
      clearInterval(handle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simulationId, status?.status]);

  const isRunning = useMemo(
    () => status && (status.status === "pending" || status.status === "running"),
    [status],
  );

  if (!simulationId) {
    return <div className="text-sm text-slate-500">{t("common.error")}</div>;
  }

  if (status?.status === "failed") {
    return (
      <div className="card border-risk-soft bg-risk-soft text-risk">
        <div className="font-medium">Simulation failed</div>
        <p className="text-sm mt-1">{status.error_message ?? "Unknown error"}</p>
      </div>
    );
  }

  if (isRunning || !result) {
    return <SimulationProgress stage={status?.current_stage ?? "validating"} />;
  }

  return (
    <ResultsDashboard
      projectId={projectId}
      simulationId={simulationId}
      result={result}
      sources={sources}
      regulatory={regulatory}
      locale={locale}
      pollError={pollError}
    />
  );
}

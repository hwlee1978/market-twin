"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AlertOctagon, ArrowLeft, ChevronDown, Ban } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { clsx } from "clsx";
import type { SimulationResult } from "@/lib/simulation/schemas";
import { SimulationProgress } from "./SimulationProgress";
import { ResultsDashboard } from "./ResultsDashboard";
import { capture } from "@/lib/analytics/posthog";

interface SimStatus {
  id: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  current_stage: string | null;
  error_message: string | null;
  started_at: string | null;
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
      // Stop polling on any terminal state — completed / failed / cancelled.
      // (Without "cancelled" the loop would keep firing 3s requests forever
      //  for an admin-cancelled sim that the user is still viewing.)
      if (
        status?.status === "completed" ||
        status?.status === "failed" ||
        status?.status === "cancelled"
      ) {
        return;
      }
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
      <FailedState
        projectId={projectId}
        stage={status.current_stage}
        errorMessage={status.error_message}
      />
    );
  }

  if (status?.status === "cancelled") {
    return <CancelledState projectId={projectId} />;
  }

  if (isRunning || !result) {
    return (
      <SimulationProgress
        stage={status?.current_stage ?? "validating"}
        startedAt={status?.started_at ?? null}
        pollError={pollError}
        simulationId={simulationId}
      />
    );
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

function FailedState({
  projectId,
  stage,
  errorMessage,
}: {
  projectId: string;
  stage: string | null;
  errorMessage: string | null;
}) {
  const t = useTranslations("simulation.failed");
  const [showDetail, setShowDetail] = useState(false);

  return (
    <div className="max-w-2xl mx-auto py-12">
      <div className="card text-center p-12">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-risk-soft mb-4">
          <AlertOctagon size={24} className="text-risk" />
        </div>
        <h2 className="text-xl font-semibold mb-2 text-slate-900">{t("title")}</h2>
        <p className="text-sm text-slate-500 break-keep mb-6">{t("subtitle")}</p>

        {stage && (
          <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-700 mb-6">
            <span className="text-slate-500">{t("stageLabel")}:</span>
            <span className="font-medium">{stage}</span>
          </div>
        )}

        <div className="flex justify-center mb-6">
          <Link href={`/projects/${projectId}`} className="btn-primary">
            <ArrowLeft size={16} />
            {t("backToProject")}
          </Link>
        </div>

        {errorMessage && (
          <div className="text-left max-w-md mx-auto">
            <button
              type="button"
              onClick={() => setShowDetail((v) => !v)}
              className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
            >
              <ChevronDown
                size={12}
                className={clsx("transition-transform", showDetail && "rotate-180")}
              />
              {t("detailToggle")}
            </button>
            {showDetail && (
              <pre className="mt-2 p-3 rounded-md bg-slate-50 border border-slate-200 text-[11px] text-slate-600 whitespace-pre-wrap break-words font-mono">
                {errorMessage}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function CancelledState({ projectId }: { projectId: string }) {
  const t = useTranslations("simulation.cancelled");
  return (
    <div className="max-w-2xl mx-auto py-12">
      <div className="card text-center p-12">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-100 mb-4">
          <Ban size={24} className="text-slate-500" />
        </div>
        <h2 className="text-xl font-semibold mb-2 text-slate-900">{t("title")}</h2>
        <p className="text-sm text-slate-500 break-keep mb-6">{t("subtitle")}</p>
        <div className="flex justify-center">
          <Link href={`/projects/${projectId}`} className="btn-primary">
            <ArrowLeft size={16} />
            {t("backToProject")}
          </Link>
        </div>
      </div>
    </div>
  );
}

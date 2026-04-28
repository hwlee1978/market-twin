"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Play } from "lucide-react";

interface Props {
  projectId: string;
  /** Persona count to use. Keep low for fast retest. */
  defaultPersonaCount?: number;
  className?: string;
}

export function RunSimulationButton({
  projectId,
  defaultPersonaCount = 50,
  className,
}: Props) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [count, setCount] = useState(defaultPersonaCount);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch(`/api/simulations/${projectId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personaCount: count, locale }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { simulationId } = await res.json();
      router.push(`/projects/${projectId}/results?sim=${simulationId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setRunning(false);
    }
  };

  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        <select
          className="input w-32"
          value={count}
          disabled={running}
          onChange={(e) => setCount(Number(e.target.value))}
        >
          <option value={50}>50 (fast)</option>
          <option value={200}>200</option>
          <option value={500}>500</option>
          <option value={1000}>1,000</option>
        </select>
        <button onClick={run} disabled={running} className="btn-primary">
          <Play size={14} />
          {running ? t("common.loading") : t("project.wizard.runCta")}
        </button>
      </div>
      {error && <div className="mt-2 text-xs text-risk">{error}</div>}
    </div>
  );
}

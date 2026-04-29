"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Loader2, Play } from "lucide-react";
import { clsx } from "clsx";

/**
 * One-click "Try a sample" button. Hits POST /api/projects/demo, then
 * navigates straight to the in-progress results page so the user sees
 * the simulation finish live. The pipeline picks up where the wizard
 * normally would.
 */
export function DemoLaunchButton({
  variant = "primary",
}: {
  variant?: "primary" | "ghost";
}) {
  const t = useTranslations("onboarding");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const launch = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/projects/demo", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? res.statusText);
      }
      const { projectId, simulationId } = (await res.json()) as {
        projectId: string;
        simulationId: string;
      };
      router.push(`/projects/${projectId}/results?sim=${simulationId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <button
        onClick={launch}
        disabled={busy}
        className={clsx(
          variant === "primary" ? "btn-primary" : "btn-ghost",
          "disabled:opacity-50",
        )}
      >
        {busy ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            {t("launching")}
          </>
        ) : (
          <>
            <Play size={16} />
            {t("startDemo")}
          </>
        )}
      </button>
      {error && <p className="text-xs text-risk">{error}</p>}
    </div>
  );
}

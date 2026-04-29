"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { AlertTriangle } from "lucide-react";

/**
 * Error boundary for any (app) route. Next.js App Router automatically
 * mounts this when a child page or layout throws during render —
 * either server-side or client-side. Without this file, the user
 * would see Next.js's generic 'Application error' screen.
 */
export default function AppErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errors.app");

  useEffect(() => {
    // Log to console for now. Future: pipe to Sentry / equivalent.
    console.error("[app-error-boundary]", error);
  }, [error]);

  return (
    <div className="card text-center py-16">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-risk-soft text-risk mb-5">
        <AlertTriangle size={22} />
      </div>
      <h2 className="text-xl font-semibold tracking-tight text-slate-900">
        {t("title")}
      </h2>
      <p className="mt-3 text-sm text-slate-600 max-w-md mx-auto leading-relaxed">
        {t("description")}
      </p>
      {error.digest && (
        <p className="mt-3 text-[11px] text-slate-400 font-mono">
          {t("errorCode")}: {error.digest}
        </p>
      )}
      <div className="mt-7 flex flex-col sm:flex-row items-center justify-center gap-2">
        <button onClick={reset} className="btn-primary">
          {t("retry")}
        </button>
        <Link href="/dashboard" className="btn-ghost">
          {t("backToDashboard")}
        </Link>
      </div>
    </div>
  );
}

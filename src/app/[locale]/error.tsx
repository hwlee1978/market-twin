"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { AlertTriangle } from "lucide-react";

/**
 * Error boundary for any [locale] route that isn't inside (app) —
 * marketing landing, /privacy, /terms, /login, /signup. Catches
 * unexpected render errors and falls back to a friendly message.
 */
export default function LocaleErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errors.app");

  useEffect(() => {
    console.error("[locale-error-boundary]", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-6">
      <div className="card max-w-md w-full text-center py-12">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-risk-soft text-risk mb-5">
          <AlertTriangle size={22} />
        </div>
        <h2 className="text-xl font-semibold tracking-tight text-slate-900">
          {t("title")}
        </h2>
        <p className="mt-3 text-sm text-slate-600 leading-relaxed">
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
          <Link href="/" className="btn-ghost">
            {t("backToHome")}
          </Link>
        </div>
      </div>
    </div>
  );
}

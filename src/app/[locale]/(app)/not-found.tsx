"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Compass } from "lucide-react";

/**
 * Locale-aware 404 for in-app routes (anything inside (app)). Triggered
 * when a project / ensemble / share token URL points at a row the
 * caller can't see — RLS-filtered, deleted, or simply mistyped. Same
 * brand-styled empty-state pattern as the error boundary so a
 * not-found and a runtime error read consistently to the user.
 */
export default function AppNotFound() {
  const t = useTranslations("errors.notFound");

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6 py-12">
      <div className="card max-w-md w-full text-center py-12 px-6">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-brand-50 text-brand mb-5">
          <Compass size={22} />
        </div>
        <div className="text-[10px] uppercase tracking-wider text-brand font-semibold mb-2">
          404
        </div>
        <h2 className="text-xl font-semibold tracking-tight text-slate-900">
          {t("title")}
        </h2>
        <p className="mt-3 text-sm text-slate-600 leading-relaxed">
          {t("description")}
        </p>
        <div className="mt-7 flex flex-col sm:flex-row items-center justify-center gap-2">
          <Link href="/projects" className="btn-primary">
            {t("backToProjects")}
          </Link>
          <Link href="/" className="btn-ghost">
            {t("backToHome")}
          </Link>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useTranslations } from "next-intl";
import { Activity, BarChart3, Globe2, ShieldCheck, Sparkles } from "lucide-react";

/**
 * Shared chrome for the login/signup pages. The left panel showcases what
 * the product does in 4 short bullets — first impression for B2B trial
 * conversion, replacing the previous bare title-and-tagline-only design.
 *
 * The form half is rendered as children so each page owns just its
 * form logic without re-implementing the brand surround.
 */
export function AuthLayout({
  formTitle,
  formSubtitle,
  children,
}: {
  formTitle: string;
  formSubtitle?: string;
  children: React.ReactNode;
}) {
  const t = useTranslations();
  const features = [
    { icon: BarChart3, key: "successScore" as const },
    { icon: Globe2, key: "countries" as const },
    { icon: Sparkles, key: "personas" as const },
    { icon: ShieldCheck, key: "regulatory" as const },
  ];

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-[1.05fr_1fr]">
      <aside className="hidden lg:flex flex-col justify-between bg-brand text-white p-12 relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 -left-24 w-[480px] h-[480px] rounded-full bg-accent/10 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-40 -right-32 w-[520px] h-[520px] rounded-full bg-brand-300/15 blur-3xl"
        />

        <div className="relative flex items-center gap-2.5">
          <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-accent/20 text-accent">
            <Activity size={18} />
          </span>
          <div className="leading-tight">
            <div className="text-base font-semibold tracking-tight">
              {t("common.appName")}
            </div>
            <div className="text-[10px] uppercase tracking-wider text-brand-200">
              Launch Twin
            </div>
          </div>
        </div>

        <div className="relative space-y-8 max-w-md">
          <div>
            <h1 className="text-[2.4rem] font-semibold leading-[1.2] tracking-tight">
              {t("common.tagline")}
            </h1>
            <p className="mt-4 text-sm text-brand-100 leading-relaxed">
              {t("auth.trustline")}
            </p>
          </div>

          <ul className="space-y-3.5">
            {features.map((f) => (
              <li key={f.key} className="flex items-start gap-3">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-white/8 text-accent shrink-0">
                  <f.icon size={15} />
                </span>
                <div>
                  <div className="text-sm font-medium text-white">
                    {t(`auth.features.${f.key}.title`)}
                  </div>
                  <div className="mt-0.5 text-xs text-brand-100 leading-relaxed">
                    {t(`auth.features.${f.key}.description`)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative text-[11px] text-brand-200">
          © {new Date().getFullYear()} AI Market Twin
        </div>
      </aside>

      <main className="flex items-center justify-center px-6 py-12 lg:px-12">
        <div className="w-full max-w-sm">
          {/* Mobile-only brand mark since the side panel is hidden below lg */}
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-brand text-accent">
              <Activity size={14} />
            </span>
            <span className="text-sm font-semibold tracking-tight text-slate-900">
              {t("common.appName")}
            </span>
          </div>

          <div className="mb-7">
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
              {formTitle}
            </h2>
            {formSubtitle && (
              <p className="mt-1.5 text-sm text-slate-500 leading-relaxed">
                {formSubtitle}
              </p>
            )}
          </div>

          {children}
        </div>
      </main>
    </div>
  );
}

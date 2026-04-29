"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { BarChart3, Globe2, ShieldCheck, Sparkles, Hourglass } from "lucide-react";
import { LogoMark } from "@/components/ui/Logo";

const FEATURES = [
  { icon: BarChart3, key: "successScore" as const },
  { icon: Globe2, key: "countries" as const },
  { icon: Sparkles, key: "personas" as const },
  { icon: ShieldCheck, key: "regulatory" as const },
];

/**
 * Coming-soon placeholder shown by signup/page.tsx whenever
 * NEXT_PUBLIC_SIGNUP_ENABLED is anything other than "true". The brand
 * panel mirrors SignupForm exactly so the visual experience is the
 * same, only the form area is replaced by an early-access mailto.
 */
export function SignupComingSoon() {
  const t = useTranslations();

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between bg-brand text-white p-12">
        <Link href="/" className="inline-flex items-center gap-2.5">
          <LogoMark size={22} />
          <span className="text-xl font-semibold tracking-tight">Market Twin</span>
        </Link>
        <div className="space-y-8 max-w-md">
          <div>
            <h1 className="text-[2rem] font-bold leading-[1.2] tracking-tight whitespace-nowrap">
              {t("common.tagline")}
            </h1>
            <p className="mt-5 text-brand-100 leading-relaxed break-keep">
              {t("auth.trustline")}
            </p>
          </div>
          <ul className="space-y-3.5">
            {FEATURES.map((f) => (
              <li key={f.key} className="flex items-start gap-3">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-white/10 text-accent shrink-0">
                  <f.icon size={15} />
                </span>
                <div className="min-w-0">
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
        <div className="text-xs text-brand-100">© Market Twin</div>
      </div>

      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-sm text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-brand-50 text-brand mb-6">
            <Hourglass size={22} />
          </div>

          <span className="inline-flex items-center justify-center rounded-full bg-warn-soft text-warn text-xs font-semibold px-3 py-1 mb-4 tracking-wider">
            {t("auth.comingSoon.badge")}
          </span>

          <h2 className="text-2xl font-semibold tracking-tight text-slate-900 break-keep">
            {t("auth.comingSoon.title")}
          </h2>

          <p className="mt-4 text-sm text-slate-600 leading-relaxed break-keep">
            {t("auth.comingSoon.description")}
          </p>

          <div className="mt-8 space-y-3">
            <a
              href={`mailto:${t("auth.comingSoon.contactEmail")}?subject=${encodeURIComponent(t("auth.comingSoon.contactSubject"))}`}
              className="btn-primary w-full"
            >
              {t("auth.comingSoon.requestAccess")}
            </a>
          </div>

          <p className="mt-8 text-sm text-slate-600 text-center">
            {t("auth.haveAccount")}{" "}
            <Link href="/login" className="text-brand font-medium hover:underline">
              {t("common.login")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

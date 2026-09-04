"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { BarChart3, Globe2, ShieldCheck, Sparkles, Hourglass } from "lucide-react";
import { LogoMark } from "@/components/ui/Logo";

const FEATURES = [
  { icon: BarChart3, key: "successScore" as const, from: "#4f46e5", to: "#6d5cf0" },
  { icon: Globe2, key: "countries" as const, from: "#0891b2", to: "#06b6d4" },
  { icon: Sparkles, key: "personas" as const, from: "#0d9c72", to: "#10b981" },
  { icon: ShieldCheck, key: "regulatory" as const, from: "#d97706", to: "#f59e0b" },
];

/**
 * Coming-soon placeholder shown by signup/page.tsx whenever
 * NEXT_PUBLIC_SIGNUP_ENABLED is anything other than "true". The brand
 * panel mirrors SignupForm exactly so the visual experience is the
 * same, only the form area is replaced by an early-access mailto.
 *
 * gatedReason="oauth" branch fires when the auth/oauth-callback route
 * bounced a Google sign-in because signups are closed. Without this
 * branch the user saw the generic "준비중" screen and assumed they'd
 * landed on the wrong page — not that their Google login attempt was
 * specifically rejected.
 */
export function SignupComingSoon({
  gatedReason,
}: {
  gatedReason?: string;
}) {
  const t = useTranslations();
  const isOauthGated = gatedReason === "oauth";

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2">
      <div
        className="hidden lg:flex flex-col justify-between text-white p-12 relative overflow-hidden"
        style={{ background: "linear-gradient(185deg,#0b2a5b 0%,#0a2352 55%,#0d1f47 100%)" }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(70% 90% at 100% 0%, rgba(6,182,212,.22), transparent 55%), radial-gradient(60% 80% at 0% 100%, rgba(124,58,237,.18), transparent 55%)",
          }}
        />
        <Link href="/" className="relative z-10 inline-flex items-center gap-3">
          <span
            className="inline-flex items-center justify-center w-10 h-10 rounded-[11px] text-white"
            style={{
              background: "linear-gradient(150deg,#06b6d4,#3b82f6)",
              boxShadow: "0 6px 18px -6px rgba(6,182,212,.8)",
            }}
          >
            <LogoMark size={20} />
          </span>
          <span className="text-xl font-bold tracking-tight">Market Twin</span>
        </Link>
        <div className="relative z-10 space-y-8 max-w-xl">
          <div>
            <h1 className="text-[2rem] font-bold leading-[1.2] tracking-tight break-keep whitespace-pre-line">
              {t("common.tagline")}
            </h1>
            <p className="mt-5 text-brand-100 leading-relaxed break-keep">
              {t("auth.trustline")}
            </p>
          </div>
          <ul className="space-y-3.5">
            {FEATURES.map((f) => (
              <li key={f.key} className="flex items-start gap-3">
                <span
                  className="inline-flex items-center justify-center w-9 h-9 rounded-[10px] text-white shrink-0"
                  style={{ background: `linear-gradient(140deg,${f.from},${f.to})` }}
                >
                  <f.icon size={16} />
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-white">
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
        <div className="relative z-10 text-xs text-brand-200">© Market Twin · by Mr.AI</div>
      </div>

      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-sm text-center">
          <div
            className={`inline-flex items-center justify-center w-14 h-14 rounded-full mb-6 ${
              isOauthGated
                ? "bg-warn-soft text-warn"
                : "bg-brand-50 text-brand"
            }`}
          >
            <Hourglass size={22} />
          </div>

          <span
            className={`inline-flex items-center justify-center rounded-full text-xs font-semibold px-3 py-1 mb-4 tracking-wider ${
              isOauthGated
                ? "bg-risk-soft text-risk"
                : "bg-warn-soft text-warn"
            }`}
          >
            {isOauthGated
              ? t("auth.comingSoon.gatedBadge")
              : t("auth.comingSoon.badge")}
          </span>

          <h2 className="text-2xl font-semibold tracking-tight text-slate-900 break-keep">
            {isOauthGated
              ? t("auth.comingSoon.gatedTitle")
              : t("auth.comingSoon.title")}
          </h2>

          <p className="mt-4 text-sm text-slate-600 leading-relaxed break-keep">
            {isOauthGated
              ? t("auth.comingSoon.gatedDescription")
              : t("auth.comingSoon.description")}
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

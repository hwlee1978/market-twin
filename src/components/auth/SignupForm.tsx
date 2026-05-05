"use client";

import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { BarChart3, Globe2, ShieldCheck, Sparkles } from "lucide-react";
import { LogoMark } from "@/components/ui/Logo";
import { authErrorKey } from "@/lib/auth/error-messages";
import { createClient } from "@/lib/supabase/client";
import { capture } from "@/lib/analytics/posthog";
import { getPlan, type PlanSlug } from "@/lib/billing/plans";

const FEATURES = [
  { icon: BarChart3, key: "successScore" as const },
  { icon: Globe2, key: "countries" as const },
  { icon: Sparkles, key: "personas" as const },
  { icon: ShieldCheck, key: "regulatory" as const },
];

/**
 * Active signup form with email/password + locale-aware copy. Rendered
 * by signup/page.tsx only when NEXT_PUBLIC_SIGNUP_ENABLED is "true";
 * otherwise SignupComingSoon takes over. Keeping both versions in the
 * tree means we can toggle between them via env without git history
 * archaeology, and either component can be edited freely without
 * breaking the other.
 */
export function SignupForm() {
  const t = useTranslations();
  const router = useRouter();
  const search = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreeMarketing, setAgreeMarketing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Read the plan / billing-cycle the user picked on /plans. Falls back
  // to free_trial when the user reached /signup directly without going
  // through the tier selector.
  const rawPlan = search.get("plan") ?? "free_trial";
  const planSlug: PlanSlug = (
    rawPlan === "free_trial" ||
    rawPlan === "starter" ||
    rawPlan === "growth" ||
    rawPlan === "enterprise"
      ? rawPlan
      : "free_trial"
  ) as PlanSlug;
  const cycle = (search.get("cycle") ?? "monthly") as "monthly" | "annual";
  const plan = getPlan(planSlug);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);
    const supabase = createClient();
    // Stamp consent into the user's auth metadata so we have an audit
    // trail of when ToS / Privacy were accepted and which version.
    // (Term version is hard-coded for now; bump when the legal docs
    // change to invalidate prior consents.)
    const consent = {
      tos_version: "2026-04-30",
      tos_accepted_at: new Date().toISOString(),
      marketing_email: agreeMarketing,
    };
    // Persist the chosen plan in the user's auth metadata so the
    // post-confirmation handler (or the workspace bootstrap) can apply
    // it once the user has a workspace. Free_trial is the default state
    // already created by getOrCreatePrimaryWorkspace; paid plans need a
    // checkout step that we'll wire up after Stripe / Toss integration.
    const intendedPlan = {
      slug: planSlug,
      cycle,
      chosen_at: new Date().toISOString(),
    };
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?plan=${planSlug}&cycle=${cycle}`,
        data: { consent, intended_plan: intendedPlan },
      },
    });
    if (error) {
      setLoading(false);
      setError(t(authErrorKey(error.message) as "errors.auth.generic"));
      return;
    }
    capture("signup_completed", {
      via: "password",
      auto_session: !!data.session,
      marketing_consent: agreeMarketing,
      intended_plan: planSlug,
      billing_cycle: cycle,
    });
    if (data.session) {
      // Auto-logged in — keep loading=true through navigation so the
      // submit button stays disabled until the dashboard mounts.
      router.replace("/dashboard");
      router.refresh();
    } else {
      setLoading(false);
      setInfo(t("auth.checkEmail"));
    }
  };

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
        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-semibold mb-2">{t("auth.signupTitle")}</h2>

          {/* Selected-plan banner — shows the user what they picked on
              /plans, with a "Change" link back. Helps avoid the
              "wait, am I signing up for the right tier?" doubt. */}
          <div className="mb-5 flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/60 px-3.5 py-2.5">
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-wider text-brand">
                {t("auth.selectedPlan")}
              </div>
              <div className="text-sm font-semibold text-slate-900 truncate">
                {plan.name}
                {planSlug !== "free_trial" && planSlug !== "enterprise" && (
                  <span className="ml-1.5 text-xs font-normal text-slate-500">
                    · {cycle === "annual" ? t("auth.cycleAnnual") : t("auth.cycleMonthly")}
                  </span>
                )}
              </div>
            </div>
            <Link
              href="/plans"
              className="text-xs text-brand font-medium hover:underline shrink-0"
            >
              {t("auth.changePlan")}
            </Link>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label htmlFor="signup-email" className="label">{t("auth.email")}</label>
              <input
                id="signup-email"
                type="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label htmlFor="signup-password" className="label">{t("auth.password")}</label>
              <input
                id="signup-password"
                type="password"
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
              <p className="mt-1 text-xs text-slate-500">{t("auth.passwordHint")}</p>
            </div>
            <div className="space-y-2.5 pt-1">
              <label className="flex items-start gap-2.5 text-xs text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5 w-4 h-4 rounded border-slate-300 text-brand focus:ring-brand shrink-0"
                  checked={agreeTerms}
                  onChange={(e) => setAgreeTerms(e.target.checked)}
                  required
                />
                <span className="leading-relaxed">
                  <span className="text-risk font-semibold">[{t("auth.consent.required")}]</span>{" "}
                  {t.rich("auth.consent.agreeRich", {
                    terms: (chunks) => (
                      <Link
                        href="/terms"
                        target="_blank"
                        className="text-brand hover:underline font-medium"
                      >
                        {chunks}
                      </Link>
                    ),
                    privacy: (chunks) => (
                      <Link
                        href="/privacy"
                        target="_blank"
                        className="text-brand hover:underline font-medium"
                      >
                        {chunks}
                      </Link>
                    ),
                  })}
                </span>
              </label>
              <label className="flex items-start gap-2.5 text-xs text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5 w-4 h-4 rounded border-slate-300 text-brand focus:ring-brand shrink-0"
                  checked={agreeMarketing}
                  onChange={(e) => setAgreeMarketing(e.target.checked)}
                />
                <span className="leading-relaxed">
                  <span className="text-slate-400 font-semibold">[{t("auth.consent.optional")}]</span>{" "}
                  {t("auth.consent.marketing")}
                </span>
              </label>
            </div>

            {error && <div className="text-sm text-risk">{error}</div>}
            {info && <div className="text-sm text-success">{info}</div>}
            <button
              type="submit"
              disabled={loading || !agreeTerms}
              className="btn-primary w-full"
            >
              {loading ? t("auth.signingUp") : t("auth.signupCta")}
            </button>
          </form>

          <p className="mt-6 text-sm text-slate-600">
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

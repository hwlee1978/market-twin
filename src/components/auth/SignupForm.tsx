"use client";

import { useLocale, useTranslations } from "next-intl";
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
  const isKo = useLocale() === "ko";
  const router = useRouter();
  const search = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreeCrossBorder, setAgreeCrossBorder] = useState(false);
  const [agreeMarketing, setAgreeMarketing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  // Email-confirmation resend: shown after a successful signup that didn't
  // auto-log-in (Supabase "Confirm email" ON → data.session is null).
  const [awaitingConfirm, setAwaitingConfirm] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Read the plan / billing-cycle the user picked on /plans. Falls back
  // to free_trial when the user reached /signup directly without going
  // through the tier selector.
  const rawPlan = search.get("plan") ?? "free_trial";
  const planSlug: PlanSlug = (
    rawPlan === "free_trial" ||
    rawPlan === "starter" ||
    rawPlan === "validator" ||
    rawPlan === "growth" ||
    rawPlan === "enterprise"
      ? rawPlan
      : "free_trial"
  ) as PlanSlug;
  const cycle = (search.get("cycle") ?? "monthly") as "monthly" | "annual";
  const plan = getPlan(planSlug);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    capture("signup_started", {
      via: "password",
      intended_plan: planSlug,
      billing_cycle: cycle,
      marketing_consent: agreeMarketing,
      cross_border_consent: agreeCrossBorder,
    });
    setLoading(true);
    setError(null);
    setInfo(null);
    const supabase = createClient();
    // Stamp consent into the user's auth metadata so we have an audit
    // trail of when ToS / Privacy were accepted and which version.
    // (Term version is hard-coded for now; bump when the legal docs
    // change to invalidate prior consents.)
    const consent = {
      // Bump when Privacy/Terms/Refund docs change in a way that invalidates
      // prior consent (material policy shifts, new data uses, etc.).
      tos_version: "2026-05-28",
      tos_accepted_at: new Date().toISOString(),
      // PIPA Art. 28 — separate explicit consent for cross-border transfer
      // to overseas LLM providers / hosting / mail. Stored alongside ToS
      // consent so auditors can verify both were captured at signup.
      cross_border_transfer: agreeCrossBorder,
      cross_border_accepted_at: new Date().toISOString(),
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
        emailRedirectTo: `${window.location.origin}/auth/oauth-callback?plan=${planSlug}&cycle=${cycle}`,
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
      setAwaitingConfirm(true);
      setInfo(t("auth.checkEmail"));
    }
  };

  // Re-send the signup confirmation email. Guarded by a 60s cooldown to
  // respect Supabase's per-user SMTP rate limit (Minimum interval per
  // user) and to prevent button-spam.
  const onResend = async () => {
    if (resending || resendCooldown > 0 || !email) return;
    setResending(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/oauth-callback?plan=${planSlug}&cycle=${cycle}`,
      },
    });
    setResending(false);
    if (error) {
      setError(t(authErrorKey(error.message) as "errors.auth.generic"));
      return;
    }
    setInfo(t("auth.resendSent"));
    setResendCooldown(60);
    const timer = setInterval(() => {
      setResendCooldown((c) => {
        if (c <= 1) {
          clearInterval(timer);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  };

  // Google signup — same OAuth flow as login, but gated behind the
  // required consents. The password path stamps consent into auth
  // metadata directly; for OAuth we pass flags via the callback query so
  // the oauth-callback route can persist the same audit trail.
  const onGoogle = async () => {
    if (!agreeTerms || !agreeCrossBorder) {
      setError(
        isKo
          ? "구글로 가입하려면 먼저 필수 항목에 동의해 주세요."
          : "Please agree to the required items before continuing with Google.",
      );
      return;
    }
    capture("signup_started", {
      via: "google",
      intended_plan: planSlug,
      billing_cycle: cycle,
      marketing_consent: agreeMarketing,
      cross_border_consent: agreeCrossBorder,
    });
    const supabase = createClient();
    const params = new URLSearchParams({
      plan: planSlug,
      cycle,
      consent: "1",
      mkt: agreeMarketing ? "1" : "0",
    });
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/oauth-callback?${params.toString()}`,
      },
    });
  };

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between bg-brand text-white p-12">
        <Link href="/" className="inline-flex items-center gap-2.5">
          <LogoMark size={22} />
          <span className="text-xl font-semibold tracking-tight">Market Twin</span>
        </Link>
        <div className="space-y-8 max-w-xl">
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
                  checked={agreeCrossBorder}
                  onChange={(e) => setAgreeCrossBorder(e.target.checked)}
                  required
                />
                <span className="leading-relaxed">
                  <span className="text-risk font-semibold">[{t("auth.consent.required")}]</span>{" "}
                  {t.rich("auth.consent.crossBorderRich", {
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
            {awaitingConfirm && (
              <button
                type="button"
                onClick={onResend}
                disabled={resending || resendCooldown > 0}
                className="text-sm font-medium text-brand hover:underline disabled:opacity-50 disabled:no-underline"
              >
                {resendCooldown > 0
                  ? t("auth.resendCooldown", { seconds: resendCooldown })
                  : resending
                    ? t("auth.resendSending")
                    : t("auth.resendConfirm")}
              </button>
            )}
            <button
              type="submit"
              disabled={loading || !agreeTerms || !agreeCrossBorder}
              className="btn-primary w-full"
            >
              {loading ? t("auth.signingUp") : t("auth.signupCta")}
            </button>
          </form>

          <div className="my-5 flex items-center gap-3 text-xs text-slate-400">
            <div className="h-px flex-1 bg-slate-200" />
            {isKo ? "또는" : "or"}
            <div className="h-px flex-1 bg-slate-200" />
          </div>
          <button
            type="button"
            onClick={onGoogle}
            className="btn-secondary w-full"
          >
            {t("auth.googleLogin")}
          </button>
          <p className="mt-2 text-[11px] text-slate-400 leading-relaxed">
            {isKo
              ? "구글 가입도 위 필수 항목 동의가 적용됩니다."
              : "Google signup also applies the required consents above."}
          </p>

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

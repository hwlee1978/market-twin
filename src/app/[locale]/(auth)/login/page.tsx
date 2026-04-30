"use client";

import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { useState } from "react";
import { BarChart3, Globe2, ShieldCheck, Sparkles } from "lucide-react";
import { LogoMark } from "@/components/ui/Logo";
import { authErrorKey } from "@/lib/auth/error-messages";
import { createClient } from "@/lib/supabase/client";
import { capture } from "@/lib/analytics/posthog";

const FEATURES = [
  { icon: BarChart3, key: "successScore" as const },
  { icon: Globe2, key: "countries" as const },
  { icon: Sparkles, key: "personas" as const },
  { icon: ShieldCheck, key: "regulatory" as const },
];

export default function LoginPage() {
  const t = useTranslations();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setLoading(false);
      // Map Supabase's English error to a locale-aware friendly message.
      setError(t(authErrorKey(error.message) as "errors.auth.generic"));
      return;
    }
    capture("login_completed", { via: "password" });
    // Keep loading=true through the navigation. The button stays disabled
    // ("로그인 중...") until the dashboard takes over and this component
    // unmounts. If we reset loading here, the button briefly snaps back
    // to active in the gap between auth resolving and the route swap.
    router.replace("/dashboard");
    router.refresh();
  };

  const onGoogle = async () => {
    capture("login_started", { via: "google" });
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
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
          <h2 className="text-2xl font-semibold mb-6">{t("auth.loginTitle")}</h2>

          <button onClick={onGoogle} className="btn-secondary w-full mb-3">
            {t("auth.googleLogin")}
          </button>

          <div className="my-4 flex items-center gap-3 text-xs text-slate-400">
            <div className="h-px flex-1 bg-slate-200" />
            {t("auth.or")}
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="label">{t("auth.email")}</label>
              <input
                type="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label">{t("auth.password")}</label>
              <input
                type="password"
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
            </div>
            {error && <div className="text-sm text-risk">{error}</div>}
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? t("auth.loggingIn") : t("auth.loginCta")}
            </button>
          </form>

          <p className="mt-6 text-sm text-slate-600">
            {t("auth.noAccount")}{" "}
            <Link href="/signup" className="text-brand font-medium hover:underline">
              {t("common.signup")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

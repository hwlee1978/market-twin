"use client";

import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { useState } from "react";
import { BarChart3, Globe2, ShieldCheck, Sparkles } from "lucide-react";
import { LogoMark } from "@/components/ui/Logo";
import { createClient } from "@/lib/supabase/client";

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
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setLoading(false);
      setError(error.message);
      return;
    }
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
          <h2 className="text-2xl font-semibold mb-6">{t("auth.signupTitle")}</h2>

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
              <p className="mt-1 text-xs text-slate-500">{t("auth.passwordHint")}</p>
            </div>
            {error && <div className="text-sm text-risk">{error}</div>}
            {info && <div className="text-sm text-success">{info}</div>}
            <button type="submit" disabled={loading} className="btn-primary w-full">
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

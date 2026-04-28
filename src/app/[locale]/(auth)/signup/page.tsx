"use client";

import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function SignupPage() {
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
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    if (data.session) {
      router.replace("/dashboard");
      router.refresh();
    } else {
      setInfo("Check your email to confirm your account.");
    }
  };

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between bg-brand text-white p-12">
        <div className="text-xl font-semibold">{t("common.appName")}</div>
        <div>
          <h1 className="text-4xl font-semibold leading-tight">{t("common.tagline")}</h1>
          <p className="mt-4 text-brand-100 max-w-md">{t("auth.trustline")}</p>
        </div>
        <div className="text-xs text-brand-100">© AI Market Twin</div>
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
              {loading ? t("common.loading") : t("auth.signupCta")}
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

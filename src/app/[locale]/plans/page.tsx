import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { LogoMark } from "@/components/ui/Logo";
import { PlansSelector } from "@/components/billing/PlansSelector";
import { createClient } from "@/lib/supabase/server";

/**
 * Pre-signup tier selection. The user lands here after clicking
 * "시작하기" / "Sign up" on markettwin.ai. They pick a plan, then we
 * route them into /signup with the chosen plan as a query param.
 *
 * Public route — no auth gate. Lives on the app domain (not the
 * marketing site) so we can keep pricing private from random web
 * crawlers; the only entry path is the sign-up CTA on markettwin.ai
 * or a direct app-domain link we send to a prospect.
 */
export default async function PlansPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const isKo = locale === "ko";
  // 국내카드 PG 라벨 — nicepay 전환 시 나이스페이먼츠(바로오픈은 카드만),
  // 그 전엔 토스페이먼츠(국내카드·계좌이체).
  const krwSingle = process.env.NEXT_PUBLIC_KRW_PROVIDER === "nicepay";
  const krwPgLabel = krwSingle
    ? isKo
      ? "나이스페이먼츠 (국내 신용카드)"
      : "NICE Payments (Korean cards)"
    : isKo
      ? "토스페이먼츠 (국내카드·계좌이체)"
      : "TossPayments (Korean cards / bank transfer)";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isLoggedIn = !!user;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="px-6 py-5 border-b border-slate-200 bg-white">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/" className="inline-flex items-center gap-2.5 text-slate-900">
            <LogoMark size={22} />
            <span className="text-lg font-semibold tracking-tight">Market Twin</span>
          </Link>
          <Link
            href={isLoggedIn ? "/dashboard" : "/login"}
            className="text-sm text-slate-600 hover:text-brand transition-colors"
          >
            {isLoggedIn
              ? isKo
                ? "대시보드로"
                : "Back to dashboard"
              : isKo
                ? "이미 계정이 있으신가요? 로그인"
                : "Already have an account? Sign in"}
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-12 sm:py-16">
        <div className="text-center mb-10 sm:mb-14">
          <div className="text-xs uppercase tracking-[0.15em] text-brand font-semibold mb-3">
            {isKo ? "플랜 선택" : "Choose your plan"}
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4 break-keep">
            {isKo
              ? "당신의 진출 검증에 맞는 플랜"
              : "Pick the plan that fits your launch validation"}
          </h1>
          <p className="text-base text-slate-600 leading-relaxed max-w-2xl mx-auto break-keep">
            {isKo
              ? "Free Trial로 7일 무료 체험. 신용카드 등록 없이 시뮬 1건을 즉시 받아볼 수 있습니다."
              : "Start with a free 7-day trial — 1 simulation, no card required."}
          </p>
        </div>

        <PlansSelector locale={locale} isLoggedIn={isLoggedIn} />

        <div className="mt-14 sm:mt-20 max-w-3xl mx-auto text-center">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">
            {isKo ? "도움이 필요하신가요?" : "Need help choosing?"}
          </h2>
          <p className="text-sm text-slate-600 leading-relaxed mb-4 break-keep">
            {isKo
              ? "데모 미팅 30분으로 어떤 플랜이 맞는지 같이 정해드립니다. 케이스 스터디 + 라이브 시뮬 시연 포함."
              : "We can help you pick the right plan in a 30-minute demo call. Includes case studies and a live simulation walkthrough."}
          </p>
          <a
            href="mailto:contact@markettwin.ai?subject=Demo%20request"
            className="btn-secondary inline-flex"
          >
            {isKo ? "데모 미팅 요청" : "Request a demo"}
          </a>
        </div>

        <div className="mt-12 text-center text-xs text-slate-500 leading-relaxed">
          {isKo ? (
            <>
              연간 결제 시 <strong className="text-slate-700">2개월 무료</strong> (16.7% 할인). 모든 플랜은 언제든 업그레이드·다운그레이드 가능합니다.
              <br />
              가격은 부가세 별도. 결제는 Stripe (해외카드) 및 {krwPgLabel} 지원.
            </>
          ) : (
            <>
              Annual billing saves <strong className="text-slate-700">2 months</strong> (16.7% off). Upgrade or downgrade any time.
              <br />
              Prices exclude tax. Payment via Stripe (international cards) and {krwPgLabel}.
            </>
          )}
        </div>
      </main>
    </div>
  );
}

import { Link } from "@/i18n/navigation";
import { LogoMark } from "@/components/ui/Logo";
import { BetaFeedbackForm } from "@/components/beta/BetaFeedbackForm";
import {
  Globe2,
  Users,
  LineChart,
  FileText,
  Sparkles,
  CheckCircle2,
  MessageSquare,
} from "lucide-react";

/**
 * Public beta recruitment landing — lives outside the (app)/(auth) route
 * groups so it needs no auth. CTA points at /signup. Copy is beta-specific
 * (free, 7 days or 2 hypothesis sims). Locale-branched (ko default / en).
 */
export default async function BetaLandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const isKo = locale !== "en";

  const steps = isKo
    ? [
        {
          icon: Globe2,
          title: "제품과 후보 국가를 입력",
          body: "제품명·가격·진출 후보국(미국·일본·대만 등)을 5분 안에 입력합니다. 비기술자도 가능합니다.",
        },
        {
          icon: Users,
          title: "600명 AI 페르소나가 반응",
          body: "정부 통계 기반 현지 가상 소비자 600명이 멀티 LLM(Claude·GPT·Gemini)으로 당신의 제품에 반응합니다.",
        },
        {
          icon: FileText,
          title: "추천 시장·가격·리포트",
          body: "추천 시장 Top-2, 페르소나 반응, 적정 가격, PDF 리포트까지 몇 분이면 나옵니다.",
        },
      ]
    : [
        {
          icon: Globe2,
          title: "Enter your product & target markets",
          body: "Product, price, candidate countries (US, JP, TW…) in under 5 minutes. No technical setup.",
        },
        {
          icon: Users,
          title: "600 AI personas react",
          body: "600 government-statistics-grounded local personas react across multiple LLMs (Claude, GPT, Gemini).",
        },
        {
          icon: FileText,
          title: "Markets, pricing & a report",
          body: "Top-2 markets, persona reactions, pricing, and a PDF report — in a few minutes.",
        },
      ];

  const perks = isKo
    ? [
        "완전 무료 — 신용카드 불필요",
        "7일 또는 초기검증 2회 무료",
        "샘플 데모는 하루 3회 즉시 체험",
      ]
    : [
        "Completely free — no credit card",
        "7 days or 2 hypothesis simulations free",
        "Try the sample demo instantly (3/day)",
      ];

  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto">
        <Link href="/" className="inline-flex items-center gap-2.5">
          <LogoMark size={22} />
          <span className="text-lg font-semibold tracking-tight">Market Twin</span>
        </Link>
        <div className="flex items-center gap-4 sm:gap-5">
          <Link
            href="/beta"
            locale={isKo ? "en" : "ko"}
            className="text-sm font-medium text-slate-500 hover:text-brand"
          >
            {isKo ? "EN" : "한국어"}
          </Link>
          <Link href="/login" className="text-sm font-medium text-brand hover:underline">
            {isKo ? "로그인" : "Log in"}
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-brand text-white">
        <div className="max-w-6xl mx-auto px-6 py-20 lg:py-28">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-accent">
            <Sparkles size={13} />
            {isKo ? "베타 테스트 진행 중" : "Now in beta"}
          </span>
          <h1 className="mt-5 text-[2.4rem] lg:text-[3.2rem] font-bold leading-[1.15] tracking-tight break-keep whitespace-pre-line">
            {isKo
              ? "어느 나라부터 진출할지,\n출시 전에 확인하세요"
              : "See where your product fits abroad —\nbefore you launch"}
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-brand-100 leading-relaxed break-keep">
            {isKo
              ? "제품 정보를 입력하면, 진출 후보국의 현지 소비자 600명이 어떻게 반응하는지 시뮬레이션해 보여드립니다. 추천 시장과 적정 가격까지 몇 분이면 확인할 수 있어요."
              : "Tell us about your product, and we'll simulate how 600 local consumers would react — recommended markets and pricing included. It only takes a few minutes."}
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <Link
              href="/signup"
              className="inline-flex items-center justify-center rounded-lg bg-accent px-6 py-3.5 text-base font-semibold text-brand hover:opacity-90 transition-opacity"
            >
              {isKo ? "무료로 시작하기" : "Start free"}
            </Link>
            <span className="text-sm text-brand-100">
              {isKo
                ? "신용카드 불필요 · 1분 가입"
                : "No credit card · 1-minute signup"}
            </span>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <h2 className="text-2xl lg:text-3xl font-bold tracking-tight text-center break-keep">
          {isKo ? "어떻게 작동하나요?" : "How it works"}
        </h2>
        <div className="mt-12 grid gap-8 md:grid-cols-3">
          {steps.map((s, i) => (
            <div key={i} className="relative">
              <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-brand/5 text-brand">
                <s.icon size={20} />
              </div>
              <div className="mt-4 text-xs font-semibold text-accent">
                {isKo ? `${i + 1}단계` : `Step ${i + 1}`}
              </div>
              <h3 className="mt-1 text-lg font-semibold break-keep">{s.title}</h3>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed break-keep">
                {s.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Perks / beta benefits */}
      <section className="bg-slate-50">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <div className="grid gap-10 lg:grid-cols-2 items-center">
            <div>
              <h2 className="text-2xl lg:text-3xl font-bold tracking-tight break-keep">
                {isKo ? "베타 기간, 전부 무료" : "Free during the beta"}
              </h2>
              <p className="mt-4 text-slate-600 leading-relaxed break-keep">
                {isKo
                  ? "베타 테스터에게는 모든 기능을 무료로 열어드립니다. 사용해보시고 느낀 점을 보내주시면 제품에 적극 반영하겠습니다."
                  : "Beta testers get full access for free. Use it, tell us what you think, and we'll fold your feedback straight into the product."}
              </p>
              <ul className="mt-6 space-y-3">
                {perks.map((p, i) => (
                  <li key={i} className="flex items-start gap-2.5">
                    <CheckCircle2 size={18} className="text-accent shrink-0 mt-0.5" />
                    <span className="text-sm text-slate-800">{p}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-8">
              <div className="flex items-center gap-2 text-brand">
                <LineChart size={18} />
                <span className="text-sm font-semibold">
                  {isKo ? "결과로 받는 것" : "What you get"}
                </span>
              </div>
              <ul className="mt-5 space-y-3 text-sm text-slate-700">
                <li>· {isKo ? "Top-2 추천 진출 시장 + 신뢰도" : "Top-2 recommended markets + confidence"}</li>
                <li>· {isKo ? "현지 페르소나 반응·구매의향·거부 이유" : "Local persona reactions, intent, objections"}</li>
                <li>· {isKo ? "가격 탄력성 곡선 + 추천가" : "Price elasticity curve + recommended price"}</li>
                <li>· {isKo ? "임원 보고용 PDF 리포트" : "Executive-ready PDF report"}</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="max-w-6xl mx-auto px-6 py-20 text-center">
        <h2 className="text-2xl lg:text-3xl font-bold tracking-tight break-keep">
          {isKo
            ? "출시 전에, 먼저 검증하세요"
            : "Validate before you launch"}
        </h2>
        <p className="mt-3 text-slate-600 break-keep">
          {isKo
            ? "베타는 한정 기간입니다. 지금 무료로 시작해보세요."
            : "The beta is time-limited. Start free today."}
        </p>
        <Link
          href="/signup"
          className="mt-7 inline-flex items-center justify-center rounded-lg bg-brand px-7 py-3.5 text-base font-semibold text-white hover:opacity-90 transition-opacity"
        >
          {isKo ? "무료로 시작하기" : "Start free"}
        </Link>
      </section>

      {/* Beta tester feedback — anonymous, private collection */}
      <section className="bg-slate-50 border-t border-slate-200">
        <div className="max-w-3xl mx-auto px-6 py-20">
          <div className="text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand/5 px-3 py-1 text-xs font-semibold text-brand">
              <MessageSquare size={13} />
              {isKo ? "베타 피드백" : "Beta feedback"}
            </span>
            <h2 className="mt-4 text-2xl lg:text-3xl font-bold tracking-tight break-keep">
              {isKo
                ? "써보셨나요? 의견을 들려주세요"
                : "Tried it? Tell us what you think"}
            </h2>
            <p className="mt-3 text-slate-600 break-keep">
              {isKo
                ? "로그인 없이 익명으로 보낼 수 있어요. 한 줄이라도 베타에 큰 힘이 됩니다."
                : "Send it anonymously — no login needed. Even one line helps the beta a lot."}
            </p>
          </div>
          <div className="mt-10">
            <BetaFeedbackForm isKo={isKo} />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200">
        <div className="max-w-6xl mx-auto px-6 py-8 text-xs text-slate-500 leading-relaxed">
          <div className="font-medium text-slate-700">© 2026 주식회사 미스터에이아이 (Mr.AI Inc.)</div>
          <div className="mt-1">
            {isKo ? "문의: " : "Contact: "}
            <a
              href="mailto:contact@markettwin.ai"
              className="text-brand hover:underline"
            >
              contact@markettwin.ai
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

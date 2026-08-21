"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { Check, X, ArrowRight } from "lucide-react";
import { clsx } from "clsx";
import {
  ALL_PLANS,
  SINGLE_PURCHASE_PACKS,
  formatPlanPrice,
  isOpenBeta,
  type PlanDefinition,
  type SinglePurchasePack,
} from "@/lib/billing/plans";
import { BillingComplianceNotice } from "./BillingComplianceNotice";

type Currency = "usd" | "krw";

/**
 * Tier-selection grid for the pre-signup /plans page. Server component
 * passes the locale; everything else (currency toggle, billing cycle
 * toggle, hover states) stays client-side.
 *
 * CTA routing:
 *   - free_trial / starter / growth → /signup?plan=<slug>&cycle=<cycle>
 *     so the signup form can resume the choice and the post-signup
 *     payment step (Stripe / Toss) gets the right line item
 *   - enterprise → mailto with the user's intent in the subject
 */
export function PlansSelector({
  locale,
  isLoggedIn,
}: {
  locale: string;
  /**
   * Server-detected auth state. When true, paid-plan CTAs route
   * directly to /billing/upgrade (skipping /signup) and pass currency
   * through so the dispatcher knows whether to use Stripe or Toss.
   */
  isLoggedIn?: boolean;
}) {
  const isKo = locale === "ko";
  const [currency, setCurrency] = useState<Currency>(isKo ? "krw" : "usd");
  const openBeta = isOpenBeta();

  return (
    <div>
      {openBeta && (
        <div className="mb-8 rounded-xl border border-brand/30 bg-brand/5 px-5 py-4 text-center">
          <p className="text-sm font-semibold text-brand break-keep">
            {isKo
              ? "🎉 오픈 베타 진행 중 — 지금은 모든 기능을 무료로 이용하실 수 있습니다."
              : "🎉 Open beta — everything is free right now."}
          </p>
          <p className="mt-1 text-xs text-slate-500 break-keep">
            {isKo
              ? "결제는 정식 출시 후 시작됩니다. 아래 요금은 참고용입니다."
              : "Paid plans begin after launch. Prices below are for reference only."}
          </p>
        </div>
      )}

      <div className="flex items-center justify-center mb-8">
        <CurrencyToggle value={currency} onChange={setCurrency} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {ALL_PLANS.map((plan) => (
          <PlanCard
            key={plan.slug}
            plan={plan}
            currency={currency}
            isKo={isKo}
            highlight={plan.slug === "validator"}
            isLoggedIn={!!isLoggedIn}
            openBeta={openBeta}
          />
        ))}
      </div>

      <div className="mt-6 text-xs text-slate-500 text-center">
        {isKo
          ? "* 베타 무료 체험은 7일 또는 초기검증 2회 (먼저 도래한 시점) 후 자동 종료. 신용카드 등록 불필요."
          : "* The beta free trial ends after 7 days or 2 sims, whichever comes first. No credit card required."}
      </div>

      <SinglePurchaseSection currency={currency} isKo={isKo} isLoggedIn={!!isLoggedIn} openBeta={openBeta} />

      <BillingComplianceNotice locale={isKo ? "ko" : "en"} />
    </div>
  );
}

function CurrencyToggle({
  value,
  onChange,
}: {
  value: Currency;
  onChange: (c: Currency) => void;
}) {
  return (
    <div className="inline-flex rounded-full bg-white border border-slate-200 p-1 mx-auto sm:mx-0">
      <button
        type="button"
        onClick={() => onChange("usd")}
        className={clsx(
          "px-3 py-1.5 text-xs font-semibold rounded-full transition-colors",
          value === "usd" ? "bg-slate-900 text-white" : "text-slate-600 hover:text-slate-900",
        )}
      >
        USD
      </button>
      <button
        type="button"
        onClick={() => onChange("krw")}
        className={clsx(
          "px-3 py-1.5 text-xs font-semibold rounded-full transition-colors",
          value === "krw" ? "bg-slate-900 text-white" : "text-slate-600 hover:text-slate-900",
        )}
      >
        KRW
      </button>
    </div>
  );
}

/**
 * Pay-per-simulation "1회권" packs, shown below the monthly tier grid.
 * During beta these are inquiry-only: the CTA opens a 사전 문의 mailto
 * rather than live checkout (see plans.ts SINGLE_PURCHASE_PACKS). Shares
 * the currency toggle with the plan grid above.
 */
function SinglePurchaseSection({
  currency,
  isKo,
  isLoggedIn,
  openBeta,
}: {
  currency: Currency;
  isKo: boolean;
  isLoggedIn: boolean;
  openBeta: boolean;
}) {
  return (
    <div className="mt-14 sm:mt-16">
      <div className="text-center mb-6">
        <div className="text-xs uppercase tracking-[0.15em] text-brand font-semibold mb-2">
          {isKo ? "단건 이용권" : "Single-run packs"}
        </div>
        <h2 className="text-xl sm:text-2xl font-bold text-slate-900 mb-2 break-keep">
          {isKo ? "구독 없이 1회권으로" : "Pay per simulation, no subscription"}
        </h2>
        <p className="text-sm text-slate-600 leading-relaxed max-w-2xl mx-auto break-keep">
          {isKo
            ? "월 구독이 부담이라면 필요한 시뮬만 1건씩 결제하세요. 티어별 1회 실행 기준입니다."
            : "Not ready for a monthly plan? Buy a single simulation at the tier you need."}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {SINGLE_PURCHASE_PACKS.map((pack) => (
          <PackCard key={pack.slug} pack={pack} currency={currency} isKo={isKo} isLoggedIn={isLoggedIn} openBeta={openBeta} />
        ))}
      </div>

      <p className="mt-4 text-xs text-slate-500 text-center break-keep">
        {isKo
          ? openBeta
            ? "* 오픈 베타 기간에는 결제 없이 무료로 이용하실 수 있습니다. 아래 요금은 정식 출시 후 기준(참고용)입니다."
            : "* 단건 이용권은 결제 즉시 해당 티어 시뮬레이션을 1회 실행할 수 있습니다. (원화 카드결제 · 부가세 별도)"
          : openBeta
            ? "* Free during open beta — no payment required. Prices are for reference (post-launch)."
            : "* Each single-run pack unlocks one simulation of that tier right after payment. (KRW card checkout; USD by inquiry)"}
      </p>
    </div>
  );
}

function PackCard({
  pack,
  currency,
  isKo,
  isLoggedIn,
  openBeta,
}: {
  pack: SinglePurchasePack;
  currency: Currency;
  isKo: boolean;
  isLoggedIn: boolean;
  openBeta: boolean;
}) {
  const priceLabel = formatPlanPrice(pack.price[currency], currency);
  const locale = isKo ? "ko" : "en";
  // 오픈 베타: 결제 감추고 무료 시작으로 유도(로그인=대시보드, 비로그인=가입).
  // 정식 유료화 시: NICE 결제창(KRW)만 제공, USD는 문의(Stripe 미연결).
  const canBuy = !openBeta && !pack.inquiryOnly && currency === "krw";
  const ctaHref = openBeta
    ? isLoggedIn
      ? "/dashboard"
      : "/signup"
    : canBuy
      ? isLoggedIn
        ? `/${locale}/billing/upgrade?pack=${pack.slug}`
        : `/signup?pack=${pack.slug}`
      : `mailto:contact@markettwin.ai?subject=${encodeURIComponent(
          isKo ? `단건 이용권 문의 — ${pack.name.ko}` : `Single-run pack inquiry — ${pack.name.en}`,
        )}`;

  return (
    <div className="flex flex-col rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-bold text-slate-900 mb-1 break-keep">
        {pack.name[isKo ? "ko" : "en"]}
      </h3>
      <p className="text-[11px] text-slate-500 leading-relaxed min-h-[3em] break-keep mb-3">
        {pack.tagline[isKo ? "ko" : "en"]}
      </p>
      <div className="mb-3">
        <div className="flex items-baseline gap-1">
          <span className="text-xl font-bold text-slate-900 tabular-nums">{priceLabel}</span>
          <span className="text-[11px] text-slate-500">/{isKo ? "회" : "run"}</span>
        </div>
        {currency === "krw" && (
          <div className="text-[10px] text-slate-400 mt-0.5">
            {isKo ? "부가세 별도" : "Excl. VAT"}
          </div>
        )}
      </div>
      <a
        href={ctaHref}
        className="mt-auto w-full justify-center inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium border border-slate-300 text-slate-900 hover:border-slate-400 hover:bg-slate-50 transition-colors"
      >
        {openBeta
          ? isKo
            ? "베타 무료 이용"
            : "Free in beta"
          : canBuy
            ? isKo
              ? "결제하기"
              : "Buy"
            : isKo
              ? "사전 문의"
              : "Inquire"}
        <ArrowRight size={13} />
      </a>
    </div>
  );
}

function PlanCard({
  plan,
  currency,
  isKo,
  highlight,
  isLoggedIn,
  openBeta,
}: {
  plan: PlanDefinition;
  currency: Currency;
  isKo: boolean;
  highlight: boolean;
  isLoggedIn: boolean;
  openBeta: boolean;
}) {
  // 월간 결제만 제공 (연간 상품 제거 2026-06-24).
  const priceLabel = formatPlanPrice(plan.priceMonthly[currency], currency);

  // CTA routing matrix:
  //   - Enterprise → always mailto sales
  //   - Free trial → always /signup (free trial happens at workspace
  //     creation; logged-in users are already on free trial)
  //   - Paid plans:
  //       logged out → /signup with plan params; user converts after
  //       logged in → /billing/upgrade with currency, dispatcher
  //                    routes to Stripe (USD) or Toss (KRW)
  const ctaHref = (() => {
    if (plan.slug === "enterprise") {
      return `mailto:contact@markettwin.ai?subject=${encodeURIComponent(
        isKo ? "Enterprise 플랜 문의" : "Enterprise plan inquiry",
      )}`;
    }
    // 오픈 베타: 유료 플랜도 결제 없이 무료 시작으로 유도.
    if (openBeta || plan.slug === "free_trial") {
      return isLoggedIn ? "/dashboard" : `/signup?plan=${plan.slug}&cycle=monthly`;
    }
    if (isLoggedIn) {
      return `/billing/upgrade?plan=${plan.slug}&cycle=monthly&currency=${currency}`;
    }
    return `/signup?plan=${plan.slug}&cycle=monthly`;
  })();

  const ctaLabel = (() => {
    if (plan.slug === "enterprise") return isKo ? "Sales 문의" : "Contact sales";
    if (openBeta) return isKo ? "무료로 시작" : "Start free (beta)";
    if (plan.slug === "free_trial") return isKo ? "무료로 시작" : "Start free trial";
    return isKo ? "이 플랜으로 시작" : "Start with this plan";
  })();

  return (
    <div
      className={clsx(
        "relative flex flex-col rounded-xl border bg-white p-6 transition-shadow",
        highlight
          ? "border-brand shadow-lg shadow-brand/10 ring-1 ring-brand/20"
          : "border-slate-200",
      )}
    >
      {highlight && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 px-3 py-1 rounded-full bg-brand text-white text-[10px] font-bold uppercase tracking-wider">
          {isKo ? "가장 인기" : "Most popular"}
        </div>
      )}

      <div className="mb-4">
        <h3 className="text-lg font-bold text-slate-900 mb-1">{plan.name}</h3>
        <p className="text-xs text-slate-500 leading-relaxed min-h-[2.5em] break-keep">
          {plan.tagline[isKo ? "ko" : "en"]}
        </p>
      </div>

      <div className="mb-4 min-h-[5em]">
        {priceLabel == null ? (
          <div>
            <div className="text-2xl font-bold text-slate-900">
              {isKo ? "협의" : "Custom"}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {isKo ? "워크로드에 맞춘 가격" : "Pricing tailored to workload"}
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-bold text-slate-900 tabular-nums">{priceLabel}</span>
              <span className="text-sm text-slate-500">/{isKo ? "월" : "mo"}</span>
            </div>
            {plan.slug === "free_trial" && (
              <div className="text-xs text-slate-500 mt-1">
                {isKo ? "7일 또는 초기검증 2회" : "7 days or 2 sims"}
              </div>
            )}
            {plan.slug !== "free_trial" && currency === "krw" && (
              <div className="text-[11px] text-slate-400 mt-1">
                {isKo ? "부가세 별도 · 결제 시 10% 포함" : "Excl. VAT · +10% at checkout"}
              </div>
            )}
          </div>
        )}
      </div>

      <ul className="space-y-2 mb-6 flex-1 text-sm">
        <FeatureRow
          on={true}
          label={
            isKo
              ? `${formatLimit(plan.limits.simsPerMonth, isKo)}건 시뮬/월`
              : `${formatLimit(plan.limits.simsPerMonth, isKo)} sims/mo`
          }
        />
        <FeatureRow
          on={
            plan.limits.decisionPlusSimsPerMonth > 0 ||
            plan.limits.decisionPlusSimsPerMonth < 0
          }
          label={
            plan.limits.decisionPlusSimsPerMonth > 0 ||
            plan.limits.decisionPlusSimsPerMonth < 0
              ? isKo
                ? `검증분석 Plus tier ${formatLimit(plan.limits.decisionPlusSimsPerMonth, isKo)}건`
                : `Consensus Plus tier ${formatLimit(plan.limits.decisionPlusSimsPerMonth, isKo)} sims`
              : isKo
                ? "검증분석 Plus tier"
                : "Consensus Plus tier"
          }
        />
        <FeatureRow
          on={plan.features.multiLLM}
          label={
            plan.limits.deepSimsPerMonth > 0 || plan.limits.deepSimsPerMonth < 0
              ? isKo
                ? `심층분석 tier (멀티 LLM) ${formatLimit(plan.limits.deepSimsPerMonth, isKo)}건`
                : `Triangulated tier (multi-LLM) ${formatLimit(plan.limits.deepSimsPerMonth, isKo)} sims`
              : isKo
                ? "심층분석 tier (멀티 LLM)"
                : "Triangulated tier (multi-LLM)"
          }
        />
        <FeatureRow
          on={plan.limits.deepProEnabled}
          label={isKo ? "심층분석 Pro tier (10K 페르소나)" : "Triangulated Pro tier (10K personas)"}
        />
        <FeatureRow
          on={true}
          label={
            isKo
              ? `${formatLimit(plan.limits.chatMessagesPerMonth, isKo)} 페르소나 챗 메시지/월`
              : `${formatLimit(plan.limits.chatMessagesPerMonth, isKo)} persona chat msgs/mo`
          }
        />
        <FeatureRow
          on={true}
          label={
            isKo
              ? `${formatLimit(plan.limits.seats, isKo)} 사용자 좌석`
              : `${formatLimit(plan.limits.seats, isKo)} user seats`
          }
        />
        <FeatureRow on={plan.features.pdfDownload} label={isKo ? "PDF 리포트 다운로드" : "PDF report download"} />
        <FeatureRow on={plan.features.publicShareLinks} label={isKo ? "공유 링크 (read-only)" : "Public share links"} />
        <FeatureRow on={plan.features.csvExport} label={isKo ? "CSV 내보내기" : "CSV export"} />
        <FeatureRow on={plan.features.crossProjectCompare} label={isKo ? "프로젝트 간 비교" : "Cross-project compare"} />
        <FeatureRow on={plan.features.apiAccess} label="API 접근" />
        <FeatureRow on={plan.features.sso} label={isKo ? "SSO + 감사 로그" : "SSO + audit logs"} />
        <FeatureRow on={true} label={plan.support[isKo ? "ko" : "en"]} muted />
      </ul>

      {plan.slug === "enterprise" ? (
        <a
          href={ctaHref}
          className={clsx(
            "btn-secondary w-full justify-center inline-flex",
          )}
        >
          {ctaLabel}
          <ArrowRight size={14} />
        </a>
      ) : (
        <Link
          href={ctaHref}
          className={clsx(
            "w-full justify-center inline-flex items-center gap-1.5 px-4 py-2.5 rounded-md font-medium text-sm transition-colors",
            highlight
              ? "bg-brand text-white hover:bg-brand-deep"
              : plan.slug === "free_trial"
                ? "bg-slate-900 text-white hover:bg-slate-800"
                : "border border-slate-300 text-slate-900 hover:border-slate-400 hover:bg-slate-50",
          )}
        >
          {ctaLabel}
          <ArrowRight size={14} />
        </Link>
      )}
    </div>
  );
}

function FeatureRow({
  on,
  label,
  muted,
}: {
  on: boolean;
  label: string;
  muted?: boolean;
}) {
  return (
    <li className="flex items-start gap-2">
      {on ? (
        <Check size={14} className={muted ? "text-slate-400" : "text-success"} />
      ) : (
        <X size={14} className="text-slate-300" />
      )}
      <span className={clsx(on ? (muted ? "text-slate-500" : "text-slate-700") : "text-slate-400 line-through")}>
        {label}
      </span>
    </li>
  );
}

function formatLimit(n: number, isKo: boolean): string {
  if (n < 0) return isKo ? "무제한" : "Unlimited";
  return n.toLocaleString("en-US");
}

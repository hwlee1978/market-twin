"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { Check, X, ArrowRight } from "lucide-react";
import { clsx } from "clsx";
import {
  ALL_PLANS,
  formatPlanPrice,
  type PlanDefinition,
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

  return (
    <div>
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
          />
        ))}
      </div>

      <div className="mt-6 text-xs text-slate-500 text-center">
        {isKo
          ? "* 베타 무료 체험은 7일 또는 초기검증 2회 (먼저 도래한 시점) 후 자동 종료. 신용카드 등록 불필요."
          : "* The beta free trial ends after 7 days or 2 sims, whichever comes first. No credit card required."}
      </div>
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

function PlanCard({
  plan,
  currency,
  isKo,
  highlight,
  isLoggedIn,
}: {
  plan: PlanDefinition;
  currency: Currency;
  isKo: boolean;
  highlight: boolean;
  isLoggedIn: boolean;
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
    if (plan.slug === "free_trial") {
      return `/signup?plan=${plan.slug}&cycle=monthly`;
    }
    if (isLoggedIn) {
      return `/billing/upgrade?plan=${plan.slug}&cycle=monthly&currency=${currency}`;
    }
    return `/signup?plan=${plan.slug}&cycle=monthly`;
  })();

  const ctaLabel = (() => {
    if (plan.slug === "enterprise") return isKo ? "Sales 문의" : "Contact sales";
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

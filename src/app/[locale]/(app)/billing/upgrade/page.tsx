import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { getPlan, type PlanSlug } from "@/lib/billing/plans";
import { UpgradeDispatcher } from "@/components/billing/UpgradeDispatcher";
import { NiceCheckout } from "@/components/billing/NiceCheckout";

/**
 * Post-signup / explicit-upgrade entry point. Reads ?plan=&cycle= from
 * the URL, then dispatches:
 *   - currency=USD → Stripe Checkout (server creates the Session, we
 *     redirect window.location to Stripe's hosted page)
 *   - currency=KRW → Toss billing-auth widget (client SDK pops up
 *     directly; success URL routes to /billing/toss-success)
 *
 * The currency choice rides on the URL too because the user picked it
 * on /plans. Defaults to KRW for ko locale and USD for en, matching the
 * /plans toggle default.
 *
 * Free trial / Enterprise plans bounce back to /billing immediately —
 * no checkout flow needed.
 */
export default async function UpgradePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ plan?: string; cycle?: string; currency?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const search = await searchParams;
  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) redirect(`/${locale}/login?next=/billing/upgrade`);

  const planSlug = (search.plan ?? "starter") as PlanSlug;
  const plan = getPlan(planSlug);
  // 연간 상품 제거(2026-06-24) — 결제는 월간만. ?cycle=annual URL 우회도 차단.
  const cycle = "monthly" as const;
  const currency = (search.currency ??
    (locale === "ko" ? "krw" : "usd")) as "usd" | "krw";

  // Free trial / Enterprise: nothing to charge. Free trial happens
  // automatically on workspace creation; enterprise routes to email.
  if (plan.slug !== "starter" && plan.slug !== "growth") {
    redirect(`/${locale}/billing`);
  }

  // KRW 결제 PG 전환: 기본은 Toss(호스팅 결제창 redirect), env 플래그가
  // 'nicepay'면 NICE 결제창(SDK) 단건결제를 띄운다. 바로오픈 기간엔 단건
  // 신용카드 결제만 가능하므로 단건(NiceCheckout)으로 런칭하고, 자동갱신
  // (빌키/NiceCardForm)은 정식오픈 후 도입한다.
  const krwProvider = process.env.NEXT_PUBLIC_KRW_PROVIDER === "nicepay" ? "nicepay" : "toss";
  if (currency === "krw" && krwProvider === "nicepay") {
    return (
      <NiceCheckout
        locale={locale}
        planSlug={plan.slug}
        planName={plan.name}
        cycle={cycle}
      />
    );
  }

  return (
    <UpgradeDispatcher
      locale={locale}
      planSlug={plan.slug}
      planName={plan.name}
      cycle={cycle}
      currency={currency}
      workspaceId={ctx.workspaceId}
      userEmail={ctx.email}
    />
  );
}

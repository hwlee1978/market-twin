import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { getPlan, type PlanSlug } from "@/lib/billing/plans";
import { UpgradeDispatcher } from "@/components/billing/UpgradeDispatcher";
import { NiceCardForm } from "@/components/billing/NiceCardForm";

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
  const cycle = (search.cycle === "annual" ? "annual" : "monthly") as "monthly" | "annual";
  const currency = (search.currency ??
    (locale === "ko" ? "krw" : "usd")) as "usd" | "krw";

  // Free trial / Enterprise: nothing to charge. Free trial happens
  // automatically on workspace creation; enterprise routes to email.
  if (plan.slug !== "starter" && plan.slug !== "growth") {
    redirect(`/${locale}/billing`);
  }

  // KRW 정기결제 PG 전환: 기본은 Toss(호스팅 결제창 redirect), env 플래그가
  // 'nicepay'면 NICE 키인 카드입력 폼을 인앱으로 띄운다. 포스타트는 결제창
  // 빌키발급이 없어 redirect가 아니라 자체 폼이 필요하다(NICE 답변 2026-06-22).
  // NICE는 계약 완료+내부셋팅 후에만 실연동되므로 그 전까진 toss 유지.
  const krwProvider = process.env.NEXT_PUBLIC_KRW_PROVIDER === "nicepay" ? "nicepay" : "toss";
  if (currency === "krw" && krwProvider === "nicepay") {
    return (
      <NiceCardForm
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

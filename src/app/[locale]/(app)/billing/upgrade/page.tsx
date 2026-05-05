import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { getPlan, type PlanSlug } from "@/lib/billing/plans";
import { UpgradeDispatcher } from "@/components/billing/UpgradeDispatcher";

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

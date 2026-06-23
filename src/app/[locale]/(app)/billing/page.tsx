import { setRequestLocale } from "next-intl/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { getSubscription, getMonthlyUsage } from "@/lib/billing/usage";
import { BillingDashboard } from "@/components/billing/BillingDashboard";

export default async function BillingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) return null;

  const sub = await getSubscription(ctx.workspaceId);
  const usage = await getMonthlyUsage(ctx.workspaceId, sub);

  // Strip non-serialisable fields (functions etc. — none here, but
  // explicit projection keeps the client/server boundary readable).
  const initialState = {
    plan: {
      slug: sub.plan.slug,
      name: sub.plan.name,
      tagline: sub.plan.tagline,
      limits: sub.plan.limits,
      features: sub.plan.features,
      priceMonthly: sub.plan.priceMonthly,
      selfServe: sub.plan.selfServe,
    },
    status: sub.status,
    trial: {
      active: sub.trialActive,
      endsAt: sub.trialEndsAt,
      simsUsed: sub.trialSimsUsed,
      simsLimit: sub.trialSimsLimit,
    },
    period: {
      start: sub.currentPeriodStart,
      end: sub.currentPeriodEnd,
      cancelAtEnd: sub.cancelAtPeriodEnd,
    },
    paymentProvider: sub.paymentProvider,
    singlePayment: sub.singlePayment,
    usage,
  };

  return <BillingDashboard initial={initialState} locale={locale} />;
}

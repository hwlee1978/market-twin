import { setRequestLocale } from "next-intl/server";
import { ProjectWizard } from "@/components/ProjectWizard";
import { BetaTrialComplete } from "@/components/BetaTrialComplete";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { getSubscription } from "@/lib/billing/usage";

export default async function NewProjectPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const ctx = await getOrCreatePrimaryWorkspace();
  const sub = ctx ? await getSubscription(ctx.workspaceId) : null;
  const betaTrialOnly = sub?.plan.slug === "free_trial";

  // Beta (free_trial) trial exhausted → show the "beta complete" notice
  // instead of the wizard, right at the '새 프로젝트' step. Exhausted =
  // used up the free simulations OR the 7-day trial window has passed.
  if (
    sub &&
    sub.plan.slug === "free_trial" &&
    (sub.trialSimsUsed >= sub.trialSimsLimit || !sub.trialActive)
  ) {
    return (
      <BetaTrialComplete
        locale={locale}
        reason={sub.trialSimsUsed >= sub.trialSimsLimit ? "sims" : "expired"}
      />
    );
  }

  // Beta (free_trial) workspaces can only run the Hypothesis tier, so lock
  // the higher tier cards in the wizard — otherwise the user selects one and
  // only learns it's unavailable after submitting (plan_limit).
  return <ProjectWizard locale={locale} betaTrialOnly={betaTrialOnly} />;
}

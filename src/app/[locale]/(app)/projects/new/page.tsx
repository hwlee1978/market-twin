import { setRequestLocale } from "next-intl/server";
import { ProjectWizard } from "@/components/ProjectWizard";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { getSubscription } from "@/lib/billing/usage";

export default async function NewProjectPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Beta (free_trial) workspaces can only run the Hypothesis tier, so lock
  // the higher tier cards in the wizard — otherwise the user selects one and
  // only learns it's unavailable after submitting (plan_limit).
  const ctx = await getOrCreatePrimaryWorkspace();
  const sub = ctx ? await getSubscription(ctx.workspaceId) : null;
  const betaTrialOnly = sub?.plan.slug === "free_trial";

  return <ProjectWizard locale={locale} betaTrialOnly={betaTrialOnly} />;
}

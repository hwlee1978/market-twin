import { setRequestLocale } from "next-intl/server";
import { ResultsView } from "@/components/results/ResultsView";
import { EnsembleView } from "@/components/results/EnsembleView";

export default async function ResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; locale: string }>;
  searchParams: Promise<{ sim?: string; ensemble?: string }>;
}) {
  const { id, locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  // Route on `ensemble` first — it's the new primary view. Fall back to
  // single-sim view (legacy / quick mode) when ensemble param missing.
  if (sp.ensemble) {
    return <EnsembleView projectId={id} ensembleId={sp.ensemble} locale={locale} />;
  }
  return <ResultsView projectId={id} simulationId={sp.sim ?? null} locale={locale} />;
}

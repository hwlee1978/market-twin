import { setRequestLocale } from "next-intl/server";
import { ResultsView } from "@/components/results/ResultsView";

export default async function ResultsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; locale: string }>;
  searchParams: Promise<{ sim?: string }>;
}) {
  const { id, locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  return <ResultsView projectId={id} simulationId={sp.sim ?? null} locale={locale} />;
}

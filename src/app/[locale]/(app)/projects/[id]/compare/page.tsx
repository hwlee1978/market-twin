import { redirect } from "@/i18n/navigation";

/**
 * Legacy single-sim comparison page. Replaced by the ensemble comparison
 * flow at /compare-ensembles — every new analysis goes through ensembles
 * (wizard + re-run button both target the ensemble endpoint), so the two
 * comparison surfaces collapsed into one. Preserved here as a redirect
 * so any bookmarks / emails with the old URL still land somewhere
 * useful.
 */
export default async function LegacyCompareRedirect({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id, locale } = await params;
  redirect({ href: `/projects/${id}/compare-ensembles`, locale });
}

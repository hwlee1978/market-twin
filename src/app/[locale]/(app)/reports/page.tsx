import { getTranslations, setRequestLocale } from "next-intl/server";

export default async function ReportsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t("nav.reports")}</h1>
      <div className="card text-sm text-slate-500">
        Reports archive arrives in v0.2. Use the “Download PDF” button on any completed simulation
        for now.
      </div>
    </div>
  );
}

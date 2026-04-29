import { getTranslations, setRequestLocale } from "next-intl/server";

export default async function AdminPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("admin");
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t("nav.billing")}</h1>
      <div className="card text-sm text-slate-500">{t("placeholder.comingSoon")}</div>
    </div>
  );
}

import { getTranslations, setRequestLocale } from "next-intl/server";

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t("nav.settings")}</h1>
      <div className="card text-sm text-slate-500">
        Profile, workspace, and notification settings arrive in v0.2.
      </div>
    </div>
  );
}

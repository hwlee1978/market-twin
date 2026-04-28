import { setRequestLocale } from "next-intl/server";
import { ProjectWizard } from "@/components/ProjectWizard";

export default async function NewProjectPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <ProjectWizard locale={locale} />;
}

import { getTranslations, setRequestLocale } from "next-intl/server";
import { LegalLayout, LegalSection } from "@/components/legal/LegalLayout";

export default async function RefundPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("legal.refund");

  return (
    <LegalLayout title={t("title")} lastUpdated={t("lastUpdated")}>
      <p className="mb-6 text-slate-700 leading-[1.75] text-justify">
        {t("intro")}
      </p>

      <LegalSection num={1} title={t("scope.title")}>
        <p>{t("scope.body")}</p>
      </LegalSection>

      <LegalSection num={2} title={t("trial.title")}>
        <p>{t("trial.body")}</p>
      </LegalSection>

      <LegalSection num={3} title={t("monthly.title")}>
        <p>{t("monthly.body")}</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>{t("monthly.item1")}</li>
          <li>{t("monthly.item2")}</li>
          <li>{t("monthly.item3")}</li>
        </ul>
      </LegalSection>

      <LegalSection num={4} title={t("annual.title")}>
        <p>{t("annual.body")}</p>
      </LegalSection>

      <LegalSection num={5} title={t("withdrawal.title")}>
        <p>{t("withdrawal.body")}</p>
      </LegalSection>

      <LegalSection num={6} title={t("cancel.title")}>
        <p>{t("cancel.body")}</p>
      </LegalSection>

      <LegalSection num={7} title={t("autopay.title")}>
        <p>{t("autopay.body")}</p>
      </LegalSection>

      <LegalSection num={8} title={t("contact.title")}>
        <p>{t("contact.body")}</p>
      </LegalSection>
    </LegalLayout>
  );
}

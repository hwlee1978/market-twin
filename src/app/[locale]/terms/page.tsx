import { getTranslations, setRequestLocale } from "next-intl/server";
import { LegalLayout, LegalSection } from "@/components/legal/LegalLayout";

export default async function TermsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("legal.terms");

  return (
    <LegalLayout title={t("title")} lastUpdated={t("lastUpdated")}>
      <p className="mb-6 text-slate-700 leading-[1.75] text-justify">
        {t("intro")}
      </p>

      <LegalSection num={1} title={t("acceptance.title")}>
        <p>{t("acceptance.body")}</p>
      </LegalSection>

      <LegalSection num={2} title={t("service.title")}>
        <p>{t("service.body")}</p>
        <p className="mt-3">{t("service.disclaimer")}</p>
      </LegalSection>

      <LegalSection num={3} title={t("account.title")}>
        <p>{t("account.body")}</p>
      </LegalSection>

      <LegalSection num={4} title={t("acceptableUse.title")}>
        <p>{t("acceptableUse.body")}</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>{t("acceptableUse.item1")}</li>
          <li>{t("acceptableUse.item2")}</li>
          <li>{t("acceptableUse.item3")}</li>
          <li>{t("acceptableUse.item4")}</li>
        </ul>
      </LegalSection>

      <LegalSection num={5} title={t("ip.title")}>
        <p>{t("ip.body")}</p>
        <p className="mt-3">{t("ip.userContent")}</p>
      </LegalSection>

      <LegalSection num={6} title={t("disclaimer.title")}>
        <p>{t("disclaimer.body")}</p>
      </LegalSection>

      <LegalSection num={7} title={t("liability.title")}>
        <p>{t("liability.body")}</p>
      </LegalSection>

      <LegalSection num={8} title={t("termination.title")}>
        <p>{t("termination.body")}</p>
      </LegalSection>

      <LegalSection num={9} title={t("law.title")}>
        <p>{t("law.body")}</p>
      </LegalSection>

      <LegalSection num={10} title={t("changes.title")}>
        <p>{t("changes.body")}</p>
      </LegalSection>

      <LegalSection num={11} title={t("contact.title")}>
        <p>{t("contact.body")}</p>
      </LegalSection>
    </LegalLayout>
  );
}

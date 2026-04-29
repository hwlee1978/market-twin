import { getTranslations, setRequestLocale } from "next-intl/server";
import { LegalLayout, LegalSection } from "@/components/legal/LegalLayout";

export default async function PrivacyPolicyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("legal.privacy");

  return (
    <LegalLayout title={t("title")} lastUpdated={t("lastUpdated")}>
      <p className="mb-6 text-slate-700 leading-[1.75] text-justify">
        {t("intro")}
      </p>

      <LegalSection num={1} title={t("collect.title")}>
        <p>{t("collect.body")}</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>{t("collect.item1")}</li>
          <li>{t("collect.item2")}</li>
          <li>{t("collect.item3")}</li>
          <li>{t("collect.item4")}</li>
        </ul>
      </LegalSection>

      <LegalSection num={2} title={t("use.title")}>
        <p>{t("use.body")}</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>{t("use.item1")}</li>
          <li>{t("use.item2")}</li>
          <li>{t("use.item3")}</li>
          <li>{t("use.item4")}</li>
        </ul>
      </LegalSection>

      <LegalSection num={3} title={t("share.title")}>
        <p>{t("share.body")}</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <strong>Supabase</strong> — {t("share.supabase")}
          </li>
          <li>
            <strong>Vercel</strong> — {t("share.vercel")}
          </li>
          <li>
            <strong>Anthropic / OpenAI / Google</strong> — {t("share.llm")}
          </li>
          <li>
            <strong>Resend</strong> — {t("share.resend")}
          </li>
        </ul>
      </LegalSection>

      <LegalSection num={4} title={t("retention.title")}>
        <p>{t("retention.body")}</p>
      </LegalSection>

      <LegalSection num={5} title={t("rights.title")}>
        <p>{t("rights.body")}</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>{t("rights.item1")}</li>
          <li>{t("rights.item2")}</li>
          <li>{t("rights.item3")}</li>
          <li>{t("rights.item4")}</li>
        </ul>
      </LegalSection>

      <LegalSection num={6} title={t("cookies.title")}>
        <p>{t("cookies.body")}</p>
      </LegalSection>

      <LegalSection num={7} title={t("changes.title")}>
        <p>{t("changes.body")}</p>
      </LegalSection>

      <LegalSection num={8} title={t("contact.title")}>
        <p>{t("contact.body")}</p>
      </LegalSection>
    </LegalLayout>
  );
}

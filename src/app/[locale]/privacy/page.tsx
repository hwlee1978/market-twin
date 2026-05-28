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
            <strong>Anthropic / OpenAI / Google / DeepSeek</strong> — {t("share.llm")}
          </li>
          <li>
            <strong>Resend</strong> — {t("share.resend")}
          </li>
        </ul>
      </LegalSection>

      <LegalSection num={4} title={t("aiProcessing.title")}>
        <p>{t("aiProcessing.body")}</p>

        <h4 className="font-semibold text-slate-800 mt-4 mb-2">
          {t("aiProcessing.inputsTitle")}
        </h4>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>{t("aiProcessing.input1")}</li>
          <li>{t("aiProcessing.input2")}</li>
          <li>{t("aiProcessing.input3")}</li>
        </ul>

        <h4 className="font-semibold text-slate-800 mt-4 mb-2">
          {t("aiProcessing.purposeTitle")}
        </h4>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>{t("aiProcessing.purpose1")}</li>
          <li>{t("aiProcessing.purpose2")}</li>
        </ul>

        <h4 className="font-semibold text-slate-800 mt-4 mb-2">
          {t("aiProcessing.providersTitle")}
        </h4>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>{t("aiProcessing.provider1")}</li>
          <li>{t("aiProcessing.provider2")}</li>
          <li>{t("aiProcessing.provider3")}</li>
          <li>{t("aiProcessing.provider4")}</li>
          <li>{t("aiProcessing.provider5")}</li>
        </ul>

        <h4 className="font-semibold text-slate-800 mt-4 mb-2">
          {t("aiProcessing.optoutTitle")}
        </h4>
        <p>{t("aiProcessing.optoutBody")}</p>

        <h4 className="font-semibold text-slate-800 mt-4 mb-2">
          {t("aiProcessing.decisionTitle")}
        </h4>
        <p>{t("aiProcessing.decisionBody")}</p>
      </LegalSection>

      <LegalSection num={5} title={t("crossBorder.title")}>
        <p>{t("crossBorder.body")}</p>
        <div className="overflow-x-auto mt-4">
          <table className="w-full text-xs border border-slate-200 border-collapse">
            <thead className="bg-slate-50">
              <tr>
                <th className="border border-slate-200 px-2 py-2 text-left font-semibold">
                  {t("crossBorder.tableHeaderRecipient")}
                </th>
                <th className="border border-slate-200 px-2 py-2 text-left font-semibold">
                  {t("crossBorder.tableHeaderCountry")}
                </th>
                <th className="border border-slate-200 px-2 py-2 text-left font-semibold">
                  {t("crossBorder.tableHeaderItems")}
                </th>
                <th className="border border-slate-200 px-2 py-2 text-left font-semibold">
                  {t("crossBorder.tableHeaderPurpose")}
                </th>
                <th className="border border-slate-200 px-2 py-2 text-left font-semibold">
                  {t("crossBorder.tableHeaderRetention")}
                </th>
              </tr>
            </thead>
            <tbody>
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <tr key={i}>
                  <td className="border border-slate-200 px-2 py-2 align-top">
                    {t(`crossBorder.row${i}Recipient`)}
                  </td>
                  <td className="border border-slate-200 px-2 py-2 align-top">
                    {t(`crossBorder.row${i}Country`)}
                  </td>
                  <td className="border border-slate-200 px-2 py-2 align-top">
                    {t(`crossBorder.row${i}Items`)}
                  </td>
                  <td className="border border-slate-200 px-2 py-2 align-top">
                    {t(`crossBorder.row${i}Purpose`)}
                  </td>
                  <td className="border border-slate-200 px-2 py-2 align-top">
                    {t(`crossBorder.row${i}Retention`)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs text-slate-600">{t("crossBorder.method")}</p>
        <p className="mt-2 text-xs text-slate-600">
          {t("crossBorder.refusalNote")}
        </p>
      </LegalSection>

      <LegalSection num={6} title={t("retention.title")}>
        <p>{t("retention.body")}</p>
      </LegalSection>

      <LegalSection num={7} title={t("rights.title")}>
        <p>{t("rights.body")}</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>{t("rights.item1")}</li>
          <li>{t("rights.item2")}</li>
          <li>{t("rights.item3")}</li>
          <li>{t("rights.item4")}</li>
        </ul>
      </LegalSection>

      <LegalSection num={8} title={t("cookies.title")}>
        <p>{t("cookies.body")}</p>
      </LegalSection>

      <LegalSection num={9} title={t("changes.title")}>
        <p>{t("changes.body")}</p>
      </LegalSection>

      <LegalSection num={10} title={t("dpo.title")}>
        <p>{t("dpo.body")}</p>
        <ul className="list-none pl-0 space-y-1.5 mt-3">
          <li>{t("dpo.name")}</li>
          <li>{t("dpo.role")}</li>
          <li>{t("dpo.email")}</li>
          <li>{t("dpo.phoneNote")}</li>
          <li>{t("dpo.department")}</li>
        </ul>
        <h4 className="font-semibold text-slate-800 mt-4 mb-2">
          {t("dpo.remedyTitle")}
        </h4>
        <p className="text-xs">{t("dpo.remedyBody")}</p>
      </LegalSection>

      <LegalSection num={11} title={t("contact.title")}>
        <p>{t("contact.body")}</p>
      </LegalSection>
    </LegalLayout>
  );
}

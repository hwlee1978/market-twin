import { getTranslations, setRequestLocale } from "next-intl/server";
import { Radio } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { DispatchChannelsPanel } from "@/components/mrai/DispatchChannelsPanel";
import { MarketingChannelsPanel } from "@/components/mrai/MarketingChannelsPanel";

export const dynamic = "force-dynamic";

/**
 * 채널 탭 — 마케팅 채널 + 페르소나 채널.
 *
 * (개별 채널 상세는 /mr-ai/channels/[id] — 별도 dynamic route.)
 */
export default async function MrAIChannelsTab({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const safeLocale: "ko" | "en" = locale === "en" ? "en" : "ko";
  const t = await getTranslations("mrai.tabs");

  return (
    <div className="px-6 py-6 max-w-[1400px] mx-auto space-y-6">
      <PageHeader
        title={t("channelsTitle")}
        subtitle={t("channelsSubtitle")}
        icon={Radio}
        iconTone="emerald"
      />
      <MarketingChannelsPanel />
      <DispatchChannelsPanel locale={safeLocale} />
    </div>
  );
}

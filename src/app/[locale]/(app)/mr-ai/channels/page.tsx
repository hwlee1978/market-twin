import { setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { ChannelsPanel } from "@/components/mrai/ChannelsPanel";
import { MarketingChannelsPanel } from "@/components/mrai/MarketingChannelsPanel";

export const dynamic = "force-dynamic";

/**
 * 채널 탭 — 마케팅 채널 + 추가 / 페르소나 채널.
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

  return (
    <div className="px-6 py-6 max-w-[1400px] mx-auto space-y-6">
      <PageHeader
        title="채널"
        subtitle="마케팅 채널 관리 (X · Instagram · TikTok · 네이버 블로그 등)."
      />
      <MarketingChannelsPanel />
      <ChannelsPanel locale={safeLocale} />
    </div>
  );
}

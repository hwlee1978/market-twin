import { setRequestLocale } from "next-intl/server";

export const dynamic = "force-dynamic";

/**
 * 채널 탭 — 마케팅 채널 목록 + 추가.
 * 다음 commit에서 MarketingChannelsPanel 이전 예정.
 *
 * (기존 /mr-ai/channels/[id] 는 그대로 채널 상세 페이지)
 */
export default async function MrAIChannelsTab({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <div className="px-6 py-6 max-w-[1400px] mx-auto">
      <h1 className="text-xl font-bold text-slate-900 mb-2">채널</h1>
      <p className="text-sm text-slate-500">
        마케팅 채널 관리 (X · Instagram · TikTok · 네이버 블로그 등).
        다음 commit에서 이전 예정.
      </p>
    </div>
  );
}

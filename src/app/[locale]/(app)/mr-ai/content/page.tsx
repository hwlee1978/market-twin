import { setRequestLocale } from "next-intl/server";

export const dynamic = "force-dynamic";

/**
 * 콘텐츠 탭 — 드래프트 목록 + 캘린더 + 가상 피드.
 * 다음 commit에서 ContentDraftsPanel + 캘린더 링크 + VirtualSpaceFeed 이전 예정.
 */
export default async function MrAIContentTab({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <div className="px-6 py-6 max-w-[1400px] mx-auto">
      <h1 className="text-xl font-bold text-slate-900 mb-2">콘텐츠</h1>
      <p className="text-sm text-slate-500">
        드래프트 생성 · 캘린더 · 가상 피드. 다음 commit에서 이전 예정.
      </p>
    </div>
  );
}

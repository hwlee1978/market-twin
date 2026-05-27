import { setRequestLocale } from "next-intl/server";

export const dynamic = "force-dynamic";

/**
 * 분석 탭 — LLM 가시성 감사 + 추세.
 * 다음 commit에서 LLMVisibilityPanel + LLMVisibilityHistoryPanel 이전 예정.
 */
export default async function MrAIAnalyticsTab({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <div className="px-6 py-6 max-w-[1400px] mx-auto">
      <h1 className="text-xl font-bold text-slate-900 mb-2">분석</h1>
      <p className="text-sm text-slate-500">
        LLM 답변엔진 가시성 감사 + KPI 추세.
        다음 commit에서 이전 예정.
      </p>
    </div>
  );
}

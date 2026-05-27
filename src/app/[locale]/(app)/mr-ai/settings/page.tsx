import { setRequestLocale } from "next-intl/server";

export const dynamic = "force-dynamic";

/**
 * 설정 탭 — 온보딩 / 통합 / 이미지 생성 / 프리셋.
 * 다음 commit에서 OnboardingPanel + IntegrationsPanel + ImageGenSettingsPanel
 * + PresetsPanel 이전 예정.
 */
export default async function MrAISettingsTab({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <div className="px-6 py-6 max-w-[1400px] mx-auto">
      <h1 className="text-xl font-bold text-slate-900 mb-2">설정</h1>
      <p className="text-sm text-slate-500">
        온보딩 · 외부 통합 · 이미지 생성 옵션 · 프리셋.
        다음 commit에서 이전 예정.
      </p>
    </div>
  );
}

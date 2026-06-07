import { getTranslations, setRequestLocale } from "next-intl/server";
import { Settings as SettingsIcon } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { getOnboardingState } from "@/lib/mrai/onboarding";
import { OnboardingPanel } from "@/components/mrai/OnboardingPanel";
import { IntegrationsPanel } from "@/components/mrai/IntegrationsPanel";
import { ImageGenSettingsPanel } from "@/components/mrai/ImageGenSettingsPanel";
import { PresetsPanel } from "@/components/mrai/PresetsPanel";

export const dynamic = "force-dynamic";

/**
 * 설정 탭 — 온보딩 / 외부 통합 / 이미지 생성 / 프리셋.
 * Mr. AI 전반 환경 설정을 한곳에 모은 페이지.
 */
export default async function MrAISettingsTab({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    hubspot?: string;
    linkedin?: string;
    x?: string;
    detail?: string;
  }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const safeLocale: "ko" | "en" = locale === "en" ? "en" : "ko";
  const t = await getTranslations("mrai.tabs");

  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) return null;

  const onboarding = await getOnboardingState(ctx.workspaceId);

  // Any of the OAuth callbacks (hubspot / linkedin / x) bounce back here
  // with a {provider}=ok|error flash param.
  const flashStatus = sp.hubspot ?? sp.linkedin ?? sp.x;
  const integrationFlash =
    flashStatus === "ok"
      ? { kind: "ok" as const }
      : flashStatus === "error"
      ? { kind: "error" as const, detail: sp.detail }
      : null;

  return (
    <div className="px-6 py-6 max-w-[1400px] mx-auto space-y-6">
      <PageHeader
        title={t("settingsTitle")}
        subtitle={t("settingsSubtitle")}
        icon={SettingsIcon}
        iconTone="slate"
      />
      <OnboardingPanel initialState={onboarding} />
      <IntegrationsPanel initialFlash={integrationFlash} locale={safeLocale} />
      <ImageGenSettingsPanel />
      <PresetsPanel />
    </div>
  );
}

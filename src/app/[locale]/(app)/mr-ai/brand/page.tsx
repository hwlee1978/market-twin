import { getTranslations, setRequestLocale } from "next-intl/server";
import { Palette } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { BrandAssetsPanel } from "@/components/mrai/BrandAssetsPanel";
import { BrandSEOPanel } from "@/components/mrai/BrandSEOPanel";
import { CrawlSourcesPanel } from "@/components/mrai/CrawlSourcesPanel";

export const dynamic = "force-dynamic";

/**
 * 브랜드 탭 — 브랜드 자산 / SEO / 자동 크롤.
 * 브랜드 정체성을 정의하고 자동 수집되는 정보를 관리하는 곳.
 *
 * ProductProfilePanel(Vision-extracted spec)은 일단 숨김 — 컴포넌트는
 * 유지하되 콘텐츠 생성 quality에 spec 오인이 잦아지면 재활성.
 */
export default async function MrAIBrandTab({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("mrai.tabs");

  return (
    <div className="px-6 py-6 max-w-[1400px] mx-auto space-y-6">
      <PageHeader
        title={t("brandTitle")}
        subtitle={t("brandSubtitle")}
        icon={Palette}
        iconTone="rose"
      />
      <BrandAssetsPanel />
      <BrandSEOPanel />
      <CrawlSourcesPanel />
    </div>
  );
}

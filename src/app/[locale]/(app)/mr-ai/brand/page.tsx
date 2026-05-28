import { getTranslations, setRequestLocale } from "next-intl/server";
import { Palette } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { BrandAssetsPanel } from "@/components/mrai/BrandAssetsPanel";
import { BrandSEOPanel } from "@/components/mrai/BrandSEOPanel";
import { CrawlSourcesPanel } from "@/components/mrai/CrawlSourcesPanel";
import { ProductProfilePanel } from "@/components/mrai/ProductProfilePanel";

export const dynamic = "force-dynamic";

/**
 * 브랜드 탭 — 브랜드 자산 / 제품 프로필 / SEO / 자동 크롤.
 * 브랜드 정체성을 정의하고 자동 수집되는 정보를 관리하는 곳.
 *
 * ProductProfilePanel: 한때 콘텐츠 생성 quality 이슈로 숨겼지만, 카테고리
 * 직접 설정(PATCH /product-profile)이 추가되면서 크롤 소스 프리셋·SEO 추천
 * 게이트 역할이 되어 다시 노출. SaaS·디지털 워크스페이스는 사진이 없어
 * Vision 경로 대신 manual 카테고리 선택을 사용한다.
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
      <ProductProfilePanel />
      <BrandSEOPanel />
      <CrawlSourcesPanel />
    </div>
  );
}

import { setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { BrandAssetsPanel } from "@/components/mrai/BrandAssetsPanel";
import { ProductProfilePanel } from "@/components/mrai/ProductProfilePanel";
import { BrandSEOPanel } from "@/components/mrai/BrandSEOPanel";
import { CrawlSourcesPanel } from "@/components/mrai/CrawlSourcesPanel";

export const dynamic = "force-dynamic";

/**
 * 브랜드 탭 — 브랜드 자산 / 제품 프로필 / SEO / 자동 크롤.
 * 브랜드 정체성을 정의하고 자동 수집되는 정보를 관리하는 곳.
 */
export default async function MrAIBrandTab({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="px-6 py-6 max-w-[1400px] mx-auto space-y-6">
      <PageHeader
        title="브랜드"
        subtitle="브랜드 자산 라이브러리 · 제품 프로필 · SEO 키워드 · 자동 크롤 소스."
      />
      <BrandAssetsPanel />
      <ProductProfilePanel />
      <BrandSEOPanel />
      <CrawlSourcesPanel />
    </div>
  );
}

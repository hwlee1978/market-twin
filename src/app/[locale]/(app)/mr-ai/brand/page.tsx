import { setRequestLocale } from "next-intl/server";

export const dynamic = "force-dynamic";

/**
 * 브랜드 탭 — 브랜드 자산 · 제품 프로필 · SEO · 자동 크롤.
 * 다음 commit에서 BrandAssetsPanel + ProductProfilePanel + BrandSEOPanel +
 * CrawlSourcesPanel 이전 예정.
 */
export default async function MrAIBrandTab({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <div className="px-6 py-6 max-w-[1400px] mx-auto">
      <h1 className="text-xl font-bold text-slate-900 mb-2">브랜드</h1>
      <p className="text-sm text-slate-500">
        브랜드 자산 라이브러리 · 제품 프로필 · SEO 키워드 · 자동 크롤 소스.
        다음 commit에서 이전 예정.
      </p>
    </div>
  );
}

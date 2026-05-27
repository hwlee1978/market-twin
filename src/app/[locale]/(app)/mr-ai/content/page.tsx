import { getTranslations, setRequestLocale } from "next-intl/server";
import { PenSquare } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { ContentPanel } from "@/components/mrai/ContentPanel";

export const dynamic = "force-dynamic";

/**
 * 콘텐츠 탭 — 콘텐츠 브리프 + 캘린더 링크.
 *
 * (각 채널의 콘텐츠 드래프트 / 가상 피드는 채널 상세 페이지에 있음.
 *  여기는 브리프 / 전략 / 캘린더 진입점.)
 */
export default async function MrAIContentTab({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const safeLocale: "ko" | "en" = locale === "en" ? "en" : "ko";
  const t = await getTranslations("mrai.tabs");

  return (
    <div className="px-6 py-6 max-w-[1400px] mx-auto space-y-6">
      <PageHeader
        title={t("contentTitle")}
        subtitle={t("contentSubtitle")}
        icon={PenSquare}
        iconTone="amber"
        actions={
          <a
            href={`/${safeLocale}/mr-ai/calendar`}
            className="inline-flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-800 font-medium px-3 py-1.5 rounded-md border border-indigo-200 bg-indigo-50"
          >
            {safeLocale === "ko" ? "콘텐츠 캘린더 →" : "Content calendar →"}
          </a>
        }
      />
      <ContentPanel locale={safeLocale} />
    </div>
  );
}

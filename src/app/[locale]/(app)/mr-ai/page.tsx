import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { loadWorkspaceMemories } from "@/lib/mrai/memory";
import { listConversations } from "@/lib/mrai/chat";
import { loadLatestBriefing } from "@/lib/mrai/briefing";
import { MrAIChat } from "@/components/mrai/MrAIChat";
import { BriefingPanel } from "@/components/mrai/BriefingPanel";

export const dynamic = "force-dynamic";

/**
 * Mr. AI — 대시보드 탭.
 *
 * 첫 화면은 가벼운 진입점: 오늘의 브리핑 + 메인 채팅.
 * 세부 기능은 콘텐츠 / 채널 / 브랜드 / 분석 / 설정 탭으로 분리됨.
 */
export default async function MrAIPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("mrai");

  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) return null;

  const safeLocale: "ko" | "en" = locale === "en" ? "en" : "ko";

  const [memories, conversations, latestBriefing] = await Promise.all([
    loadWorkspaceMemories(ctx.workspaceId),
    listConversations(ctx.workspaceId),
    loadLatestBriefing(ctx.workspaceId),
  ]);

  return (
    <div className="px-6 pt-6 pb-10 max-w-[1400px] mx-auto space-y-6">
      <PageHeader title={t("pageTitle")} subtitle={t("pageSubtitle")} />
      <BriefingPanel initialBriefing={latestBriefing} locale={safeLocale} />
      <MrAIChat
        initialMemories={memories}
        initialConversations={conversations}
        locale={safeLocale}
      />
    </div>
  );
}

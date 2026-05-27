import { getTranslations, setRequestLocale } from "next-intl/server";

import { LayoutDashboard } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { loadWorkspaceMemories } from "@/lib/mrai/memory";
import { listConversations } from "@/lib/mrai/chat";
import { loadLatestBriefing } from "@/lib/mrai/briefing";
import { loadDashboardKPIs } from "@/lib/mrai/dashboard-kpis";
import { MrAIChat } from "@/components/mrai/MrAIChat";
import { BriefingPanel } from "@/components/mrai/BriefingPanel";
import { DashboardKPIStrip } from "@/components/mrai/DashboardKPIStrip";

export const dynamic = "force-dynamic";

/**
 * Mr. AI — 대시보드 탭.
 *
 * 첫 화면 = 가벼운 진입점:
 *   KPI strip (가시성·채널·브리프·기억) → 오늘의 브리핑 → 메인 채팅.
 * 세부 기능은 콘텐츠 / 채널 / 브랜드 / 분석 / 설정 탭으로 분리됨.
 */
export default async function MrAIPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const tTabs = await getTranslations("mrai.tabs");

  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) return null;

  const safeLocale: "ko" | "en" = locale === "en" ? "en" : "ko";

  const [memories, conversations, latestBriefing, kpis] = await Promise.all([
    loadWorkspaceMemories(ctx.workspaceId),
    listConversations(ctx.workspaceId),
    loadLatestBriefing(ctx.workspaceId),
    loadDashboardKPIs(ctx.workspaceId),
  ]);

  return (
    <div className="px-6 pt-6 pb-10 max-w-[1400px] mx-auto space-y-6">
      <PageHeader
        title={tTabs("dashboardTitle")}
        subtitle={tTabs("dashboardSubtitle")}
        icon={LayoutDashboard}
        iconTone="violet"
      />
      <DashboardKPIStrip kpis={kpis} locale={safeLocale} />
      <BriefingPanel initialBriefing={latestBriefing} locale={safeLocale} />
      <MrAIChat
        initialMemories={memories}
        initialConversations={conversations}
        locale={safeLocale}
      />
    </div>
  );
}

import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { loadWorkspaceMemories } from "@/lib/mrai/memory";
import { listConversations } from "@/lib/mrai/chat";
import { loadLatestBriefing } from "@/lib/mrai/briefing";
import { MrAIChat } from "@/components/mrai/MrAIChat";
import { BriefingPanel } from "@/components/mrai/BriefingPanel";
import { IntegrationsPanel } from "@/components/mrai/IntegrationsPanel";

export const dynamic = "force-dynamic";

/**
 * Mr. AI — W1-3 Foundation: persistent memory + daily briefing.
 *
 * Server component loads initial memories + thread list + latest briefing
 * so the client doesn't see a flash of empty state on first paint.
 * Locale is forwarded to children so chat + briefing operate in the
 * user's UI language.
 */
export default async function MrAIPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ hubspot?: string; detail?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
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

  const integrationFlash =
    sp.hubspot === "ok"
      ? { kind: "ok" as const }
      : sp.hubspot === "error"
      ? { kind: "error" as const, detail: sp.detail }
      : null;

  return (
    <div className="px-6 pt-6 pb-10 max-w-[1400px] mx-auto space-y-6">
      <PageHeader title={t("pageTitle")} subtitle={t("pageSubtitle")} />
      <IntegrationsPanel initialFlash={integrationFlash} locale={safeLocale} />
      <BriefingPanel initialBriefing={latestBriefing} locale={safeLocale} />
      <MrAIChat
        initialMemories={memories}
        initialConversations={conversations}
        locale={safeLocale}
      />
    </div>
  );
}

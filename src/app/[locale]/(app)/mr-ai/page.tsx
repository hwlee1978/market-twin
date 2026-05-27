import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { loadWorkspaceMemories } from "@/lib/mrai/memory";
import { listConversations } from "@/lib/mrai/chat";
import { loadLatestBriefing } from "@/lib/mrai/briefing";
import { getOnboardingState } from "@/lib/mrai/onboarding";
import { MrAIChat } from "@/components/mrai/MrAIChat";
import { BriefingPanel } from "@/components/mrai/BriefingPanel";
import { IntegrationsPanel } from "@/components/mrai/IntegrationsPanel";
import { ChannelsPanel } from "@/components/mrai/ChannelsPanel";
import { ContentPanel } from "@/components/mrai/ContentPanel";
import { MarketingChannelsPanel } from "@/components/mrai/MarketingChannelsPanel";
import { BrandAssetsPanel } from "@/components/mrai/BrandAssetsPanel";
import { LLMVisibilityPanel } from "@/components/mrai/LLMVisibilityPanel";
import { LLMVisibilityHistoryPanel } from "@/components/mrai/LLMVisibilityHistoryPanel";
import { CrawlSourcesPanel } from "@/components/mrai/CrawlSourcesPanel";
import { ImageGenSettingsPanel } from "@/components/mrai/ImageGenSettingsPanel";
import { ProductProfilePanel } from "@/components/mrai/ProductProfilePanel";
import { BrandSEOPanel } from "@/components/mrai/BrandSEOPanel";
import { OnboardingPanel } from "@/components/mrai/OnboardingPanel";
import { PresetsPanel } from "@/components/mrai/PresetsPanel";

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

  const [memories, conversations, latestBriefing, onboarding] = await Promise.all([
    loadWorkspaceMemories(ctx.workspaceId),
    listConversations(ctx.workspaceId),
    loadLatestBriefing(ctx.workspaceId),
    getOnboardingState(ctx.workspaceId),
  ]);

  // Look up workspace name + first channel's market_country to seed
  // the LLM-SEO visibility panel with sensible defaults.
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const [wsRow, chRow] = await Promise.all([
    supabase
      .from("workspaces")
      .select("name")
      .eq("id", ctx.workspaceId)
      .maybeSingle<{ name: string }>(),
    supabase
      .from("mrai_marketing_channels")
      .select("market_country")
      .eq("workspace_id", ctx.workspaceId)
      .not("market_country", "is", null)
      .limit(1)
      .maybeSingle<{ market_country: string }>(),
  ]);
  const workspaceName = wsRow.data?.name ?? "";
  const defaultMarket = chRow.data?.market_country ?? null;
  // Pull a category hint from the first memory mentioning a product/category
  const categoryHint =
    memories.find((m) =>
      /category|카테고리|sneaker|스니커즈|울|wool|merino|메리노/i.test(m.body),
    )?.body.slice(0, 100) ?? "";

  const integrationFlash =
    sp.hubspot === "ok"
      ? { kind: "ok" as const }
      : sp.hubspot === "error"
      ? { kind: "error" as const, detail: sp.detail }
      : null;

  return (
    <div className="px-6 pt-6 pb-10 max-w-[1400px] mx-auto space-y-6">
      <PageHeader title={t("pageTitle")} subtitle={t("pageSubtitle")} />
      <OnboardingPanel initialState={onboarding} />
      <IntegrationsPanel initialFlash={integrationFlash} locale={safeLocale} />
      <ChannelsPanel locale={safeLocale} />
      <div className="flex justify-end">
        <a
          href={`/${safeLocale}/mr-ai/calendar`}
          className="inline-flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
        >
          📅 콘텐츠 캘린더 보기 →
        </a>
      </div>
      <MarketingChannelsPanel />
      <BrandAssetsPanel />
      <ProductProfilePanel />
      <ImageGenSettingsPanel />
      <CrawlSourcesPanel />
      <BrandSEOPanel />
      <LLMVisibilityPanel
        defaultBrand={workspaceName}
        defaultCategory={categoryHint}
        defaultMarket={defaultMarket}
      />
      <LLMVisibilityHistoryPanel />
      <PresetsPanel />
      <ContentPanel locale={safeLocale} />
      <BriefingPanel initialBriefing={latestBriefing} locale={safeLocale} />
      <MrAIChat
        initialMemories={memories}
        initialConversations={conversations}
        locale={safeLocale}
      />
    </div>
  );
}

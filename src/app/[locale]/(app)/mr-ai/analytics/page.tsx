import { getTranslations, setRequestLocale } from "next-intl/server";
import { TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { loadWorkspaceMemories } from "@/lib/mrai/memory";
import { LLMVisibilityPanel } from "@/components/mrai/LLMVisibilityPanel";
import { LLMVisibilityHistoryPanel } from "@/components/mrai/LLMVisibilityHistoryPanel";

export const dynamic = "force-dynamic";

/**
 * 분석 탭 — LLM 답변엔진 가시성 감사 + KPI 추세.
 * 답변엔진 시대의 새 SEO 지표가 한곳에.
 */
export default async function MrAIAnalyticsTab({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("mrai.tabs");

  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) return null;

  // Seed defaults for the visibility panel from workspace name + first
  // channel's market + a category hint from memories.
  const memories = await loadWorkspaceMemories(ctx.workspaceId);
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
  const categoryHint =
    memories.find((m) =>
      /category|카테고리|sneaker|스니커즈|울|wool|merino|메리노/i.test(m.body),
    )?.body.slice(0, 100) ?? "";

  return (
    <div className="px-6 py-6 max-w-[1400px] mx-auto space-y-6">
      <PageHeader
        title={t("analyticsTitle")}
        subtitle={t("analyticsSubtitle")}
        icon={TrendingUp}
        iconTone="violet"
      />
      <LLMVisibilityPanel
        defaultBrand={workspaceName}
        defaultCategory={categoryHint}
        defaultMarket={defaultMarket}
      />
      <LLMVisibilityHistoryPanel />
    </div>
  );
}

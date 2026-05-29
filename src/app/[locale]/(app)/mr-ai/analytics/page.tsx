import { getTranslations, setRequestLocale } from "next-intl/server";
import { TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { loadWorkspaceMemories } from "@/lib/mrai/memory";
import { LLMVisibilityPanel } from "@/components/mrai/LLMVisibilityPanel";
import { LLMVisibilityHistoryPanel } from "@/components/mrai/LLMVisibilityHistoryPanel";
import { BrandSEOPanel } from "@/components/mrai/BrandSEOPanel";
import { SEOPerformancePanel } from "@/components/mrai/SEOPerformancePanel";

export const dynamic = "force-dynamic";

/**
 * 분석 탭 — LLM 답변엔진 가시성 (지금 측정 가능) + 전통 SEO 자산 현황
 * (등록·인증 baseline) + GSC/GA4 실데이터 수집(v0.2 예정).
 *
 * categoryHint: 워크스페이스 메모리에서 카테고리 정보가 들어 있을 만한
 * 첫 항목 body를 가져와 LLM 가시성 감사의 default category 시드로 사용.
 * 키워드는 generic 만 (category·카테고리) — 특정 브랜드 어휘 매칭은
 * 멀티테넌트 audit에서 제거됨.
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
    memories.find((m) => /category|카테고리/i.test(m.body))?.body.slice(0, 100) ?? "";

  return (
    <div className="px-6 py-6 max-w-[1400px] mx-auto space-y-6">
      <PageHeader
        title={t("analyticsTitle")}
        subtitle={t("analyticsSubtitle")}
        icon={TrendingUp}
        iconTone="violet"
      />

      {/* ── 1. LLM 답변엔진 가시성 — 답변엔진 시대의 새 SEO ── */}
      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
          <span className="inline-block w-1 h-4 bg-violet-500 rounded" />
          1. LLM 답변엔진 가시성
        </h3>
        <div className="space-y-4">
          <LLMVisibilityPanel
            defaultBrand={workspaceName}
            defaultCategory={categoryHint}
            defaultMarket={defaultMarket}
          />
          <LLMVisibilityHistoryPanel />
        </div>
      </div>

      {/* ── 2. 전통 SEO — 구글 실데이터 (GSC + GA4) + 네이버는 v0.2 ── */}
      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
          <span className="inline-block w-1 h-4 bg-emerald-500 rounded" />
          2. 전통 SEO (구글·네이버)
        </h3>
        <div className="space-y-4">
          <SEOPerformancePanel />
          <BrandSEOPanel />
        </div>
      </div>
    </div>
  );
}

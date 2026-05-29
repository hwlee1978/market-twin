import { getTranslations, setRequestLocale } from "next-intl/server";
import { TrendingUp, Search, Clock } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { loadWorkspaceMemories } from "@/lib/mrai/memory";
import { LLMVisibilityPanel } from "@/components/mrai/LLMVisibilityPanel";
import { LLMVisibilityHistoryPanel } from "@/components/mrai/LLMVisibilityHistoryPanel";
import { BrandSEOPanel } from "@/components/mrai/BrandSEOPanel";

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

      {/* ── 2. 전통 SEO — 자산 baseline + GSC/GA4 데이터(v0.2 예정) ── */}
      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
          <span className="inline-block w-1 h-4 bg-emerald-500 rounded" />
          2. 전통 SEO (구글·네이버)
        </h3>
        <div className="space-y-4">
          {/* SEO 성과 데이터 수집은 v0.2 — 일단 baseline 안내 */}
          <div className="rounded-xl border border-slate-200 bg-gradient-to-br from-emerald-50/50 to-sky-50/50 px-5 py-4">
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-9 h-9 rounded-lg bg-white border border-emerald-200 flex items-center justify-center">
                <Search className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                  GSC · GA4 · 네이버 서치어드바이저 성과 추세
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 bg-amber-100 border border-amber-200 px-1.5 py-0.5 rounded">
                    <Clock className="w-3 h-3" /> v0.2 예정
                  </span>
                </h4>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  클릭·노출·평균 순위·CTR을 사이트별 / 키워드별로 자동 수집해 추세 그래프로
                  보여줍니다. 지금은 우선 아래에서 자사 사이트를 등록하고 GSC·GA4·네이버
                  인증을 완료하면 v0.2 출시 즉시 과거 데이터부터 수집됩니다.
                </p>
              </div>
            </div>
          </div>
          <BrandSEOPanel />
        </div>
      </div>
    </div>
  );
}

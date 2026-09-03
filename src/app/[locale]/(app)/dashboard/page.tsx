import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import {
  Plus,
  Compass,
  BarChart3,
  Globe2,
  FileText,
  Sparkles,
  Users,
  AlertTriangle,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { DemoCard } from "@/components/onboarding/DemoCard";
import { DashboardGuideButton } from "@/components/onboarding/DashboardGuideButton";
import { createClient } from "@/lib/supabase/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { getCountryLabel } from "@/lib/countries";
import { formatPrice } from "@/lib/format/price";
import type { EnsembleAggregate } from "@/lib/simulation/ensemble";
import { SectionTitle } from "@/components/dashboard/SectionTitle";
import { KpiTiles } from "@/components/dashboard/KpiTiles";
import { HighlightHero } from "@/components/dashboard/HighlightHero";
import { AttractivenessGauge } from "@/components/dashboard/AttractivenessGauge";
import { MarketRanking, type MarketRankingRow } from "@/components/dashboard/MarketRanking";
import { SuccessFactors, type FactorRow } from "@/components/dashboard/SuccessFactors";
import {
  TargetAudience,
  type AudienceSegment,
  type ArchetypeCard,
} from "@/components/dashboard/TargetAudience";
import { PricingCard } from "@/components/dashboard/PricingCard";
import { RiskRadar, type RiskRow } from "@/components/dashboard/RiskRadar";
import {
  EnsembleConsensus,
  type ProviderLegendRow,
} from "@/components/dashboard/EnsembleConsensus";
import { RecentProjectsCards, type RecentProjectRow } from "@/components/dashboard/RecentProjectsCards";
import { formatRelativeTime } from "@/components/dashboard/relativeTime";
import { DashboardCopilot } from "@/components/dashboard/DashboardCopilot";
import { PlanUsageCard, type PlanUsageMeter } from "@/components/dashboard/PlanUsageCard";
import { getSubscription, getMonthlyUsage } from "@/lib/billing/usage";

type LatestEnsembleRow = {
  id: string;
  project_id: string;
  aggregate_result: EnsembleAggregate | null;
  completed_at: string | null;
  projects: { id: string; name: string; product_name: string; currency: string | null } | null;
};

function providerDisplayName(provider: string): string {
  const key = provider.toLowerCase();
  if (key === "anthropic") return "Claude";
  if (key === "openai") return "GPT";
  if (key === "gemini" || key === "google") return "Gemini";
  if (key === "deepseek") return "DeepSeek";
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

const PROVIDER_COLOR: Record<string, string> = {
  anthropic: "#7c3aed",
  openai: "#10b981",
  gemini: "#2563eb",
  google: "#2563eb",
  deepseek: "#f59e0b",
};

const AUDIENCE_SEGMENT_PALETTE = [
  { from: "#7c3aed", to: "#a855f7", text: "#7c3aed" },
  { from: "#2563eb", to: "#60a5fa", text: "#2563eb" },
  { from: "#0d9c72", to: "#34d399", text: "#10b981" },
  { from: "#d97706", to: "#fbbf24", text: "#f59e0b" },
];

const ARCHETYPE_ORDER: ArchetypeCard["id"][] = ["champion", "curious", "conditional", "skeptic", "walker"];
const ARCHETYPE_COLOR: Record<ArchetypeCard["id"], string> = {
  champion: "#10b981",
  curious: "#06b6d4",
  conditional: "#f59e0b",
  skeptic: "#f43f5e",
  walker: "#94a3b8",
};

const FACTOR_KEYS: FactorRow["key"][] = [
  "marketSize",
  "culturalFit",
  "channelMatch",
  "priceCompat",
  "competition",
  "regulatory",
];

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const isKo = locale === "ko";
  const t = await getTranslations();
  const ctx = await getOrCreatePrimaryWorkspace();
  if (!ctx) return null;

  const supabase = await createClient();
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  // Parallel fan-out — these queries don't depend on each other, so
  // doing them sequentially was costing ~N× the wall time. Promise.all keeps
  // them in flight together and lets the slowest one set the page latency.
  // Subscription first: getMonthlyUsage needs the resolved plan to know where
  // the billing month starts, so it can't join the fan-out below.
  const subscription = await getSubscription(ctx.workspaceId);

  const [projectsRes, completedSimsRes, monthlyReportsRes, latestEnsembleRes, monthlyUsage] =
    await Promise.all([
    supabase
      .from("projects")
      .select("id, name, product_name, category, status, candidate_countries, updated_at")
      .eq("workspace_id", ctx.workspaceId)
      .order("updated_at", { ascending: false })
      .limit(8),
    supabase
      .from("simulations")
      .select("id, success_score")
      .eq("workspace_id", ctx.workspaceId)
      .eq("status", "completed")
      .not("success_score", "is", null)
      .limit(50),
    supabase
      .from("reports")
      .select("*", { count: "exact", head: true })
      .eq("workspace_id", ctx.workspaceId)
      .gte("created_at", monthStart.toISOString()),
    supabase
      .from("ensembles")
      .select(
        "id, project_id, aggregate_result, completed_at, projects:projects(id, name, product_name, currency)",
      )
      .eq("workspace_id", ctx.workspaceId)
      .eq("status", "completed")
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    getMonthlyUsage(ctx.workspaceId, subscription),
  ]);

  const projects = projectsRes.data;
  const completedSims = completedSimsRes.data;
  const monthlyReports = monthlyReportsRes.count;
  const latestEnsemble = latestEnsembleRes.data as unknown as LatestEnsembleRow | null;

  const successScores = (completedSims ?? [])
    .map((s) => (s as { success_score: number | null }).success_score)
    .filter((n): n is number => typeof n === "number");
  const avgScore = successScores.length
    ? Math.round(successScores.reduce((a, b) => a + b, 0) / successScores.length)
    : 0;

  const countriesTested = new Set(
    (projects ?? []).flatMap((p) => p.candidate_countries ?? []),
  ).size;

  const hasProjects = !!projects && projects.length > 0;

  // Personalize greeting from email — use the local-part before "@" so it reads
  // naturally without exposing the full address in the headline.
  const greetingName = (ctx.email ?? "").split("@")[0] || "";

  // ── Latest-ensemble aggregate → dashboard insight sections ──
  // This whole block stays defensive: aggregate_result is jsonb and every
  // sub-field on EnsembleAggregate is optional, so nothing here may crash
  // when a field is absent — it just produces null/empty and the caller
  // omits the corresponding section below.
  const aggregate = latestEnsemble?.aggregate_result ?? null;

  let ensembleAvgSuccess: number | null = null;
  if (latestEnsemble) {
    const { data: ensSimsData } = await supabase
      .from("simulations")
      .select("success_score")
      .eq("ensemble_id", latestEnsemble.id)
      .not("success_score", "is", null);
    const scores = (ensSimsData ?? [])
      .map((s) => (s as { success_score: number | null }).success_score)
      .filter((n): n is number => typeof n === "number");
    if (scores.length > 0) {
      ensembleAvgSuccess = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    }
  }

  const recommendation = aggregate?.recommendation ?? null;
  const recommendedCode = recommendation?.country ?? null;
  const recommendedLabel = recommendedCode ? getCountryLabel(recommendedCode, locale) : "";

  const countryStatsSorted = aggregate?.countryStats
    ? [...aggregate.countryStats].sort(
        (a, b) => (b.finalScore?.mean ?? 0) - (a.finalScore?.mean ?? 0),
      )
    : [];

  const recommendedStats = recommendedCode
    ? (countryStatsSorted.find((c) => c.country.toUpperCase() === recommendedCode.toUpperCase()) ?? null)
    : null;

  const attractivenessScore =
    recommendedStats?.finalScore?.mean != null ? recommendedStats.finalScore.mean / 10 : null;

  const secondaryRec = recommendation?.secondary ?? null;
  const secondaryGaugeData = secondaryRec
    ? {
        countryCode: secondaryRec.country,
        countryLabel: getCountryLabel(secondaryRec.country, locale),
        score: secondaryRec.meanScore / 10,
        gap: secondaryRec.gapToPrimary / 10,
      }
    : null;

  const successProbability =
    ensembleAvgSuccess ??
    (recommendedStats?.finalScore?.mean != null ? Math.round(recommendedStats.finalScore.mean) : null);

  const riskLevel = aggregate?.narrative?.overallRiskLevel ?? null;
  const consensusPercent = recommendation?.consensusPercent ?? null;
  const confidence = recommendation?.confidence ?? null;

  const providerBreakdown = aggregate?.providerBreakdown ?? null;
  const providerLegendRows: ProviderLegendRow[] = (providerBreakdown ?? []).map((p) => {
    const top = p.bestCountryDistribution[0];
    return {
      name: providerDisplayName(p.provider),
      color: PROVIDER_COLOR[p.provider.toLowerCase()] ?? "#64748b",
      simCount: p.simCount,
      topCountryLabel: top ? getCountryLabel(top.country, locale) : null,
      topPercent: top ? top.percent : null,
    };
  });
  const providerNamesForHero = Array.from(
    new Set((providerBreakdown ?? []).map((p) => providerDisplayName(p.provider))),
  );

  const rankingRows: MarketRankingRow[] = countryStatsSorted.slice(0, 6).map((c) => ({
    code: c.country,
    label: getCountryLabel(c.country, locale),
    score: c.finalScore?.mean ?? 0,
  }));

  const factorRows: FactorRow[] = recommendedStats?.components
    ? FACTOR_KEYS.map((key) => ({
        key,
        value: recommendedStats.components![key]?.mean ?? 0,
      }))
    : [];

  const personasAgg = aggregate?.personas ?? null;
  const totalPersonas = personasAgg?.total ?? null;
  const audienceSegments: AudienceSegment[] = (personasAgg?.segmentBreakdown?.byAge ?? [])
    .slice()
    .sort((a, b) => b.count - a.count)
    .slice(0, 4)
    .map((row, i) => {
      const palette = AUDIENCE_SEGMENT_PALETTE[i % AUDIENCE_SEGMENT_PALETTE.length];
      return {
        label: row.bucket,
        sharePct: totalPersonas ? (row.count / totalPersonas) * 100 : 0,
        from: palette.from,
        to: palette.to,
        textColor: palette.text,
      };
    });

  const archetypesRaw = personasAgg?.archetypes ?? [];
  const archetypeCards: ArchetypeCard[] = ARCHETYPE_ORDER.map((id) =>
    archetypesRaw.find((a) => a.id === id),
  )
    .filter((a): a is NonNullable<typeof a> => !!a)
    .slice(0, 4)
    .map((a) => ({
      id: a.id,
      sharePct: a.share * 100,
      quote: a.representativeQuote?.text ?? null,
      dotColor: ARCHETYPE_COLOR[a.id],
    }));

  const pricingAgg = aggregate?.pricing ?? null;
  const currency = latestEnsemble?.projects?.currency ?? "USD";
  let pricingCardProps: {
    recommendedLabel: string;
    lowLabel: string;
    highLabel: string;
    markerPct: number;
    marginPct: number | null;
  } | null = null;
  if (pricingAgg) {
    const low = pricingAgg.range?.minCents ?? pricingAgg.recommendedPriceP25;
    const high = pricingAgg.range?.maxCents ?? pricingAgg.recommendedPriceP75;
    const rec = pricingAgg.recommendedPriceCents;
    const span = high - low;
    const markerPct = span > 0 ? ((rec - low) / span) * 100 : 50;
    const recommendedLabel =
      pricingAgg.recommendedPriceP25 === pricingAgg.recommendedPriceP75
        ? formatPrice(pricingAgg.recommendedPriceP25, currency)
        : `${formatPrice(pricingAgg.recommendedPriceP25, currency)} – ${formatPrice(pricingAgg.recommendedPriceP75, currency)}`;
    pricingCardProps = {
      recommendedLabel,
      lowLabel: formatPrice(low, currency),
      highLabel: formatPrice(high, currency),
      markerPct,
      marginPct: pricingAgg.marginEstimatePct ?? null,
    };
  }

  const mergedRisks = aggregate?.narrative?.mergedRisks ?? [];
  const severityRank: Record<"low" | "medium" | "high", number> = { high: 2, medium: 1, low: 0 };
  const riskRows: RiskRow[] = [...mergedRisks]
    .sort((a, b) => severityRank[b.severity] - severityRank[a.severity] || b.surfacedInSims - a.surfacedInSims)
    .slice(0, 3)
    .map((r) => ({
      factor: r.factor,
      description: r.description,
      severity: r.severity,
      surfacedInSims: r.surfacedInSims,
      simCount: aggregate?.simCount ?? 0,
      scopeLabel:
        r.scope === "cross-market"
          ? isKo
            ? "전 시장 공통"
            : "Market-wide"
          : (r.affectedCountries?.length ?? 0) > 0
            ? r.affectedCountries!.map((c) => getCountryLabel(c, locale)).join(", ")
            : null,
    }));

  const showInsightSections = !!(aggregate && recommendedCode && recommendedStats);
  const showRankingSection = rankingRows.length > 0 || factorRows.length > 0;
  const showAudienceSection = audienceSegments.length > 0 || archetypeCards.length > 0 || !!pricingCardProps;
  const showRiskSection = riskRows.length > 0 || providerLegendRows.length > 0;

  const recentProjects: RecentProjectRow[] = hasProjects
    ? projects.map((p) => ({
        id: p.id,
        name: p.name,
        productName: p.product_name,
        status: p.status,
        statusLabel: t(`project.status.${p.status}`),
        category: (p as { category: string | null }).category ?? null,
        countryCodes: (p.candidate_countries ?? []).slice(0, 4),
        updatedAt: p.updated_at,
        ensembleInfo:
          latestEnsemble && latestEnsemble.project_id === p.id && recommendedCode
            ? {
                countryLabel: recommendedLabel,
                score: successProbability,
                confidence,
              }
            : null,
      }))
    : [];

  // ── Plan + quota summary ───────────────────────────────────────────────
  // During the free trial the sim quota is the trial grant, not the plan's
  // monthly allowance — the same rule the billing page applies, kept here
  // rather than re-derived so the two screens can't disagree.
  const planLimits = subscription.plan.limits;
  const trialActive = subscription.trialActive;

  const planMeters: PlanUsageMeter[] = [
    {
      label: trialActive ? t("dashboard.plan.trialSims") : t("dashboard.plan.sims"),
      used: trialActive ? subscription.trialSimsUsed : monthlyUsage.simsUsed,
      limit: trialActive ? subscription.trialSimsLimit : planLimits.simsPerMonth,
      color: "#2563eb",
    },
  ];
  if (planLimits.decisionPlusSimsPerMonth > 0) {
    planMeters.push({
      label: t("dashboard.plan.decisionPlus"),
      used: monthlyUsage.decisionPlusSimsUsed,
      limit: planLimits.decisionPlusSimsPerMonth,
      color: "#7c3aed",
    });
  }
  if (subscription.plan.features.multiLLM && planLimits.deepSimsPerMonth !== 0) {
    planMeters.push({
      label: t("dashboard.plan.deep"),
      used: monthlyUsage.deepSimsUsed,
      limit: planLimits.deepSimsPerMonth,
      color: "#0d9c72",
    });
  }
  planMeters.push({
    label: t("dashboard.plan.chat"),
    used: monthlyUsage.chatMessagesUsed,
    limit: planLimits.chatMessagesPerMonth,
    color: "#d97706",
  });

  const planStatus: { label: string; tone: "neutral" | "warn" | "risk" } | null =
    subscription.status === "past_due"
      ? { label: t("dashboard.plan.statusPastDue"), tone: "risk" }
      : subscription.status === "canceled"
        ? { label: t("dashboard.plan.statusCanceled"), tone: "warn" }
        : trialActive
          ? { label: t("dashboard.plan.statusTrial"), tone: "warn" }
          : null;

  const periodEnd = subscription.currentPeriodEnd ?? subscription.trialEndsAt;
  const planResetLabel = periodEnd
    ? t("dashboard.plan.resetsOn", {
        date: new Date(periodEnd).toLocaleDateString(locale),
      })
    : null;

  return (
    <>
      {hasProjects ? (
        <PageHeader
          title={t("dashboard.title")}
          subtitle={t("dashboard.subtitleReturning")}
          actions={
            <div className="flex items-center gap-2">
              <DashboardGuideButton
                isKo={locale === "ko"}
                hasProjects
                demoToken={process.env.NEXT_PUBLIC_DEMO_SHARE_TOKEN}
              />
              <Link href="/projects/new" className="btn-primary">
                <Plus size={16} />
                {t("dashboard.newProject")}
              </Link>
            </div>
          }
        />
      ) : (
        <PageHeader
          title={
            greetingName
              ? t("dashboard.welcomeNamed", { name: greetingName })
              : t("dashboard.welcome")
          }
          subtitle={t("dashboard.subtitleNew")}
          actions={
            <DashboardGuideButton
              isKo={locale === "ko"}
              hasProjects={false}
              demoToken={process.env.NEXT_PUBLIC_DEMO_SHARE_TOKEN}
            />
          }
        />
      )}

      <PlanUsageCard
        title={t("dashboard.plan.title")}
        planName={subscription.plan.name}
        statusLabel={planStatus?.label ?? null}
        statusTone={planStatus?.tone ?? "neutral"}
        meters={planMeters}
        resetLabel={planResetLabel}
        manageLabel={t("dashboard.plan.manage")}
      />

      {!hasProjects ? (
        <>
          <DemoCard />
          <TrackingPreview />
        </>
      ) : (
        <>
          <KpiTiles
            locale={locale}
            activeProjects={projects.filter((p) => p.status !== "archived").length}
            avgScore={avgScore || null}
            countriesTested={countriesTested}
            monthlyReports={monthlyReports ?? 0}
          />

          {showInsightSections && recommendedStats && (
            <>
              <SectionTitle
                icon={Sparkles}
                gradient="linear-gradient(135deg,#1e4d8f,#06b6d4)"
                title={isKo ? "최근 결과 하이라이트" : "Recent result highlight"}
              />
              <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-4">
                <HighlightHero
                  locale={locale}
                  productName={latestEnsemble?.projects?.product_name ?? latestEnsemble?.projects?.name ?? ""}
                  countryCode={recommendedCode!}
                  countryLabel={recommendedLabel}
                  simCount={aggregate?.simCount ?? 0}
                  countryCount={aggregate?.countryStats?.length ?? 0}
                  providerNames={providerNamesForHero}
                  successProbability={successProbability}
                  riskLevel={riskLevel}
                  consensusPercent={consensusPercent}
                  confidence={confidence ?? null}
                  updatedAgoLabel={formatRelativeTime(latestEnsemble?.completed_at, locale)}
                />
                <AttractivenessGauge
                  locale={locale}
                  countryLabel={recommendedLabel}
                  score={attractivenessScore}
                  secondary={secondaryGaugeData}
                />
              </div>
            </>
          )}

          {showInsightSections && showRankingSection && (
            <>
              <SectionTitle
                icon={BarChart3}
                gradient="linear-gradient(135deg,#0d9c72,#10b981)"
                title={isKo ? "시장 비교 & 성공 요인" : "Market comparison & success factors"}
              />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {rankingRows.length > 0 && <MarketRanking locale={locale} rows={rankingRows} />}
                {factorRows.length > 0 && (
                  <SuccessFactors locale={locale} countryLabel={recommendedLabel} factors={factorRows} />
                )}
              </div>
            </>
          )}

          {showInsightSections && showAudienceSection && (
            <>
              <SectionTitle
                icon={Users}
                gradient="linear-gradient(135deg,#7c3aed,#a855f7)"
                title={isKo ? "타깃 오디언스 & 가격 전략" : "Target audience & pricing strategy"}
              />
              <div className="grid grid-cols-1 lg:grid-cols-[1.35fr_1fr] gap-4">
                {(audienceSegments.length > 0 || archetypeCards.length > 0) && (
                  <TargetAudience
                    locale={locale}
                    totalPersonas={totalPersonas}
                    segments={audienceSegments}
                    archetypes={archetypeCards}
                  />
                )}
                {pricingCardProps && <PricingCard locale={locale} {...pricingCardProps} />}
              </div>
            </>
          )}

          {showInsightSections && showRiskSection && (
            <>
              <SectionTitle
                icon={AlertTriangle}
                gradient="linear-gradient(135deg,#e11d48,#f43f5e)"
                title={isKo ? "리스크 & AI 앙상블 합의" : "Risk & AI ensemble consensus"}
              />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {riskRows.length > 0 && (
                  <RiskRadar locale={locale} overallLevel={riskLevel} risks={riskRows} />
                )}
                {providerLegendRows.length > 0 && (
                  <EnsembleConsensus
                    locale={locale}
                    consensusPercent={consensusPercent}
                    countryLabel={recommendedLabel}
                    providers={providerLegendRows}
                    confidence={confidence ?? null}
                  />
                )}
              </div>
            </>
          )}

          <SectionTitle
            icon={FileText}
            gradient="linear-gradient(135deg,#0891b2,#06b6d4)"
            title={t("dashboard.recentProjects")}
          />
          <RecentProjectsCards locale={locale} projects={recentProjects} totalCount={projects.length} />

          {/* Keep the sample demo reachable even after the user has real
              projects — it's capped 3/day and useful for re-checking how
              results look. Compact so it doesn't dominate the dashboard. */}
          <DemoCard compact />

          {/* Scoped market-entry copilot (floating). Reuses the Mr.AI chat
              backend but exposes only a focused strategy Q&A drawer. */}
          <DashboardCopilot
            locale={locale}
            recommendedMarket={recommendedLabel || null}
            productName={latestEnsemble?.projects?.product_name ?? null}
          />
        </>
      )}
    </>
  );
}

/**
 * Replaces the row of empty 0/0/0/— KPIs new users used to see. Instead it
 * tells them WHAT will get tracked here once they run a simulation, which
 * frames the empty dashboard as a feature roadmap rather than a void.
 */
async function TrackingPreview() {
  const t = await getTranslations("dashboard.tracking");
  const items = [
    { icon: BarChart3, key: "successScore" as const },
    { icon: Globe2, key: "countries" as const },
    { icon: FileText, key: "reports" as const },
    { icon: Compass, key: "actions" as const },
  ];
  return (
    <div className="card p-6">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-4">
        {t("title")}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {items.map((it) => (
          <div key={it.key} className="flex items-start gap-3">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-brand-50 text-brand shrink-0">
              <it.icon size={16} />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-medium text-slate-900">
                {t(`${it.key}.title`)}
              </div>
              <div className="mt-0.5 text-xs text-slate-500 leading-relaxed">
                {t(`${it.key}.description`)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

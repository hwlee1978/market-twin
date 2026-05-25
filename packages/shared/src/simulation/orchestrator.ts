/**
 * Ensemble orchestration — pre-fetch grounding, run all sims through a
 * provider-grouped worker pool with cost-cap circuit breaker, aggregate +
 * persist results, fire the completion email.
 *
 * Extracted from `app/api/projects/[id]/run-ensemble/route.ts`'s `after()`
 * callback so it can run from either:
 *   - the Vercel route (legacy / fallback path), or
 *   - the Cloud Run worker (target path that escapes Vercel's 800s
 *     function-duration cap).
 *
 * Both call sites pass the same `OrchestrationContext`. Vercel constructs
 * it inline from request data; the worker reconstructs it from a single
 * ensembleId via `loadOrchestrationContext()`.
 */

import { createServiceClient } from "@/lib/supabase/admin";
import { runSimulation } from "@/lib/simulation/runner";
import type { ProjectInput, CountryScore } from "@/lib/simulation/schemas";
import { prefetchInlineAssets } from "@/lib/llm/asset-fetch";
import {
  buildCategoryTrendQuery,
  buildCategoryTrendQueryNative,
  buildMarginBenchmarkQuery,
  tavilySearch,
  type TavilyResult,
} from "@/lib/market-research/tavily";
import {
  buildCategoryTrendQuerySonar,
  sonarSearch,
} from "@/lib/market-research/sonar";
import {
  extractCompetitorPrices,
  type CompetitorPriceResult,
} from "@/lib/simulation/competitor-prices";
import {
  aggregateEnsemble,
  type EnsembleSimSnapshot,
} from "@/lib/simulation/ensemble";
import { mergeNarrative } from "@/lib/simulation/ensemble-narrative";
import { buildMarketProfile } from "@/lib/simulation/market-profile";
import { notifyEnsembleComplete } from "@/lib/email/notify";

/* ────────────────────────────────── tier presets ─── */

export const TIER_PRESETS = {
  // 2026-05-20: Hypothesis tier upgraded from "1 sim × 200 personas × anthropic
  // only" to "3 sims × 100 personas × 3 providers" so it has enough cross-LLM
  // signal for the Top-2 dominance check (which needs ≥2 providers to detect
  // crossLLMAgree, and needs ≥2 sims for voteShare granularity). 300 personas
  // total is still 1/4 of Decision (1200) and 1/16 of Deep (5000). Designed
  // as the recommended FIRST PASS before committing $25+ to Decision/Deep —
  // hypothesis verdict tells you whether the product has clear top-1 dominance
  // (proceed to Decision for narrative depth) or borderline top-2 cluster
  // (refine product description or accept cluster recommendation here).
  hypothesis: {
    parallelSims: 3,
    // 200 personas per sim matches other tiers — keeps per-country sample
    // density consistent (~20 personas / candidate country at 10 candidates),
    // which Top-2 dominance check needs for stable mean / std estimates.
    // Total 600 personas across 3 sims is 1/2 of Decision (1200) and 1/8
    // of Deep (5000). Cost with prompt caching: ~$3-5 per ensemble.
    perSimPersonas: 200,
    llmProviders: ["anthropic", "openai", "deepseek"] as const,
    marketProfile: false,
  },
  decision: {
    parallelSims: 6,
    perSimPersonas: 200,
    // Multi-LLM round-robin neutralizes single-provider bias surfaced by
    // benchmark v1 (defect #9, 2026-05-16): Anthropic-only decision tier
    // produced STRONG-but-wrong CN/VN picks on 3/6 K-product fixtures.
    // 6 sims across 3 providers → 2 each by index round-robin. Different
    // model priors cancel at aggregation. Bumped from 5→6 so the split is
    // even rather than 2-2-1 (cheap insurance against single-provider tie-
    // breakers when one provider's 2 sims happen to spike the same wrong
    // country).
    llmProviders: ["anthropic", "openai", "deepseek"] as const,
    marketProfile: true,
  },
  decision_plus: {
    parallelSims: 15,
    perSimPersonas: 200,
    llmProviders: ["anthropic", "openai", "deepseek"] as const,
    marketProfile: true,
  },
  deep: {
    parallelSims: 25,
    perSimPersonas: 200,
    llmProviders: ["anthropic", "openai", "deepseek"] as const,
    marketProfile: true,
  },
  deep_pro: {
    parallelSims: 50,
    perSimPersonas: 200,
    llmProviders: ["anthropic", "openai", "gemini"] as const,
    marketProfile: true,
  },
} as const;

export type Tier = keyof typeof TIER_PRESETS;
export type ProviderName =
  | "anthropic"
  | "openai"
  | "gemini"
  | "xai"
  | "deepseek";

/**
 * Per-tier cost budget in cents — kill switch for runaway ensembles.
 * Set to 3× expected unit-economics cost. See route.ts for history.
 */
const TIER_BUDGET_CENTS: Record<Tier, number> = {
  hypothesis: 900,
  // Decision bumped from 4200→5400 to cover the extra sim (5→6) + the
  // mix of provider rates after multi-LLM rollout (defect #9 fix). Still
  // ~3× expected unit-economics cost — kill switch room preserved.
  decision: 5400,
  decision_plus: 8100,
  deep: 9300,
  deep_pro: 18600,
};

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

const PROVIDER_SIM_CONCURRENCY: Record<ProviderName, number> = {
  anthropic: envInt("LLM_ANTHROPIC_SIM_CONCURRENCY", 12),
  openai: envInt("LLM_OPENAI_SIM_CONCURRENCY", 12),
  gemini: envInt("LLM_GEMINI_SIM_CONCURRENCY", 4),
  xai: envInt("LLM_XAI_SIM_CONCURRENCY", 12),
  deepseek: envInt("LLM_DEEPSEEK_SIM_CONCURRENCY", 12),
};

/* ────────────────────────────────── public types ─── */

export interface OrchestrationSimRow {
  id: string;
  index: number;
  provider: ProviderName;
}

export interface OrchestrationContext {
  ensembleId: string;
  productName: string;
  workspaceId: string;
  projectId: string;
  projectInput: ProjectInput;
  locale: "ko" | "en";
  tier: Tier;
  notifyEmail: string | null;
  simRows: OrchestrationSimRow[];
}

/* ────────────────────────────────── main entry ─── */

/**
 * Runs the full ensemble pipeline. Idempotent on the input ensemble row —
 * if a previous attempt half-completed, the aggregator picks up whatever
 * sims persisted before the crash and aggregates from there.
 *
 * Errors are caught + persisted to the ensemble row so callers (Vercel
 * route, Cloud Run worker) don't need their own error handling beyond
 * "log + return". The status flips: running → completed | failed.
 */
export async function runEnsembleOrchestration(
  ctx: OrchestrationContext,
): Promise<void> {
  const admin = createServiceClient();
  const { ensembleId, projectInput, locale, tier, simRows } = ctx;
  const preset = TIER_PRESETS[tier];

  /* ── 1. Pre-fetch grounding ── */

  const inlineAssets =
    projectInput.assetUrls.length > 0
      ? await prefetchInlineAssets(
          projectInput.assetUrls,
          `ensemble ${ensembleId}`,
        )
      : [];

  let trendSnippets: TavilyResult[] = [];
  let marginSnippets: TavilyResult[] = [];
  // UN Comtrade trade-flow anchor — Phase E Week 4-5 (2026-05-16).
  // Pre-fetched once per ensemble; same block passed to every sim's
  // country-scoring stage so all 6/25 sims see identical trade evidence.
  // Best-effort: empty string when API down or category lacks HSCode
  // mapping, in which case sims revert to pre-anchor behavior.
  let tradeAnchorBlock = "";
  try {
    const { buildComtradeAnchor } = await import("@/lib/market-research/comtrade");
    const { block } = await buildComtradeAnchor(
      projectInput.category,
      projectInput.candidateCountries,
      { apiKey: process.env.COMTRADE_API_KEY, locale },
    );
    tradeAnchorBlock = block;
    if (block) {
      console.log(
        `[ensemble ${ensembleId}] Comtrade anchor: ${block.split("\n").length} lines, ${(block.length / 100).toFixed(0)}×100 chars`,
      );
    } else {
      console.log(`[ensemble ${ensembleId}] Comtrade anchor: empty (no data or unsupported category)`);
    }
  } catch (err) {
    console.warn(`[ensemble ${ensembleId}] Comtrade anchor build failed: ${(err as Error).message}`);
  }

  // Phase F.0-2 (2026-05-17): World Bank macro indicators prefetch.
  let worldBankBlock = "";
  try {
    const { buildWorldBankAnchor } = await import("@/lib/market-research/world-bank");
    const { block, rows } = await buildWorldBankAnchor(
      projectInput.candidateCountries,
      locale,
    );
    worldBankBlock = block;
    if (block) {
      console.log(`[ensemble ${ensembleId}] World Bank anchor: ${rows.length} countries`);
    } else {
      console.log(`[ensemble ${ensembleId}] World Bank anchor: empty`);
    }
  } catch (err) {
    console.warn(`[ensemble ${ensembleId}] World Bank anchor build failed: ${(err as Error).message}`);
  }

  // Phase F.1-1 (2026-05-17): 관세청 trade statistics — appended to
  // Comtrade block since they confirm each other (same underlying data,
  // different aggregation granularity).
  try {
    const { buildKoreaCustomsAnchor } = await import("@/lib/market-research/korea-customs");
    const { hsCodesForCategory } = await import("@/lib/market-research/comtrade");
    const hsCodes = hsCodesForCategory(projectInput.category);
    if (hsCodes.length > 0) {
      const { block, rows } = await buildKoreaCustomsAnchor(
        projectInput.category,
        projectInput.candidateCountries,
        hsCodes,
        { locale },
      );
      if (block) {
        console.log(`[ensemble ${ensembleId}] Korea Customs anchor: ${rows.length} rows`);
        tradeAnchorBlock = tradeAnchorBlock ? `${tradeAnchorBlock}\n\n${block}` : block;
      } else {
        console.log(`[ensemble ${ensembleId}] Korea Customs anchor: empty`);
      }
    }
  } catch (err) {
    console.warn(`[ensemble ${ensembleId}] Korea Customs anchor build failed: ${(err as Error).message}`);
  }

  // Phase F.1-A + F.1-B (2026-05-17): DART scale + brand region revenue.
  try {
    const { buildDartFullAnchor, inferSlugFromProductName } = await import("@/lib/market-research/dart");
    const slug = inferSlugFromProductName(projectInput.productName);
    if (slug) {
      const { block, financials, region, autoRegion, narrative } = await buildDartFullAnchor(
        slug,
        projectInput.candidateCountries,
        { locale },
      );
      if (block) {
        const rev = financials?.revenueKrw ?? 0;
        const regionCount = region?.regions?.length ?? 0;
        const autoTag = autoRegion ? ` + auto-region ${autoRegion.rows.length}` : "";
        const narrativeTag = narrative ? ` + narrative ${narrative.countries.length}` : "";
        console.log(
          `[ensemble ${ensembleId}] DART anchor: ${financials?.corpNameKo ?? slug} (${(rev / 1e12).toFixed(2)}T KRW + ${regionCount} manual regions${autoTag}${narrativeTag})`,
        );
        tradeAnchorBlock = tradeAnchorBlock ? `${tradeAnchorBlock}\n\n${block}` : block;
      }
    }
  } catch (err) {
    console.warn(`[ensemble ${ensembleId}] DART anchor build failed: ${(err as Error).message}`);
  }

  // Phase F.3 (2026-05-18): MFDS narrow regulatory anchor (sunscreen only).
  // Activates only when fixture has a brand-ingredients.json entry with
  // uvFilters list — currently BoJ Relief Sun. Skips otherwise (empty block).
  // Why narrow: MFDS reg has 7,257 internationally-regulated ingredients;
  // safe skincare actives (Centella, snail mucin, niacinamide) aren't there,
  // so this anchor only adds value for sunscreens where ingredient × country
  // restrictions are dramatic (Korean-developed UV filters lack US FDA approval).
  try {
    const { buildMfdsAnchor } = await import("@/lib/market-research/mfds");
    const { inferSlugFromProductName } = await import("@/lib/market-research/dart");
    const slug = inferSlugFromProductName(projectInput.productName);
    if (slug) {
      const { block, result } = buildMfdsAnchor(slug, { locale });
      if (block && result) {
        console.log(
          `[ensemble ${ensembleId}] MFDS anchor: ${slug} — ${result.matched.length} matched, ${result.unmatchedIngredients.length} not-in-list`,
        );
        tradeAnchorBlock = tradeAnchorBlock ? `${tradeAnchorBlock}\n\n${block}` : block;
      }
    }
  } catch (err) {
    console.warn(`[ensemble ${ensembleId}] MFDS anchor build failed: ${(err as Error).message}`);
  }

  // Phase F.1-C (2026-05-17): KOTRA per-country Korean-companies anchor.
  // Names Korean parent companies already operating in each candidate market —
  // direct brand-presence signal that closes the Phase F.0 gap where sims
  // missed Binggrae VN (own subsidiary) and KGC CN (duty-free service).
  //
  // KOTRA_ANCHOR_ENABLED=false disables this anchor. Used for A/B diagnostic
  // when v8 (n=10) measurement revealed confident_wrong on buldak/jinro
  // (non-US-top fixtures) suggesting US-heavy KOTRA registry was over-
  // weighting the US prior. Default ON.
  if (process.env.KOTRA_ANCHOR_ENABLED === "false") {
    console.log(`[ensemble ${ensembleId}] KOTRA anchor: disabled via KOTRA_ANCHOR_ENABLED=false`);
  } else try {
    const { buildKotraNationalAnchor } = await import("@/lib/market-research/kotra");
    const keywords = [projectInput.category, projectInput.productName].filter(
      (s): s is string => typeof s === "string" && s.length > 0,
    );
    const { block, bundles, skipped } = await buildKotraNationalAnchor(
      projectInput.candidateCountries,
      // Cap 3 per country (v2 2026-05-18) to balance per-country weight after
      // v8a diagnostic showed US-heavy KOTRA registry was amplifying US-prior
      // on non-US-top fixtures (jinro JP regressed -22pt under v1 cap=5).
      // category opt-in (v3 2026-05-18) auto-disables KOTRA for K-Food /
      // K-Alcohol where US-heavy bias hurt rather than helped.
      { categoryKeywords: keywords, locale, maxPerCountry: 3, category: projectInput.category },
    );
    if (skipped === "category") {
      console.log(`[ensemble ${ensembleId}] KOTRA anchor: skipped (category=${projectInput.category})`);
    } else if (block) {
      const totalComps = bundles.reduce((n, b) => n + b.koreanCompanies.length, 0);
      console.log(
        `[ensemble ${ensembleId}] KOTRA anchor: ${bundles.length}/${projectInput.candidateCountries.length} countries (${totalComps} Korean companies)`,
      );
      tradeAnchorBlock = tradeAnchorBlock ? `${tradeAnchorBlock}\n\n${block}` : block;
    } else {
      console.log(`[ensemble ${ensembleId}] KOTRA anchor: empty`);
    }
  } catch (err) {
    console.warn(`[ensemble ${ensembleId}] KOTRA anchor build failed: ${(err as Error).message}`);
  }
  // Run grounding when EITHER provider key is set — Sonar Pro alone is
  // a valid grounding source even without Tavily (cheaper-fallback
  // scenario), and we want the trend block to fire if any signal is
  // available. The per-call functions (tavilySearch, sonarSearch) each
  // gracefully return null when their own key is missing.
  if (process.env.TAVILY_API_KEY || process.env.PERPLEXITY_API_KEY) {
    // English trend query always runs. For non-English originating
    // countries (K-product launches: KR / JP / CN / TW / HK origin),
    // a parallel native-language query also runs — pulls 조선비즈 /
    // 매경 / 한경 / Nikkei / Sina Finance IR articles that publish
    // export growth news in the native language before (or instead
    // of) English coverage.
    const trendNativeQuery = buildCategoryTrendQueryNative({
      category: projectInput.category,
      productName: projectInput.productName,
      originatingCountry: projectInput.originatingCountry,
    });
    const trendSonarQuery = buildCategoryTrendQuerySonar({
      category: projectInput.category,
      productName: projectInput.productName,
    });
    const [trendResult, trendNativeResult, trendSonarResult] = await Promise.all([
      tavilySearch({
        query: buildCategoryTrendQuery({
          category: projectInput.category,
          productName: projectInput.productName,
        }),
        searchDepth: "advanced",
        maxResults: 5,
        includeAnswer: false,
      }),
      trendNativeQuery
        ? tavilySearch({
            query: trendNativeQuery,
            searchDepth: "advanced",
            maxResults: 5,
            includeAnswer: false,
          })
        : Promise.resolve(null),
      // Sonar Pro is best-effort and skipped when PERPLEXITY_API_KEY is
      // unset — sonarSearch returns null and the merge just sees an
      // empty third slot. Same Promise.all shape as the Tavily calls
      // so total latency = max(t_en, t_native, t_sonar) instead of sum.
      sonarSearch({ query: trendSonarQuery, model: "sonar-pro" }),
    ]);
    const enTrendSnippets = trendResult?.results ?? [];
    const nativeTrendSnippets = trendNativeResult?.results ?? [];
    const sonarTrendSnippets = trendSonarResult?.results ?? [];
    const seenTrendUrls = new Set(enTrendSnippets.map((r) => r.url));
    const nativeUniqueTrend = nativeTrendSnippets.filter(
      (r) => !seenTrendUrls.has(r.url),
    );
    nativeUniqueTrend.forEach((r) => seenTrendUrls.add(r.url));
    const sonarUniqueTrend = sonarTrendSnippets.filter(
      (r) => !seenTrendUrls.has(r.url),
    );
    trendSnippets = [...enTrendSnippets, ...nativeUniqueTrend, ...sonarUniqueTrend];
    if (trendSnippets.length > 0) {
      console.log(
        `[ensemble ${ensembleId}] trend grounding: ${enTrendSnippets.length}EN + ${nativeUniqueTrend.length}native + ${sonarUniqueTrend.length}sonar = ${trendSnippets.length} for ${projectInput.category}`,
      );
    }

    const marginResult = await tavilySearch({
      query: buildMarginBenchmarkQuery({
        category: projectInput.category,
        country: projectInput.originatingCountry,
        productName: projectInput.productName,
      }),
      searchDepth: "advanced",
      maxResults: 5,
      includeAnswer: false,
    });
    marginSnippets = marginResult?.results ?? [];
    if (marginSnippets.length > 0) {
      console.log(
        `[ensemble ${ensembleId}] tavily margin: ${marginSnippets.length} snippets for ${projectInput.category}`,
      );
    }
  }

  let competitorPrices: CompetitorPriceResult[] = [];
  if (projectInput.competitorUrls.length > 0) {
    try {
      competitorPrices = await extractCompetitorPrices({
        urls: projectInput.competitorUrls,
        productCategory: projectInput.category,
        targetCurrency: projectInput.currency,
        locale: locale === "ko" ? "ko" : "en",
      });
      const ok = competitorPrices.filter((r) => r.status === "extracted");
      console.log(
        `[ensemble ${ensembleId}] competitor prices: ${ok.length}/${competitorPrices.length} extracted` +
          (ok.length > 0
            ? ` — ${ok.map((r) => `${r.productName ?? "?"}=${r.priceCents}`).join(" / ")}`
            : ""),
      );
    } catch (err) {
      console.warn(
        `[ensemble ${ensembleId}] competitor extraction failed:`,
        err,
      );
    }
  }

  /* ── 2. Run sims with provider-grouped worker pool + cost cap ── */

  const groups = new Map<ProviderName, OrchestrationSimRow[]>();
  for (const row of simRows) {
    const arr = groups.get(row.provider) ?? [];
    arr.push(row);
    groups.set(row.provider, arr);
  }

  const tierBudgetCents = TIER_BUDGET_CENTS[tier] ?? 9300;
  const costCircuit = { tripped: false, total: 0 };

  const runOne = async (sim: OrchestrationSimRow) => {
    try {
      await runSimulation({
        simulationId: sim.id,
        projectInput,
        personaCount: preset.perSimPersonas,
        locale,
        seedOverride: `${ensembleId}-${sim.index}`,
        provider: sim.provider,
        inlineAssets,
        trendSnippets,
        marginSnippets,
        competitorPrices,
        tradeAnchorBlock,
        worldBankBlock,
      });
    } catch (err) {
      console.error(`[ensemble ${ensembleId}] sim ${sim.id} failed:`, err);
      await admin
        .from("simulations")
        .update({
          status: "failed",
          current_stage: "failed",
          error_message: err instanceof Error ? err.message : String(err),
        })
        .eq("id", sim.id);
    }
  };

  const checkCostCircuit = async () => {
    if (costCircuit.tripped) return;
    const { data: cost } = await admin
      .from("simulations")
      .select("total_cost_cents")
      .eq("ensemble_id", ensembleId);
    const costRows = (cost ?? []) as Array<{ total_cost_cents: number | null }>;
    const total = costRows.reduce(
      (s: number, r) =>
        s + (typeof r.total_cost_cents === "number" ? r.total_cost_cents : 0),
      0,
    );
    costCircuit.total = total;
    if (total > tierBudgetCents) {
      costCircuit.tripped = true;
      console.error(
        `[ensemble ${ensembleId}] COST CAP TRIPPED — total $${(total / 100).toFixed(2)} ` +
          `exceeds tier ${tier} budget $${(tierBudgetCents / 100).toFixed(2)}. ` +
          `Aborting remaining sims; ensemble will aggregate whatever has finished.`,
      );
      await admin
        .from("simulations")
        .update({
          status: "cancelled",
          current_stage: "cancelled",
          error_message: `cost cap tripped at ensemble level ($${(total / 100).toFixed(2)} > $${(tierBudgetCents / 100).toFixed(2)})`,
        })
        .eq("ensemble_id", ensembleId)
        .in("status", ["pending", "running"]);
    }
  };

  await Promise.all(
    [...groups.entries()].map(async ([prov, sims]) => {
      const limit = Math.min(
        PROVIDER_SIM_CONCURRENCY[prov] ?? 4,
        sims.length,
      );
      let cursor = 0;
      await Promise.all(
        Array.from({ length: limit }, async () => {
          while (true) {
            if (costCircuit.tripped) return;
            const idx = cursor++;
            if (idx >= sims.length) return;
            await runOne(sims[idx]);
            await checkCostCircuit();
          }
        }),
      );
    }),
  );

  /* ── 3. Aggregate, persist, notify ── */

  try {
    const aggregate = await aggregateAndPersist({
      ensembleId,
      productName: ctx.productName,
      locale,
      projectInput,
      wantMarketProfile: preset.marketProfile,
      expectedSimCount: preset.parallelSims,
    });
    if (aggregate) {
      await notifyEnsembleComplete({
        ensembleId,
        workspaceId: ctx.workspaceId,
        projectId: ctx.projectId,
        productName: ctx.productName,
        locale,
        tier,
        bestCountry: aggregate.recommendation.country,
        consensusPercent: aggregate.recommendation.consensusPercent,
        confidence: aggregate.recommendation.confidence,
        notifyEmail: ctx.notifyEmail,
      });
    }
  } catch (err) {
    console.error(`[ensemble ${ensembleId}] aggregation failed:`, err);
    await admin
      .from("ensembles")
      .update({
        status: "failed",
        error_message: err instanceof Error ? err.message : String(err),
        completed_at: new Date().toISOString(),
      })
      .eq("id", ensembleId);
  }
}

/* ────────────────────────────────── aggregateAndPersist ─── */

/**
 * Pulls every sim's persisted result, runs the deterministic aggregator,
 * applies minimum-N gating, runs the narrative merge LLM, attaches market
 * profile + quality rollup, and persists onto the ensemble row.
 *
 * Returns the computed aggregate when the ensemble landed in "completed"
 * state; null when the catastrophic failure path fired (all sims failed,
 * or sub-threshold sample count).
 */
export async function aggregateAndPersist(opts: {
  ensembleId: string;
  productName: string;
  locale: "ko" | "en";
  projectInput?: ProjectInput;
  wantMarketProfile?: boolean;
  expectedSimCount?: number;
}) {
  const {
    ensembleId,
    productName,
    locale,
    projectInput,
    wantMarketProfile,
    expectedSimCount,
  } = opts;
  const admin = createServiceClient();

  type StoredResult = {
    countries: unknown[];
    personas: unknown[];
    overview?: unknown;
    risks?: unknown;
    recommendations?: unknown;
    pricing?: unknown;
    creative?: unknown[];
  };
  type EnsembleSimRow = {
    id: string;
    ensemble_index: number | null;
    best_country: string | null;
    status: string;
    model_provider: string | null;
    synthesis_provider: string | null;
    simulation_results: StoredResult | StoredResult[] | null;
  };

  const { data: rawRows, error } = await admin
    .from("simulations")
    .select(
      `id, ensemble_index, best_country, status, model_provider, synthesis_provider,
       simulation_results ( countries, personas, overview, risks, recommendations, pricing, creative )`,
    )
    .eq("ensemble_id", ensembleId);
  if (error || !rawRows) {
    throw new Error(`Failed to load ensemble sims: ${error?.message}`);
  }
  const rows = rawRows as unknown as EnsembleSimRow[];

  const completed = rows.filter((r) => r.status === "completed");
  const snapshots: EnsembleSimSnapshot[] = completed.flatMap((r) => {
    const result = Array.isArray(r.simulation_results)
      ? r.simulation_results[0]
      : r.simulation_results;
    if (!result) return [];
    const personas = (result.personas ?? []) as Array<{
      country?: string;
      purchaseIntent?: number;
    }>;
    const intentByCountry: Record<string, { n: number; meanIntent: number }> =
      {};
    const sums: Record<string, { n: number; total: number }> = {};
    for (const p of personas) {
      const c = (p.country ?? "?").toUpperCase();
      if (!sums[c]) sums[c] = { n: 0, total: 0 };
      sums[c].n += 1;
      sums[c].total += typeof p.purchaseIntent === "number" ? p.purchaseIntent : 0;
    }
    for (const [c, v] of Object.entries(sums)) {
      intentByCountry[c] = { n: v.n, meanIntent: v.n > 0 ? v.total / v.n : 0 };
    }
    const compactPersonas = personas.flatMap((p) => {
      const rec = p as {
        country?: string;
        purchaseIntent?: number;
        voice?: string;
        ageRange?: string;
        profession?: string;
        baseProfession?: string;
        gender?: string;
        incomeBand?: string;
        trustFactors?: unknown;
        objections?: unknown;
        trustFactorsCategorized?: unknown;
        objectionsCategorized?: unknown;
        adReaction?: unknown;
      };
      if (typeof rec.purchaseIntent !== "number" || !rec.country) return [];
      let adReaction: { curiosity: number; wouldClick: boolean } | undefined;
      const ar = rec.adReaction as
        | { curiosity?: unknown; wouldClick?: unknown }
        | undefined;
      if (
        ar &&
        typeof ar === "object" &&
        typeof ar.curiosity === "number" &&
        typeof ar.wouldClick === "boolean"
      ) {
        adReaction = { curiosity: ar.curiosity, wouldClick: ar.wouldClick };
      }
      const coerceCategorized = (
        raw: unknown,
      ): Array<{ category: string; detail: string }> | undefined => {
        if (!Array.isArray(raw)) return undefined;
        const items: Array<{ category: string; detail: string }> = [];
        for (const v of raw) {
          if (
            v &&
            typeof v === "object" &&
            typeof (v as Record<string, unknown>).category === "string" &&
            typeof (v as Record<string, unknown>).detail === "string"
          ) {
            const obj = v as Record<string, string>;
            if (obj.detail.trim()) {
              items.push({ category: obj.category, detail: obj.detail });
            }
          }
        }
        return items.length > 0 ? items : undefined;
      };
      return [
        {
          country: rec.country.toUpperCase(),
          purchaseIntent: rec.purchaseIntent,
          voice: rec.voice,
          ageRange: rec.ageRange,
          profession: rec.profession,
          baseProfession: rec.baseProfession,
          gender: rec.gender,
          incomeBand: rec.incomeBand,
          trustFactors: Array.isArray(rec.trustFactors)
            ? (rec.trustFactors as unknown[]).filter(
                (x): x is string => typeof x === "string",
              )
            : undefined,
          objections: Array.isArray(rec.objections)
            ? (rec.objections as unknown[]).filter(
                (x): x is string => typeof x === "string",
              )
            : undefined,
          trustFactorsCategorized: coerceCategorized(rec.trustFactorsCategorized),
          objectionsCategorized: coerceCategorized(rec.objectionsCategorized),
          adReaction,
        },
      ];
    });
    return [
      {
        simulationId: r.id,
        index: r.ensemble_index ?? 0,
        bestCountry: r.best_country ?? null,
        countries: (result.countries ?? []) as CountryScore[],
        personaIntentByCountry: intentByCountry,
        provider: r.model_provider ?? undefined,
        synthesisProvider:
          r.synthesis_provider ?? r.model_provider ?? undefined,
        overview: (result.overview ?? undefined) as EnsembleSimSnapshot["overview"],
        risks: (result.risks ?? undefined) as EnsembleSimSnapshot["risks"],
        recommendations: (result.recommendations ??
          undefined) as EnsembleSimSnapshot["recommendations"],
        pricing: (result.pricing ?? undefined) as EnsembleSimSnapshot["pricing"],
        personas: compactPersonas,
        creative: (result.creative ?? undefined) as EnsembleSimSnapshot["creative"],
      },
    ];
  });

  const aggregate = aggregateEnsemble(snapshots, {
    category: projectInput?.category ?? null,
    originatingCountry: projectInput?.originatingCountry ?? "KR",
  });

  let finalStatus: "completed" | "failed";
  let lowSampleErrorMessage: string | null = null;
  if (snapshots.length === 0) {
    finalStatus = "failed";
    lowSampleErrorMessage = "all sims failed — no snapshots to aggregate";
  } else if (
    expectedSimCount !== undefined &&
    expectedSimCount > 0 &&
    snapshots.length < expectedSimCount * 0.4
  ) {
    finalStatus = "failed";
    lowSampleErrorMessage = `only ${snapshots.length}/${expectedSimCount} sims succeeded (${Math.round((snapshots.length / expectedSimCount) * 100)}%) — below minimum threshold`;
  } else {
    finalStatus = "completed";
    if (
      expectedSimCount !== undefined &&
      expectedSimCount > 0 &&
      snapshots.length < expectedSimCount * 0.8
    ) {
      console.warn(
        `[ensemble ${ensembleId}] suboptimal sim count: ${snapshots.length}/${expectedSimCount} ` +
          `(${Math.round((snapshots.length / expectedSimCount) * 100)}%) — downgrading confidence to WEAK`,
      );
      aggregate.recommendation.confidence = "WEAK";
    }
  }

  if (snapshots.length > 0) {
    // Top-2 detection mirrors the aggregator's displayMode logic — when
    // the orchestrator deferred to "two candidates", the narrative
    // merge prompt MUST know about it so the LLM doesn't write "전
    // 시뮬이 X 지목 / 합의도 96%" which contradicts the Top-2 framing
    // every UI surface shows.
    const recExt = aggregate.recommendation as unknown as {
      displayMode?: string;
      secondary?: { country?: string; gapToPrimary?: number };
    };
    const top2Info =
      recExt.displayMode === "top2" && recExt.secondary?.country
        ? (() => {
            const primary = aggregate.recommendation.country;
            const secondary = recExt.secondary!.country!;
            const primaryVotePct =
              aggregate.bestCountryDistribution?.find((b) => b.country === primary)
                ?.percent ?? 0;
            const secondaryVotePct =
              aggregate.bestCountryDistribution?.find((b) => b.country === secondary)
                ?.percent ?? 0;
            return {
              primary,
              secondary,
              primaryVotePct,
              secondaryVotePct,
              gapToPrimary: recExt.secondary!.gapToPrimary ?? 0,
            };
          })()
        : undefined;
    const narrative = await mergeNarrative({
      snapshots,
      productName,
      bestCountry: aggregate.recommendation.country,
      consensusPercent: aggregate.recommendation.consensusPercent,
      locale,
      crossCountryDistribution: aggregate.crossCountryDistribution,
      candidateCountries: projectInput?.candidateCountries,
      top2: top2Info,
    });
    if (narrative) aggregate.narrative = narrative;
  }

  if (snapshots.length > 0 && wantMarketProfile && projectInput) {
    const result = await buildMarketProfile({
      input: projectInput,
      aggregate,
      locale,
    });
    if (result.profile) aggregate.marketProfile = result.profile;
  }

  if (snapshots.length > 0) {
    try {
      const simIds = snapshots.map((s) => s.simulationId);
      const { data: qualityRows } = await admin
        .from("simulation_quality")
        .select("simulation_id, confidence_score, quarantined, warnings")
        .in("simulation_id", simIds);

      type QualityRow = {
        simulation_id: string;
        confidence_score: number;
        quarantined: boolean;
        warnings: Array<{
          code: string;
          severity: string;
          message: string;
        }> | null;
      };
      const rows = (qualityRows ?? []) as QualityRow[];
      if (rows.length > 0) {
        const meanConfidence = Math.round(
          rows.reduce((s, r) => s + r.confidence_score, 0) / rows.length,
        );
        const quarantinedCount = rows.filter((r) => r.quarantined).length;
        const codeCounts = new Map<
          string,
          { count: number; severity: string; message: string }
        >();
        for (const r of rows) {
          for (const w of r.warnings ?? []) {
            const existing = codeCounts.get(w.code);
            if (existing) existing.count++;
            else
              codeCounts.set(w.code, {
                count: 1,
                severity: w.severity,
                message: w.message,
              });
          }
        }
        const systemicWarnings = [...codeCounts.entries()]
          .filter(([, v]) => v.count / rows.length >= 0.3)
          .map(([code, v]) => ({
            code,
            severity: v.severity,
            message: v.message,
            simShare: Math.round((v.count / rows.length) * 100),
          }));

        (aggregate as unknown as Record<string, unknown>).quality = {
          confidenceScore: meanConfidence,
          simCount: rows.length,
          quarantinedCount,
          systemicWarnings,
        };
      }
    } catch (err) {
      console.warn(
        `[ensemble ${ensembleId}] quality rollup failed (non-fatal):`,
        err,
      );
    }
  }

  await admin
    .from("ensembles")
    .update({
      status: finalStatus,
      aggregate_result: snapshots.length > 0 ? aggregate : null,
      completed_at: new Date().toISOString(),
      error_message: lowSampleErrorMessage,
    })
    .eq("id", ensembleId);

  return finalStatus === "completed" ? aggregate : null;
}

/* ────────────────────────────────── worker-side context loader ─── */

/**
 * Reconstruct the full OrchestrationContext from the DB given just an
 * ensembleId. Used by the Cloud Run worker which receives only ensembleId
 * over HTTP and needs to fetch project + sim slot rows from Supabase.
 *
 * Returns null when the ensemble row doesn't exist (e.g. caller passed a
 * stale id, or the ensemble was deleted between Vercel hand-off and worker
 * pickup) — caller should respond with 404 / log + abort.
 */
export async function loadOrchestrationContext(opts: {
  ensembleId: string;
  notifyEmail?: string | null;
}): Promise<OrchestrationContext | null> {
  const admin = createServiceClient();

  const { data: ensemble } = await admin
    .from("ensembles")
    .select("id, project_id, tier")
    .eq("id", opts.ensembleId)
    .single();
  if (!ensemble) return null;

  const tier = ensemble.tier as Tier;
  if (!(tier in TIER_PRESETS)) {
    console.error(
      `[orchestrator] ensemble ${opts.ensembleId} has unknown tier "${tier}"`,
    );
    return null;
  }

  const { data: project } = await admin
    .from("projects")
    .select(
      `id, workspace_id, product_name, category, description,
       base_price_cents, currency, objective, originating_country,
       candidate_countries, competitor_urls, asset_descriptions, asset_urls`,
    )
    .eq("id", ensemble.project_id)
    .single();
  if (!project) return null;

  const projectInput: ProjectInput = {
    productName: project.product_name,
    category: project.category ?? "other",
    description: project.description ?? "",
    basePriceCents: project.base_price_cents ?? 0,
    currency: project.currency ?? "USD",
    objective: project.objective as ProjectInput["objective"],
    originatingCountry: project.originating_country ?? "KR",
    candidateCountries: project.candidate_countries ?? [],
    competitorUrls: project.competitor_urls ?? [],
    assetDescriptions: project.asset_descriptions ?? [],
    assetUrls: project.asset_urls ?? [],
  };

  const { data: simRowsRaw } = await admin
    .from("simulations")
    .select("id, ensemble_index, model_provider")
    .eq("ensemble_id", opts.ensembleId)
    .order("ensemble_index", { ascending: true });
  const simRows: OrchestrationSimRow[] = (simRowsRaw ?? []).map((r) => ({
    id: r.id as string,
    index: (r.ensemble_index as number | null) ?? 0,
    provider: ((r.model_provider as string | null) ?? "anthropic") as ProviderName,
  }));

  // Locale isn't on the ensemble row in v0.1 — pull from project context
  // when present, default to "ko" (the primary user locale per memory note
  // user_language.md). The web side can override by writing locale into
  // ensemble.error_message metadata or extending the ensembles schema.
  const locale: "ko" | "en" = "ko";

  return {
    ensembleId: opts.ensembleId,
    productName: project.product_name,
    workspaceId: project.workspace_id as string,
    projectId: project.id as string,
    projectInput,
    locale,
    tier,
    notifyEmail: opts.notifyEmail ?? null,
    simRows,
  };
}

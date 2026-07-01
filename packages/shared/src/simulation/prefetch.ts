/**
 * prefetchSimulationContext — shared "before runSimulation" pipeline.
 *
 * Single source of truth for the grounding/anchor pre-fetch sequence that
 * both `orchestrator.ts` (production Web UI / cron) and
 * `scripts/smoke-ensemble-e2e.ts` (CLI backtest) must run before spawning
 * per-sim work.
 *
 * Why extracted (2026-06-04): the two call sites previously kept duplicate
 * copies of the same anchor calls and silently drifted apart:
 *   - 2026-05-20: orchestrator's hypothesis TIER_PRESETS upgraded
 *     1→3 sims × multi-LLM, smoke kept 1 sim × anthropic-only
 *   - 2026-06-04 (v0.2-B): smoke never had Tavily grounding (trend /
 *     margin / KOL ecosystem) at all — every backtest result up to
 *     and including K-Beauty methodology v3 + v0.2-A ran without it
 *
 * Both gaps were caught by accident. Centralising the sequence here
 * means future anchor additions land in one file and both paths pick
 * them up automatically.
 *
 * Inline assets (image fetch) stays in the caller — orchestrator needs
 * the Supabase admin handle to attribute asset blobs to a workspace,
 * and smoke doesn't run that flow. That's the only divergence kept.
 */

import type { ProjectInput } from "@/lib/simulation/schemas";
import type { PromptLocale } from "@/lib/simulation/prompts";
import {
  buildCategoryTrendQuery,
  buildCategoryTrendQueryNative,
  buildKolEcosystemQuery,
  buildKolEcosystemQueryNative,
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

export interface PrefetchedContext {
  tradeAnchorBlock: string;
  worldBankBlock: string;
  trendSnippets: TavilyResult[];
  marginSnippets: TavilyResult[];
  kolEcosystemByCountry: Record<string, TavilyResult[]>;
  competitorPrices: CompetitorPriceResult[];
}

export interface PrefetchOpts {
  projectInput: ProjectInput;
  locale: PromptLocale;
  /**
   * Log prefix — orchestrator passes `[ensemble <id>]` so log lines
   * are attributable to an ensemble; smoke passes a short bare
   * identifier (e.g. `""`) and lets bash scope the lines per run.
   */
  logPrefix?: string;
}

const PREFETCH_DEFAULTS = {
  trendMaxResults: 5,
  marginMaxResults: 5,
  kolMaxResultsPerCountry: 4,
};

export async function prefetchSimulationContext(
  opts: PrefetchOpts,
): Promise<PrefetchedContext> {
  const { projectInput, locale } = opts;
  const log = opts.logPrefix ? `${opts.logPrefix} ` : "";

  const asOfDate = projectInput.asOfDate
    ? new Date(projectInput.asOfDate)
    : undefined;
  const asOfYear =
    asOfDate && !Number.isNaN(asOfDate.getTime())
      ? asOfDate.getUTCFullYear()
      : undefined;
  const asOfYyyymm = asOfYear
    ? {
        strtYymm: `${asOfYear}01`,
        endYymm: `${asOfYear}${String(asOfDate!.getUTCMonth() + 1).padStart(2, "0")}`,
      }
    : undefined;
  if (asOfYear) {
    console.log(
      `${log}historical anchors as-of ${projectInput.asOfDate} (year=${asOfYear})`,
    );
  }

  // Origin (home / exporting country). Defaults to KR. Trade-flow grounding
  // (Comtrade) is origin-agnostic; the Korea-specific national anchors below
  // (Customs / DART / MFDS / KOTRA) only fire when origin === KR so a non-KR
  // origin never gets Korea data mislabeled as its own.
  const origin = (projectInput.originatingCountry ?? "KR").toUpperCase();

  let tradeAnchorBlock = "";
  // UN Comtrade — Phase E Week 4-5 (2026-05-16). Origin-dynamic reporter.
  try {
    const { buildComtradeAnchor } = await import(
      "@/lib/market-research/comtrade"
    );
    const { block } = await buildComtradeAnchor(
      projectInput.category,
      projectInput.candidateCountries,
      {
        apiKey: process.env.COMTRADE_API_KEY,
        locale,
        period: asOfYear,
        originIso: origin,
      },
    );
    tradeAnchorBlock = block;
    if (block) {
      console.log(
        `${log}Comtrade anchor: ${block.split("\n").length} lines`,
      );
    } else {
      console.log(`${log}Comtrade anchor: empty`);
    }
  } catch (err) {
    console.warn(
      `${log}Comtrade anchor failed: ${(err as Error).message}`,
    );
  }

  // World Bank — Phase F.0-2 (2026-05-17)
  let worldBankBlock = "";
  try {
    const { buildWorldBankAnchor } = await import(
      "@/lib/market-research/world-bank"
    );
    const { block, rows } = await buildWorldBankAnchor(
      projectInput.candidateCountries,
      locale,
      asOfYear,
    );
    worldBankBlock = block;
    if (block) {
      console.log(`${log}World Bank anchor: ${rows.length} countries`);
    } else {
      console.log(`${log}World Bank anchor: empty`);
    }
  } catch (err) {
    console.warn(
      `${log}World Bank anchor failed: ${(err as Error).message}`,
    );
  }

  // Korea Customs — Phase F.1-1 (appended to tradeAnchorBlock). KR-origin only.
  if (origin === "KR") try {
    const { buildKoreaCustomsAnchor } = await import(
      "@/lib/market-research/korea-customs"
    );
    const { hsCodesForCategory } = await import(
      "@/lib/market-research/comtrade"
    );
    const hsCodes = hsCodesForCategory(projectInput.category);
    if (hsCodes.length > 0) {
      const { block, rows } = await buildKoreaCustomsAnchor(
        projectInput.category,
        projectInput.candidateCountries,
        hsCodes,
        { locale, ...asOfYyyymm },
      );
      if (block) {
        console.log(`${log}Korea Customs anchor: ${rows.length} rows`);
        tradeAnchorBlock = tradeAnchorBlock
          ? `${tradeAnchorBlock}\n\n${block}`
          : block;
      } else {
        console.log(`${log}Korea Customs anchor: empty`);
      }
    }
  } catch (err) {
    console.warn(
      `${log}Korea Customs anchor failed: ${(err as Error).message}`,
    );
  }

  // DART — Phase F.1-A + F.1-B (2026-05-17). Korean listed co's — KR-origin only.
  if (origin === "KR") try {
    const { buildDartFullAnchor, inferSlugFromProductName } = await import(
      "@/lib/market-research/dart"
    );
    const slug = inferSlugFromProductName(projectInput.productName);
    if (slug) {
      const { block, financials, region, autoRegion, narrative } =
        await buildDartFullAnchor(
          slug,
          projectInput.candidateCountries,
          { locale, bsnsYear: asOfYear },
        );
      if (block) {
        const rev = financials?.revenueKrw ?? 0;
        const regionCount = region?.regions?.length ?? 0;
        const autoTag = autoRegion
          ? ` + auto-region ${autoRegion.rows.length}`
          : "";
        const narrativeTag = narrative
          ? ` + narrative ${narrative.countries.length}`
          : "";
        console.log(
          `${log}DART anchor: ${financials?.corpNameKo ?? slug} (${(rev / 1e12).toFixed(2)}T KRW + ${regionCount} regions${autoTag}${narrativeTag})`,
        );
        tradeAnchorBlock = tradeAnchorBlock
          ? `${tradeAnchorBlock}\n\n${block}`
          : block;
      }
    }
  } catch (err) {
    console.warn(`${log}DART anchor failed: ${(err as Error).message}`);
  }

  // MFDS — Phase F.3 (2026-05-18, sunscreen-only). Korean regulator — KR-origin only.
  if (origin === "KR") try {
    const { buildMfdsAnchor } = await import(
      "@/lib/market-research/mfds"
    );
    const { inferSlugFromProductName } = await import(
      "@/lib/market-research/dart"
    );
    const slug = inferSlugFromProductName(projectInput.productName);
    if (slug) {
      const { block, result } = buildMfdsAnchor(slug, { locale });
      if (block && result) {
        console.log(
          `${log}MFDS anchor: ${slug} — ${result.matched.length} matched, ${result.unmatchedIngredients.length} not-in-list`,
        );
        tradeAnchorBlock = tradeAnchorBlock
          ? `${tradeAnchorBlock}\n\n${block}`
          : block;
      }
    }
  } catch (err) {
    console.warn(`${log}MFDS anchor failed: ${(err as Error).message}`);
  }

  // KOTRA — Phase F.1-C (2026-05-17). Korean trade agency K-export cases —
  // KR-origin only. KOTRA_ANCHOR_ENABLED=false also disables.
  if (origin !== "KR") {
    // non-KR origin: KOTRA (a Korean agency) is not applicable — skip silently.
  } else if (process.env.KOTRA_ANCHOR_ENABLED === "false") {
    console.log(`${log}KOTRA anchor: disabled via env`);
  } else {
    try {
      const { buildKotraNationalAnchor } = await import(
        "@/lib/market-research/kotra"
      );
      const keywords = [
        projectInput.category,
        projectInput.productName,
      ].filter((s): s is string => typeof s === "string" && s.length > 0);
      const { block, bundles, skipped } = await buildKotraNationalAnchor(
        projectInput.candidateCountries,
        {
          categoryKeywords: keywords,
          locale,
          maxPerCountry: 3,
          category: projectInput.category,
        },
      );
      if (skipped === "category") {
        console.log(
          `${log}KOTRA anchor: skipped (category=${projectInput.category})`,
        );
      } else if (block) {
        const totalComps = bundles.reduce(
          (n, b) => n + b.koreanCompanies.length,
          0,
        );
        console.log(
          `${log}KOTRA anchor: ${bundles.length}/${projectInput.candidateCountries.length} countries (${totalComps} companies)`,
        );
        tradeAnchorBlock = tradeAnchorBlock
          ? `${tradeAnchorBlock}\n\n${block}`
          : block;
      } else {
        console.log(`${log}KOTRA anchor: empty`);
      }
    } catch (err) {
      console.warn(
        `${log}KOTRA anchor failed: ${(err as Error).message}`,
      );
    }
  }

  // Tavily grounding — trend (global) + margin (origin) + per-country KOL.
  // Sonar Pro joins trend when PERPLEXITY_API_KEY is set.
  let trendSnippets: TavilyResult[] = [];
  let marginSnippets: TavilyResult[] = [];
  const kolEcosystemByCountry: Record<string, TavilyResult[]> = {};
  if (process.env.TAVILY_API_KEY || process.env.PERPLEXITY_API_KEY) {
    const trendNativeQuery = buildCategoryTrendQueryNative({
      category: projectInput.category,
      productName: projectInput.productName,
      originatingCountry: projectInput.originatingCountry,
    });
    const trendSonarQuery = buildCategoryTrendQuerySonar({
      category: projectInput.category,
      productName: projectInput.productName,
    });
    const [trendResult, trendNativeResult, trendSonarResult] =
      await Promise.all([
        tavilySearch({
          query: buildCategoryTrendQuery({
            category: projectInput.category,
            productName: projectInput.productName,
          }),
          searchDepth: "advanced",
          maxResults: PREFETCH_DEFAULTS.trendMaxResults,
          includeAnswer: false,
        }),
        trendNativeQuery
          ? tavilySearch({
              query: trendNativeQuery,
              searchDepth: "advanced",
              maxResults: PREFETCH_DEFAULTS.trendMaxResults,
              includeAnswer: false,
            })
          : Promise.resolve(null),
        sonarSearch({ query: trendSonarQuery, model: "sonar-pro" }),
      ]);
    const enSnips = trendResult?.results ?? [];
    const nativeSnips = trendNativeResult?.results ?? [];
    const sonarSnips = trendSonarResult?.results ?? [];
    const seenTrendUrls = new Set(enSnips.map((r) => r.url));
    const nativeUniqueTrend = nativeSnips.filter(
      (r) => !seenTrendUrls.has(r.url),
    );
    nativeUniqueTrend.forEach((r) => seenTrendUrls.add(r.url));
    const sonarUniqueTrend = sonarSnips.filter(
      (r) => !seenTrendUrls.has(r.url),
    );
    trendSnippets = [
      ...enSnips,
      ...nativeUniqueTrend,
      ...sonarUniqueTrend,
    ];
    if (trendSnippets.length > 0) {
      console.log(
        `${log}trend grounding: ${enSnips.length}EN + ${nativeUniqueTrend.length}native + ${sonarUniqueTrend.length}sonar = ${trendSnippets.length}`,
      );
    }

    const marginResult = await tavilySearch({
      query: buildMarginBenchmarkQuery({
        category: projectInput.category,
        country: projectInput.originatingCountry,
        productName: projectInput.productName,
      }),
      searchDepth: "advanced",
      maxResults: PREFETCH_DEFAULTS.marginMaxResults,
      includeAnswer: false,
    });
    marginSnippets = marginResult?.results ?? [];
    if (marginSnippets.length > 0) {
      console.log(`${log}margin grounding: ${marginSnippets.length} snippets`);
    }

    // v0.2-B per-country KOL ecosystem fan-out (2026-06-04).
    if (process.env.TAVILY_API_KEY) {
      const kolJobs = projectInput.candidateCountries.flatMap((country) => {
        const enQ = buildKolEcosystemQuery({
          country,
          category: projectInput.category,
          productName: projectInput.productName,
        });
        const nativeQ = buildKolEcosystemQueryNative({
          country,
          category: projectInput.category,
          productName: projectInput.productName,
        });
        const en = tavilySearch({
          query: enQ,
          searchDepth: "advanced",
          maxResults: PREFETCH_DEFAULTS.kolMaxResultsPerCountry,
          includeAnswer: false,
        }).then((r) => ({ country, result: r }));
        const native = nativeQ
          ? tavilySearch({
              query: nativeQ,
              searchDepth: "advanced",
              maxResults: PREFETCH_DEFAULTS.kolMaxResultsPerCountry,
              includeAnswer: false,
            }).then((r) => ({ country, result: r }))
          : Promise.resolve({ country, result: null });
        return [en, native];
      });
      const kolResults = await Promise.all(kolJobs);
      for (const { country, result } of kolResults) {
        const arr = result?.results ?? [];
        if (arr.length === 0) continue;
        const seen = new Set(
          (kolEcosystemByCountry[country] ?? []).map((r) => r.url),
        );
        kolEcosystemByCountry[country] = [
          ...(kolEcosystemByCountry[country] ?? []),
          ...arr.filter((r) => !seen.has(r.url)),
        ];
      }
      const total = Object.values(kolEcosystemByCountry).reduce(
        (acc, arr) => acc + arr.length,
        0,
      );
      const covered = Object.keys(kolEcosystemByCountry).length;
      console.log(
        `${log}KOL ecosystem grounding: ${total} snippets across ${covered}/${projectInput.candidateCountries.length} countries`,
      );
    }
  } else {
    console.log(`${log}Tavily grounding skipped (no API keys)`);
  }

  // Competitor price extraction (puppeteer-based, ensemble-shared).
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
        `${log}competitor prices: ${ok.length}/${competitorPrices.length} extracted`,
      );
    } catch (err) {
      console.warn(
        `${log}competitor extraction failed: ${(err as Error).message}`,
      );
    }
  }

  return {
    tradeAnchorBlock,
    worldBankBlock,
    trendSnippets,
    marginSnippets,
    kolEcosystemByCountry,
    competitorPrices,
  };
}

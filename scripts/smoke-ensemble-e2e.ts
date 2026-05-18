/**
 * E2E smoke for the ensemble pipeline. Picks an existing project, mimics
 * what the run-ensemble API does (insert ensemble + sim rows, run sims,
 * aggregate + persist), then prints the URL to view the result and
 * download the PDF in the dev server.
 *
 * Bypasses HTTP auth via service-role client; everything else hits the
 * same library code paths the production endpoint uses.
 *
 * Usage:
 *   npm run smoke:ensemble-e2e -- <project_id_prefix> [tier=hypothesis]
 *
 * Examples:
 *   npm run smoke:ensemble-e2e -- 8de9f248                  # hypothesis 1×200
 *   npm run smoke:ensemble-e2e -- 8de9f248 decision         # 5×200
 */
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { runSimulation } from "../packages/shared/src/simulation/runner";
import {
  aggregateEnsemble,
  type EnsembleSimSnapshot,
} from "../packages/shared/src/simulation/ensemble";
import { mergeNarrative } from "../packages/shared/src/simulation/ensemble-narrative";
import type {
  CountryScore,
  ProjectInput,
} from "../packages/shared/src/simulation/schemas";

// Mirrors packages/shared/src/simulation/orchestrator.ts TIER_PRESETS exactly.
// When provider mix or parallelSim count changes there, change it here too
// (two locations because this script doesn't go through Next.js routes and
// can't import the orchestrator module without bringing in supabase admin).
// `deep-3` and `decision_plus` here intentionally differ from orchestrator:
// they're dev-only variants exercising multi-LLM cheaply.
const TIER_PRESETS = {
  hypothesis: {
    parallelSims: 1,
    perSimPersonas: 200,
    llmProviders: ["anthropic"] as const,
  },
  decision: {
    parallelSims: 6,
    perSimPersonas: 200,
    // Synced with orchestrator after defect #9 fix (2026-05-16).
    llmProviders: ["anthropic", "openai", "deepseek"] as const,
  },
  decision_plus: {
    parallelSims: 15,
    perSimPersonas: 200,
    llmProviders: ["anthropic", "openai", "deepseek"] as const,
  },
  deep: {
    parallelSims: 25,
    perSimPersonas: 200,
    llmProviders: ["anthropic", "openai", "deepseek"] as const,
  },
  deep_pro: {
    parallelSims: 50,
    perSimPersonas: 200,
    llmProviders: ["anthropic", "openai", "gemini"] as const,
  },
  // Cheap dev variant: 3 sims, one per provider — exercises the multi-LLM
  // round-robin without burning a 25-sim deep run. Reuses the "deep" tier
  // label so the DB tier check accepts it. Not exposed in the UI.
  "deep-3": {
    parallelSims: 3,
    perSimPersonas: 200,
    llmProviders: ["anthropic", "openai", "deepseek"] as const,
    storedTier: "deep" as const,
  },
} as const;
type Tier = keyof typeof TIER_PRESETS;
type ProviderName = "anthropic" | "openai" | "gemini" | "deepseek";

// Mirrors src/app/api/projects/[id]/run-ensemble/route.ts so the smoke
// driver exercises the same per-provider concurrency cap as production.
// Bumping these in one file requires bumping in the other.
const PROVIDER_SIM_CONCURRENCY: Record<ProviderName, number> = {
  anthropic: 12,
  openai: 12,
  gemini: 4,
  deepseek: 12,
};

function admin() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

async function main() {
  const args = process.argv.slice(2);
  const prefix = args[0];
  const tier = ((args[1] ?? "hypothesis") as Tier);
  if (!prefix) {
    console.error("Usage: smoke-ensemble-e2e -- <project_id_prefix> [tier]");
    process.exit(1);
  }
  if (!(tier in TIER_PRESETS)) {
    console.error(`Unknown tier: ${tier}`);
    process.exit(1);
  }
  const preset = TIER_PRESETS[tier];

  const sb = admin();
  // Lookup project by id prefix. Supabase JS doesn't support text-cast on
  // uuid columns, so we pull a small recent batch and filter client-side.
  const { data: candidates, error: lookupErr } = await sb
    .from("projects")
    .select(
      "id, workspace_id, product_name, category, description, base_price_cents, currency, objective, originating_country, candidate_countries, competitor_urls, asset_descriptions, asset_urls",
    )
    .order("created_at", { ascending: false })
    .limit(50);
  if (lookupErr) throw lookupErr;
  const matches = (candidates ?? []).filter((c) => (c.id as string).startsWith(prefix));
  if (matches.length === 0) {
    console.error(`No project matches prefix ${prefix}`);
    process.exit(1);
  }
  if (matches.length > 1) {
    console.error(`Ambiguous prefix — matched: ${matches.map((c) => (c.id as string).slice(0, 8)).join(", ")}`);
    process.exit(1);
  }
  const project = matches[0];

  // Service-role inserts need a non-null created_by; pick the workspace owner.
  const { data: owner } = await sb
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", project.workspace_id)
    .eq("role", "owner")
    .limit(1)
    .single();
  if (!owner) {
    console.error("Workspace has no owner — cannot attribute ensemble.");
    process.exit(1);
  }

  console.log(`\nProject: ${project.product_name} (${project.id.slice(0, 8)})`);
  console.log(`Tier: ${tier} · ${preset.parallelSims}×${preset.perSimPersonas}`);
  console.log(`Markets: ${(project.candidate_countries ?? []).join(", ")}`);

  // 1. Create ensemble row. For dev-only tier variants ("deep-3") use the
  //    storedTier override so we satisfy the DB tier check constraint while
  //    still surfacing the actual variant name to the user.
  const dbTier = (preset as { storedTier?: string }).storedTier ?? tier;
  const { data: ensemble, error: ensErr } = await sb
    .from("ensembles")
    .insert({
      project_id: project.id,
      workspace_id: project.workspace_id,
      created_by: owner.user_id,
      tier: dbTier,
      parallel_sims: preset.parallelSims,
      per_sim_personas: preset.perSimPersonas,
      llm_providers: preset.llmProviders,
      status: "running",
    })
    .select("id")
    .single();
  if (ensErr || !ensemble) throw ensErr ?? new Error("ensemble insert failed");
  const ensembleId = ensemble.id as string;
  console.log(`\nEnsemble: ${ensembleId.slice(0, 8)}`);

  // 2. Create N pending sim rows. Round-robin provider assignment for
  //    multi-LLM tiers so the smoke test exercises the same code path the
  //    deep tier uses in production.
  const simRows: Array<{ id: string; index: number; provider: ProviderName }> = [];
  for (let i = 0; i < preset.parallelSims; i++) {
    const provider = preset.llmProviders[i % preset.llmProviders.length] as ProviderName;
    const { data: sim, error: simErr } = await sb
      .from("simulations")
      .insert({
        project_id: project.id,
        workspace_id: project.workspace_id,
        status: "pending",
        persona_count: preset.perSimPersonas,
        current_stage: "validating",
        ensemble_id: ensembleId,
        ensemble_index: i,
        model_provider: provider,
      })
      .select("id")
      .single();
    if (simErr || !sim) throw simErr ?? new Error("sim insert failed");
    simRows.push({ id: sim.id as string, index: i, provider });
  }
  await sb.from("projects").update({ status: "running" }).eq("id", project.id);

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

  // 3. Run sims with per-provider concurrency cap. Cross-provider runs
  //    are unconstrained; within a provider we cap to avoid burst 429/503.
  const t0 = Date.now();
  const groups = new Map<ProviderName, typeof simRows>();
  for (const row of simRows) {
    const arr = groups.get(row.provider) ?? [];
    arr.push(row);
    groups.set(row.provider, arr);
  }
  const groupSummary = [...groups.entries()]
    .map(([p, rows]) => `${p}=${rows.length}`)
    .join(", ");
  console.log(
    `\nRunning ${preset.parallelSims} sim(s) (${groupSummary}) — gemini cap ${PROVIDER_SIM_CONCURRENCY.gemini}`,
  );

  // Phase E Week 4-5 (2026-05-16): UN Comtrade prefetch. Same logic as
  // orchestrator.ts so smoke-driven runs see the same anchor as
  // production-routed runs.
  let tradeAnchorBlock = "";
  try {
    const { buildComtradeAnchor } = await import(
      "../packages/shared/src/market-research/comtrade"
    );
    const { block } = await buildComtradeAnchor(
      projectInput.category,
      projectInput.candidateCountries,
      { apiKey: process.env.COMTRADE_API_KEY, locale: "ko" },
    );
    tradeAnchorBlock = block;
    if (block) {
      console.log(`Comtrade anchor: ${block.split("\n").length} lines (HSCode-aggregate K-export evidence)`);
    } else {
      console.log("Comtrade anchor: empty (no data or unsupported category)");
    }
  } catch (err) {
    console.warn(`Comtrade anchor build failed: ${(err as Error).message}`);
  }

  // Phase F.0-2 (2026-05-17): World Bank macro indicators prefetch.
  let worldBankBlock = "";
  try {
    const { buildWorldBankAnchor } = await import(
      "../packages/shared/src/market-research/world-bank"
    );
    const { block, rows } = await buildWorldBankAnchor(
      projectInput.candidateCountries,
      "ko",
    );
    worldBankBlock = block;
    if (block) {
      console.log(`World Bank macro anchor: ${rows.length} countries fetched`);
    } else {
      console.log("World Bank macro anchor: empty (fetch failed)");
    }
  } catch (err) {
    console.warn(`World Bank anchor build failed: ${(err as Error).message}`);
  }

  // Phase F.1-1 (2026-05-17): 관세청 (Korea Customs) trade statistics
  // prefetch. Same HSCode mapping as Comtrade. Appended to Comtrade block
  // when both succeed — they confirm each other (same underlying trade
  // data) but 관세청 supports finer HSCode and more recent months.
  try {
    const { buildKoreaCustomsAnchor } = await import(
      "../packages/shared/src/market-research/korea-customs"
    );
    const { hsCodesForCategory } = await import(
      "../packages/shared/src/market-research/comtrade"
    );
    const hsCodes = hsCodesForCategory(projectInput.category);
    if (hsCodes.length > 0) {
      const { block, rows } = await buildKoreaCustomsAnchor(
        projectInput.category,
        projectInput.candidateCountries,
        hsCodes,
        { locale: "ko" },
      );
      if (block) {
        console.log(`Korea Customs anchor: ${rows.length} (HSCode × country) rows`);
        tradeAnchorBlock = tradeAnchorBlock ? `${tradeAnchorBlock}\n\n${block}` : block;
      } else {
        console.log("Korea Customs anchor: empty");
      }
    }
  } catch (err) {
    console.warn(`Korea Customs anchor build failed: ${(err as Error).message}`);
  }

  // Phase F.1-A + F.1-B (2026-05-17): DART consolidated financials + brand
  // region revenue reference. Targets v5 brand-mismatch finding (HSCode
  // aggregate misses 자회사 production like Binggrae VN and 면세점
  // service revenue like KGC CN). Region table is the cheap fix; DART
  // company-scale gives absolute size prior.
  try {
    const { buildDartFullAnchor, inferSlugFromProductName } = await import(
      "../packages/shared/src/market-research/dart"
    );
    const slug = inferSlugFromProductName(projectInput.productName);
    if (slug) {
      const { block, financials, region, autoRegion, narrative } = await buildDartFullAnchor(
        slug,
        projectInput.candidateCountries,
        { locale: "ko" },
      );
      if (block) {
        const rev = financials?.revenueKrw ?? 0;
        const regionCount = region?.regions?.length ?? 0;
        const autoTag = autoRegion ? ` + auto-region ${autoRegion.rows.length}` : "";
        const narrativeTag = narrative ? ` + narrative ${narrative.countries.length}` : "";
        console.log(
          `DART anchor: ${financials?.corpNameKo ?? slug} (${(rev / 1e12).toFixed(2)}T KRW + ${regionCount} manual regions${autoTag}${narrativeTag})`,
        );
        tradeAnchorBlock = tradeAnchorBlock ? `${tradeAnchorBlock}\n\n${block}` : block;
      } else {
        console.log(`DART anchor: empty for slug=${slug} (unlisted + no region table entry)`);
      }
    } else {
      console.log(`DART anchor: no slug match for "${projectInput.productName}"`);
    }
  } catch (err) {
    console.warn(`DART anchor build failed: ${(err as Error).message}`);
  }

  // Phase F.3 (2026-05-18): MFDS narrow regulatory anchor (sunscreen only).
  try {
    const { buildMfdsAnchor } = await import(
      "../packages/shared/src/market-research/mfds"
    );
    const { inferSlugFromProductName } = await import(
      "../packages/shared/src/market-research/dart"
    );
    const slug = inferSlugFromProductName(projectInput.productName);
    if (slug) {
      const { block, result } = buildMfdsAnchor(slug, { locale: "ko" });
      if (block && result) {
        console.log(
          `MFDS anchor: ${slug} — ${result.matched.length} matched, ${result.unmatchedIngredients.length} not-in-list`,
        );
        tradeAnchorBlock = tradeAnchorBlock ? `${tradeAnchorBlock}\n\n${block}` : block;
      }
    }
  } catch (err) {
    console.warn(`MFDS anchor build failed: ${(err as Error).message}`);
  }

  // Phase F.1-C (2026-05-17): KOTRA per-country Korean-companies anchor.
  // Closes the Phase F.0 gap: sims that missed Binggrae VN / KGC CN now see
  // explicit parent-company presence from KOTRA's registry.
  //
  // KOTRA_ANCHOR_ENABLED=false disables for A/B diagnostic (see orchestrator
  // comment for context). Default ON.
  if (process.env.KOTRA_ANCHOR_ENABLED === "false") {
    console.log(`KOTRA anchor: disabled via KOTRA_ANCHOR_ENABLED=false`);
  } else try {
    const { buildKotraNationalAnchor } = await import(
      "../packages/shared/src/market-research/kotra"
    );
    const keywords = [projectInput.category, projectInput.productName].filter(
      (s): s is string => typeof s === "string" && s.length > 0,
    );
    const { block, bundles, skipped } = await buildKotraNationalAnchor(
      projectInput.candidateCountries,
      // Cap 3 per country (v2 2026-05-18) + category opt-in (v3 2026-05-18).
      { categoryKeywords: keywords, locale: "ko", maxPerCountry: 3, category: projectInput.category },
    );
    if (skipped === "category") {
      console.log(`KOTRA anchor: skipped (category=${projectInput.category})`);
    } else if (block) {
      const totalComps = bundles.reduce((n, b) => n + b.koreanCompanies.length, 0);
      console.log(
        `KOTRA anchor: ${bundles.length}/${projectInput.candidateCountries.length} countries (${totalComps} Korean companies)`,
      );
      tradeAnchorBlock = tradeAnchorBlock ? `${tradeAnchorBlock}\n\n${block}` : block;
    } else {
      console.log(`KOTRA anchor: empty`);
    }
  } catch (err) {
    console.warn(`KOTRA anchor build failed: ${(err as Error).message}`);
  }

  const runOne = async ({
    id: simId,
    index,
    provider,
  }: (typeof simRows)[number]) => {
    try {
      await runSimulation({
        simulationId: simId,
        projectInput,
        personaCount: preset.perSimPersonas,
        locale: "ko",
        seedOverride: `${ensembleId}-${index}`,
        provider,
        tradeAnchorBlock,
        worldBankBlock,
      });
      console.log(`  ✓ sim ${index} (${simId.slice(0, 8)}) [${provider}] done`);
    } catch (err) {
      console.error(`  ✗ sim ${index} [${provider}] failed:`, err);
      await sb
        .from("simulations")
        .update({
          status: "failed",
          current_stage: "failed",
          error_message: err instanceof Error ? err.message : String(err),
        })
        .eq("id", simId);
    }
  };

  await Promise.all(
    [...groups.entries()].map(async ([prov, sims]) => {
      const limit = Math.min(PROVIDER_SIM_CONCURRENCY[prov] ?? 4, sims.length);
      let cursor = 0;
      await Promise.all(
        Array.from({ length: limit }, async () => {
          while (true) {
            const idx = cursor++;
            if (idx >= sims.length) return;
            await runOne(sims[idx]);
          }
        }),
      );
    }),
  );

  // 4. Aggregate + persist (mirrors aggregateAndPersist in route.ts).
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
    simulation_results: StoredResult | StoredResult[] | null;
  };
  const { data: rawRows, error: rowsErr } = await sb
    .from("simulations")
    .select(
      `id, ensemble_index, best_country, status, model_provider,
       simulation_results ( countries, personas, overview, risks, recommendations, pricing, creative )`,
    )
    .eq("ensemble_id", ensembleId);
  if (rowsErr) throw rowsErr;
  const rows = (rawRows ?? []) as unknown as EnsembleSimRow[];
  const completed = rows.filter((r) => r.status === "completed");
  const snapshots: EnsembleSimSnapshot[] = completed.flatMap((r) => {
    const result = Array.isArray(r.simulation_results)
      ? r.simulation_results[0]
      : r.simulation_results;
    if (!result) return [];
    const personas = (result.personas ?? []) as Array<{ country?: string; purchaseIntent?: number }>;
    const intentByCountry: Record<string, { n: number; meanIntent: number }> = {};
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
        gender?: string;
        incomeBand?: string;
        trustFactors?: unknown;
        objections?: unknown;
      };
      if (typeof rec.purchaseIntent !== "number" || !rec.country) return [];
      return [
        {
          country: rec.country.toUpperCase(),
          purchaseIntent: rec.purchaseIntent,
          voice: rec.voice,
          ageRange: rec.ageRange,
          profession: rec.profession,
          gender: rec.gender,
          incomeBand: rec.incomeBand,
          trustFactors: Array.isArray(rec.trustFactors)
            ? (rec.trustFactors as unknown[]).filter((x): x is string => typeof x === "string")
            : undefined,
          objections: Array.isArray(rec.objections)
            ? (rec.objections as unknown[]).filter((x): x is string => typeof x === "string")
            : undefined,
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
        overview: (result.overview ?? undefined) as EnsembleSimSnapshot["overview"],
        risks: (result.risks ?? undefined) as EnsembleSimSnapshot["risks"],
        recommendations: (result.recommendations ?? undefined) as EnsembleSimSnapshot["recommendations"],
        pricing: (result.pricing ?? undefined) as EnsembleSimSnapshot["pricing"],
        personas: compactPersonas,
        creative: (result.creative ?? undefined) as EnsembleSimSnapshot["creative"],
      },
    ];
  });
  const aggregate = aggregateEnsemble(snapshots);
  const finalStatus = snapshots.length === 0 ? "failed" : "completed";

  // Same narrative-merge step the production endpoint runs.
  if (snapshots.length > 0) {
    const narrative = await mergeNarrative({
      snapshots,
      productName: project.product_name,
      bestCountry: aggregate.recommendation.country,
      consensusPercent: aggregate.recommendation.consensusPercent,
      locale: "ko",
    });
    if (narrative) aggregate.narrative = narrative;
  }

  await sb
    .from("ensembles")
    .update({
      status: finalStatus,
      aggregate_result: aggregate,
      completed_at: new Date().toISOString(),
      error_message: snapshots.length === 0 ? "no completed sims to aggregate" : null,
    })
    .eq("id", ensembleId);

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\nDone in ${elapsed}s · status=${finalStatus} · ${snapshots.length}/${preset.parallelSims} sims completed`);
  if (aggregate && snapshots.length > 0) {
    console.log(
      `Recommendation: ${aggregate.recommendation.country} · ${aggregate.recommendation.consensusPercent}% (${aggregate.recommendation.confidence})`,
    );
  }
  console.log(`\nView in browser:`);
  console.log(`  http://localhost:3000/ko/projects/${project.id}/results?ensemble=${ensembleId}`);
  console.log(`Download PDF directly:`);
  console.log(`  http://localhost:3000/api/ensembles/${ensembleId}/pdf?locale=ko`);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});

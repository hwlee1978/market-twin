/**
 * Smoke test for buildEnsemblePdf — picks the most recent completed
 * ensemble in the DB, renders the PDF, writes it to disk, and prints
 * the path. Validates that the actual PDF code path works against real
 * aggregate data. Falls back to a synthetic fixture if the DB has no
 * completed ensembles yet (useful right after the table was added).
 *
 * Usage:
 *   npm run smoke:ensemble-pdf                  # latest completed (or synthetic)
 *   npm run smoke:ensemble-pdf -- <id-prefix>   # specific ensemble
 *   npm run smoke:ensemble-pdf -- en            # latest, English locale
 *   npm run smoke:ensemble-pdf -- --synthetic   # force synthetic fixture
 */
import { Client } from "pg";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildEnsemblePdf } from "../src/lib/report/ensemble-pdf";
import type { EnsembleAggregate } from "../src/lib/simulation/ensemble";

function syntheticFixture(): {
  aggregate: EnsembleAggregate;
  productName: string;
  tier: "hypothesis" | "decision" | "decision_plus" | "deep" | "deep_pro";
  parallelSims: number;
  perSimPersonas: number;
  llmProviders: string[];
} {
  return {
    productName: "Beauty of Joseon Glow Serum",
    tier: "decision",
    parallelSims: 5,
    perSimPersonas: 200,
    llmProviders: ["anthropic"],
    aggregate: {
      simCount: 5,
      effectivePersonas: 1000,
      bestCountryDistribution: [
        { country: "US", count: 4, percent: 80 },
        { country: "JP", count: 1, percent: 20 },
      ],
      recommendation: { country: "US", consensusPercent: 80, confidence: "STRONG" },
      countryStats: [
        {
          country: "US",
          finalScore: { mean: 78.4, median: 79, std: 3.1, min: 74, max: 82, range: 8 },
          demandScore: { mean: 81, median: 82 },
          cacEstimateUsd: { mean: 22.4, median: 22 },
          competitionScore: { mean: 68, median: 68 },
        },
        {
          country: "JP",
          finalScore: { mean: 71.2, median: 72, std: 4.4, min: 65, max: 76, range: 11 },
          demandScore: { mean: 70, median: 70 },
          cacEstimateUsd: { mean: 18.1, median: 18 },
          competitionScore: { mean: 55, median: 55 },
        },
        {
          country: "FR",
          finalScore: { mean: 64.0, median: 64, std: 2.7, min: 60, max: 67, range: 7 },
          demandScore: { mean: 62, median: 62 },
          cacEstimateUsd: { mean: 26.5, median: 26 },
          competitionScore: { mean: 58, median: 58 },
        },
        {
          country: "DE",
          finalScore: { mean: 58.6, median: 59, std: 3.0, min: 54, max: 62, range: 8 },
          demandScore: { mean: 56, median: 57 },
          cacEstimateUsd: { mean: 24.0, median: 24 },
          competitionScore: { mean: 60, median: 60 },
        },
      ],
      segments: [
        { id: "volume", labelKo: "속도 우선 (highest demand)", bestCountry: "US", bestValue: 82, alternative: { country: "JP", value: 70 } },
        { id: "cac", labelKo: "비용 효율 (lowest CAC)", bestCountry: "JP", bestValue: 18, alternative: { country: "US", value: 22 } },
        { id: "competition", labelKo: "경쟁 회피 (lowest competition)", bestCountry: "JP", bestValue: 55, alternative: { country: "FR", value: 58 } },
        { id: "overall", labelKo: "종합 점수 (highest finalScore)", bestCountry: "US", bestValue: 79, alternative: { country: "JP", value: 72 } },
      ],
      varianceAssessment: {
        maxFinalScoreRange: 11,
        meanFinalScoreRange: 8.5,
        label: "low",
        note: "Single-sim answer would have been reliable.",
      },
    },
  };
}

async function main() {
  const args = process.argv.slice(2);
  let idPrefix: string | undefined;
  let locale: "ko" | "en" = "ko";
  let forceSynthetic = false;
  for (const a of args) {
    if (a === "--synthetic") forceSynthetic = true;
    else if (a === "ko" || a === "en") locale = a;
    else idPrefix = a;
  }

  let payload: {
    aggregate: EnsembleAggregate;
    productName: string;
    tier: "hypothesis" | "decision" | "decision_plus" | "deep" | "deep_pro";
    parallelSims: number;
    perSimPersonas: number;
    llmProviders: string[];
    completedAt: Date;
    ensembleId: string;
    project?: {
      name: string;
      product_name: string;
      category: string | null;
      description: string | null;
      base_price_cents: number | null;
      currency: string | null;
      objective: string | null;
      originating_country: string | null;
      candidate_countries: string[] | null;
    };
  };

  if (forceSynthetic || !process.env.DATABASE_URL) {
    const f = syntheticFixture();
    payload = {
      ...f,
      completedAt: new Date(),
      ensembleId: "synthetic-00000000",
    };
    console.log("Using synthetic fixture (forced or no DATABASE_URL).");
  } else {
    const c = new Client({ connectionString: process.env.DATABASE_URL });
    await c.connect();
    try {
      const where = idPrefix
        ? `where e.id::text like '${idPrefix}%' and e.status = 'completed'`
        : `where e.status = 'completed'`;
      const { rows } = await c.query<{
        id: string;
        tier: string;
        parallel_sims: number;
        per_sim_personas: number;
        llm_providers: string[] | null;
        aggregate_result: EnsembleAggregate;
        completed_at: string | null;
        product_name: string;
        project_name: string | null;
        category: string | null;
        description: string | null;
        base_price_cents: number | null;
        currency: string | null;
        objective: string | null;
        originating_country: string | null;
        candidate_countries: string[] | null;
      }>(
        `select e.id::text as id, e.tier, e.parallel_sims, e.per_sim_personas,
                e.llm_providers, e.aggregate_result, e.completed_at,
                p.product_name,
                p.name as project_name, p.category, p.description,
                p.base_price_cents, p.currency, p.objective,
                p.originating_country, p.candidate_countries
           from public.ensembles e
           join public.projects p on p.id = e.project_id
           ${where}
          order by e.completed_at desc nulls last
          limit 1`,
      );
      if (rows.length === 0) {
        console.log("No completed ensembles in DB — falling back to synthetic fixture.");
        const f = syntheticFixture();
        payload = { ...f, completedAt: new Date(), ensembleId: "synthetic-00000000" };
      } else {
        const e = rows[0];
        payload = {
          aggregate: e.aggregate_result,
          productName: e.product_name,
          tier: e.tier as "hypothesis" | "decision" | "decision_plus" | "deep" | "deep_pro",
          parallelSims: e.parallel_sims,
          perSimPersonas: e.per_sim_personas,
          llmProviders: e.llm_providers ?? ["anthropic"],
          completedAt: e.completed_at ? new Date(e.completed_at) : new Date(),
          ensembleId: e.id,
          project: {
            name: e.project_name ?? "",
            product_name: e.product_name,
            category: e.category,
            description: e.description,
            base_price_cents: e.base_price_cents,
            currency: e.currency,
            objective: e.objective,
            originating_country: e.originating_country,
            candidate_countries: e.candidate_countries,
          },
        };
      }
    } finally {
      await c.end();
    }
  }

  console.log(`Rendering PDF for ensemble ${payload.ensembleId.slice(0, 8)}`);
  console.log(`  Product: ${payload.productName}`);
  console.log(`  Tier: ${payload.tier} · ${payload.parallelSims}×${payload.perSimPersonas}`);
  console.log(`  LLMs: ${payload.llmProviders.join(", ")}`);
  console.log(`  Locale: ${locale}`);

  const t0 = Date.now();
  const buffer = await buildEnsemblePdf({
    aggregate: payload.aggregate,
    productName: payload.productName,
    tier: payload.tier,
    parallelSims: payload.parallelSims,
    perSimPersonas: payload.perSimPersonas,
    llmProviders: payload.llmProviders,
    locale,
    generatedAt: payload.completedAt,
    ensembleId: payload.ensembleId,
    project: payload.project,
  });
  const elapsed = Date.now() - t0;

  const outPath = resolve(
    process.cwd(),
    `smoke-ensemble-${payload.ensembleId.slice(0, 8)}-${locale}.pdf`,
  );
  await writeFile(outPath, buffer);
  console.log(`\nOK · ${buffer.length.toLocaleString()} bytes · ${elapsed}ms`);
  console.log(`Wrote: ${outPath}`);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});

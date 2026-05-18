/**
 * Phase F.2 B1 A/B test — replays the winner-picker logic with and without
 * provider weighting on the LATEST ensemble per fixture, then scores both
 * against ground truth.
 *
 * No new sim spawn cost — uses existing simulation_results.countries rows.
 * Reimplements the rank-aggregation loop client-side so we don't have to
 * fake EnsembleSimSnapshot's full schema.
 *
 *   npx tsx --env-file=.env.local scripts/ab-test-provider-weights.ts
 */

import { Client } from "pg";
import { loadAllGroundTruth, type LoadedTruth } from "@/lib/validation/loader";
import { scoreEnsemble, type SimAggregate } from "@/lib/validation/score";
import { pairedTTest } from "@/lib/validation/stats";
import {
  getProviderWeight,
  normalizeCategory,
} from "@/lib/simulation/calibration/provider-weights";

interface SimRow {
  bestCountry: string | null;
  provider: string | null;
  countries: Array<{ country: string; finalScore: number }>;
}

interface ProductEnsemble {
  slug: string;
  ensembleId: string;
  productName: string;
  category: string | null;
  truth: LoadedTruth["truth"];
  sims: SimRow[];
}

async function loadLatest(): Promise<ProductEnsemble[]> {
  const truths = await loadAllGroundTruth();
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const out: ProductEnsemble[] = [];
  for (const t of truths) {
    const slugPart = t.truth.product.split(" ")[0];
    const { rows: ens } = await c.query<{ id: string; product_name: string; category: string | null }>(
      `select e.id::text as id, p.product_name, p.category
         from public.ensembles e
         join public.projects p on p.id = e.project_id
        where e.status = 'completed' and p.product_name ilike $1
        order by e.created_at desc limit 1`,
      [`%${slugPart}%`],
    );
    if (!ens.length) continue;
    const e = ens[0];
    const { rows: simRows } = await c.query<{
      best_country: string | null;
      model_provider: string | null;
      countries: SimRow["countries"];
    }>(
      `select s.best_country, s.model_provider, r.countries
         from public.simulations s
         join public.simulation_results r on r.simulation_id = s.id
        where s.ensemble_id = $1 and s.status = 'completed'
        order by s.ensemble_index`,
      [e.id],
    );
    out.push({
      slug: t.slug,
      ensembleId: e.id,
      productName: e.product_name,
      category: e.category,
      truth: t.truth,
      sims: simRows.map((s) => ({
        bestCountry: s.best_country,
        provider: s.model_provider,
        countries: s.countries ?? [],
      })),
    });
  }
  await c.end();
  return out;
}

/** Replays the Phase E mean-rank winner picker (with optional F.2 weighting). */
function pickWinner(
  sims: SimRow[],
  category: string | null,
  weightingEnabled: boolean,
): { winner: string | null; consensusPercent: number; totalSims: number; perCountryMeanScore: Record<string, number>; bestCountryVotes: Record<string, number> } {
  if (weightingEnabled) process.env.PHASE_F2_ENABLED = "true";
  else delete process.env.PHASE_F2_ENABLED;
  const normalized = normalizeCategory(category);

  const rankByCountry = new Map<string, { rank: number; weight: number }[]>();
  const scoreByCountry = new Map<string, { sum: number; n: number }>();
  const bestVotes: Record<string, number> = {};

  for (const s of sims) {
    if (s.bestCountry) bestVotes[s.bestCountry] = (bestVotes[s.bestCountry] ?? 0) + 1;
    const sorted = [...s.countries].sort((a, b) => b.finalScore - a.finalScore);
    const weight = getProviderWeight(normalized, s.provider ?? null);
    sorted.forEach((c, i) => {
      const k = c.country.toUpperCase();
      const arr = rankByCountry.get(k) ?? [];
      arr.push({ rank: i + 1, weight });
      rankByCountry.set(k, arr);
      const score = scoreByCountry.get(k) ?? { sum: 0, n: 0 };
      score.sum += c.finalScore * weight;
      score.n += weight;
      scoreByCountry.set(k, score);
    });
  }

  const meanRanking = [...rankByCountry.entries()]
    .map(([country, entries]) => {
      const totalW = entries.reduce((a, e) => a + e.weight, 0);
      const meanRank = totalW > 0
        ? entries.reduce((a, e) => a + e.rank * e.weight, 0) / totalW
        : 0;
      const sc = scoreByCountry.get(country)!;
      const meanScore = sc.n > 0 ? sc.sum / sc.n : 0;
      return { country, meanRank, meanScore };
    })
    .sort((a, b) => {
      const dr = a.meanRank - b.meanRank;
      if (Math.abs(dr) > 1e-3) return dr;
      return b.meanScore - a.meanScore;
    });

  delete process.env.PHASE_F2_ENABLED;

  const winner = meanRanking[0]?.country ?? null;
  let top3Hits = 0;
  for (const s of sims) {
    const sorted = [...s.countries].sort((a, b) => b.finalScore - a.finalScore);
    const top3 = sorted.slice(0, 3).map((c) => c.country.toUpperCase());
    if (winner && top3.includes(winner)) top3Hits++;
  }
  const perCountryMeanScore: Record<string, number> = {};
  for (const [k, sc] of scoreByCountry.entries()) {
    perCountryMeanScore[k] = sc.n > 0 ? sc.sum / sc.n : 0;
  }
  return {
    winner,
    consensusPercent: sims.length ? Math.round((top3Hits / sims.length) * 100) : 0,
    totalSims: sims.length,
    perCountryMeanScore,
    bestCountryVotes: bestVotes,
  };
}

async function run() {
  console.log("Loading latest ensemble per fixture...");
  const products = await loadLatest();
  console.log(`Loaded ${products.length} fixtures with ensembles\n`);

  const rows: Array<{ slug: string; uniform: number; weighted: number; delta: number; flip: boolean }> = [];

  for (const p of products) {
    const u = pickWinner(p.sims, p.category, false);
    const w = pickWinner(p.sims, p.category, true);

    const aggU: SimAggregate = {
      ensembleId: p.ensembleId,
      perCountryMeanScore: u.perCountryMeanScore,
      bestCountryVotes: u.bestCountryVotes,
      pickedWinner: u.winner ? u.winner.toUpperCase() : null,
      pickedWinnerConsensusPercent: u.consensusPercent,
      totalSims: u.totalSims,
    };
    const aggW: SimAggregate = {
      ensembleId: p.ensembleId,
      perCountryMeanScore: w.perCountryMeanScore,
      bestCountryVotes: w.bestCountryVotes,
      pickedWinner: w.winner ? w.winner.toUpperCase() : null,
      pickedWinnerConsensusPercent: w.consensusPercent,
      totalSims: w.totalSims,
    };
    const scoreU = scoreEnsemble(p.slug, aggU, p.truth);
    const scoreW = scoreEnsemble(p.slug, aggW, p.truth);
    const delta = scoreW.composite - scoreU.composite;
    const flip = u.winner !== w.winner;
    rows.push({ slug: p.slug, uniform: scoreU.composite, weighted: scoreW.composite, delta, flip });
    const flag = flip ? `  FLIP ${u.winner}→${w.winner}` : "";
    console.log(
      `  ${p.slug.padEnd(28)} uniform=${scoreU.composite.toFixed(1).padStart(5)}  weighted=${scoreW.composite.toFixed(1).padStart(5)}  Δ=${delta.toFixed(1).padStart(6)}${flag}`,
    );
  }

  console.log("");
  const meanU = rows.reduce((a, r) => a + r.uniform, 0) / rows.length;
  const meanW = rows.reduce((a, r) => a + r.weighted, 0) / rows.length;
  console.log(`Mean uniform:  ${meanU.toFixed(2)}`);
  console.log(`Mean weighted: ${meanW.toFixed(2)}`);
  console.log(`Mean Δ:        ${(meanW - meanU).toFixed(2)} pt`);

  if (rows.length >= 2) {
    const t = pairedTTest(rows.map((r) => r.uniform), rows.map((r) => r.weighted));
    console.log("");
    console.log(`Paired t-test (n=${t.n}):`);
    console.log(`  mean Δ = ${t.delta.toFixed(2)} ± ${t.stderr.toFixed(2)} SE`);
    console.log(`  t = ${t.t.toFixed(2)}, df = ${t.df}, p = ${t.pValue.toFixed(4)}  ${t.significant95 ? "✓ significant at 95%" : "(not significant at 95%)"}`);
    console.log(`  95% CI for Δ: [${t.ci95[0].toFixed(2)}, ${t.ci95[1].toFixed(2)}]`);
  }

  console.log("");
  const flips = rows.filter((r) => r.flip);
  console.log(`Winner flips: ${flips.length}/${rows.length}`);
  for (const f of flips) {
    console.log(`  ${f.slug}: ${f.delta > 0 ? "+" : ""}${f.delta.toFixed(1)} pt`);
  }

  console.log("");
  const meanDelta = meanW - meanU;
  if (meanDelta >= 5) console.log("✓ Mean Δ ≥ +5pt — Gate 2 candidate.");
  else if (meanDelta > 0) console.log("△ Positive but <+5pt.");
  else console.log("✗ Non-positive Δ. F.2 weight matrix needs revisit.");
}

run().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});

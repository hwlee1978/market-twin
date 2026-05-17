/**
 * Run the accuracy benchmark.
 *
 * Modes:
 *   single         : Score one ensemble per product (the latest matching the
 *                    product name) and print composite + sub-scores.
 *   compare        : Pair products by slug between two ensemble sets (A vs B)
 *                    and run a paired t-test. Prefixes provided by user.
 *   compare-latest : Like --compare, but auto-resolves A and B as the latest
 *                    two completed ensembles per product (B = newest, A = its
 *                    immediate predecessor). For the common "I just ran a new
 *                    benchmark, compare it to the previous one" workflow.
 *
 * Usage:
 *   tsx scripts/benchmark.ts --single
 *   tsx scripts/benchmark.ts --single buldak=10dbb41a shin-ramyun=4fc8bfef \
 *     cosrx-snail-mucin=22357286 jinro-chamisul=315a49ae
 *   tsx scripts/benchmark.ts --compare \
 *     buldak=10dbb41a,d226eff6  jinro-chamisul=315a49ae,79934f1f
 *   tsx scripts/benchmark.ts --compare-latest
 *   tsx scripts/benchmark.ts --compare-latest --products bibigo-mandu,binggrae-melona
 */

import { Client } from "pg";
import { loadAllGroundTruth, type LoadedTruth } from "@/lib/validation/loader";
import {
  scoreEnsemble,
  alignForPairedTest,
  type SimAggregate,
  type ScoreReport,
} from "@/lib/validation/score";
import {
  bootstrapMeanCI,
  pairedTTest,
} from "@/lib/validation/stats";
import {
  classifyOne,
  classifyDataset,
  classifyDrift,
  type FailureFinding,
  type DatasetEntry,
  type DriftInput,
} from "@/lib/validation/failure-modes";

interface EnsembleSpec {
  slug: string;
  prefixes: string[]; // 1 element for single mode, 2 for compare
}

function parseSpecs(args: string[]): EnsembleSpec[] {
  const specs: EnsembleSpec[] = [];
  for (const a of args) {
    const [slug, rest] = a.split("=");
    if (!slug || !rest) {
      throw new Error(`Bad spec '${a}'. Expected slug=prefix or slug=prefixA,prefixB`);
    }
    specs.push({ slug, prefixes: rest.split(",").map((s) => s.trim()).filter(Boolean) });
  }
  return specs;
}

async function fetchEnsembleAggregate(c: Client, prefix: string, slug: string): Promise<SimAggregate> {
  const { rows: ens } = await c.query<{ id: string; aggregate_result: { recommendation?: { country?: string; consensusPercent?: number } } | null }>(
    `select e.id::text as id, e.aggregate_result from public.ensembles e
       where e.id::text like $1 and e.status = 'completed'
       order by e.created_at desc limit 1`,
    [`${prefix}%`],
  );
  if (!ens.length) throw new Error(`No completed ensemble for prefix '${prefix}' (product ${slug})`);
  const ensembleId = ens[0].id;
  const { rows: sims } = await c.query<{
    countries: { country: string; finalScore: number }[];
    best_country: string | null;
  }>(
    `select r.countries, s.best_country
       from public.simulations s
       join public.simulation_results r on r.simulation_id = s.id
      where s.ensemble_id = $1 and s.status = 'completed'`,
    [ensembleId],
  );
  const perCountrySum: Record<string, number> = {};
  const perCountryCount: Record<string, number> = {};
  const bestVotes: Record<string, number> = {};
  for (const s of sims) {
    if (s.best_country) bestVotes[s.best_country] = (bestVotes[s.best_country] ?? 0) + 1;
    for (const c of s.countries ?? []) {
      perCountrySum[c.country] = (perCountrySum[c.country] ?? 0) + c.finalScore;
      perCountryCount[c.country] = (perCountryCount[c.country] ?? 0) + 1;
    }
  }
  const perCountryMeanScore: Record<string, number> = {};
  for (const k of Object.keys(perCountrySum)) {
    perCountryMeanScore[k] = perCountrySum[k] / perCountryCount[k];
  }
  // Phase F.0.5 fix: surface ensemble.recommendation.country (Phase E
  // mean-rank winner) so confidenceCalibration scores against the runner's
  // actual recommendation, not the legacy vote mode. Falls back to null
  // when ensembles row pre-dates Phase E or aggregate_result is missing.
  const rec =
    typeof ens[0].aggregate_result === "object" && ens[0].aggregate_result
      ? ens[0].aggregate_result.recommendation
      : null;
  const pickedWinner = rec?.country ?? null;
  return {
    ensembleId,
    perCountryMeanScore,
    bestCountryVotes: bestVotes,
    pickedWinner: pickedWinner && pickedWinner !== "?" ? pickedWinner.toUpperCase() : null,
    pickedWinnerConsensusPercent: rec?.consensusPercent ?? null,
    totalSims: sims.length,
  };
}

/** Defaults if user doesn't pass specs: use the latest ensemble matching each
 *  product's name. Implemented loosely — match by product_name LIKE. */
async function autoResolveSpecs(c: Client, truths: LoadedTruth[]): Promise<EnsembleSpec[]> {
  const out: EnsembleSpec[] = [];
  for (const t of truths) {
    const { rows } = await c.query<{ id: string }>(
      `select e.id::text as id from public.ensembles e
       join public.projects p on p.id = e.project_id
       where e.status = 'completed' and p.product_name ilike $1
       order by e.created_at desc limit 1`,
      [`%${t.truth.product.split(" ")[0]}%`],
    );
    if (rows.length) out.push({ slug: t.slug, prefixes: [rows[0].id.slice(0, 8)] });
  }
  return out;
}

/** For --compare-latest: per product, fetch the 2 most-recent completed
 *  ensembles. Returns slug=prefixA,prefixB pairs where prefixB is newest. */
async function autoResolveCompareLatest(
  c: Client,
  truths: LoadedTruth[],
  productFilter?: Set<string>,
): Promise<EnsembleSpec[]> {
  const out: EnsembleSpec[] = [];
  for (const t of truths) {
    if (productFilter && !productFilter.has(t.slug)) continue;
    const { rows } = await c.query<{ id: string }>(
      `select e.id::text as id from public.ensembles e
       join public.projects p on p.id = e.project_id
       where e.status = 'completed' and p.product_name ilike $1
       order by e.created_at desc limit 2`,
      [`%${t.truth.product.split(" ")[0]}%`],
    );
    if (rows.length < 2) {
      console.warn(`  ⚠ ${t.slug}: only ${rows.length} completed ensemble(s) found, skipping`);
      continue;
    }
    // A = previous, B = newest. Order matches user-facing "A vs B (Δ = B-A)".
    out.push({ slug: t.slug, prefixes: [rows[1].id.slice(0, 8), rows[0].id.slice(0, 8)] });
  }
  return out;
}

async function single(c: Client, truths: LoadedTruth[], specs: EnsembleSpec[]) {
  const bySlug = new Map(truths.map((t) => [t.slug, t]));
  const reports: ScoreReport[] = [];
  const datasetEntries: DatasetEntry[] = [];
  const perProductFindings: FailureFinding[] = [];
  for (const spec of specs) {
    const truth = bySlug.get(spec.slug);
    if (!truth) {
      console.warn(`  ✗ ${spec.slug}: no ground truth file`);
      continue;
    }
    const agg = await fetchEnsembleAggregate(c, spec.prefixes[0], spec.slug);
    const report = scoreEnsemble(spec.slug, agg, truth.truth);
    reports.push(report);
    datasetEntries.push({ productSlug: spec.slug, agg, truth: truth.truth });
    perProductFindings.push(...classifyOne(agg, truth.truth, spec.slug));
    printReport(report);
  }
  printBenchmarkSummary(reports, truths);
  const datasetFindings = classifyDataset(datasetEntries);
  printFindings([...perProductFindings, ...datasetFindings]);
}

function printReport(r: ScoreReport) {
  console.log(`\n┌── ${r.productSlug}  ·  ensemble ${r.ensembleId.slice(0, 8)}`);
  console.log(`│  composite ${r.composite.toFixed(1)} / 100`);
  for (const [k, v] of Object.entries(r.sub)) {
    const val = Number.isNaN(v) ? "n/a" : v.toFixed(2);
    console.log(`│    ${k.padEnd(22)} ${val.padStart(5)}    ${r.rationale[k as keyof typeof r.rationale]}`);
  }
}

function printBenchmarkSummary(reports: ScoreReport[], truths: LoadedTruth[]) {
  if (reports.length === 0) return;
  const splitBySlug = new Map(truths.map((t) => [t.slug, t.truth.split]));
  const composites = reports.map((r) => r.composite);
  const ci = bootstrapMeanCI(composites, 2000, 42);
  console.log("\n══ Benchmark summary");
  console.log(`  n=${reports.length} products  ·  mean composite = ${ci.pointEstimate.toFixed(1)}  ·  95% CI [${ci.lo.toFixed(1)}, ${ci.hi.toFixed(1)}]`);
  const tuning = reports.filter((r) => splitBySlug.get(r.productSlug) === "TUNING").map((r) => r.composite);
  const holdout = reports.filter((r) => splitBySlug.get(r.productSlug) === "HOLDOUT").map((r) => r.composite);
  if (tuning.length) {
    const t = bootstrapMeanCI(tuning, 2000, 43);
    console.log(`  TUNING  n=${tuning.length}  mean=${t.pointEstimate.toFixed(1)}  CI [${t.lo.toFixed(1)}, ${t.hi.toFixed(1)}]`);
  }
  if (holdout.length) {
    const h = bootstrapMeanCI(holdout, 2000, 44);
    console.log(`  HOLDOUT n=${holdout.length}  mean=${h.pointEstimate.toFixed(1)}  CI [${h.lo.toFixed(1)}, ${h.hi.toFixed(1)}]`);
  }
}

async function compare(c: Client, truths: LoadedTruth[], specs: EnsembleSpec[]) {
  const bySlug = new Map(truths.map((t) => [t.slug, t]));
  const reportsA: ScoreReport[] = [];
  const reportsB: ScoreReport[] = [];
  const driftInputs: DriftInput[] = [];
  for (const spec of specs) {
    const truth = bySlug.get(spec.slug);
    if (!truth) {
      console.warn(`  ✗ ${spec.slug}: no ground truth file`);
      continue;
    }
    if (spec.prefixes.length !== 2) {
      throw new Error(`compare mode needs slug=prefixA,prefixB — got ${spec.prefixes.length} for ${spec.slug}`);
    }
    const aggA = await fetchEnsembleAggregate(c, spec.prefixes[0], spec.slug);
    const aggB = await fetchEnsembleAggregate(c, spec.prefixes[1], spec.slug);
    const rA = scoreEnsemble(spec.slug, aggA, truth.truth);
    const rB = scoreEnsemble(spec.slug, aggB, truth.truth);
    reportsA.push(rA);
    reportsB.push(rB);
    driftInputs.push({ before: rA, after: rB });
    console.log(`  ${spec.slug.padEnd(28)}  A: ${rA.composite.toFixed(1)}   B: ${rB.composite.toFixed(1)}   Δ ${(rB.composite - rA.composite).toFixed(1)}`);
  }
  const pairs = alignForPairedTest(reportsA, reportsB);
  if (pairs.length < 2) {
    console.log("\n  (need ≥2 paired products for t-test; skipping)");
  } else {
    const test = pairedTTest(pairs.map((p) => p.scoreA), pairs.map((p) => p.scoreB));
    console.log(`\n══ Paired t-test (n=${test.n} products)`);
    console.log(`  mean Δ (B-A) = ${test.delta.toFixed(2)}  ±  ${test.stderr.toFixed(2)} SE`);
    console.log(`  t = ${test.t.toFixed(2)}, df = ${test.df}, p = ${test.pValue.toFixed(4)}  ${test.significant95 ? "✓ significant at 95%" : "(not significant at 95%)"}`);
    console.log(`  95% CI for Δ: [${test.ci95[0].toFixed(2)}, ${test.ci95[1].toFixed(2)}]`);
  }
  printFindings(classifyDrift(driftInputs));
}

function printFindings(findings: FailureFinding[]) {
  if (findings.length === 0) {
    console.log("\n  ✓ No failure modes triggered.");
    return;
  }
  console.log("\n══ Failure mode findings");
  const order: Record<string, number> = { critical: 0, warning: 1, info: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);
  for (const f of findings) {
    const tag = f.severity === "critical" ? "✗ CRIT" : f.severity === "warning" ? "⚠ WARN" : "  INFO";
    const scope = f.productSlug ?? (f.countries?.length ? `country ${f.countries.join(",")}` : "dataset");
    console.log(`  ${tag} [${f.mode}]  ${scope}`);
    console.log(`         ${f.message}`);
    if (f.recommendation) console.log(`         → ${f.recommendation}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const mode = args[0];
  const rest = args.slice(1);

  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    const truths = await loadAllGroundTruth();
    if (mode === "--single") {
      const specs = rest.length ? parseSpecs(rest) : await autoResolveSpecs(c, truths);
      await single(c, truths, specs);
    } else if (mode === "--compare") {
      if (!rest.length) throw new Error("--compare needs at least one slug=prefixA,prefixB spec");
      await compare(c, truths, parseSpecs(rest));
    } else if (mode === "--compare-latest") {
      let productFilter: Set<string> | undefined;
      const pIdx = rest.indexOf("--products");
      if (pIdx >= 0 && rest[pIdx + 1]) {
        productFilter = new Set(rest[pIdx + 1].split(",").map((s) => s.trim()).filter(Boolean));
      }
      const specs = await autoResolveCompareLatest(c, truths, productFilter);
      if (specs.length < 2) {
        throw new Error(`compare-latest needs ≥2 products with 2+ ensembles each (got ${specs.length})`);
      }
      console.log(`Auto-resolved ${specs.length} product pairs (prev vs newest):`);
      for (const s of specs) console.log(`  ${s.slug.padEnd(28)}  A=${s.prefixes[0]}  →  B=${s.prefixes[1]}`);
      console.log();
      await compare(c, truths, specs);
    } else {
      console.error("Usage: tsx scripts/benchmark.ts --single [slug=prefix ...]");
      console.error("       tsx scripts/benchmark.ts --compare slug=prefixA,prefixB ...");
      console.error("       tsx scripts/benchmark.ts --compare-latest [--products slug1,slug2,...]");
      process.exit(1);
    }
  } finally {
    await c.end();
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});

/**
 * Ensemble runner — orchestrates N parallel sims of the same project for
 * confidence-graded results. MVP CLI version; productize as API endpoint
 * once we've validated the output quality on a real fixture.
 *
 * Writes a real `ensembles` row and stamps ensemble_id on every sim
 * before starting them. Two things depend on that and used to break:
 * the runner skips its per-sim completion email only for sims that
 * belong to an ensemble (otherwise a 6-sim run mails you six times),
 * and smoke:ensemble-pdf can only render an ensemble the table knows
 * about.
 *
 * Each sim within the ensemble uses a distinct seed (`<ensembleId>-<index>`)
 * so they draw different persona samples. Aggregating the N results gives
 * the bestCountry distribution, per-country score variance, and segment-
 * based recommendations that single-sim view can't surface.
 *
 * Usage:
 *   npm run ensemble:run -- <project_id_prefix> [parallel=5] [perSim=200]
 *
 * Examples:
 *   npm run ensemble:run -- 48f1041d                # 5 × 200 = 1000 personas
 *   npm run ensemble:run -- 48f1041d 10 200         # 10 × 200 = 2000
 *   npm run ensemble:run -- 48f1041d 5 500          # 5 × 500 = 2500
 */
import { Client } from "pg";
import { runSimulation } from "../packages/shared/src/simulation/runner";
import { aggregateEnsemble } from "../packages/shared/src/simulation/ensemble";
import type { EnsembleSimSnapshot } from "../packages/shared/src/simulation/ensemble";
import { mergeNarrative } from "../packages/shared/src/simulation/ensemble-narrative";
import type { CountryScore } from "../packages/shared/src/simulation/schemas";
import type { ProjectInput } from "../packages/shared/src/simulation/schemas";

interface ProjectRow {
  id: string;
  workspace_id: string;
  created_by: string | null;
  product_name: string;
  category: string;
  description: string;
  base_price_cents: number;
  currency: string;
  objective: string;
  originating_country: string;
  candidate_countries: string[];
  competitor_urls: string[] | null;
  asset_descriptions: string[] | null;
  asset_urls: string[] | null;
  founder_background: string | null;
  channel_priority: string | null;
  kol_relationships: string | null;
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
}
function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}
function std(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

async function main() {
  const [, , projectPrefix, parallelArg, perSimArg] = process.argv;
  if (!projectPrefix) {
    console.error("Usage: npm run ensemble:run -- <project_id_prefix> [parallel=5] [perSim=200]");
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("ERROR: DATABASE_URL env var is required.");
    process.exit(1);
  }
  const parallel = Math.max(1, Number.parseInt(parallelArg ?? "5", 10));
  const perSim = Math.max(10, Number.parseInt(perSimArg ?? "200", 10));
  const totalPersonas = parallel * perSim;

  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  let project: ProjectRow | null = null;
  try {
    const { rows } = await c.query<ProjectRow>(
      `select id::text, workspace_id::text, created_by::text, product_name, category, description,
              base_price_cents, currency, objective, originating_country,
              candidate_countries, competitor_urls, asset_descriptions, asset_urls,
              founder_background, channel_priority, kol_relationships
       from public.projects where id::text like $1 limit 1`,
      [`${projectPrefix}%`],
    );
    project = rows[0] ?? null;
    if (!project) {
      console.error(`No project found with id prefix ${projectPrefix}`);
      process.exit(1);
    }
  } finally {
    await c.end();
  }

  const ensembleId = crypto.randomUUID();
  {
    const c2 = new Client({ connectionString: process.env.DATABASE_URL });
    await c2.connect();
    try {
      await c2.query(
        `insert into public.ensembles
            (id, project_id, workspace_id, created_by, tier, parallel_sims,
             per_sim_personas, llm_providers, status, locale)
          values ($1,$2,$3,$4,$5,$6,$7,'{anthropic}','running','ko')`,
        [
          ensembleId,
          project.id,
          project.workspace_id,
          project.created_by ?? null,
          tierFor(parallel),
          parallel,
          perSim,
        ],
      );
    } finally {
      await c2.end();
    }
  }
  console.log(`\n${"=".repeat(72)}`);
  console.log(`Ensemble Run`);
  console.log(`  Ensemble: ${ensembleId.slice(0, 8)}`);
  console.log(`  Project:  ${project.id.slice(0, 8)} · ${project.product_name}`);
  console.log(`  Markets:  ${project.candidate_countries.join(", ")}`);
  console.log(`  Plan:     ${parallel} parallel sims × ${perSim} personas = ${totalPersonas} total`);
  console.log(`${"=".repeat(72)}\n`);

  const brandStrategy =
    project.founder_background || project.channel_priority || project.kol_relationships
      ? {
          ...(project.founder_background ? { founderBackground: project.founder_background } : {}),
          ...(project.channel_priority
            ? {
                channelPriority: project.channel_priority as NonNullable<
                  ProjectInput["brandStrategy"]
                >["channelPriority"],
              }
            : {}),
          ...(project.kol_relationships ? { kolRelationships: project.kol_relationships } : {}),
        }
      : undefined;

  const projectInput: ProjectInput = {
    productName: project.product_name,
    category: project.category,
    description: project.description,
    basePriceCents: project.base_price_cents,
    currency: project.currency,
    objective: project.objective as ProjectInput["objective"],
    originatingCountry: project.originating_country,
    candidateCountries: project.candidate_countries,
    competitorUrls: project.competitor_urls ?? [],
    assetDescriptions: project.asset_descriptions ?? [],
    assetUrls: project.asset_urls ?? [],
    ...(brandStrategy ? { brandStrategy } : {}),
  };

  // Insert N simulation rows up front so they all have valid IDs the runner
  // can persist to. Each gets a distinct seedOverride so persona draws vary.
  const adminClient = new Client({ connectionString: process.env.DATABASE_URL });
  await adminClient.connect();
  const simIds: string[] = [];
  try {
    for (let i = 0; i < parallel; i++) {
      const { rows } = await adminClient.query<{ id: string }>(
        `insert into public.simulations
            (project_id, workspace_id, status, persona_count, current_stage,
             ensemble_id, ensemble_index)
          values ($1, $2, 'pending', $3, 'validating', $4, $5)
          returning id::text`,
        [project.id, project.workspace_id, perSim, ensembleId, i],
      );
      simIds.push(rows[0].id);
    }
  } finally {
    await adminClient.end();
  }
  console.log(`Created ${simIds.length} simulation rows. Starting parallel pipelines...\n`);

  const tStart = Date.now();
  const results = await Promise.allSettled(
    simIds.map((simId, idx) =>
      runSimulation({
        simulationId: simId,
        projectInput,
        personaCount: perSim,
        locale: "ko",
        seedOverride: `${ensembleId}-${idx}`,
      }).then((r) => ({ idx, simId, ok: true as const, result: r }))
        .catch((err) => ({ idx, simId, ok: false as const, error: err instanceof Error ? err.message : String(err) })),
    ),
  );
  const wallSec = ((Date.now() - tStart) / 1000).toFixed(1);
  console.log(`\nAll sims settled in ${wallSec}s (parallel wall time).`);

  const okResults = results.flatMap((r) =>
    r.status === "fulfilled" && r.value.ok
      ? [{ idx: r.value.idx, simId: r.value.simId }]
      : [],
  );
  const failed = results.length - okResults.length;
  if (failed > 0) {
    console.warn(`⚠️  ${failed}/${results.length} sims failed — aggregation uses ${okResults.length} successful.`);
  }

  // Re-read simulation_results from DB so we get the persisted, schema-validated
  // snapshot — same source the UI/PDF would use.
  const c2 = new Client({ connectionString: process.env.DATABASE_URL });
  await c2.connect();
  type CountryRow = { country: string; demandScore: number; cacEstimateUsd: number; competitionScore: number; finalScore: number };
  type SimResult = { sim_id: string; best_country: string | null; countries: CountryRow[]; personas: Array<{ country?: string; purchaseIntent?: number }>; overview: { headline?: string; bestSegment?: string } };
  let sims: SimResult[] = [];
  try {
    const { rows } = await c2.query<SimResult>(
      `select s.id::text as sim_id, s.best_country, r.countries, r.personas, r.overview
       from public.simulations s
       join public.simulation_results r on r.simulation_id = s.id
       where s.id = ANY($1::uuid[])`,
      [okResults.map((r) => r.simId)],
    );
    sims = rows;
  } finally {
    await c2.end();
  }

  console.log(`\n${"=".repeat(72)}`);
  console.log(`AGGREGATE RESULT (${sims.length} sims, ${perSim * sims.length} effective personas)`);
  console.log(`${"=".repeat(72)}\n`);

  // bestCountry distribution
  const bestFreq = new Map<string, number>();
  for (const s of sims) {
    const k = s.best_country ?? "?";
    bestFreq.set(k, (bestFreq.get(k) ?? 0) + 1);
  }
  console.log(`bestCountry distribution:`);
  const sortedBest = [...bestFreq.entries()].sort((a, b) => b[1] - a[1]);
  for (const [country, n] of sortedBest) {
    const pct = ((n / sims.length) * 100).toFixed(0);
    const bar = "█".repeat(Math.round((n / sims.length) * 30));
    console.log(`  ${country.padEnd(4)} ${String(n).padStart(2)}/${sims.length} (${pct.padStart(3)}%) ${bar}`);
  }
  const winner = sortedBest[0];
  const consensusPct = (winner[1] / sims.length) * 100;
  const confidence = consensusPct >= 80 ? "STRONG" : consensusPct >= 50 ? "MODERATE" : "WEAK";
  console.log(`  → Recommendation: ${winner[0]} (${consensusPct.toFixed(0)}% consensus, ${confidence})\n`);

  // Per-country finalScore stats
  const countryFinal = new Map<string, number[]>();
  for (const s of sims) {
    for (const c of s.countries) {
      const arr = countryFinal.get(c.country) ?? [];
      arr.push(c.finalScore);
      countryFinal.set(c.country, arr);
    }
  }
  console.log(`Per-country finalScore (n=${sims.length}):`);
  console.log(`  Country | mean   median  std    range`);
  const sortedCountries = [...countryFinal.entries()]
    .map(([country, scores]) => ({ country, scores, m: mean(scores) }))
    .sort((a, b) => b.m - a.m);
  for (const { country, scores } of sortedCountries) {
    const m = mean(scores).toFixed(1);
    const md = median(scores).toFixed(1);
    const s = std(scores).toFixed(1);
    const rng = (Math.max(...scores) - Math.min(...scores)).toFixed(0);
    console.log(`  ${country.padEnd(7)} | ${m.padStart(5)}  ${md.padStart(5)}   ${s.padStart(4)}   ${rng.padStart(2)}`);
  }

  // Segment-based recommendations
  console.log(`\nSegment-based recommendations:`);
  const segments = [
    { name: "속도 우선 (highest demand)", metric: "demandScore" as const, dir: "high" as const },
    { name: "비용 효율 (lowest CAC)", metric: "cacEstimateUsd" as const, dir: "low" as const },
    { name: "경쟁 회피 (lowest competition)", metric: "competitionScore" as const, dir: "low" as const },
    { name: "종합 점수 (highest finalScore)", metric: "finalScore" as const, dir: "high" as const },
  ];
  for (const seg of segments) {
    const byCountry = new Map<string, number[]>();
    for (const s of sims) {
      for (const c of s.countries) {
        const v = c[seg.metric];
        if (typeof v !== "number") continue;
        const arr = byCountry.get(c.country) ?? [];
        arr.push(v);
        byCountry.set(c.country, arr);
      }
    }
    const ranked = [...byCountry.entries()]
      .map(([country, vals]) => ({ country, m: median(vals) }))
      .sort((a, b) => (seg.dir === "high" ? b.m - a.m : a.m - b.m));
    const top = ranked[0];
    const second = ranked[1];
    console.log(
      `  ${seg.name.padEnd(40)} → ${top.country.padEnd(4)} (${top.m.toFixed(1)})   alt: ${second?.country ?? "?"} (${second?.m.toFixed(1) ?? "?"})`,
    );
  }

  // Persist the aggregate so the row is usable by the app, the PDF
  // renderer and anything else that reads ensembles.aggregate_result.
  // Without this the run only ever existed in this console.
  const c3 = new Client({ connectionString: process.env.DATABASE_URL });
  await c3.connect();
  try {
    const snapshots = await loadSnapshots(c3, ensembleId);
    const aggregate = aggregateEnsemble(snapshots);
    const narrative = await mergeNarrative({
      snapshots,
      ensembleId,
      productName: project.product_name,
      bestCountry: aggregate.recommendation.country,
      consensusPercent: aggregate.recommendation.consensusPercent,
      locale: "ko",
      crossCountryDistribution: aggregate.crossCountryDistribution,
      candidateCountries: project.candidate_countries,
      basePriceCents: project.base_price_cents,
      currency: project.currency,
      tier: tierFor(parallel),
    });
    if (narrative) {
      (aggregate as { narrative?: unknown }).narrative = narrative;
    } else {
      console.warn("narrative merge returned nothing — aggregate saved without it");
    }
    await c3.query(
      `update public.ensembles
          set aggregate_result = $2::jsonb, status = 'completed', completed_at = now()
        where id = $1`,
      [ensembleId, JSON.stringify(aggregate)],
    );
    console.log(`\n✓ Saved ensemble ${ensembleId.slice(0, 8)} (${snapshots.length} sims aggregated)`);
  } finally {
    await c3.end();
  }

  console.log(`\n✓ Ensemble complete. Wall time: ${wallSec}s`);
}

/** Tier label implied by the parallel-sim count the caller asked for. */
function tierFor(parallel: number): string {
  if (parallel <= 3) return "hypothesis";
  if (parallel <= 6) return "decision";
  if (parallel <= 15) return "decision_plus";
  if (parallel <= 25) return "deep";
  return "deep_pro";
}

/** Rebuild per-sim snapshots from what the runner persisted. */
async function loadSnapshots(c: Client, ensembleId: string): Promise<EnsembleSimSnapshot[]> {
  const { rows } = await c.query<Record<string, unknown>>(
    `select s.id::text as id, s.ensemble_index, s.best_country, s.model_provider,
            sr.countries, sr.personas, sr.overview, sr.risks, sr.recommendations,
            sr.pricing, sr.creative
       from public.simulations s
       join public.simulation_results sr on sr.simulation_id = s.id
      where s.ensemble_id = $1 and s.status = 'completed'
      order by s.ensemble_index nulls last`,
    [ensembleId],
  );
  return rows.map((r) => {
    const personas = (r.personas ?? []) as Array<Record<string, unknown>>;
    const sums: Record<string, { n: number; total: number }> = {};
    for (const p of personas) {
      const cc = String(p.country ?? "?").toUpperCase();
      (sums[cc] ??= { n: 0, total: 0 });
      sums[cc].n += 1;
      sums[cc].total += typeof p.purchaseIntent === "number" ? p.purchaseIntent : 0;
    }
    const intentByCountry: Record<string, { n: number; meanIntent: number }> = {};
    for (const [cc, v] of Object.entries(sums)) {
      intentByCountry[cc] = { n: v.n, meanIntent: v.n ? v.total / v.n : 0 };
    }
    const compact = personas.flatMap((p) =>
      typeof p.purchaseIntent === "number" && p.country
        ? [
            {
              country: String(p.country).toUpperCase(),
              purchaseIntent: p.purchaseIntent as number,
              voice: p.voice as string | undefined,
              ageRange: p.ageRange as string | undefined,
              profession: p.profession as string | undefined,
              gender: p.gender as string | undefined,
              incomeBand: p.incomeBand as string | undefined,
              trustFactors: Array.isArray(p.trustFactors)
                ? (p.trustFactors as unknown[]).filter((x): x is string => typeof x === "string")
                : undefined,
              objections: Array.isArray(p.objections)
                ? (p.objections as unknown[]).filter((x): x is string => typeof x === "string")
                : undefined,
            },
          ]
        : [],
    );
    return {
      simulationId: r.id as string,
      index: (r.ensemble_index as number) ?? 0,
      bestCountry: (r.best_country as string) ?? null,
      countries: (r.countries ?? []) as CountryScore[],
      personaIntentByCountry: intentByCountry,
      provider: (r.model_provider as string) ?? undefined,
      overview: r.overview,
      risks: r.risks,
      recommendations: r.recommendations,
      pricing: r.pricing,
      personas: compact,
      creative: r.creative,
    } as EnsembleSimSnapshot;
  });
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});

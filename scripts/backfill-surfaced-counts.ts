/**
 * Backfill surfacedInSims values on existing ensembles using the
 * algorithmic recount (overlap-coefficient on tokenised text). Existing
 * aggregates were persisted with the merge-LLM's count, which
 * consistently said 1 for everything; this script reads the per-sim
 * raw items, recomputes the count, and patches the aggregate JSONB
 * back to the DB.
 *
 * No LLM calls — pure data backfill.
 *
 * Usage:
 *   npm run backfill:surfaced                 # latest completed ensemble
 *   npm run backfill:surfaced -- <id-prefix>  # specific ensemble
 *   npm run backfill:surfaced -- all          # every completed ensemble
 */
import { Client } from "pg";
import {
  recountSurfacedInSims,
  clusterStrings,
  isPersonaMismatchNoise,
} from "../src/lib/simulation/surfaced-recount";

interface MergedRisk {
  factor: string;
  description: string;
  severity: "low" | "medium" | "high";
  surfacedInSims: number;
}
interface MergedAction {
  action: string;
  surfacedInSims: number;
  impact?: number;
  effort?: number;
  specificity?: unknown;
}
interface CountryStat {
  country: string;
  detail?: {
    topObjections?: Array<{ text: string; count: number }>;
    topTrustFactors?: Array<{ text: string; count: number }>;
    [k: string]: unknown;
  };
  [k: string]: unknown;
}
interface Aggregate {
  narrative?: {
    mergedRisks?: MergedRisk[];
    mergedActions?: MergedAction[];
  };
  countryStats?: CountryStat[];
  [k: string]: unknown;
}
interface SimRow {
  recommendations: { actionPlan?: string[] } | null;
  risks: Array<{ factor: string; description: string }> | null;
  personas: Array<{
    country?: string;
    objections?: string[];
    trustFactors?: string[];
  }> | null;
}

async function backfillEnsemble(
  c: Client,
  ensembleId: string,
  ensembleShortId: string,
): Promise<{ risksUpdated: number; actionsUpdated: number; countriesUpdated: number }> {
  const { rows: aggRows } = await c.query<{ aggregate_result: Aggregate | null }>(
    `select aggregate_result from public.ensembles where id = $1`,
    [ensembleId],
  );
  const aggregate = aggRows[0]?.aggregate_result;
  if (!aggregate?.narrative) {
    console.log(`  ${ensembleShortId} · skip (no narrative)`);
    return { risksUpdated: 0, actionsUpdated: 0, countriesUpdated: 0 };
  }
  const { rows: simRows } = await c.query<SimRow>(
    `select r.recommendations, r.risks, r.personas
       from public.simulations s
       join public.simulation_results r on r.simulation_id = s.id
      where s.ensemble_id = $1`,
    [ensembleId],
  );
  if (simRows.length === 0) {
    console.log(`  ${ensembleShortId} · skip (no sims)`);
    return { risksUpdated: 0, actionsUpdated: 0, countriesUpdated: 0 };
  }

  const perSimActions: string[][] = simRows.map(
    (s) => s.recommendations?.actionPlan ?? [],
  );
  const perSimRisks: string[][] = simRows.map((s) =>
    (s.risks ?? []).map((r) => `${r.factor} ${r.description}`),
  );

  let risksUpdated = 0;
  let actionsUpdated = 0;
  let countriesUpdated = 0;
  const risks = aggregate.narrative.mergedRisks ?? [];
  const actions = aggregate.narrative.mergedActions ?? [];
  for (const r of risks) {
    const merged = `${r.factor} ${r.description}`;
    const recount = recountSurfacedInSims(merged, perSimRisks);
    if (recount !== r.surfacedInSims) {
      r.surfacedInSims = recount;
      risksUpdated++;
    }
  }
  for (const a of actions) {
    const recount = recountSurfacedInSims(a.action, perSimActions);
    if (recount !== a.surfacedInSims) {
      a.surfacedInSims = recount;
      actionsUpdated++;
    }
  }

  // Per-country topObjections / topTrustFactors recompute — pulls from
  // raw persona objections (preserved in simulation_results.personas)
  // and re-runs the noise filter + fuzzy cluster the aggregator now
  // uses. Without this pass, existing ensembles still show 1-count
  // entries since they were aggregated with exact-text dedup.
  type Persona = NonNullable<SimRow["personas"]>[number];
  const personasByCountry = new Map<string, Persona[]>();
  for (const sim of simRows) {
    for (const p of sim.personas ?? []) {
      const code = (p.country ?? "?").toUpperCase();
      const arr = personasByCountry.get(code) ?? [];
      arr.push(p);
      personasByCountry.set(code, arr);
    }
  }
  const cstats = aggregate.countryStats ?? [];
  for (const c of cstats) {
    const inCountry = personasByCountry.get(c.country.toUpperCase()) ?? [];
    if (inCountry.length === 0) continue;
    const allObj: string[] = [];
    const allTrust: string[] = [];
    for (const p of inCountry) {
      for (const o of p.objections ?? []) {
        const t = o.trim();
        if (t && !isPersonaMismatchNoise(t)) allObj.push(t);
      }
      for (const tf of p.trustFactors ?? []) {
        const t = tf.trim();
        if (t) allTrust.push(t);
      }
    }
    const newObj = clusterStrings(allObj, 0.5)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    const newTrust = clusterStrings(allTrust, 0.5)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    const oldObjJson = JSON.stringify(c.detail?.topObjections ?? []);
    const oldTrustJson = JSON.stringify(c.detail?.topTrustFactors ?? []);
    const newObjJson = JSON.stringify(newObj);
    const newTrustJson = JSON.stringify(newTrust);
    if (oldObjJson !== newObjJson || oldTrustJson !== newTrustJson) {
      if (!c.detail) c.detail = {};
      c.detail.topObjections = newObj;
      c.detail.topTrustFactors = newTrust;
      countriesUpdated++;
    }
  }

  if (risksUpdated > 0 || actionsUpdated > 0 || countriesUpdated > 0) {
    await c.query(
      `update public.ensembles set aggregate_result = $1 where id = $2`,
      [JSON.stringify(aggregate), ensembleId],
    );
    console.log(
      `  ${ensembleShortId} · updated ${actionsUpdated} actions / ${risksUpdated} risks / ${countriesUpdated} countries (${simRows.length} sims)`,
    );
  } else {
    console.log(`  ${ensembleShortId} · no changes (${simRows.length} sims)`);
  }
  return { risksUpdated, actionsUpdated, countriesUpdated };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("ERROR: DATABASE_URL env var required.");
    process.exit(1);
  }
  const arg = process.argv[2];

  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    let ensembleIds: Array<{ id: string; short: string }> = [];
    if (arg === "all") {
      const { rows } = await c.query<{ id: string }>(
        `select id::text from public.ensembles where status = 'completed' order by created_at desc`,
      );
      ensembleIds = rows.map((r) => ({ id: r.id, short: r.id.slice(0, 8) }));
    } else if (arg) {
      const { rows } = await c.query<{ id: string }>(
        `select id::text from public.ensembles where id::text like $1 limit 1`,
        [`${arg}%`],
      );
      ensembleIds = rows.map((r) => ({ id: r.id, short: r.id.slice(0, 8) }));
    } else {
      const { rows } = await c.query<{ id: string }>(
        `select id::text from public.ensembles where status = 'completed' order by created_at desc limit 1`,
      );
      ensembleIds = rows.map((r) => ({ id: r.id, short: r.id.slice(0, 8) }));
    }
    if (ensembleIds.length === 0) {
      console.log("No matching ensemble found.");
      return;
    }
    console.log(`Backfilling ${ensembleIds.length} ensemble(s)...\n`);
    let totalActions = 0;
    let totalRisks = 0;
    let totalCountries = 0;
    for (const e of ensembleIds) {
      const result = await backfillEnsemble(c, e.id, e.short);
      totalActions += result.actionsUpdated;
      totalRisks += result.risksUpdated;
      totalCountries += result.countriesUpdated;
    }
    console.log(
      `\n✓ Done. Total: ${totalActions} actions / ${totalRisks} risks / ${totalCountries} country detail entries updated.`,
    );
  } finally {
    await c.end();
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});

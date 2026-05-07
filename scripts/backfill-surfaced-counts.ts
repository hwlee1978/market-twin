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
import { recountSurfacedInSims } from "../src/lib/simulation/surfaced-recount";

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
interface Aggregate {
  narrative?: {
    mergedRisks?: MergedRisk[];
    mergedActions?: MergedAction[];
  };
  [k: string]: unknown;
}
interface SimRow {
  recommendations: { actionPlan?: string[] } | null;
  risks: Array<{ factor: string; description: string }> | null;
}

async function backfillEnsemble(
  c: Client,
  ensembleId: string,
  ensembleShortId: string,
): Promise<{ risksUpdated: number; actionsUpdated: number }> {
  const { rows: aggRows } = await c.query<{ aggregate_result: Aggregate | null }>(
    `select aggregate_result from public.ensembles where id = $1`,
    [ensembleId],
  );
  const aggregate = aggRows[0]?.aggregate_result;
  if (!aggregate?.narrative) {
    console.log(`  ${ensembleShortId} · skip (no narrative)`);
    return { risksUpdated: 0, actionsUpdated: 0 };
  }
  const { rows: simRows } = await c.query<SimRow>(
    `select r.recommendations, r.risks
       from public.simulations s
       join public.simulation_results r on r.simulation_id = s.id
      where s.ensemble_id = $1`,
    [ensembleId],
  );
  if (simRows.length === 0) {
    console.log(`  ${ensembleShortId} · skip (no sims)`);
    return { risksUpdated: 0, actionsUpdated: 0 };
  }

  const perSimActions: string[][] = simRows.map(
    (s) => s.recommendations?.actionPlan ?? [],
  );
  const perSimRisks: string[][] = simRows.map((s) =>
    (s.risks ?? []).map((r) => `${r.factor} ${r.description}`),
  );

  let risksUpdated = 0;
  let actionsUpdated = 0;
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

  if (risksUpdated > 0 || actionsUpdated > 0) {
    await c.query(
      `update public.ensembles set aggregate_result = $1 where id = $2`,
      [JSON.stringify(aggregate), ensembleId],
    );
    console.log(
      `  ${ensembleShortId} · updated ${actionsUpdated} actions / ${risksUpdated} risks (${simRows.length} sims)`,
    );
  } else {
    console.log(`  ${ensembleShortId} · no changes (${simRows.length} sims)`);
  }
  return { risksUpdated, actionsUpdated };
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
    for (const e of ensembleIds) {
      const result = await backfillEnsemble(c, e.id, e.short);
      totalActions += result.actionsUpdated;
      totalRisks += result.risksUpdated;
    }
    console.log(`\n✓ Done. Total: ${totalActions} actions / ${totalRisks} risks updated.`);
  } finally {
    await c.end();
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});

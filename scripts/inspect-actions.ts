/**
 * Inspect per-sim raw action plans for the most recent ensemble (or
 * one matching a given prefix). Prints every sim's actionPlan side
 * by side so we can manually judge whether the merge LLM correctly
 * collapsed semantic duplicates or whether each sim genuinely emitted
 * unique items.
 *
 * Usage:
 *   npm run inspect:actions               # latest ensemble
 *   npm run inspect:actions -- 53328452   # by ensemble id prefix
 */
import { Client } from "pg";
import { recountSurfacedInSims } from "../src/lib/simulation/surfaced-recount";

interface SimResult {
  sim_id: string;
  best_country: string | null;
  recommendations: { actionPlan?: string[]; executiveSummary?: string } | null;
  risks: Array<{ factor: string; severity: string; description: string }> | null;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("ERROR: DATABASE_URL env var required (use --env-file=.env.local).");
    process.exit(1);
  }
  const prefix = process.argv[2];

  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    const ens = prefix
      ? await c.query<{ id: string; project_id: string; aggregate_result: unknown }>(
          `select id::text, project_id::text, aggregate_result
             from public.ensembles where id::text like $1
             order by created_at desc limit 1`,
          [`${prefix}%`],
        )
      : await c.query<{ id: string; project_id: string; aggregate_result: unknown }>(
          `select id::text, project_id::text, aggregate_result
             from public.ensembles where status = 'completed'
             order by created_at desc limit 1`,
        );
    if (ens.rows.length === 0) {
      console.log("No matching ensemble found.");
      return;
    }
    const ensemble = ens.rows[0];
    console.log(`\n${"=".repeat(72)}`);
    console.log(`Ensemble: ${ensemble.id.slice(0, 8)} · project ${ensemble.project_id.slice(0, 8)}`);
    console.log("=".repeat(72));

    const aggregate = ensemble.aggregate_result as {
      narrative?: { mergedActions?: Array<{ action: string; surfacedInSims: number }> };
    } | null;
    const merged = aggregate?.narrative?.mergedActions ?? [];

    // Per-sim action plans — pull from simulation_results joined to the
    // ensemble through simulations.
    const sims = await c.query<SimResult>(
      `select s.id::text as sim_id, s.best_country,
              r.recommendations, r.risks
         from public.simulations s
         join public.simulation_results r on r.simulation_id = s.id
        where s.ensemble_id = $1
        order by s.created_at`,
      [ensemble.id],
    );
    console.log(`\nFound ${sims.rows.length} sims in this ensemble.\n`);

    sims.rows.forEach((s, i) => {
      console.log(`─── SIM ${i + 1} (${s.sim_id.slice(0, 8)}) · best=${s.best_country ?? "?"} ───`);
      const actions = s.recommendations?.actionPlan ?? [];
      if (actions.length === 0) {
        console.log("  (no actionPlan emitted)");
      } else {
        actions.forEach((a, j) => {
          const head = a.length > 200 ? a.slice(0, 200) + "..." : a;
          console.log(`  ${j + 1}. ${head}`);
        });
      }
      console.log();
    });

    console.log("=".repeat(72));
    console.log(`MERGED ACTIONS (${merged.length} after dedup) — LLM count vs Algorithm recount`);
    console.log("=".repeat(72));
    const perSimActions = sims.rows.map((s) => s.recommendations?.actionPlan ?? []);
    merged.forEach((a, i) => {
      const head = a.action.length > 200 ? a.action.slice(0, 200) + "..." : a.action;
      const recount = recountSurfacedInSims(a.action, perSimActions);
      const flag = recount !== a.surfacedInSims ? " ⚠" : "";
      console.log(`  ${i + 1}. [LLM=${a.surfacedInSims} / Algo=${recount}${flag}] ${head}`);
    });
    console.log();
  } finally {
    await c.end();
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});

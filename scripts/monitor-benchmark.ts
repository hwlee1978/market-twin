/**
 * Monitor benchmark spawn progress.
 *   npx tsx --env-file=.env.local scripts/monitor-benchmark.ts [workspace_id]
 *
 * Shows per-status ensemble counts in last 4h + running sim breakdown.
 * Useful as a second-terminal watcher while spawn-benchmark.ts runs.
 */
import { Client } from "pg";

(async () => {
  const workspaceId = process.argv[2] ?? "0c8e774f-356a-4bf2-ba3d-8bfb41e6d019";
  if (!process.env.DATABASE_URL) {
    console.error("ERROR: DATABASE_URL env var required (--env-file=.env.local)");
    process.exit(1);
  }
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  // Ensemble status counts (last 4h)
  const { rows: ensRows } = await c.query<{ status: string; n: string }>(
    `select status, count(*)::text as n
       from public.ensembles
      where workspace_id = $1::uuid
        and created_at > now() - interval '4 hours'
      group by status
      order by status`,
    [workspaceId],
  );
  console.log("\n── Ensembles (last 4h) ──");
  if (ensRows.length === 0) {
    console.log("  (none)");
  } else {
    for (const r of ensRows) console.log(`  ${r.status.padEnd(12)} ${r.n}`);
  }

  // Running / pending sim breakdown
  const { rows: simRows } = await c.query<{
    status: string;
    current_stage: string | null;
    n: string;
  }>(
    `select s.status, s.current_stage, count(*)::text as n
       from public.simulations s
       join public.ensembles e on e.id = s.ensemble_id
      where e.workspace_id = $1::uuid
        and e.created_at > now() - interval '4 hours'
      group by s.status, s.current_stage
      order by s.status, s.current_stage`,
    [workspaceId],
  );
  console.log("\n── Sims (last 4h) ──");
  for (const r of simRows) {
    console.log(`  ${r.status.padEnd(12)} ${(r.current_stage ?? "-").padEnd(20)} ${r.n}`);
  }

  // Cost so far
  const { rows: costRows } = await c.query<{ total_cents: string; n: string }>(
    `select coalesce(sum(total_cost_cents), 0)::text as total_cents,
            count(*)::text as n
       from public.simulations s
       join public.ensembles e on e.id = s.ensemble_id
      where e.workspace_id = $1::uuid
        and e.created_at > now() - interval '4 hours'
        and s.status = 'completed'`,
    [workspaceId],
  );
  const totalUsd = Number(costRows[0]?.total_cents ?? "0") / 100;
  console.log(`\n── Cost ──`);
  console.log(`  Completed sims: ${costRows[0]?.n ?? "0"}`);
  console.log(`  Total spend:    $${totalUsd.toFixed(2)}`);

  // Most recent 5 ensembles
  const { rows: recent } = await c.query<{
    id: string;
    product_name: string;
    status: string;
    sim_ok: string;
    sim_total: string;
    age_min: string;
  }>(
    `select e.id::text as id,
            p.product_name,
            e.status,
            (select count(*)::text from public.simulations where ensemble_id = e.id and status = 'completed') as sim_ok,
            (select count(*)::text from public.simulations where ensemble_id = e.id) as sim_total,
            round(extract(epoch from (now() - e.created_at)) / 60)::text as age_min
       from public.ensembles e
       join public.projects p on p.id = e.project_id
      where e.workspace_id = $1::uuid
        and e.created_at > now() - interval '4 hours'
      order by e.created_at desc
      limit 8`,
    [workspaceId],
  );
  console.log(`\n── Recent 8 ensembles ──`);
  for (const r of recent) {
    const label = r.product_name.slice(0, 40).padEnd(40);
    console.log(`  ${r.id.slice(0, 8)}  ${r.status.padEnd(10)}  ${r.sim_ok}/${r.sim_total} sims  ${r.age_min}min ago  ${label}`);
  }

  await c.end();
})();

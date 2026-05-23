import { Client } from "pg";

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const ws = "0c8e774f-356a-4bf2-ba3d-8bfb41e6d019";
  const { rows: ens } = await c.query(
    `select status, count(*)::int as n from public.ensembles
      where workspace_id = $1::uuid and created_at > now() - interval '24 hours'
      group by status order by status`,
    [ws],
  );
  console.log("── Ensembles (last 24h) ──");
  for (const r of ens) console.log(`  ${(r.status as string).padEnd(12)}${r.n}`);

  const { rows: cost } = await c.query(
    `select coalesce(sum(total_cost_cents),0)::int as cents, count(*)::int as n
       from public.simulations s
       join public.ensembles e on e.id = s.ensemble_id
      where e.workspace_id = $1::uuid
        and e.created_at > now() - interval '24 hours'
        and s.status = 'completed'`,
    [ws],
  );
  console.log("\n── Cost (last 24h) ──");
  console.log(`  Completed sims: ${cost[0].n}`);
  console.log(`  Total spend:    $${(Number(cost[0].cents) / 100).toFixed(2)}`);

  const { rows: recent } = await c.query(
    `select e.id::text as id, p.product_name, e.status,
            (select count(*) from public.simulations where ensemble_id = e.id and status='completed')::int as ok,
            (select count(*) from public.simulations where ensemble_id = e.id)::int as total,
            round(extract(epoch from (now() - e.created_at))/60)::int as age_min
       from public.ensembles e
       join public.projects p on p.id = e.project_id
      where e.workspace_id = $1::uuid
        and e.created_at > now() - interval '24 hours'
      order by e.created_at desc
      limit 50`,
    [ws],
  );
  console.log(`\n── Recent ensembles (${recent.length} total) ──`);
  for (const r of recent) {
    console.log(
      `  ${r.id.slice(0, 8)}  ${(r.status as string).padEnd(10)} ${r.ok}/${r.total}  ${String(r.age_min).padStart(4)}min  ${(r.product_name as string).slice(0, 50)}`,
    );
  }
  await c.end();
})();

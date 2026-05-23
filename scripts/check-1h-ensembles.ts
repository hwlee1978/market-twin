import { Client } from "pg";
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const { rows } = await c.query<{
    id: string;
    status: string;
    tier: string;
    created_at: Date;
    completed_at: Date | null;
    ok: number;
    fail: number;
  }>(
    `select e.id::text as id, e.status, e.tier, e.created_at, e.completed_at,
            (select count(*) from public.simulations where ensemble_id=e.id and status='completed')::int as ok,
            (select count(*) from public.simulations where ensemble_id=e.id and status='failed')::int as fail
       from public.ensembles e where e.created_at > now() - interval '1 hour'
       order by created_at desc limit 10`,
  );
  for (const r of rows) {
    const dur = r.completed_at
      ? ((r.completed_at.getTime() - r.created_at.getTime()) / 60000).toFixed(1)
      : "running";
    console.log(`${r.id.slice(0,8)} | ${r.status.padEnd(10)} | ${r.tier.padEnd(13)} | ok=${r.ok} fail=${r.fail} | dur=${dur}min | ${r.created_at.toLocaleTimeString()}`);
  }
  await c.end();
})();

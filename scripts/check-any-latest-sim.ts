import { Client } from "pg";
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const { rows } = await c.query(
    `select s.id::text as id, s.status, s.model_provider, s.model_version,
            s.current_stage, s.started_at, p.product_name
       from public.simulations s join public.projects p on p.id=s.project_id
      where s.created_at > now() - interval '5 minutes'
      order by s.created_at desc limit 15`,
  );
  for (const s of rows) {
    const age = s.started_at ? `${((Date.now() - new Date(s.started_at).getTime()) / 60000).toFixed(1)}min` : "no_start";
    console.log(`  ${s.id.slice(0,8)} | ${s.status.padEnd(9)} | ${(s.model_provider ?? "?").padEnd(10)} | ${(s.model_version ?? "?").padEnd(22)} | stage=${s.current_stage ?? "?"} | age=${age}`);
  }
  await c.end();
})();

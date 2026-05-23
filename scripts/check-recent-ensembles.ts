import { Client } from "pg";
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const { rows: ens } = await c.query(
    `select e.id::text as id, e.status, e.tier, e.created_at, e.completed_at, p.product_name
       from public.ensembles e join public.projects p on p.id=e.project_id
      where e.created_at > now() - interval '90 minutes'
      order by e.created_at desc limit 5`,
  );
  for (const e of ens) {
    const created = new Date(e.created_at);
    const completed = e.completed_at ? new Date(e.completed_at) : null;
    const durMin = completed ? ((completed.getTime() - created.getTime()) / 60000).toFixed(1) : "running";
    console.log(`\n${e.id.slice(0,8)} | ${e.status} | ${e.tier} | ${e.product_name} | duration: ${durMin}min`);
    const { rows: sims } = await c.query(
      `select status, model_provider, model_version, started_at, completed_at
         from public.simulations where ensemble_id=$1 order by ensemble_index`,
      [e.id],
    );
    let totalOk = 0, totalFail = 0;
    const durations: { provider: string; sec: number }[] = [];
    for (const s of sims) {
      if (s.status === 'completed') totalOk++;
      if (s.status === 'failed') totalFail++;
      if (s.started_at && s.completed_at) {
        const sec = (new Date(s.completed_at).getTime() - new Date(s.started_at).getTime()) / 1000;
        durations.push({ provider: s.model_provider ?? '?', sec });
      }
    }
    console.log(`  sims: ${sims.length} total, ${totalOk} ok, ${totalFail} fail`);
    const byProvider: Record<string, number[]> = {};
    for (const d of durations) {
      (byProvider[d.provider] = byProvider[d.provider] ?? []).push(d.sec);
    }
    for (const [p, secs] of Object.entries(byProvider)) {
      const avg = secs.reduce((a,b)=>a+b,0) / secs.length;
      console.log(`    ${p}: ${secs.length} sims, avg ${avg.toFixed(0)}s = ${(avg/60).toFixed(1)}min`);
    }
  }
  await c.end();
})();

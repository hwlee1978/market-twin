import { Client } from "pg";

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const { rows } = await c.query<{
    id: string;
    status: string;
    model_provider: string | null;
    model_version: string | null;
    current_stage: string | null;
    started_at: Date | null;
    error_message: string | null;
  }>(
    `select id::text as id, status, model_provider, model_version, current_stage, started_at, error_message
       from public.simulations
      where model_provider = 'openai' and created_at > now() - interval '10 minutes'
      order by created_at desc limit 8`,
  );
  if (rows.length === 0) {
    console.log("No OpenAI sims in last 10 min. Spawn one.");
    await c.end();
    return;
  }
  let okCount = 0, failCount = 0;
  console.log(`OpenAI sims (last 10 min):\n`);
  for (const s of rows) {
    const age = s.started_at ? `${((Date.now() - s.started_at.getTime()) / 60000).toFixed(1)}min` : "?";
    const tag = s.status === "failed" ? "✗ FAIL" : s.status === "completed" ? "✓ OK" : "⏳ run";
    console.log(`  ${s.id.slice(0,8)} | ${s.model_version} | ${s.status.padEnd(9)} ${tag} | stage=${s.current_stage} | age=${age}`);
    if (s.error_message) console.log(`    err: ${s.error_message.slice(0, 150)}`);
    if (s.status === "completed") okCount++;
    if (s.status === "failed") failCount++;
  }
  console.log("");
  if (failCount === 0 && okCount === 0) {
    console.log(`⏳ ${rows.length} sims still running — wait 2-5 more min`);
  } else if (failCount > 0) {
    console.log(`✗ ${failCount} failed / ${okCount} ok — fix didn't take or new error`);
  } else {
    console.log(`✓ All ${okCount} openai sims completed — fix verified! 🎉`);
  }
  await c.end();
})();

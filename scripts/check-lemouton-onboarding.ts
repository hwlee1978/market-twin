import { Client } from "pg";

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  const ws = await c.query<{ id: string; name: string; mrai_onboarded_at: string | null }>(
    `select id, name, mrai_onboarded_at from public.workspaces where name = '르무통'`,
  );
  console.log("Le Mouton workspace:");
  for (const w of ws.rows) {
    console.log(`  id=${w.id}`);
    console.log(`  onboarded_at=${w.mrai_onboarded_at}`);
  }

  if (ws.rows.length === 0) {
    console.log("No Le Mouton workspace found.");
    await c.end();
    return;
  }

  const wsId = ws.rows[0].id;
  const r = await c.query<{ onboarding_step: string; body: string | null }>(
    `select onboarding_step, body from public.mrai_memories where workspace_id = $1 and onboarding_step is not null order by onboarding_step`,
    [wsId],
  );
  console.log(`\nOnboarding memories (${r.rows.length} rows):`);
  for (const row of r.rows) {
    console.log(`  ${row.onboarding_step}: ${(row.body ?? "").slice(0, 80)}`);
  }

  await c.end();
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});

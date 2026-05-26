/**
 * Quick sanity check: how many personas does Le Mouton's workspace have
 * by country? Used to verify the virtual-space audience endpoint will
 * return non-empty pools for each seeded marketing channel.
 */
import { Client } from "pg";

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  const ws = await c.query<{ id: string }>(
    `select id from public.workspaces where name = '르무통' limit 1`,
  );
  if (ws.rows.length === 0) {
    console.error("No Le Mouton workspace");
    await c.end();
    return;
  }
  const wsId = ws.rows[0].id;

  const total = await c.query<{ n: string }>(
    `select count(*)::text as n from public.personas where workspace_id = $1`,
    [wsId],
  );
  console.log(`Total personas: ${total.rows[0].n}`);

  const byCountry = await c.query<{ country: string; n: string }>(
    `select country, count(*)::text as n
     from public.personas
     where workspace_id = $1
     group by country
     order by count(*) desc`,
    [wsId],
  );
  console.log("\nBy country:");
  for (const r of byCountry.rows) {
    console.log(`  ${r.country.padEnd(8)} ${r.n}`);
  }

  const channels = await c.query<{
    platform: string;
    handle: string;
    market_country: string;
  }>(
    `select platform, handle, market_country from public.mrai_marketing_channels
     where workspace_id = $1 order by created_at`,
    [wsId],
  );
  console.log("\nSeeded channels:");
  for (const ch of channels.rows) {
    const match = await c.query<{ n: string }>(
      `select count(*)::text as n from public.personas where workspace_id = $1 and country = $2`,
      [wsId, ch.market_country],
    );
    console.log(
      `  ${ch.platform.padEnd(18)} @${ch.handle.padEnd(24)} → ${ch.market_country} → ${match.rows[0].n} personas`,
    );
  }

  await c.end();
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});

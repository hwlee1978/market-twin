/**
 * Reads the system_health_alert history and measures how long the health
 * check's own query actually takes, so we can tell a real outage from a
 * timeout budget that is simply too tight.
 *
 *   npx tsx --env-file=.env.local scripts/_health-history.ts
 */
import { Client } from "pg";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("ERROR: DATABASE_URL required (use --env-file=.env.local).");
    process.exit(1);
  }
  const client = new Client({ connectionString: url });

  const connectStart = Date.now();
  await client.connect();
  console.log(`connect: ${Date.now() - connectStart}ms`);

  try {
    // What the health check itself runs: an exact count over workspaces.
    for (let i = 1; i <= 5; i++) {
      const t = Date.now();
      await client.query("select count(*) from public.workspaces");
      console.log(`  count(workspaces) #${i}: ${Date.now() - t}ms`);
    }

    const { rows: alerts } = await client.query<{
      ts: string;
      metadata: unknown;
    }>(
      `select ts, metadata from public.audit_logs
       where action = 'system_health_alert'
       order by ts desc limit 20`,
    );
    console.log(`\nsystem_health_alert rows (most recent 20): ${alerts.length}`);
    for (const a of alerts) {
      const m = a.metadata as { status?: string; failing?: Array<{ key: string; detail: string }> };
      const failing = (m?.failing ?? []).map((f) => `${f.key}: ${f.detail}`).join(" | ");
      console.log(`  ${a.ts}  [${m?.status}]  ${failing}`);
    }

    const { rows: span } = await client.query<{ n: string; first: string | null; last: string | null }>(
      `select count(*)::text as n, min(ts)::text as first, max(ts)::text as last
       from public.audit_logs where action = 'system_health_alert'`,
    );
    console.log(
      `\ntotal alerts: ${span[0].n}  first: ${span[0].first ?? "-"}  last: ${span[0].last ?? "-"}`,
    );
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

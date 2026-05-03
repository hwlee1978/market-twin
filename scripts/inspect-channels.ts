/** Quick check: print channelMentions from a recent ensemble. */
import { Client } from "pg";

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    const { rows } = await c.query<{ id: string; aggregate_result: unknown }>(
      `select id::text as id, aggregate_result
         from public.ensembles
        where status = 'completed'
        order by completed_at desc nulls last
        limit 1`,
    );
    if (rows.length === 0) {
      console.log("no completed ensembles");
      return;
    }
    const agg = rows[0].aggregate_result as { personas?: { channelMentions?: unknown; segmentBreakdown?: unknown } };
    console.log(`Latest ensemble: ${rows[0].id.slice(0, 8)}`);
    console.log("personas.channelMentions:", JSON.stringify(agg?.personas?.channelMentions ?? "(missing)", null, 2));
    console.log("personas.segmentBreakdown:", JSON.stringify(agg?.personas?.segmentBreakdown ?? "(missing)", null, 2));
  } finally {
    await c.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

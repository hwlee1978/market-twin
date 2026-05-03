/** List ensembles by status (read-only). */
import { Client } from "pg";

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    const { rows } = await c.query<{
      id: string;
      status: string;
      tier: string;
      parallel_sims: number;
      per_sim_personas: number;
      created_at: string;
      completed_at: string | null;
      product_name: string;
    }>(
      `select e.id::text as id, e.status, e.tier, e.parallel_sims, e.per_sim_personas,
              e.created_at, e.completed_at, p.product_name
         from public.ensembles e
         join public.projects p on p.id = e.project_id
        order by e.created_at desc
        limit 10`,
    );
    if (rows.length === 0) {
      console.log("No ensembles in DB.");
      return;
    }
    for (const r of rows) {
      console.log(
        `${r.id.slice(0, 8)} · ${r.status.padEnd(10)} · ${r.tier.padEnd(10)} · ${r.parallel_sims}×${r.per_sim_personas} · ${r.product_name}`,
      );
    }
  } finally {
    await c.end();
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});

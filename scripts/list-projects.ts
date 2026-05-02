/**
 * Quick list of recent projects in the workspace — picks ensemble candidates.
 * Usage: npm run list:projects
 */
import { Client } from "pg";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("ERROR: DATABASE_URL env var is required.");
    process.exit(1);
  }
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    const { rows } = await c.query<{
      id: string;
      product_name: string;
      category: string;
      candidate_countries: string[];
      created_at: string;
      sim_count: string;
    }>(
      `select p.id::text as id, p.product_name, p.category,
              p.candidate_countries, p.created_at,
              (select count(*)::text from public.simulations s where s.project_id = p.id) as sim_count
       from public.projects p
       order by p.created_at desc
       limit 15`,
    );
    console.log(`\nRecent projects (id · category · product · markets · sim count):`);
    for (const r of rows) {
      console.log(
        `  ${r.id.slice(0, 8)} · ${r.category.padEnd(12)} · ${r.product_name.slice(0, 40).padEnd(40)} · [${r.candidate_countries.join(",")}] · ${r.sim_count} sims`,
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

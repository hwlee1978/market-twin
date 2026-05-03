/** Quick check: look at incomeBand distribution in the latest ensemble. */
import { Client } from "pg";

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    // Find latest completed ensemble
    const ens = await c.query<{ id: string }>(
      `select id::text as id from public.ensembles
        where status = 'completed' order by completed_at desc nulls last limit 1`,
    );
    if (ens.rows.length === 0) {
      console.log("no ensembles");
      return;
    }
    const ensembleId = ens.rows[0].id;
    console.log("ensemble:", ensembleId.slice(0, 8));

    // Pull personas from simulation_results.personas across sims
    const sims = await c.query<{ simulation_id: string; personas: unknown }>(
      `select sr.simulation_id::text as simulation_id, sr.personas
         from public.simulation_results sr
         join public.simulations s on s.id = sr.simulation_id
        where s.ensemble_id = $1
        limit 10`,
      [ensembleId],
    );
    console.log("sims with results:", sims.rows.length);

    const incomeCounts = new Map<string, number>();
    let totalPersonas = 0;
    let withIncome = 0;
    let withoutIncome = 0;
    for (const sim of sims.rows) {
      const personas = (sim.personas ?? []) as Array<{ incomeBand?: string }>;
      for (const p of personas) {
        totalPersonas++;
        const i = p.incomeBand?.trim();
        if (i) {
          withIncome++;
          incomeCounts.set(i, (incomeCounts.get(i) ?? 0) + 1);
        } else {
          withoutIncome++;
        }
      }
    }
    console.log(`personas: ${totalPersonas} | with income: ${withIncome} | without: ${withoutIncome}`);
    console.log("\nTop 25 incomeBand values:");
    const sorted = [...incomeCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);
    for (const [k, v] of sorted) console.log(`  ${v.toString().padStart(3)} | ${k}`);
    console.log(`\nUnique values: ${incomeCounts.size}`);
  } finally {
    await c.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

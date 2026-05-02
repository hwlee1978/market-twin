/**
 * Quick read-only inspection of a simulation's stored result.
 * Usage:
 *   npm run inspect:sim                    # latest sim
 *   npm run inspect:sim -- <sim_id_prefix> # by prefix
 */
import { Client } from "pg";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("ERROR: DATABASE_URL env var is required.");
    process.exit(1);
  }
  const prefix = process.argv[2];
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    const where = prefix ? `where s.id::text like '${prefix}%'` : "";
    const { rows } = await c.query<{
      id: string;
      created_at: string;
      persona_count: number;
      product_name: string;
      candidate_countries: string[];
      countries: Array<{ country: string; demandScore: number; estimatedCAC: number; competitionIntensity: number; finalScore: number }>;
      best_country: string;
      personas: unknown[];
    }>(
      `select s.id::text as id, s.created_at, s.persona_count, s.best_country,
              p.product_name, p.candidate_countries,
              r.countries, r.personas
       from public.simulations s
       join public.projects p on p.id = s.project_id
       join public.simulation_results r on r.simulation_id = s.id
       ${where}
       order by s.created_at desc
       limit 3`,
    );
    if (rows.length === 0) {
      console.log("No sims found.");
      return;
    }
    for (const r of rows) {
      console.log(`\n${"=".repeat(70)}`);
      console.log(`Sim: ${r.id.slice(0, 8)} · ${r.created_at} · ${r.persona_count} personas`);
      console.log(`Product: ${r.product_name}`);
      console.log(`Markets: ${r.candidate_countries.join(", ")}`);
      console.log(`best_country (DB): ${r.best_country}`);
      console.log(`\nCountry ranking (from result blob):`);
      const sorted = [...(r.countries ?? [])].sort((a, b) => b.finalScore - a.finalScore);
      for (let i = 0; i < sorted.length; i++) {
        const c = sorted[i];
        console.log(
          `  #${i + 1} ${c.country.padEnd(4)}` +
            ` final=${String(c.finalScore).padStart(3)}` +
            ` demand=${String(c.demandScore).padStart(3)}` +
            ` CAC=$${String(c.estimatedCAC).padStart(4)}` +
            ` competition=${String(c.competitionIntensity).padStart(3)}`,
        );
      }
      // Persona country distribution
      const byCountry: Record<string, { n: number; intent: number }> = {};
      for (const p of r.personas as Array<{ country?: string; purchaseIntent?: number }>) {
        const c = (p.country ?? "?").toUpperCase();
        const i = typeof p.purchaseIntent === "number" ? p.purchaseIntent : 0;
        if (!byCountry[c]) byCountry[c] = { n: 0, intent: 0 };
        byCountry[c].n++;
        byCountry[c].intent += i;
      }
      console.log(`\nPersona distribution + avg intent:`);
      for (const [country, { n, intent }] of Object.entries(byCountry).sort()) {
        console.log(`  ${country.padEnd(4)} n=${String(n).padStart(3)} avg_intent=${(intent / n).toFixed(1)}`);
      }
    }
  } finally {
    await c.end();
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});

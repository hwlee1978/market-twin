/**
 * Inspect a single ensemble's per-sim breakdown — status, provider,
 * persona count, cost. Useful for diagnosing "why is effectivePersonas
 * less than parallelSims × perSimPersonas?" gaps.
 *
 * Usage:
 *   npm run inspect:ensemble                # latest ensemble
 *   npm run inspect:ensemble -- <prefix>    # specific ensemble by id prefix
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
    const where = prefix
      ? `where e.id::text like '${prefix}%'`
      : "";
    const { rows: ensembles } = await c.query<{
      id: string;
      tier: string;
      status: string;
      parallel_sims: number;
      per_sim_personas: number;
      created_at: string;
      product_name: string;
    }>(
      `select e.id::text as id, e.tier, e.status, e.parallel_sims, e.per_sim_personas, e.created_at, p.product_name
         from public.ensembles e
         join public.projects p on p.id = e.project_id
         ${where}
         order by e.created_at desc
         limit 1`,
    );
    if (ensembles.length === 0) {
      console.log("No ensemble found.");
      return;
    }
    const ens = ensembles[0];
    console.log(`\n══ Ensemble ${ens.id.slice(0, 8)} ══`);
    console.log(`Product   : ${ens.product_name}`);
    console.log(`Tier      : ${ens.tier} (${ens.parallel_sims} sims × ${ens.per_sim_personas} personas)`);
    console.log(`Status    : ${ens.status}`);
    console.log(`Created   : ${ens.created_at}`);

    const { rows: sims } = await c.query<{
      id: string;
      ensemble_index: number;
      status: string;
      model_provider: string | null;
      total_cost_cents: number | null;
      persona_count: number;
      error_message: string | null;
    }>(
      `select s.id::text as id, s.ensemble_index, s.status, s.model_provider,
              s.total_cost_cents, s.error_message,
              coalesce(jsonb_array_length(r.personas), 0) as persona_count
         from public.simulations s
         left join public.simulation_results r on r.simulation_id = s.id
        where s.ensemble_id = $1
        order by s.ensemble_index`,
      [ens.id],
    );

    console.log(`\nPer-sim breakdown (${sims.length} sims):`);
    let totalPersonas = 0;
    let totalCost = 0;
    const byStatus = new Map<string, number>();
    for (const s of sims) {
      totalPersonas += s.persona_count ?? 0;
      totalCost += s.total_cost_cents ?? 0;
      byStatus.set(s.status, (byStatus.get(s.status) ?? 0) + 1);
      const cost = s.total_cost_cents != null
        ? `$${(s.total_cost_cents / 100).toFixed(2)}`
        : "—";
      const provider = (s.model_provider ?? "?").padEnd(9);
      const status = s.status.padEnd(10);
      const errSnip = s.error_message ? ` · ${s.error_message.slice(0, 60)}` : "";
      console.log(
        `  [${String(s.ensemble_index).padStart(2)}] ${status} ${provider} personas=${String(s.persona_count).padStart(3)}  cost=${cost}${errSnip}`,
      );
    }

    console.log(`\nTotals:`);
    console.log(`  Personas (DB)  : ${totalPersonas} (target: ${ens.parallel_sims * ens.per_sim_personas})`);
    console.log(`  Gap            : ${ens.parallel_sims * ens.per_sim_personas - totalPersonas}`);
    console.log(`  Cost           : $${(totalCost / 100).toFixed(2)}`);
    console.log(`  Status counts  :`);
    for (const [status, count] of [...byStatus.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${status.padEnd(12)} ${count}`);
    }
  } finally {
    await c.end();
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});

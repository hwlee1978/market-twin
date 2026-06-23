import { Client } from "pg";

const ENSEMBLE_ID = "0c2e1a31-53bb-4202-87e0-e2c9b7e21248";

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    // First sim details — full record
    const fullSim = await c.query(
      `select *
         from public.simulations
        where ensemble_id = $1
        order by created_at
        limit 1`,
      [ENSEMBLE_ID],
    );
    if (fullSim.rows.length === 0) { console.log("no sim"); return; }
    const sim = fullSim.rows[0];
    const _stageData = sim.stage_data ?? sim.regulatory ?? null;
    console.log("=== FIRST SIM (col names) ===");
    console.log(Object.keys(sim).join(", "));
    console.log("\n=== STAGE-RELEVANT FIELDS ===");
    for (const k of Object.keys(sim)) {
      if (/stage|regulat|country|candidate|excluded|allowed/i.test(k)) {
        const v = sim[k];
        const display = typeof v === "object" ? JSON.stringify(v).slice(0, 300) : String(v).slice(0, 300);
        console.log(`  ${k}: ${display}`);
      }
    }
  } finally {
    await c.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

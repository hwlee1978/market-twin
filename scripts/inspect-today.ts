/**
 * Inspect today's simulation activity — totals by tier and status,
 * plus a per-ensemble summary so we can compare to the Anthropic
 * invoice trail.
 *
 * Usage: npm run inspect:today
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
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setUTCDate(yesterdayStart.getUTCDate() - 1);

    for (const [label, since] of [
      ["TODAY (UTC)", todayStart],
      ["YESTERDAY (UTC)", yesterdayStart],
    ] as const) {
      const until = label === "TODAY (UTC)" ? new Date() : todayStart;

      // Per-sim breakdown: status × ensemble tier.
      const { rows: sims } = await c.query<{
        status: string;
        tier: string | null;
        cost: number | null;
        in_tokens: number | null;
        out_tokens: number | null;
      }>(
        `select s.status,
                e.tier,
                s.total_cost_cents as cost,
                s.total_input_tokens as in_tokens,
                s.total_output_tokens as out_tokens
           from public.simulations s
           left join public.ensembles e on e.id = s.ensemble_id
          where s.started_at >= $1 and s.started_at < $2`,
        [since.toISOString(), until.toISOString()],
      );

      const ensembleCount = await c.query<{ count: string }>(
        `select count(*) as count
           from public.ensembles
          where created_at >= $1 and created_at < $2`,
        [since.toISOString(), until.toISOString()],
      );

      const totalCostCents = sims.reduce((s, r) => s + (r.cost ?? 0), 0);
      const totalInTokens = sims.reduce((s, r) => s + (r.in_tokens ?? 0), 0);
      const totalOutTokens = sims.reduce((s, r) => s + (r.out_tokens ?? 0), 0);

      const byTier = new Map<string, { count: number; cost: number }>();
      const byStatus = new Map<string, number>();
      for (const r of sims) {
        const k = r.tier ?? "(no-ensemble)";
        const cur = byTier.get(k) ?? { count: 0, cost: 0 };
        cur.count += 1;
        cur.cost += r.cost ?? 0;
        byTier.set(k, cur);
        byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1);
      }

      console.log(`\n══ ${label} (since ${since.toISOString()}) ══`);
      console.log(`Ensembles created : ${ensembleCount.rows[0].count}`);
      console.log(`Sims total        : ${sims.length}`);
      console.log(`Total cost (DB)   : $${(totalCostCents / 100).toFixed(2)}`);
      console.log(`Tokens in / out   : ${(totalInTokens / 1000).toFixed(0)}K / ${(totalOutTokens / 1000).toFixed(0)}K`);

      console.log("\n  By tier:");
      for (const [tier, v] of [...byTier.entries()].sort((a, b) => b[1].cost - a[1].cost)) {
        console.log(
          `    ${tier.padEnd(20)} sims=${String(v.count).padStart(3)}  cost=$${(v.cost / 100).toFixed(2)}`,
        );
      }
      console.log("\n  By status:");
      for (const [status, count] of [...byStatus.entries()].sort((a, b) => b[1] - a[1])) {
        console.log(`    ${status.padEnd(20)} ${count}`);
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

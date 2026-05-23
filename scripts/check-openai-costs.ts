/**
 * Compare OpenAI LLM costs before/after gpt-4o → gpt-5.4-mini upgrade.
 *   npx tsx --env-file=.env.local scripts/check-openai-costs.ts
 */

import { Client } from "pg";

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  // All recent OpenAI sims (last 24h)
  const { rows } = await c.query<{
    id: string;
    status: string;
    model_version: string | null;
    total_input_tokens: number | null;
    total_output_tokens: number | null;
    total_cost_cents: number | null;
    started_at: Date | null;
    completed_at: Date | null;
  }>(
    `select id::text as id, status, model_version,
            total_input_tokens, total_output_tokens, total_cost_cents,
            started_at, completed_at
       from public.simulations
      where model_provider = 'openai'
        and status = 'completed'
        and created_at > now() - interval '24 hours'
      order by completed_at desc`,
  );

  console.log(`Completed OpenAI sims (last 24h): ${rows.length}\n`);

  const byModel = new Map<string, {
    n: number;
    totalInput: number;
    totalOutput: number;
    totalCostCents: number;
    durations: number[];
  }>();

  for (const r of rows) {
    const model = r.model_version ?? "?";
    const cur = byModel.get(model) ?? { n: 0, totalInput: 0, totalOutput: 0, totalCostCents: 0, durations: [] };
    cur.n++;
    cur.totalInput += r.total_input_tokens ?? 0;
    cur.totalOutput += r.total_output_tokens ?? 0;
    cur.totalCostCents += r.total_cost_cents ?? 0;
    if (r.started_at && r.completed_at) {
      cur.durations.push((r.completed_at.getTime() - r.started_at.getTime()) / 1000);
    }
    byModel.set(model, cur);
  }

  for (const [model, s] of byModel.entries()) {
    const avgInputK = s.totalInput / s.n / 1000;
    const avgOutputK = s.totalOutput / s.n / 1000;
    const avgCostUsd = s.totalCostCents / s.n / 100;
    const avgDurSec = s.durations.length > 0 ? s.durations.reduce((a,b)=>a+b,0) / s.durations.length : 0;
    console.log(`── ${model} (n=${s.n}) ──`);
    console.log(`  Avg input tokens:  ${avgInputK.toFixed(0)}K / sim`);
    console.log(`  Avg output tokens: ${avgOutputK.toFixed(0)}K / sim`);
    console.log(`  Avg cost per sim:  $${avgCostUsd.toFixed(2)}`);
    console.log(`  Avg duration:      ${(avgDurSec/60).toFixed(1)} min`);
    console.log(`  Total cost (n=${s.n}): $${(s.totalCostCents / 100).toFixed(2)}`);
    console.log("");
  }

  // Also compute totals
  let allCost = 0;
  for (const s of byModel.values()) allCost += s.totalCostCents;
  console.log(`Grand total OpenAI cost (last 24h, completed only): $${(allCost / 100).toFixed(2)}`);
  console.log(`Grand total tokens: ${rows.reduce((a, r) => a + (r.total_input_tokens ?? 0), 0).toLocaleString()} in / ${rows.reduce((a, r) => a + (r.total_output_tokens ?? 0), 0).toLocaleString()} out`);

  // Recent (last 2h, post gpt-5.4-mini deploy)
  const recent = rows.filter((r) => r.completed_at && (Date.now() - r.completed_at.getTime()) < 2 * 60 * 60 * 1000);
  if (recent.length > 0) {
    console.log(`\n── Last 2h only (post deploy): n=${recent.length} ──`);
    const cost = recent.reduce((a, r) => a + (r.total_cost_cents ?? 0), 0) / 100;
    const dur = recent.filter(r => r.started_at && r.completed_at).map(r => (r.completed_at!.getTime() - r.started_at!.getTime()) / 60000);
    const avgDur = dur.length ? dur.reduce((a,b)=>a+b,0) / dur.length : 0;
    console.log(`  Total cost: $${cost.toFixed(2)}`);
    console.log(`  Avg cost/sim: $${(cost / recent.length).toFixed(3)}`);
    console.log(`  Avg duration: ${avgDur.toFixed(1)} min`);
  }

  await c.end();
})();

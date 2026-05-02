/**
 * Quick inventory of persona pools per workspace, broken down by category +
 * country. Helps decide which (workspace, category, country) cells need
 * pre-seeding before a demo.
 *
 * Usage: npm run inventory:pool
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
    const { rows: wsRows } = await c.query<{
      workspace_id: string;
      name: string;
      personas: string;
    }>(
      `select w.id as workspace_id, w.name, count(p.*)::text as personas
       from public.workspaces w
       left join public.personas p on p.workspace_id = w.id
       group by w.id, w.name
       order by count(p.*) desc
       limit 20`,
    );
    console.log(`\nWorkspaces (top 20 by pool size):`);
    for (const r of wsRows) {
      console.log(`  ${r.workspace_id} · ${r.name ?? "<no name>"} · ${r.personas} personas`);
    }
    if (wsRows.length === 0) {
      console.log("  (none)");
      return;
    }

    // Pick the workspace with the most personas — that's almost certainly
    // the active dev workspace where sims have been run.
    const targetWs = wsRows[0];
    if (!targetWs || Number(targetWs.personas) === 0) {
      console.log(`\nTop workspace has no personas. Nothing to break down.`);
      return;
    }

    const { rows: cellRows } = await c.query<{
      base_profession: string | null;
      country: string;
      cnt: string;
    }>(
      `select base_profession, country, count(*)::text as cnt
       from public.personas
       where workspace_id = $1
       group by base_profession, country
       order by country, count(*) desc`,
      [targetWs.workspace_id],
    );

    // Aggregate by (category proxy = base_profession) and country to show
    // coverage. base_profession alone doesn't tell us the category, but the
    // distribution gives a rough sense of which categories ran.
    const byCountry = new Map<string, number>();
    for (const r of cellRows) {
      byCountry.set(r.country, (byCountry.get(r.country) ?? 0) + Number(r.cnt));
    }
    console.log(
      `\nPool breakdown for top workspace (${targetWs.workspace_id.slice(0, 8)}, ${targetWs.personas} personas):`,
    );
    console.log(`  Countries:`);
    for (const [country, n] of [...byCountry.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`    ${country}: ${n}`);
    }
    console.log(`  Distinct base professions: ${new Set(cellRows.map((r) => r.base_profession)).size}`);
    console.log(
      `  Top 10 (base_profession × country) cells:`,
    );
    for (const r of cellRows.slice(0, 10)) {
      console.log(`    ${r.base_profession ?? "<null>"} × ${r.country}: ${r.cnt}`);
    }
  } finally {
    await c.end();
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});

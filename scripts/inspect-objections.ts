/**
 * Inspect per-persona raw objections for a country to diagnose
 * clustering quality. Prints all objections from the recommended
 * country's personas, then shows what clustering produces at various
 * thresholds.
 *
 * Usage:
 *   npm run inspect:objections -- <ensemble-prefix> <country>
 */
import { Client } from "pg";
import {
  clusterStrings,
  isPersonaMismatchNoise,
  tokenize,
  overlapCoefficient,
} from "../src/lib/simulation/surfaced-recount";

async function main() {
  const [, , prefix, country] = process.argv;
  if (!prefix || !country) {
    console.error("Usage: inspect:objections -- <ensemble-prefix> <country-code>");
    process.exit(1);
  }
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    const { rows: ens } = await c.query<{ id: string }>(
      `select id::text from public.ensembles where id::text like $1 limit 1`,
      [`${prefix}%`],
    );
    if (ens.length === 0) {
      console.log("No matching ensemble.");
      return;
    }
    const { rows: sims } = await c.query<{
      personas: Array<{ country?: string; objections?: string[] }> | null;
    }>(
      `select r.personas
         from public.simulations s
         join public.simulation_results r on r.simulation_id = s.id
        where s.ensemble_id = $1`,
      [ens[0].id],
    );
    const wanted = country.toUpperCase();
    const allObj: string[] = [];
    for (const sim of sims) {
      for (const p of sim.personas ?? []) {
        if ((p.country ?? "").toUpperCase() !== wanted) continue;
        for (const o of p.objections ?? []) {
          const t = o.trim();
          if (t && !isPersonaMismatchNoise(t)) allObj.push(t);
        }
      }
    }
    console.log(`\n${wanted} — ${allObj.length} non-noise objections from ${sims.length} sims`);
    console.log("(showing first 10 raw)\n");
    allObj.slice(0, 10).forEach((o, i) => {
      const head = o.length > 200 ? o.slice(0, 200) + "..." : o;
      console.log(`  ${i + 1}. ${head}`);
    });

    console.log("\nClustering @ various thresholds:");
    for (const t of [0.5, 0.4, 0.3, 0.25, 0.2]) {
      const clusters = clusterStrings(allObj, t)
        .sort((a, b) => b.count - a.count)
        .slice(0, 7);
      console.log(`\n  threshold ${t}:`);
      clusters.forEach((c) => {
        const head = c.text.length > 100 ? c.text.slice(0, 100) + "..." : c.text;
        console.log(`    [${c.count}] ${head}`);
      });
    }

    // Sanity: print pairwise overlap matrix on the first 5 raw items.
    console.log("\nPairwise overlap (first 5 raw items):");
    const sample = allObj.slice(0, 5);
    const tokens = sample.map((s) => tokenize(s));
    for (let i = 0; i < sample.length; i++) {
      for (let j = i + 1; j < sample.length; j++) {
        const ov = overlapCoefficient(tokens[i], tokens[j]);
        console.log(`  [${i + 1}↔${j + 1}] ${ov.toFixed(3)}`);
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

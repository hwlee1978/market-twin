/**
 * Aggregates all simulations of a single project into an ensemble view —
 * what the product would output if "1 sim" became "N parallel sims aggregated".
 *
 * Validates the segment-based recommendation concept WITHOUT spending money
 * on new sims: pulls the project's existing sim history from DB and
 * computes:
 *   - bestCountry distribution (e.g. US won 3/8 sims, GB won 2/8...)
 *   - Per-country finalScore stats (mean, median, std, min, max)
 *   - Per-country avg-intent stats
 *   - Per-segment best country (volume / CAC / stability / regulatory ease)
 *
 * Usage:
 *   npm run analyze:ensemble -- <project_id_prefix>
 */
import { Client } from "pg";

interface CountryRow {
  country: string;
  demandScore: number;
  cacEstimateUsd: number;
  competitionScore: number;
  finalScore: number;
}

interface SimRecord {
  sim_id: string;
  created_at: string;
  best_country: string | null;
  countries: CountryRow[];
  personas: Array<{ country?: string; purchaseIntent?: number }>;
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m];
}

function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}

function std(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

async function main() {
  const prefix = process.argv[2];
  if (!prefix) {
    console.error("Usage: npm run analyze:ensemble -- <project_id_prefix>");
    console.error("Example: npm run analyze:ensemble -- 48f1041d");
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("ERROR: DATABASE_URL env var is required.");
    process.exit(1);
  }
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    const { rows } = await c.query<{
      sim_id: string;
      created_at: string;
      best_country: string | null;
      product_name: string;
      candidate_countries: string[];
      countries: CountryRow[];
      personas: Array<{ country?: string; purchaseIntent?: number }>;
    }>(
      `select s.id::text as sim_id, s.created_at, s.best_country,
              p.product_name, p.candidate_countries,
              r.countries, r.personas
       from public.simulations s
       join public.projects p on p.id = s.project_id
       join public.simulation_results r on r.simulation_id = s.id
       where s.project_id::text like $1 and s.status = 'completed'
       order by s.created_at asc`,
      [`${prefix}%`],
    );
    if (rows.length === 0) {
      console.log(`No completed sims found for project prefix ${prefix}`);
      return;
    }
    const product = rows[0].product_name;
    const markets = rows[0].candidate_countries;
    console.log(`\n${"=".repeat(72)}`);
    console.log(`Ensemble Analysis: ${product}`);
    console.log(`Markets: ${markets.join(", ")}`);
    console.log(`Sims aggregated: ${rows.length}`);
    console.log(`${"=".repeat(72)}\n`);

    // ── 1. bestCountry distribution ───────────────────────────────
    const bestCountByFreq = new Map<string, number>();
    for (const r of rows) {
      const k = r.best_country ?? "?";
      bestCountByFreq.set(k, (bestCountByFreq.get(k) ?? 0) + 1);
    }
    console.log(`bestCountry distribution across ${rows.length} sims:`);
    const sortedBest = [...bestCountByFreq.entries()].sort((a, b) => b[1] - a[1]);
    for (const [country, n] of sortedBest) {
      const pct = ((n / rows.length) * 100).toFixed(0);
      const bar = "█".repeat(Math.round((n / rows.length) * 30));
      console.log(`  ${country.padEnd(4)} ${String(n).padStart(2)}/${rows.length} (${pct.padStart(3)}%) ${bar}`);
    }
    const topWinner = sortedBest[0];
    const consensus = (topWinner[1] / rows.length) * 100;
    console.log(
      `  → Consensus: ${consensus.toFixed(0)}% on ${topWinner[0]} ` +
        `${consensus >= 70 ? "(STRONG)" : consensus >= 50 ? "(MODERATE)" : "(WEAK — multiple plausible answers)"}`,
    );

    // ── 2. Per-country finalScore distribution ────────────────────
    console.log(`\nPer-country finalScore stats (n=${rows.length}):`);
    console.log(`  Country | mean   median  std    min - max  | range`);
    const countryFinalScores = new Map<string, number[]>();
    for (const r of rows) {
      for (const c of r.countries) {
        const arr = countryFinalScores.get(c.country) ?? [];
        arr.push(c.finalScore);
        countryFinalScores.set(c.country, arr);
      }
    }
    const sortedCountries = [...countryFinalScores.entries()]
      .map(([country, scores]) => ({ country, scores, m: mean(scores) }))
      .sort((a, b) => b.m - a.m);
    for (const { country, scores } of sortedCountries) {
      const m = mean(scores).toFixed(1);
      const md = median(scores).toFixed(1);
      const s = std(scores).toFixed(1);
      const mn = Math.min(...scores).toFixed(0);
      const mx = Math.max(...scores).toFixed(0);
      const rng = (Math.max(...scores) - Math.min(...scores)).toFixed(0);
      console.log(
        `  ${country.padEnd(7)} | ${m.padStart(5)}  ${md.padStart(5)}   ${s.padStart(4)}   ${mn.padStart(2)} - ${mx.padStart(2)}    | ${rng.padStart(2)}`,
      );
    }

    // ── 3. Per-country persona avg intent stats ──────────────────
    console.log(`\nPer-country avg-intent stats (n=${rows.length}):`);
    console.log(`  Country | mean   median  std    min - max`);
    const countryIntents = new Map<string, number[]>();
    for (const r of rows) {
      const byCountry: Record<string, number[]> = {};
      for (const p of r.personas) {
        const k = (p.country ?? "?").toUpperCase();
        const i = typeof p.purchaseIntent === "number" ? p.purchaseIntent : 0;
        if (!byCountry[k]) byCountry[k] = [];
        byCountry[k].push(i);
      }
      for (const [country, intents] of Object.entries(byCountry)) {
        const arr = countryIntents.get(country) ?? [];
        arr.push(mean(intents));
        countryIntents.set(country, arr);
      }
    }
    for (const country of [...countryIntents.keys()].sort()) {
      const scores = countryIntents.get(country)!;
      const m = mean(scores).toFixed(1);
      const md = median(scores).toFixed(1);
      const s = std(scores).toFixed(1);
      const mn = Math.min(...scores).toFixed(1);
      const mx = Math.max(...scores).toFixed(1);
      console.log(
        `  ${country.padEnd(7)} | ${m.padStart(5)}  ${md.padStart(5)}   ${s.padStart(4)}   ${mn.padStart(4)} - ${mx.padStart(4)}`,
      );
    }

    // ── 4. Per-segment best country ───────────────────────────────
    console.log(`\nSegment-based recommendations (median across ${rows.length} sims):`);
    const segments = [
      { name: "속도 우선 (highest demand)", metric: "demandScore", direction: "high" },
      { name: "비용 효율 (lowest CAC)", metric: "cacEstimateUsd", direction: "low" },
      { name: "경쟁 회피 (lowest competition)", metric: "competitionScore", direction: "low" },
      { name: "종합 점수 (highest finalScore)", metric: "finalScore", direction: "high" },
    ] as const;
    type Metric = "demandScore" | "cacEstimateUsd" | "competitionScore" | "finalScore";
    for (const seg of segments) {
      const metric = seg.metric as Metric;
      const byCountry = new Map<string, number[]>();
      for (const r of rows) {
        for (const c of r.countries) {
          const v = c[metric];
          if (typeof v !== "number") continue;
          const arr = byCountry.get(c.country) ?? [];
          arr.push(v);
          byCountry.set(c.country, arr);
        }
      }
      const ranked = [...byCountry.entries()]
        .map(([country, vals]) => ({ country, m: median(vals) }))
        .sort((a, b) => (seg.direction === "high" ? b.m - a.m : a.m - b.m));
      const top = ranked[0];
      const second = ranked[1];
      console.log(
        `  ${seg.name.padEnd(40)} → ${top.country.padEnd(4)} (${top.m.toFixed(1)})  alt: ${second?.country ?? "?"} (${second?.m.toFixed(1) ?? "?"})`,
      );
    }

    // ── 5. Variance assessment ────────────────────────────────────
    console.log(`\nVariance assessment:`);
    const finalRanges = sortedCountries.map(({ scores }) => Math.max(...scores) - Math.min(...scores));
    const maxRange = Math.max(...finalRanges);
    const meanRange = mean(finalRanges);
    console.log(`  Max finalScore range across countries: ${maxRange.toFixed(0)} pts`);
    console.log(`  Mean finalScore range across countries: ${meanRange.toFixed(0)} pts`);
    if (maxRange > 30) {
      console.log(
        `  ⚠️  HIGH variance — same fixture produces very different country scores per run. ` +
          `Single-sim recommendation is unreliable; ensemble + segment view recommended.`,
      );
    } else if (maxRange > 15) {
      console.log(
        `  Moderate variance — single-sim answer plausible but should be confirmed with 2-3 reruns.`,
      );
    } else {
      console.log(
        `  Low variance — single-sim answer is reliable.`,
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

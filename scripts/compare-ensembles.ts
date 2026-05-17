/**
 * Compare two ensembles side-by-side for holdout validation.
 * Usage: tsx scripts/compare-ensembles.ts <prefix-A> <prefix-B>
 */
import { Client } from "pg";

interface CountryRow {
  country: string;
  finalScore: number;
  components?: {
    marketSize?: number;
    culturalFit?: number;
    channelMatch?: number;
    priceCompat?: number;
    competition?: number;
    regulatory?: number;
  };
  cacEstimateUsd?: number;
}

interface Persona {
  country?: string;
  incomeBand?: string;
  baseProfession?: string;
  purchaseIntent?: number;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

async function loadEnsemble(c: Client, prefix: string) {
  const { rows: ens } = await c.query<{
    id: string;
    created_at: string;
    product_name: string;
  }>(
    `select e.id::text as id, e.created_at, p.product_name
       from public.ensembles e
       join public.projects p on p.id = e.project_id
      where e.id::text like $1
      order by e.created_at desc
      limit 1`,
    [`${prefix}%`],
  );
  if (!ens.length) throw new Error(`No ensemble matches prefix ${prefix}`);
  const e = ens[0];

  const { rows: sims } = await c.query<{
    countries: CountryRow[];
    personas: Persona[];
    best_country: string | null;
  }>(
    `select r.countries, r.personas, s.best_country
       from public.simulations s
       join public.simulation_results r on r.simulation_id = s.id
      where s.ensemble_id = $1 and s.status = 'completed'
      order by s.ensemble_index`,
    [e.id],
  );

  return { meta: e, sims };
}

function summarize(sims: Array<{ countries: CountryRow[]; personas: Persona[]; best_country: string | null }>) {
  // Per-country finalScore + components
  const byCountry = new Map<string, { final: number[]; ms: number[]; cac: number[] }>();
  for (const s of sims) {
    for (const c of s.countries) {
      const arr = byCountry.get(c.country) ?? { final: [], ms: [], cac: [] };
      arr.final.push(c.finalScore);
      if (c.components?.marketSize != null) arr.ms.push(c.components.marketSize);
      if (c.cacEstimateUsd != null) arr.cac.push(c.cacEstimateUsd);
      byCountry.set(c.country, arr);
    }
  }

  // Income bracket distribution
  const incomeBuckets = { low: 0, lower_mid: 0, mid: 0, upper_mid: 0, high: 0, unknown: 0 };
  let totalPersonas = 0;
  // Vegan/dietary count
  const dietRestricted = new Map<string, number>();
  const dietKeywords = ["비건", "글루텐프리", "다이어터", "vegan", "gluten", "dieter"];
  // Best country votes
  const bestVotes = new Map<string, number>();

  for (const s of sims) {
    if (s.best_country) {
      bestVotes.set(s.best_country, (bestVotes.get(s.best_country) ?? 0) + 1);
    }
    for (const p of s.personas) {
      totalPersonas++;
      // Income bucket from incomeBand text — rough USD parsing
      const usd = parseUsdRange(p.incomeBand ?? "");
      if (usd == null) incomeBuckets.unknown++;
      else if (usd < 30_000) incomeBuckets.low++;
      else if (usd < 60_000) incomeBuckets.lower_mid++;
      else if (usd < 100_000) incomeBuckets.mid++;
      else if (usd < 150_000) incomeBuckets.upper_mid++;
      else incomeBuckets.high++;
      // Diet-restricted
      const prof = (p.baseProfession ?? "").toLowerCase();
      for (const kw of dietKeywords) {
        if (prof.includes(kw)) {
          dietRestricted.set(prof, (dietRestricted.get(prof) ?? 0) + 1);
          break;
        }
      }
    }
  }

  return { byCountry, incomeBuckets, totalPersonas, dietRestricted, bestVotes };
}

function parseUsdRange(text: string): number | null {
  if (!text) return null;
  const t = text.replace(/[,]/g, "");
  const rangeK = t.match(/\$\s*(\d+(?:\.\d+)?)\s*[-–~]\s*(\d+(?:\.\d+)?)\s*k/i);
  if (rangeK) return ((parseFloat(rangeK[1]) + parseFloat(rangeK[2])) / 2) * 1000;
  const singleK = t.match(/\$\s*(\d+(?:\.\d+)?)\s*k\b/i);
  if (singleK) return parseFloat(singleK[1]) * 1000;
  const rangeAbs = t.match(/\$\s*(\d{4,7})\s*[-–~]\s*(\d{4,7})/);
  if (rangeAbs) return (parseInt(rangeAbs[1], 10) + parseInt(rangeAbs[2], 10)) / 2;
  const singleAbs = t.match(/\$\s*(\d{4,7})\b/);
  if (singleAbs) return parseInt(singleAbs[1], 10);
  return null;
}

async function main() {
  const a = process.argv[2];
  const b = process.argv[3];
  if (!a || !b) {
    console.error("Usage: tsx scripts/compare-ensembles.ts <prefix-A> <prefix-B>");
    process.exit(1);
  }
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    const A = await loadEnsemble(c, a);
    const B = await loadEnsemble(c, b);
    const sA = summarize(A.sims);
    const sB = summarize(B.sims);

    console.log(`\n══ A: ${A.meta.id.slice(0, 8)} (${A.meta.created_at}) — ${A.meta.product_name} · ${A.sims.length} sims`);
    console.log(`══ B: ${B.meta.id.slice(0, 8)} (${B.meta.created_at}) — ${B.meta.product_name} · ${B.sims.length} sims\n`);

    // Best country
    console.log("┌── bestCountry vote distribution ──");
    const allCountries = new Set([...sA.bestVotes.keys(), ...sB.bestVotes.keys()]);
    for (const country of allCountries) {
      const va = sA.bestVotes.get(country) ?? 0;
      const vb = sB.bestVotes.get(country) ?? 0;
      const pa = ((va / A.sims.length) * 100).toFixed(0);
      const pb = ((vb / B.sims.length) * 100).toFixed(0);
      console.log(`  ${country.padEnd(4)}  A: ${String(va).padStart(2)}/${A.sims.length} (${pa.padStart(3)}%)   B: ${String(vb).padStart(2)}/${B.sims.length} (${pb.padStart(3)}%)`);
    }

    // Country scores
    console.log("\n┌── Country mean finalScore + components.marketSize + CAC ──");
    console.log("  Country | A final  B final  Δ      | A mktSize  B mktSize  Δ      | A CAC    B CAC    Δ");
    const allKeys = new Set([...sA.byCountry.keys(), ...sB.byCountry.keys()]);
    const sortedKeys = [...allKeys].sort();
    for (const k of sortedKeys) {
      const da = sA.byCountry.get(k);
      const db = sB.byCountry.get(k);
      const fa = da ? mean(da.final) : NaN;
      const fb = db ? mean(db.final) : NaN;
      const ma = da && da.ms.length ? mean(da.ms) : NaN;
      const mb = db && db.ms.length ? mean(db.ms) : NaN;
      const ca = da && da.cac.length ? mean(da.cac) : NaN;
      const cb = db && db.cac.length ? mean(db.cac) : NaN;
      const dF = (fb - fa).toFixed(1);
      const dM = (mb - ma).toFixed(1);
      const dC = (cb - ca).toFixed(1);
      console.log(
        `  ${k.padEnd(7)} | ${fa.toFixed(1).padStart(6)}   ${fb.toFixed(1).padStart(6)}  ${dF.padStart(6)} | ${ma.toFixed(1).padStart(7)}    ${mb.toFixed(1).padStart(7)}    ${dM.padStart(6)} | $${ca.toFixed(0).padStart(5)}   $${cb.toFixed(0).padStart(5)}   ${dC.padStart(7)}`,
      );
    }

    // Income brackets
    console.log("\n┌── Income bracket distribution (% of total personas) ──");
    const buckets = ["low", "lower_mid", "mid", "upper_mid", "high", "unknown"] as const;
    for (const bk of buckets) {
      const pa = ((sA.incomeBuckets[bk] / sA.totalPersonas) * 100).toFixed(1);
      const pb = ((sB.incomeBuckets[bk] / sB.totalPersonas) * 100).toFixed(1);
      const d = (parseFloat(pb) - parseFloat(pa)).toFixed(1);
      console.log(`  ${bk.padEnd(10)}  A: ${pa.padStart(5)}% (${String(sA.incomeBuckets[bk]).padStart(4)})   B: ${pb.padStart(5)}% (${String(sB.incomeBuckets[bk]).padStart(4)})   Δ ${d.padStart(6)}pp`);
    }

    // Diet-restricted personas
    console.log("\n┌── Diet-restricted personas (cap=2/sim target post-Phase B) ──");
    const dietKeys = new Set([...sA.dietRestricted.keys(), ...sB.dietRestricted.keys()]);
    if (dietKeys.size === 0) console.log("  (none detected with vegan/gluten/dieter keyword in baseProfession)");
    for (const dk of dietKeys) {
      const ca = sA.dietRestricted.get(dk) ?? 0;
      const cb = sB.dietRestricted.get(dk) ?? 0;
      console.log(`  ${dk.padEnd(40)}  A: ${String(ca).padStart(3)}   B: ${String(cb).padStart(3)}   Δ ${cb - ca}`);
    }

    console.log(`\nA total personas: ${sA.totalPersonas}  ·  B total personas: ${sB.totalPersonas}`);
  } finally {
    await c.end();
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});

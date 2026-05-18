/**
 * Phase F.2 diagnostic — measure per-provider × per-category accuracy
 * across all completed ensembles vs ground-truth fixtures.
 *
 * Outputs a category × provider matrix showing where each provider
 * outperforms or underperforms the uniform-weighting baseline. This
 * answers: "is per-LLM weighting worth implementing, and if so, what
 * fixed weights should we use as the starting point?"
 *
 *   npx tsx --env-file=.env.local scripts/analyze-per-provider-accuracy.ts
 */

import { Client } from "pg";
import { loadAllGroundTruth } from "@/lib/validation/loader";

interface SimSnapshot {
  ensembleId: string;
  productSlug: string;
  productName: string;
  provider: string | null;
  bestCountry: string | null;
}

const PROVIDERS = ["anthropic", "openai", "deepseek"] as const;

function inferCategory(productName: string, gtCategory: string): string {
  // gtCategory is "food" / "beauty"; refine for sub-categorization where helpful.
  const n = productName.toLowerCase();
  if (n.includes("oled") || n.includes("tv")) return "tech";
  if (n.includes("정관장") || n.includes("ginseng")) return "wellness";
  if (n.includes("진로") || n.includes("소주") || n.includes("chamisul")) return "alcohol";
  if (gtCategory === "beauty") return "beauty";
  if (gtCategory === "food") return "food";
  return "other";
}

async function main() {
  const truths = await loadAllGroundTruth();
  const truthBySlug = new Map(truths.map((t) => [t.slug, t.truth]));

  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  const { rows } = await c.query<{
    ensemble_id: string;
    product_name: string;
    provider: string | null;
    best_country: string | null;
  }>(
    `select s.ensemble_id::text as ensemble_id,
            p.product_name,
            s.model_provider as provider,
            s.best_country
       from public.simulations s
       join public.ensembles e on e.id = s.ensemble_id
       join public.projects p on p.id = e.project_id
      where s.status = 'completed' and e.status = 'completed'
      order by s.ensemble_id, s.ensemble_index`,
  );

  // Match each sim row to a ground-truth fixture by product name LIKE
  const sims: SimSnapshot[] = [];
  for (const r of rows) {
    if (!r.best_country) continue;
    const slug = [...truthBySlug.keys()].find((s) => {
      const truth = truthBySlug.get(s)!;
      const slugPart = truth.product.split(" ")[0];
      return r.product_name.toLowerCase().includes(slugPart.toLowerCase());
    });
    if (!slug) continue;
    sims.push({
      ensembleId: r.ensemble_id,
      productSlug: slug,
      productName: r.product_name,
      provider: r.provider,
      bestCountry: r.best_country.toUpperCase(),
    });
  }

  await c.end();

  console.log(`Loaded ${sims.length} provider-attributed sims across ${new Set(sims.map(s => s.ensembleId)).size} ensembles`);
  console.log("");

  // Per (category × provider) accuracy
  type Stats = { hits: number; total: number };
  const matrix = new Map<string, Map<string, Stats>>();

  function getTruthTops(slug: string): Set<string> {
    const truth = truthBySlug.get(slug);
    if (!truth) return new Set();
    const tops = new Set<string>();
    for (const ev of truth.evidence) {
      if (ev.metric === "revenue_rank_overseas" && typeof ev.value === "number" && ev.value <= 3) {
        tops.add(ev.country.toUpperCase());
      }
    }
    return tops;
  }

  for (const sim of sims) {
    if (!sim.provider) continue;
    const truth = truthBySlug.get(sim.productSlug);
    if (!truth) continue;
    const category = inferCategory(truth.product, truth.category);
    const truthTops = getTruthTops(sim.productSlug);
    if (truthTops.size === 0) continue;
    const hit = truthTops.has(sim.bestCountry!) ? 1 : 0;
    let providerMap = matrix.get(category);
    if (!providerMap) {
      providerMap = new Map();
      matrix.set(category, providerMap);
    }
    const cur = providerMap.get(sim.provider) ?? { hits: 0, total: 0 };
    cur.hits += hit;
    cur.total += 1;
    providerMap.set(sim.provider, cur);
  }

  // Print matrix
  const categories = [...matrix.keys()].sort();
  console.log("═══ Per-provider top-3 hit rate by category ═══");
  console.log("");
  const header = "category".padEnd(12) + PROVIDERS.map((p) => p.padStart(12)).join("") + "   |   uniform";
  console.log(header);
  console.log("─".repeat(header.length));
  for (const cat of categories) {
    const providerMap = matrix.get(cat)!;
    const cells: string[] = [];
    const rates: number[] = [];
    for (const p of PROVIDERS) {
      const s = providerMap.get(p);
      if (!s || s.total === 0) {
        cells.push("    n/a".padStart(12));
        continue;
      }
      const rate = s.hits / s.total;
      rates.push(rate);
      cells.push(`${(rate * 100).toFixed(0).padStart(3)}% (${s.hits}/${s.total})`.padStart(12));
    }
    const uniform = rates.length > 0 ? rates.reduce((a, b) => a + b, 0) / rates.length : 0;
    console.log(`${cat.padEnd(12)}${cells.join("")}   |   ${(uniform * 100).toFixed(0).padStart(3)}%`);
  }

  // Suggested weights (relative to uniform)
  console.log("");
  console.log("═══ Suggested weights (relative to category uniform mean) ═══");
  console.log("");
  console.log("category".padEnd(12) + PROVIDERS.map((p) => p.padStart(12)).join(""));
  console.log("─".repeat(48));
  for (const cat of categories) {
    const providerMap = matrix.get(cat)!;
    const rates: Array<number | null> = PROVIDERS.map((p) => {
      const s = providerMap.get(p);
      return s && s.total > 0 ? s.hits / s.total : null;
    });
    const valid = rates.filter((r): r is number => r !== null);
    const meanRate = valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : 0;
    if (meanRate === 0) {
      console.log(`${cat.padEnd(12)}` + PROVIDERS.map(() => "    1.0×".padStart(12)).join(""));
      continue;
    }
    const cells = rates.map((r) => {
      if (r === null) return "      n/a".padStart(12);
      const w = r / meanRate;
      return `${w.toFixed(2)}×`.padStart(12);
    });
    console.log(`${cat.padEnd(12)}${cells.join("")}`);
  }

  console.log("");
  console.log("Notes:");
  console.log("  - 1.0× = uniform; >1.0× = over-weight this provider for this category");
  console.log("  - Categories with single fixture: weights are noisy (sample n=2-6 sims)");
  console.log("  - Cold-start: any (category, provider) with <5 sims should fall back to 1.0×");
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});

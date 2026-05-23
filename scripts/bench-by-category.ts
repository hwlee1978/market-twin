/**
 * Per-category benchmark breakdown.
 * Re-runs scoring + groups by fixture category.
 *   npx tsx --env-file=.env.local scripts/bench-by-category.ts
 */
import { Client } from "pg";
import { loadAllGroundTruth } from "@/lib/validation/loader";
import { scoreEnsemble } from "@/lib/validation/score";

interface AggRow {
  ensembleId: string;
  perCountryMeanScore: Record<string, number>;
  bestCountryVotes: Record<string, number>;
  pickedWinner: string | null;
  pickedWinnerConsensusPercent: number | null;
  totalSims: number;
}

async function fetchLatestForProduct(c: Client, productName: string): Promise<AggRow | null> {
  const firstWord = productName.split(/[\s(]/)[0];
  const { rows } = await c.query<{
    id: string;
    aggregate_result: { recommendation?: { country?: string; consensusPercent?: number } } | null;
  }>(
    `select e.id::text as id, e.aggregate_result
       from public.ensembles e
       join public.projects p on p.id = e.project_id
      where e.status = 'completed' and p.product_name ilike $1
      order by e.created_at desc limit 1`,
    [`%${firstWord}%`],
  );
  if (rows.length === 0) return null;
  const ensembleId = rows[0].id;
  const { rows: sims } = await c.query<{
    countries: { country: string; finalScore: number }[];
    best_country: string | null;
  }>(
    `select r.countries, s.best_country
       from public.simulations s
       join public.simulation_results r on r.simulation_id = s.id
      where s.ensemble_id = $1 and s.status = 'completed'`,
    [ensembleId],
  );
  const perCountrySum: Record<string, number> = {};
  const perCountryCount: Record<string, number> = {};
  const bestVotes: Record<string, number> = {};
  for (const s of sims) {
    if (s.best_country) bestVotes[s.best_country] = (bestVotes[s.best_country] ?? 0) + 1;
    for (const ct of s.countries ?? []) {
      perCountrySum[ct.country] = (perCountrySum[ct.country] ?? 0) + ct.finalScore;
      perCountryCount[ct.country] = (perCountryCount[ct.country] ?? 0) + 1;
    }
  }
  const perCountryMeanScore: Record<string, number> = {};
  for (const k of Object.keys(perCountrySum)) {
    perCountryMeanScore[k] = perCountrySum[k] / perCountryCount[k];
  }
  const rec = rows[0].aggregate_result?.recommendation;
  return {
    ensembleId,
    perCountryMeanScore,
    bestCountryVotes: bestVotes,
    pickedWinner: rec?.country ? rec.country.toUpperCase() : null,
    pickedWinnerConsensusPercent: rec?.consensusPercent ?? null,
    totalSims: sims.length,
  };
}

// Group fixtures into our 7 categories for the user's framing
function bucketize(slug: string, category: string): string {
  // Fashion
  if (["andar-leggings", "mula-pintuck-pants", "spao-bts-collab-tee", "stylenanda-3ce", "8seconds-bts-merch"].includes(slug)) return "패션";
  // Home/Daily (appliances small + kitchen)
  if (["locknlock-containers", "hurom-slow-juicer", "coway-water-purifier", "hanssem-furniture", "monami-pen-153"].includes(slug)) return "생활용품";
  // Baby
  if (["namyang-imperial-formula", "namyang-step2-formula", "bosomi-diapers", "agabang-baby-clothes", "boryung-baby-food"].includes(slug)) return "베이비";
  // Pet
  if (["harim-petfood", "anf-petfood", "petfriends-pet-snacks", "dr-bao-pet-supplement", "pets-be-pet-toys"].includes(slug)) return "펫";
  // Content/IP
  if (["kakao-webtoon-picoma", "naver-webtoon", "hybe-bts-merch", "yg-blackpink-merch", "pengsoo-character-goods"].includes(slug)) return "콘텐츠/IP";
  // Health (incl original KGC + 4 new)
  if (["kgc-everytime-redginseng", "ckd-vitamin-c", "drlin-vitamin", "pulmuone-greenjuice", "limbo-protein"].includes(slug)) return "헬스";
  // Electronics (incl original LG OLED + 4 new)
  if (["lg-oled-tv-c-series", "samsung-galaxy-s25", "lg-gram-laptop", "cuckoo-rice-cooker", "winix-air-purifier"].includes(slug)) return "전자/가전";
  // Food/Beverage/Beauty originals
  if (category === "food" || category === "beverage" || category === "alcohol") return "식음료(기존)";
  if (category === "beauty") return "뷰티(기존)";
  return "기타";
}

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const truths = await loadAllGroundTruth();
  const byCategory = new Map<string, { slug: string; composite: number; truthTop: string; simTop: string; consensus: number; hit: boolean }[]>();

  for (const t of truths) {
    const agg = await fetchLatestForProduct(c, t.truth.product);
    if (!agg) continue;
    const report = scoreEnsemble(t.slug, agg, t.truth);
    const truthTop = t.truth.evidence
      .filter((e) => e.metric === "revenue_rank_overseas" && e.value === 1)
      .map((e) => e.country)[0] ?? "?";
    const cat = bucketize(t.slug, t.truth.category);
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push({
      slug: t.slug,
      composite: report.composite,
      truthTop,
      simTop: agg.pickedWinner ?? "?",
      consensus: agg.pickedWinnerConsensusPercent ?? 0,
      hit: agg.pickedWinner === truthTop,
    });
  }

  console.log(`\n${"=".repeat(72)}`);
  console.log(`PER-CATEGORY MEAN COMPOSITE (Haiku-only, n=${truths.length})`);
  console.log("=".repeat(72));

  const summary: { category: string; n: number; mean: number; hit: number; hitPct: number }[] = [];
  for (const [cat, rows] of byCategory.entries()) {
    const mean = rows.reduce((a, b) => a + b.composite, 0) / rows.length;
    const hit = rows.filter((r) => r.hit).length;
    summary.push({ category: cat, n: rows.length, mean, hit, hitPct: (hit / rows.length) * 100 });
  }
  summary.sort((a, b) => b.mean - a.mean);

  console.log(`\n  ${"Category".padEnd(20)} ${"n".padStart(3)}  ${"mean".padStart(6)}  ${"top1Hit".padStart(8)}  ${"hit%".padStart(6)}`);
  console.log(`  ${"-".repeat(20)} ${"-".repeat(3)}  ${"-".repeat(6)}  ${"-".repeat(8)}  ${"-".repeat(6)}`);
  for (const s of summary) {
    console.log(`  ${s.category.padEnd(20)} ${String(s.n).padStart(3)}  ${s.mean.toFixed(1).padStart(6)}  ${s.hit}/${s.n}`.padEnd(50) + `${s.hitPct.toFixed(0)}%`.padStart(7));
  }

  console.log(`\n${"=".repeat(72)}`);
  console.log(`PER-FIXTURE DETAIL`);
  console.log("=".repeat(72));
  for (const [cat, rows] of byCategory.entries()) {
    console.log(`\n[${cat}]`);
    rows.sort((a, b) => b.composite - a.composite);
    for (const r of rows) {
      const mark = r.hit ? "✓" : "✗";
      console.log(`  ${mark}  ${r.slug.padEnd(32)} composite=${r.composite.toFixed(1).padStart(5)}  truth=${r.truthTop.padEnd(2)}  sim=${r.simTop}(${r.consensus}%)`);
    }
  }

  await c.end();
})();

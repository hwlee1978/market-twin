/**
 * 실험 A — 페르소나 축 오프라인 재채점 (LLM 호출 0회, 읽기 전용).
 *
 * 결과 (2026-09-13 실행, N=19): 기각. w=0 기준선이 top-1 9/19=47%로 canonical
 * 수치를 정확히 재현했고, w>0 모든 조건에서 top-2/top-3가 같거나 나빠졌다.
 * 페르소나 단독(w=1)은 top-1 21%로 크게 열등하다. 즉 국가별 평균
 * purchaseIntent는 finalScore와 상관이 낮지만(ρ≈0.48) 그 차이는 독립적인
 * 신호가 아니라 노이즈다. 선형 혼합으로는 랭킹을 개선할 수 없다.
 *
 * 현재 랭킹은 recomputeFinalScoreFromComponents()가 6개 컴포넌트를 고정
 * 가중치로 선형결합한 finalScore로만 정해진다. 1,200명 페르소나의
 * purchaseIntent는 랭킹에 들어가지 않는다. 저장된 백테스트 앙상블을 꺼내
 *
 *     score' = (1-w)·norm(finalScore) + w·norm(meanIntent)
 *
 * 로 다시 매기고, w별 top-1/2/3 적중률을 정답(seed 파일의 `actual`)과 대조한다.
 *
 * 실행: npm exec -- tsx --env-file=.env.local scripts/_rescore-persona-axis.ts
 */
import { Client } from "pg";
import { SUPPORTED_MARKET_CODES } from "../packages/shared/src/countries";

/** 백테스트 정답 — seed 스크립트의 productName → actual 를 그대로 옮긴 것.
 *  (projects 테이블에 slug 컬럼이 없어 product_name 으로 매칭한다.) */
const TRUTH: Record<string, string> = {
  "Medicube Zero Pore Pad": "US", "Kundal Perfume Shampoo": "ID",
  "Five Guys burgers": "GB", "shiro natural cosmetics": "TW",
  "Meet More fruit instant coffee": "KR", "Wardah halal cosmetics": "MY",
  "Yopokki Instant Tteokbokki": "JP", "Jinro Soju": "JP",
  "Kleannara Pure Cotton Sanitary Pads": "SG", "Native Deodorant": "CA",
  "Celsius Fitness Energy Drink": "SE", "Glico Pocky biscuit sticks": "TH",
  "Bulk Homme men's skincare": "TW", "Krating Daeng energy drink": "SG",
  "IRVINS Salted Egg snacks": "HK", "Oishi prawn crackers (Liwayway)": "CN",
  "OldTown White Coffee 3-in-1": "SG", "Indomie Mi Goreng (Indofood)": "NG",
  "Anker charging accessories": "US", "Tony's Chocolonely chocolate": "US",
  "Shake Shack burgers": "AE", "Kopiko Brown 3-in-1 Coffee": "PH",
};

const WEIGHTS = [0, 0.05, 0.1, 0.15, 0.2, 0.3, 0.5, 1.0];

/** 순위 비교용 0~1 정규화. 전부 같은 값이면 0.5로 눕힌다. */
function norm(vals: Map<string, number>): Map<string, number> {
  const xs = [...vals.values()];
  const lo = Math.min(...xs), hi = Math.max(...xs);
  const out = new Map<string, number>();
  for (const [k, v] of vals) out.set(k, hi === lo ? 0.5 : (v - lo) / (hi - lo));
  return out;
}

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  // 백테스트 프로젝트의 완료된 앙상블. 같은 슬러그가 여러 번 돌았으면 최신 1건.
  const ens = await c.query(`
    SELECT DISTINCT ON (p.product_name)
           p.product_name AS slug, p.originating_country AS origin,
           e.id, e.tier, e.aggregate_result
    FROM ensembles e
    JOIN projects p ON p.id = e.project_id
    WHERE e.status = 'completed' AND e.aggregate_result IS NOT NULL
      AND p.product_name = ANY($1::text[])
    ORDER BY p.product_name, e.created_at DESC;`, [Object.keys(TRUTH)]);

  const supported = SUPPORTED_MARKET_CODES;
  const rows: Array<{ slug: string; actual: string; base: string[]; byW: Map<number, string[]> }> = [];
  let skippedScope = 0, skippedNoIntent = 0;

  for (const r of ens.rows as Array<{ slug: string; origin: string | null; id: string; aggregate_result: any }>) {
    const actual = TRUTH[r.slug];
    if (!actual) continue;
    // 리포트의 채점 규칙과 동일: 지원 24개 시장 밖의 정답은 채점에서 제외.
    if (!supported.has(actual)) { skippedScope++; continue; }

    // aggregate_result.countryStats[] = { country, finalScore:{median,mean,...}, ... }
    const agg = r.aggregate_result;
    const countries: Array<{ country: string; finalScore?: { median?: number; mean?: number } }> =
      agg?.countryStats ?? [];
    if (countries.length === 0) continue;

    // 원산지는 "진출할 시장" 후보가 아니다. 리포트가 기록한 채점 결함 (2)가
    // 정확히 이것 — origin을 랭킹에 남겨두면 K-브랜드는 KR이 1위로 잡힌다.
    const fs = new Map<string, number>();
    for (const row of countries) {
      if (row.country === r.origin) continue;
      const v = row.finalScore?.median ?? row.finalScore?.mean;
      if (typeof v === "number") fs.set(row.country, v);
    }
    if (fs.size === 0) continue;

    // 이 앙상블에 속한 모든 sim의 페르소나에서 국가별 평균 purchaseIntent.
    const intentQ = await c.query(
      `SELECT pj.country, avg(pj.intent)::float AS mean_intent, count(*) AS n
         FROM simulations s
         JOIN simulation_results sr ON sr.simulation_id = s.id
         CROSS JOIN LATERAL (
           SELECT elem->>'country' AS country,
                  NULLIF(elem->>'purchaseIntent','')::float AS intent
             FROM jsonb_array_elements(sr.personas) elem
         ) pj
        WHERE s.ensemble_id = $1 AND pj.country IS NOT NULL AND pj.intent IS NOT NULL
        GROUP BY pj.country;`, [r.id]);

    const intent = new Map<string, number>();
    for (const row of intentQ.rows as Array<{ country: string; mean_intent: number }>) {
      if (fs.has(row.country)) intent.set(row.country, row.mean_intent);
    }
    if (intent.size < 2) { skippedNoIntent++; continue; }

    const nf = norm(fs), ni = norm(intent);
    const rank = (w: number) =>
      [...fs.keys()]
        .map((k) => ({ k, v: (1 - w) * (nf.get(k) ?? 0) + w * (ni.get(k) ?? nf.get(k) ?? 0) }))
        .sort((a, b) => b.v - a.v)
        .map((x) => x.k);

    const byW = new Map<number, string[]>();
    for (const w of WEIGHTS) byW.set(w, rank(w));
    rows.push({ slug: r.slug, actual, base: rank(0), byW });
  }

  console.log(`\n채점 대상 ${rows.length}건 (범위 밖 제외 ${skippedScope}, intent 없음 ${skippedNoIntent})`);

  const hit = (list: string[], a: string, k: number) => list.slice(0, k).includes(a);
  console.log("\n=== w별 적중 (N=" + rows.length + ") ===");
  const table = WEIGHTS.map((w) => {
    const t1 = rows.filter((r) => hit(r.byW.get(w)!, r.actual, 1)).length;
    const t2 = rows.filter((r) => hit(r.byW.get(w)!, r.actual, 2)).length;
    const t3 = rows.filter((r) => hit(r.byW.get(w)!, r.actual, 3)).length;
    const pct = (n: number) => `${n}/${rows.length} (${Math.round((n / rows.length) * 100)}%)`;
    return { w, "top-1": pct(t1), "top-2": pct(t2), "top-3": pct(t3) };
  });
  console.table(table);

  console.log("\n=== 브랜드별 정답 순위 (w=0 → w=0.15) ===");
  console.table(rows.map((r) => ({
    slug: r.slug, actual: r.actual,
    "rank w=0": r.byW.get(0)!.indexOf(r.actual) + 1,
    "rank w=.15": r.byW.get(0.15)!.indexOf(r.actual) + 1,
    "top1 w=0": r.byW.get(0)![0],
    "top1 w=.15": r.byW.get(0.15)![0],
  })));

  await c.end();
}

main().catch((e) => { console.error(e); process.exit(1); });

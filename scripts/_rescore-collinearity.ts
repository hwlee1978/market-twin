/**
 * 실험 B — 컴포넌트 공선성 진단 + 축 병합 재채점 (LLM 호출 0회, 읽기 전용).
 *
 * 현행 finalScore = 6개 컴포넌트의 고정 선형결합(score-weights.ts).
 * 가설: 6개 중 5개가 "진입 용이성"이라는 한 축을 중복해서 세고 있어
 * 실효 차원이 2에 가깝다. 그렇다면 (a) 상관행렬에서 그 덩어리가 보이고,
 * (b) 덩어리를 1축으로 묶고 marketSize와의 배분만 조정하면 개선 여지가 있다.
 *
 * 결과 (2026-09-13, N=19): 진단은 확인, 개선은 기각.
 *   - 상관행렬: 5개 "용이성" 컴포넌트가 서로 0.41~0.72로 묶이고, marketSize는
 *     그 전부와 음의 상관(-0.25~-0.53). 공선이 아니라 길항 관계인 2축이다.
 *     큰 시장일수록 진입이 어렵다는 현실이 그대로 찍혀 있다.
 *   - 예측력은 거의 전부 용이성 축에 있다: 용이성 단독 top-1 37%,
 *     marketSize 단독 16%.
 *   - 2축 배분(m=0.2~0.7), 균등 6축, 순위곱, 게이트형 — 어느 것도 현행
 *     top-1을 넘지 못했다. 선형이든 비선형이든 같은 결론이라 함수 형태의
 *     문제가 아니다.
 * → 가중치·형태를 바꿔서 얻을 것이 없다. 천장은 신호 집합 자체에 있다.
 *
 * 채점 규칙은 실험 A와 동일 — 원산지 제외, 지원 24개국 밖 정답은 제외.
 * 기준선(w=0 복원): top-1 9/19, top-2 12/19, top-3 13/19.
 *
 * 실행: npm exec -- tsx --env-file=.env.local scripts/_rescore-collinearity.ts
 */
import { Client } from "pg";
import { SUPPORTED_MARKET_CODES } from "../packages/shared/src/countries";

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

const KEYS = ["marketSize", "culturalFit", "channelMatch", "priceCompat", "competition", "regulatory"] as const;
type Key = (typeof KEYS)[number];
const PROD: Record<Key, number> = {
  marketSize: 0.3, culturalFit: 0.15, channelMatch: 0.15,
  priceCompat: 0.1, competition: 0.15, regulatory: 0.15,
};

/** 브랜드 내에서 국가들을 순위로 바꾼다(브랜드 간 수준 차이를 제거). */
function ranks(xs: number[]): number[] {
  const idx = xs.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const out = new Array(xs.length).fill(0);
  idx.forEach((o, r) => { out[o.i] = r + 1; });
  return out;
}
function pearson(a: number[], b: number[]): number {
  const n = a.length, ma = a.reduce((s, x) => s + x, 0) / n, mb = b.reduce((s, x) => s + x, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; num += x * y; da += x * x; db += y * y; }
  return da === 0 || db === 0 ? 0 : num / Math.sqrt(da * db);
}

interface Fixture { name: string; actual: string; rows: Array<{ country: string; c: Record<Key, number> }>; }

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const ens = await c.query(`
    SELECT DISTINCT ON (p.product_name)
           p.product_name AS name, p.originating_country AS origin, e.aggregate_result
      FROM ensembles e JOIN projects p ON p.id = e.project_id
     WHERE e.status = 'completed' AND e.aggregate_result IS NOT NULL
       AND p.product_name = ANY($1::text[])
     ORDER BY p.product_name, e.created_at DESC;`, [Object.keys(TRUTH)]);

  const fixtures: Fixture[] = [];
  for (const r of ens.rows as Array<{ name: string; origin: string | null; aggregate_result: any }>) {
    const actual = TRUTH[r.name];
    if (!actual || !SUPPORTED_MARKET_CODES.has(actual)) continue;
    const rows: Fixture["rows"] = [];
    for (const cs of (r.aggregate_result?.countryStats ?? []) as Array<{ country: string; components?: Record<string, { median?: number; mean?: number }> }>) {
      if (cs.country === r.origin || !cs.components) continue;
      const c2 = {} as Record<Key, number>;
      let ok = true;
      for (const k of KEYS) {
        const v = cs.components[k]?.median ?? cs.components[k]?.mean;
        if (typeof v !== "number") { ok = false; break; }
        c2[k] = v;
      }
      if (ok) rows.push({ country: cs.country, c: c2 });
    }
    if (rows.length >= 3) fixtures.push({ name: r.name, actual, rows });
  }
  console.log(`\n채점 대상 ${fixtures.length}건`);

  // ── 1) 브랜드 내 순위 기준 상관행렬 ──
  const series: Record<Key, number[]> = { marketSize: [], culturalFit: [], channelMatch: [], priceCompat: [], competition: [], regulatory: [] };
  for (const f of fixtures) for (const k of KEYS) series[k].push(...ranks(f.rows.map((r) => r.c[k])));
  console.log("\n=== 컴포넌트 상관행렬 (브랜드 내 순위 기준) ===");
  console.table(KEYS.map((a) => {
    const row: Record<string, string> = { "": a };
    for (const b of KEYS) row[b] = pearson(series[a], series[b]).toFixed(2);
    return row;
  }));

  // ── 2) 가중치 시나리오 재채점 ──
  const score = (c2: Record<Key, number>, w: Record<Key, number>) =>
    KEYS.reduce((s, k) => s + c2[k] * (w[k] ?? 0), 0);
  const evaluate = (w: Record<Key, number>) => {
    let t1 = 0, t2 = 0, t3 = 0;
    for (const f of fixtures) {
      const order = [...f.rows].sort((a, b) => score(b.c, w) - score(a.c, w)).map((r) => r.country);
      const i = order.indexOf(f.actual);
      if (i === 0) t1++;
      if (i >= 0 && i < 2) t2++;
      if (i >= 0 && i < 3) t3++;
    }
    return { t1, t2, t3 };
  };
  const EASE: Key[] = ["culturalFit", "channelMatch", "priceCompat", "competition", "regulatory"];
  const twoAxis = (m: number) => {
    const rest = (1 - m) / EASE.length;
    return { marketSize: m, ...Object.fromEntries(EASE.map((k) => [k, rest])) } as Record<Key, number>;
  };
  const scenarios: Array<[string, Record<Key, number>]> = [
    ["현행 (프로덕션)", PROD],
    ["2축 m=0.20", twoAxis(0.2)],
    ["2축 m=0.30", twoAxis(0.3)],
    ["2축 m=0.40", twoAxis(0.4)],
    ["2축 m=0.50", twoAxis(0.5)],
    ["2축 m=0.60", twoAxis(0.6)],
    ["2축 m=0.70", twoAxis(0.7)],
    ["marketSize 단독", { marketSize: 1, culturalFit: 0, channelMatch: 0, priceCompat: 0, competition: 0, regulatory: 0 }],
    ["진입용이성 단독", { marketSize: 0, ...Object.fromEntries(EASE.map((k) => [k, 0.2])) } as Record<Key, number>],
    ["균등 6축", Object.fromEntries(KEYS.map((k) => [k, 1 / 6])) as Record<Key, number>],
  ];
  // ── 3) 비선형 형태 — 선형 결합이 문제인지 분리한다.
  //    marketSize가 나머지와 음의 상관이라 선형 합에서는 서로 상쇄된다.
  //    순위곱과 "용이성 게이트 후 시장규모 정렬"은 상쇄가 일어나지 않는 형태다.
  const easeScore = (c2: Record<Key, number>) => EASE.reduce((s, k) => s + c2[k], 0) / EASE.length;
  const nonlinear: Array<[string, (f: Fixture) => string[]]> = [
    ["순위곱 (용이성 × 시장규모)", (f) => {
      const e = ranks(f.rows.map((r) => -easeScore(r.c)));   // 1위 = 가장 용이
      const m = ranks(f.rows.map((r) => -r.c.marketSize));   // 1위 = 가장 큼
      return f.rows.map((r, i) => ({ r, v: Math.sqrt(e[i] * m[i]) }))
        .sort((a, b) => a.v - b.v).map((x) => x.r.country);
    }],
    ["용이성 상위5 → 시장규모 정렬", (f) => {
      const byEase = [...f.rows].sort((a, b) => easeScore(b.c) - easeScore(a.c));
      const head = byEase.slice(0, 5).sort((a, b) => b.c.marketSize - a.c.marketSize);
      return [...head, ...byEase.slice(5)].map((r) => r.country);
    }],
    ["시장규모 상위5 → 용이성 정렬", (f) => {
      const byMkt = [...f.rows].sort((a, b) => b.c.marketSize - a.c.marketSize);
      const head = byMkt.slice(0, 5).sort((a, b) => easeScore(b.c) - easeScore(a.c));
      return [...head, ...byMkt.slice(5)].map((r) => r.country);
    }],
  ];

  const n = fixtures.length;
  console.log("\n=== 시나리오별 적중 (N=" + n + ") ===");
  console.table(scenarios.map(([label, w]) => {
    const { t1, t2, t3 } = evaluate(w);
    const p = (x: number) => `${x}/${n} (${Math.round((x / n) * 100)}%)`;
    return { 시나리오: label, "top-1": p(t1), "top-2": p(t2), "top-3": p(t3) };
  }));
  console.log("");
  console.log("=== 비선형 형태 (N=" + n + ") ===");
  console.table(nonlinear.map(([label, fn]) => {
    let t1 = 0, t2 = 0, t3 = 0;
    for (const f of fixtures) {
      const i = fn(f).indexOf(f.actual);
      if (i === 0) t1++;
      if (i >= 0 && i < 2) t2++;
      if (i >= 0 && i < 3) t3++;
    }
    const p = (x: number) => `${x}/${n} (${Math.round((x / n) * 100)}%)`;
    return { 형태: label, "top-1": p(t1), "top-2": p(t2), "top-3": p(t3) };
  }));
  await c.end();
}
main().catch((e) => { console.error(e); process.exit(1); });

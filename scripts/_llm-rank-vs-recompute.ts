/**
 * 앵커가 붙은 데이터로 "LLM 원본 순위 vs 가중합 재계산" 비교 (LLM 호출 0회).
 *
 * 오늘 오프라인 실험들은 Comtrade/World Bank/채널원가 앵커가 빠진 환경에서
 * 돌았고, 페르소나 가설이 앵커 유무로 뒤집히는 것을 실제 재실행에서 확인했다.
 * 그렇다면 같은 환경에서 기각했던 '총체적 랭킹'도 다시 봐야 한다.
 *
 * simulation_results.countries[] 에는 LLM이 직접 매긴 rank 가 그대로 남아 있고,
 * finalScore 는 가중합으로 덮인 값이다. 즉 저장 데이터만으로 두 순위를
 * 짝지어 비교할 수 있다 — 그것도 앵커가 붙은 채로.
 *
 * 실행: _llm-rank-vs-recompute.ts <시작ISO> <끝ISO|null> [라벨]
 */
import { Client } from "pg";
import { readFileSync } from "node:fs";

const SINCE = process.argv[2];
const UNTIL = process.argv[3] && process.argv[3] !== "null" ? process.argv[3] : null;
const LABEL = process.argv[4] ?? "";
const SUPPORTED = new Set("KR JP CN TW US CA GB DE FR IT ES NL AE SA SG MY PH AU IN VN TH ID BR MX".split(" "));
const FIXTURES = "C:/Users/user/AppData/Local/Temp/claude/c--Project-Crypto-Twin/7b11678e-e7ed-42fe-9ab1-fcdf2a589e3b/scratchpad/fixtures_all.json";

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

async function main() {
  const truth = new Map((JSON.parse(readFileSync(FIXTURES, "utf8")) as Array<{ name: string; actual: string }>)
    .map((f) => [f.name, f.actual] as const));
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const q = await c.query(`
    SELECT p.product_name AS name, p.originating_country AS origin, sr.countries
      FROM simulations s
      JOIN simulation_results sr ON sr.simulation_id = s.id
      JOIN projects p ON p.id = s.project_id
     WHERE s.created_at >= $1 AND ($3::timestamptz IS NULL OR s.created_at < $3)
       AND p.product_name = ANY($2::text[]) AND sr.countries IS NOT NULL;`,
    [SINCE, [...truth.keys()], UNTIL]);
  await c.end();

  // 브랜드별로 여러 sim 이 있으므로 국가별 중앙값으로 합산한다(엔진과 같은 방식).
  const byBrand = new Map<string, { origin: string; rank: Map<string, number[]>; score: Map<string, number[]> }>();
  for (const r of q.rows as any[]) {
    const e = byBrand.get(r.name) ?? { origin: r.origin, rank: new Map(), score: new Map() };
    for (const row of (r.countries ?? []) as Array<{ country: string; rank?: number; finalScore?: number }>) {
      if (row.country === r.origin) continue;
      if (typeof row.rank === "number") (e.rank.get(row.country) ?? e.rank.set(row.country, []).get(row.country)!).push(row.rank);
      if (typeof row.finalScore === "number") (e.score.get(row.country) ?? e.score.set(row.country, []).get(row.country)!).push(row.finalScore);
    }
    byBrand.set(r.name, e);
  }

  const rows: Array<{ name: string; actual: string; rLlm: number; rRec: number }> = [];
  for (const [name, e] of byBrand) {
    const actual = truth.get(name);
    if (!actual || !SUPPORTED.has(actual) || e.rank.size === 0) continue;
    const byLlm = [...e.rank.entries()].map(([k, v]) => ({ k, v: median(v) })).sort((a, b) => a.v - b.v).map((x) => x.k);
    const byRec = [...e.score.entries()].map(([k, v]) => ({ k, v: median(v) })).sort((a, b) => b.v - a.v).map((x) => x.k);
    rows.push({ name, actual, rLlm: byLlm.indexOf(actual) + 1 || 99, rRec: byRec.indexOf(actual) + 1 || 99 });
  }

  const n = rows.length, pc = (x: number) => `${x}/${n} (${Math.round((x / n) * 100)}%)`;
  const sum = (sel: (r: (typeof rows)[number]) => number) => ({
    "top-1": pc(rows.filter((r) => sel(r) === 1).length),
    "top-2": pc(rows.filter((r) => sel(r) <= 2).length),
    "top-3": pc(rows.filter((r) => sel(r) <= 3).length),
  });
  console.log(`\n=== ${LABEL} 앵커 포함 데이터 · LLM 원본 순위 vs 가중합 (N=${n}) ===`);
  console.table([
    { 방식: "가중합 재계산 (현행)", ...sum((r) => r.rRec) },
    { 방식: "LLM 원본 rank", ...sum((r) => r.rLlm) },
  ]);
  const diff = rows.filter((r) => r.rLlm !== r.rRec);
  console.log(`순위가 다른 픽스처 ${diff.length}/${n}`);
  console.table(diff.map((r) => ({ 브랜드: r.name.slice(0, 34), 정답: r.actual, 가중합: r.rRec, LLM: r.rLlm })));
}
main().catch((e) => { console.error(e); process.exit(1); });

/**
 * 백테스트 채점 — 특정 시각 이후에 생성된 앙상블을 정답과 대조한다.
 *
 * _rerun-backtest.ts 로 A/B를 돌린 뒤 각 구간을 이 스크립트로 채점한다.
 * 채점 규칙은 N=20 리포트와 동일:
 *   · 정답이 지원 24개 시장 밖이면 채점 제외
 *   · 원산지는 후보 랭킹에서 제외 (안 빼면 K-브랜드는 KR이 1위로 잡힌다)
 *   · 순위는 aggregate_result.countryStats 의 finalScore 중앙값 기준
 *
 * 실행: npm exec -- tsx --env-file=.env.local scripts/_score-backtest.ts "2026-09-14T00:00:00Z" [라벨]
 */
import { Client } from "pg";
import { readFileSync } from "node:fs";

const SINCE = process.argv[2];
const LABEL = process.argv[3] ?? SINCE;
const SUPPORTED = new Set("KR JP CN TW US CA GB DE FR IT ES NL AE SA SG MY PH AU IN VN TH ID BR MX".split(" "));
const FIXTURES = "C:/Users/user/AppData/Local/Temp/claude/c--Project-Crypto-Twin/7b11678e-e7ed-42fe-9ab1-fcdf2a589e3b/scratchpad/fixtures.json";

async function main() {
  if (!SINCE) { console.error("Usage: _score-backtest.ts <ISO timestamp> [label]"); process.exit(1); }
  const truth = new Map(
    (JSON.parse(readFileSync(FIXTURES, "utf8")) as Array<{ name: string; actual: string }>)
      .map((f) => [f.name, f.actual] as const),
  );

  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const q = await c.query(`
    SELECT DISTINCT ON (p.product_name)
           p.product_name AS name, p.originating_country AS origin,
           e.id, e.created_at, e.aggregate_result, e.llm_providers
      FROM ensembles e JOIN projects p ON p.id = e.project_id
     WHERE e.status = 'completed' AND e.aggregate_result IS NOT NULL
       AND e.created_at >= $1 AND p.product_name = ANY($2::text[])
     ORDER BY p.product_name, e.created_at DESC;`, [SINCE, [...truth.keys()]]);
  await c.end();

  const rows: Array<{ name: string; actual: string; rank: number; top1: string; conf: string }> = [];
  for (const r of q.rows as any[]) {
    const actual = truth.get(r.name);
    if (!actual || !SUPPORTED.has(actual)) continue;
    const stats = (r.aggregate_result?.countryStats ?? []) as Array<{ country: string; finalScore?: { median?: number; mean?: number } }>;
    const scored = stats
      .filter((s) => s.country !== r.origin)
      .map((s) => ({ k: s.country, v: s.finalScore?.median ?? s.finalScore?.mean }))
      .filter((s): s is { k: string; v: number } => typeof s.v === "number")
      .sort((a, b) => b.v - a.v);
    if (scored.length === 0) continue;
    const order = scored.map((s) => s.k);
    rows.push({
      name: r.name, actual, rank: order.indexOf(actual) + 1 || 99, top1: order[0],
      conf: r.aggregate_result?.confidence ?? "-",
    });
  }

  const n = rows.length, pc = (x: number) => `${x}/${n} (${Math.round((x / n) * 100)}%)`;
  console.log(`\n=== ${LABEL} · ${SINCE} 이후 앙상블 (N=${n}) ===`);
  console.table([{
    "top-1": pc(rows.filter((r) => r.rank === 1).length),
    "top-2": pc(rows.filter((r) => r.rank <= 2).length),
    "top-3": pc(rows.filter((r) => r.rank <= 3).length),
  }]);
  console.log("기준 — canonical(2026-07): top-1 47% · top-2 68% · top-3 74%");
  console.table(rows.map((r) => ({ 브랜드: r.name, 정답: r.actual, 순위: r.rank, "1위": r.top1, 신뢰도: r.conf })));
}
main().catch((e) => { console.error(e); process.exit(1); });

/**
 * 백테스트 재실행 드라이버 — 페르소나 블록 유무 A/B를 실제 파이프라인에서.
 *
 * 지금까지의 측정은 국가 단계만 떼어낸 재현이라 Comtrade/World Bank 앵커가
 * 빠져 있었다. 이 드라이버는 smoke-ensemble-e2e(프로덕션과 같은 코드 경로)를
 * 픽스처마다 --as-of 로 돌려 앵커까지 붙인 상태로 A/B를 만든다.
 *
 *   A) SIM_RANK_WITHOUT_PERSONAS=off  (현행: 국가 프롬프트에 페르소나 요약 포함)
 *   B) SIM_RANK_WITHOUT_PERSONAS=on   (제외)
 *
 * 채점은 실행이 끝난 뒤 _score-backtest.ts 가 DB에서 읽어 수행한다.
 *
 * 실행: npm exec -- tsx --env-file=.env.local scripts/_rerun-backtest.ts [on|off] [동시실행수]
 */
import { spawn } from "node:child_process";
import { Client } from "pg";
import { readFileSync } from "node:fs";

const MODE = (process.argv[2] === "on" ? "on" : "off") as "on" | "off";
const CONCURRENCY = Number(process.argv[3] ?? 3);
const SUPPORTED = new Set("KR JP CN TW US CA GB DE FR IT ES NL AE SA SG MY PH AU IN VN TH ID BR MX".split(" "));

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const FIXTURES = process.env.BT_FIXTURES
    ?? "C:/Users/user/AppData/Local/Temp/claude/c--Project-Crypto-Twin/7b11678e-e7ed-42fe-9ab1-fcdf2a589e3b/scratchpad/fixtures.json";
  const fixtures = JSON.parse(readFileSync(FIXTURES, "utf8")) as Array<{ name: string; asOf: string; actual: string }>;
  const rows = fixtures
    .filter((f) => SUPPORTED.has(f.actual));
  const ids = new Map<string, string>();
  for (const f of rows) {
    const r = await c.query(
      `SELECT id FROM projects WHERE product_name = $1 ORDER BY created_at DESC LIMIT 1;`, [f.name]);
    if (r.rows[0]) ids.set(f.name, r.rows[0].id as string);
  }
  await c.end();

  const queue = rows.filter((f) => ids.has(f.name));
  console.log(`모드 SIM_RANK_WITHOUT_PERSONAS=${MODE} · ${queue.length}건 · 동시 ${CONCURRENCY}`);
  console.log(`시작 ${new Date().toISOString()}\n`);

  let done = 0;
  const spawnOnce = (f: { name: string; asOf: string }) =>
    new Promise<number | null>((resolve) => {
      const id = ids.get(f.name)!.slice(0, 8);
      // Windows + Node 24 에서는 .cmd 를 직접 spawn 하면 EINVAL 이 난다(셸 필요).
      // node_modules 의 tsx 를 직접 실행해 셸 의존을 없앤다.
      const child = spawn(
        process.execPath,
        ["node_modules/tsx/dist/cli.mjs", "--env-file=.env.local",
         "scripts/smoke-ensemble-e2e.ts", id, "hypothesis", `--as-of=${f.asOf}`],
        { env: { ...process.env, SIM_RANK_WITHOUT_PERSONAS: MODE }, stdio: ["ignore", "inherit", "inherit"] },
      );
      const t0 = Date.now();
      child.on("exit", (code) => {
        if (code !== 0) {
          console.log(`  ! ${f.name.padEnd(38)} exit=${code} ${Math.round((Date.now() - t0) / 1000)}s`);
        }
        resolve(code);
      });
    });

  // Retry a fixture once when the child process dies outright.
  //
  // Roughly 5% of fixtures per run exit with 3221226505 (0xC0000409,
  // STATUS_STACK_BUFFER_OVERRUN) — a native crash, not a simulation failure.
  // Measured across two 42-fixture runs: four crashes, four different
  // fixtures, none of which crashed twice, and every one of them completed
  // normally in another run. They also die early — 120-334s against a 546s
  // average — so it isn't resource exhaustion at the tail.
  //
  // Root cause is unresolved: a native fault leaves nothing in the logs, and
  // at a 5% rate a repro run would cost most of a full backtest to catch one.
  // Retrying costs one fixture's runtime and recovers the data, which is what
  // actually matters here — a crashed fixture silently shrinks N and the
  // scored corpus stops being the corpus we think we measured.
  const runOne = async (f: { name: string; asOf: string }) => {
    const t0 = Date.now();
    let code = await spawnOnce(f);
    if (code !== 0) code = await spawnOnce(f);
    done++;
    console.log(`  [${done}/${queue.length}] ${f.name.padEnd(38)} exit=${code} ${Math.round((Date.now() - t0) / 1000)}s`);
  };

  const q = [...queue];
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    for (;;) { const n = q.shift(); if (!n) return; await runOne(n); }
  }));
  console.log(`\n종료 ${new Date().toISOString()}`);
}
main().catch((e) => { console.error(e); process.exit(1); });

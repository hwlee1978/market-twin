/**
 * 순서 뒤집기 실험 — 순위 먼저, 컴포넌트는 설명으로.
 *
 * 현행 국가 단계는 국가마다 6개 항목을 0~100으로 채점시키고 그중 finalScore로
 * 순위를 만든다. 절제 실험(scripts/_ablation-2x2.ts)에서 "시장을 직접 순위
 * 매겨라"라고 물었을 때 top-1 68%가 나왔고, 채점 루브릭을 거친 현행 경로는
 * 47%다. 루브릭 자체가 판단을 왜곡하는지 보려면 순서를 뒤집어야 한다.
 *
 * 비교 대상 (모두 같은 19 픽스처·같은 저장 페르소나):
 *   현행 프롬프트 → 재계산   top-1 47% · top-2 47% · top-3 63%
 *   현행 프롬프트 → LLM점수  top-1 47% · top-2 58% · top-3 68%
 *   이 실험: 순위 먼저       ?
 *
 * 3표본을 평균순위(Borda)로 합산한다. 앵커 블록은 두 조건 모두 빠져 있어
 * 절대 수준은 프로덕션보다 낮지만 비교는 유효하다.
 *
 * 실행: npm exec -- tsx --env-file=.env.local scripts/_rank-first.ts
 */
import { Client } from "pg";
import { getLLMProvider } from "../packages/shared/src/llm";
import { SUPPORTED_MARKET_CODES } from "../packages/shared/src/countries";
import { aggregatePersonas, renderAggregateForPrompt } from "../packages/shared/src/simulation/aggregate";
import { COUNTRY_SYSTEM } from "../packages/shared/src/simulation/prompts";

const TRUTH: Record<string, string> = {
  "Medicube Zero Pore Pad": "US", "Kundal Perfume Shampoo": "ID",
  "Five Guys burgers": "GB", "shiro natural cosmetics": "TW",
  "Meet More fruit instant coffee": "KR", "Wardah halal cosmetics": "MY",
  "Yopokki Instant Tteokbokki": "JP", "Jinro Soju": "JP",
  "Kleannara Pure Cotton Sanitary Pads": "SG", "Native Deodorant": "CA",
  "Glico Pocky biscuit sticks": "TH", "Bulk Homme men's skincare": "TW",
  "Krating Daeng energy drink": "SG", "Oishi prawn crackers (Liwayway)": "CN",
  "OldTown White Coffee 3-in-1": "SG", "Anker charging accessories": "US",
  "Tony's Chocolonely chocolate": "US", "Shake Shack burgers": "AE",
  "Kopiko Brown 3-in-1 Coffee": "PH",
};
const SAMPLES = 3;
const STORE = "C:/Users/user/AppData/Local/Temp/claude/c--Project-Crypto-Twin/7b11678e-e7ed-42fe-9ab1-fcdf2a589e3b/scratchpad/rankfirst-rows.jsonl";

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const q = await c.query(`
    SELECT DISTINCT ON (p.product_name)
           p.product_name, p.category, p.description, p.base_price_cents, p.currency,
           p.originating_country, p.candidate_countries, sr.personas
      FROM projects p
      JOIN simulations s ON s.project_id = p.id
      JOIN simulation_results sr ON sr.simulation_id = s.id
     WHERE p.product_name = ANY($1::text[]) AND sr.personas IS NOT NULL
       AND jsonb_array_length(sr.personas) > 50
     ORDER BY p.product_name, s.created_at DESC;`, [Object.keys(TRUTH)]);
  await c.end();

  const fsMod = await import("node:fs");
  type Row = { name: string; actual: string; rank: number; top1: string };
  const out: Row[] = fsMod.existsSync(STORE)
    ? fsMod.readFileSync(STORE, "utf8").split(String.fromCharCode(10)).filter(Boolean).map((l) => JSON.parse(l) as Row)
    : [];
  const done = new Set(out.map((r) => r.name));
  if (done.size) console.log(`이전 실행 ${done.size}건 건너뜀`);

  const llm = getLLMProvider({ provider: "anthropic" });
  console.log(`모델: ${llm.name} / ${llm.model}\n`);

  for (const p of q.rows as any[]) {
    const actual = TRUTH[p.product_name];
    if (!actual || !SUPPORTED_MARKET_CODES.has(actual) || done.has(p.product_name)) continue;
    const candidates: string[] = (p.candidate_countries ?? []).filter((x: string) => x !== p.originating_country);
    if (candidates.length < 3) continue;

    const agg = aggregatePersonas(p.personas as any[]);
    const personaBlock = renderAggregateForPrompt(agg, "en");
    const prompt =
      `Brand/product: ${p.product_name}\nCategory: ${p.category}\n` +
      `Home country: ${p.originating_country}\n` +
      `Price: ${(p.base_price_cents / 100).toFixed(2)} ${p.currency}\n\n` +
      `Description:\n${p.description}\n\n` +
      `Simulated consumer reactions by market:\n${personaBlock}\n\n` +
      `Candidate markets (ISO-2): ${candidates.join(", ")}\n\n` +
      `TASK — in this order:\n` +
      `1. Decide the ranking. Which market is most likely to become this brand's first sustained, ` +
      `largest overseas market? Rank ALL candidates best-first. Judge holistically: a launch-blocker ` +
      `outweighs a large market, an unusually strong channel or diaspora fit can outweigh size.\n` +
      `2. THEN, for each market, fill in the six component scores (0-100) that EXPLAIN the position ` +
      `you already assigned. The components justify the ranking; they do not produce it.\n\n` +
      `Return JSON: {"ranking":[{"country":"XX","rationale":"...","components":` +
      `{"marketSize":0,"culturalFit":0,"channelMatch":0,"priceCompat":0,"competition":0,"regulatory":0}}]}` +
      ` — array in rank order, best first.`;

    const points: Record<string, number[]> = {};
    for (let i = 0; i < SAMPLES; i++) {
      let res;
      try {
        res = await llm.generate({
          system: COUNTRY_SYSTEM, prompt, temperature: 0.4, maxTokens: 8192,
          signal: AbortSignal.timeout(180_000),
        } as any);
      } catch (err) { console.log(`    (표본 ${i + 1} 실패: ${(err as Error).message.slice(0, 60)})`); continue; }
      const m = res.text.match(/\{[\s\S]*\}/);
      if (!m) continue;
      let parsed: any; try { parsed = JSON.parse(m[0]); } catch { continue; }
      const arr = parsed.ranking ?? [];
      arr.forEach((row: any, idx: number) => {
        if (typeof row?.country === "string" && candidates.includes(row.country)) {
          (points[row.country] ??= []).push(idx + 1);   // 평균순위(Borda)
        }
      });
    }
    const order = Object.entries(points)
      .map(([k, v]) => ({ k, v: v.reduce((s, x) => s + x, 0) / v.length }))
      .sort((a, b) => a.v - b.v).map((x) => x.k);
    if (order.length === 0) { console.log(`  ! ${p.product_name} 파싱 실패`); continue; }
    const row: Row = { name: p.product_name, actual, rank: order.indexOf(actual) + 1 || 99, top1: order[0] };
    out.push(row);
    fsMod.appendFileSync(STORE, JSON.stringify(row) + String.fromCharCode(10));
    console.log(`  ${p.product_name.padEnd(38)} 정답=${actual}  순위=${row.rank}  1위=${row.top1}`);
  }

  const n = out.length, pc = (x: number) => `${x}/${n} (${Math.round((x / n) * 100)}%)`;
  console.log("");
  console.log("=== 순위 먼저 (N=" + n + ") ===");
  console.table([{
    방식: "순위 먼저 → 컴포넌트 설명",
    "top-1": pc(out.filter((r) => r.rank === 1).length),
    "top-2": pc(out.filter((r) => r.rank <= 2).length),
    "top-3": pc(out.filter((r) => r.rank <= 3).length),
  }]);
  console.log("비교 — 현행→재계산 47/47/63 · 현행→LLM점수 47/58/68 · 절제실험(직접질문) 68/74/84");
}
main().catch((e) => { console.error(e); process.exit(1); });

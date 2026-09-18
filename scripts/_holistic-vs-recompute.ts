/**
 * 총체적 랭킹 vs 가중합 재계산 — 짝지어진 비교 (N=19).
 *
 * 플래그가 바꾸는 건 국가 단계 한 곳뿐이므로, 그 단계만 저장된 페르소나로
 * 재현한다. 한 번의 LLM 응답에서 두 순위를 동시에 뽑기 때문에 프롬프트·
 * 표본·모델이 완전히 동일한 짝 비교가 된다.
 *   A) 총체적  = LLM이 emit한 finalScore 그대로  (SIM_HOLISTIC_RANKING=on)
 *   B) 재계산  = 6개 컴포넌트 × FINAL_SCORE_WEIGHTS (현행 기본)
 * 두 경우 모두 규제 하한 캡을 적용해 실제 코드 경로와 맞춘다.
 *
 * 한계 — 원래 실행에 있던 Comtrade/World Bank 앵커 블록은 저장돼 있지 않아
 * 재현 프롬프트에서 빠진다. 다만 이 결손은 A와 B에 똑같이 작용하므로 짝
 * 비교의 타당성은 유지된다(절대 수준은 원 실행보다 낮게 나올 수 있다).
 *
 * 실행: npm exec -- tsx --env-file=.env.local scripts/_holistic-vs-recompute.ts
 */
import { Client } from "pg";
import { getLLMProvider } from "../packages/shared/src/llm";
import { SUPPORTED_MARKET_CODES } from "../packages/shared/src/countries";
import { aggregatePersonas } from "../packages/shared/src/simulation/aggregate";
import { countryPrompt, COUNTRY_SYSTEM } from "../packages/shared/src/simulation/prompts";
import { FINAL_SCORE_WEIGHTS, REGULATORY_HARD_FLOOR } from "../packages/shared/src/simulation/calibration/score-weights";

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

type Comp = { marketSize: number; culturalFit: number; channelMatch: number; priceCompat: number; competition: number; regulatory: number };
const W = FINAL_SCORE_WEIGHTS.value, FLOOR = REGULATORY_HARD_FLOOR.value;

const recompute = (c: Comp) => {
  let v = c.marketSize * W.marketSize + c.culturalFit * W.culturalFit + c.channelMatch * W.channelMatch
        + c.priceCompat * W.priceCompat + c.competition * W.competition + c.regulatory * W.regulatory;
  if (c.regulatory < FLOOR.regulatoryThreshold) v = Math.min(v, FLOOR.finalScoreCap);
  return v;
};
const capped = (llm: number, c: Comp) =>
  c.regulatory < FLOOR.regulatoryThreshold ? Math.min(llm, FLOOR.finalScoreCap) : llm;
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const q = await c.query(`
    SELECT DISTINCT ON (p.product_name)
           p.product_name, p.category, p.description, p.base_price_cents, p.currency,
           p.objective, p.originating_country, p.candidate_countries, sr.personas
      FROM projects p
      JOIN simulations s ON s.project_id = p.id
      JOIN simulation_results sr ON sr.simulation_id = s.id
     WHERE p.product_name = ANY($1::text[]) AND sr.personas IS NOT NULL
       AND jsonb_array_length(sr.personas) > 50
     ORDER BY p.product_name, s.created_at DESC;`, [Object.keys(TRUTH)]);
  await c.end();

  const llm = getLLMProvider({ provider: "anthropic" });
  console.log(`모델: ${llm.name} / ${llm.model} · 표본 ${SAMPLES}회/픽스처\n`);

  type Row = { name: string; actual: string; rankH: number; rankR: number; top1H: string; top1R: string };
  // 부분 결과를 JSONL로 적어두고 재실행 시 완료분을 건너뛴다.
  const STORE = "C:/Users/user/AppData/Local/Temp/claude/c--Project-Crypto-Twin/7b11678e-e7ed-42fe-9ab1-fcdf2a589e3b/scratchpad/holistic-rows.jsonl";
  const fsMod = await import("node:fs");
  const out: Row[] = fsMod.existsSync(STORE)
    ? fsMod.readFileSync(STORE, "utf8").split(String.fromCharCode(10)).filter(Boolean).map((l) => JSON.parse(l) as Row)
    : [];
  const done = new Set(out.map((r) => r.name));
  if (done.size) console.log(`이전 실행에서 ${done.size}건 완료 — 건너뜁니다
`);
  for (const p of q.rows as any[]) {
    const actual = TRUTH[p.product_name];
    if (!actual || !SUPPORTED_MARKET_CODES.has(actual)) continue;
    if (done.has(p.product_name)) continue;
    const candidates: string[] = (p.candidate_countries ?? []).filter((x: string) => x !== p.originating_country);
    if (candidates.length < 3) continue;

    const input: any = {
      productName: p.product_name, category: p.category, description: p.description,
      basePriceCents: p.base_price_cents, currency: p.currency, objective: p.objective ?? "expansion",
      originatingCountry: p.originating_country, candidateCountries: candidates,
      competitorUrls: [], assetDescriptions: [], assetUrls: [],
    };
    const agg = aggregatePersonas(p.personas as any[]);
    const prompt = countryPrompt(input, agg, "en");

    const hs: Record<string, number[]> = {}, rs: Record<string, number[]> = {};
    for (let i = 0; i < SAMPLES; i++) {
      // 호출당 상한. 이게 없어 첫 실행이 한 호출에서 40분 매달리다 죽었다.
      let res;
      try {
        res = await llm.generate({
          system: COUNTRY_SYSTEM, prompt, temperature: 0.4, maxTokens: 8192,
          signal: AbortSignal.timeout(180_000),
        } as any);
      } catch (err) {
        console.log(`    (표본 ${i + 1} 실패: ${(err as Error).message.slice(0, 80)})`);
        continue;
      }
      const m = res.text.match(/\{[\s\S]*\}/);
      if (!m) continue;
      let parsed: any; try { parsed = JSON.parse(m[0]); } catch { continue; }
      for (const row of parsed.countries ?? []) {
        const comp = row.components as Comp | undefined;
        if (!comp || typeof row.finalScore !== "number" || !candidates.includes(row.country)) continue;
        if (Object.values(comp).some((v) => typeof v !== "number")) continue;
        (hs[row.country] ??= []).push(capped(row.finalScore, comp));
        (rs[row.country] ??= []).push(recompute(comp));
      }
    }
    const order = (m2: Record<string, number[]>) =>
      Object.entries(m2).map(([k, v]) => ({ k, v: median(v) })).sort((a, b) => b.v - a.v).map((x) => x.k);
    const oh = order(hs), or = order(rs);
    if (oh.length === 0) { console.log(`  ! ${p.product_name} 파싱 실패`); continue; }
    const rankH = oh.indexOf(actual) + 1 || 99, rankR = or.indexOf(actual) + 1 || 99;
    const row: Row = { name: p.product_name, actual, rankH, rankR, top1H: oh[0], top1R: or[0] };
    out.push(row);
    fsMod.appendFileSync(STORE, JSON.stringify(row) + String.fromCharCode(10));
    console.log(`  ${p.product_name.padEnd(38)} 정답=${actual}  총체적=${rankH}  재계산=${rankR}`);
  }

  const n = out.length, pc = (x: number) => `${x}/${n} (${Math.round((x / n) * 100)}%)`;
  const sum = (sel: (r: (typeof out)[number]) => number) => ({
    "top-1": pc(out.filter((r) => sel(r) === 1).length),
    "top-2": pc(out.filter((r) => sel(r) <= 2).length),
    "top-3": pc(out.filter((r) => sel(r) <= 3).length),
  });
  console.log("");
  console.log("=== 짝지어진 비교 (N=" + n + ", 동일 응답) ===");
  console.table([
    { 방식: "B) 재계산 (현행 기본)", ...sum((r) => r.rankR) },
    { 방식: "A) 총체적 (LLM finalScore)", ...sum((r) => r.rankH) },
  ]);
  const flips = out.filter((r) => r.rankH !== r.rankR);
  console.log(`순위가 달라진 픽스처 ${flips.length}/${n}`);
  console.table(flips.map((r) => ({ 브랜드: r.name, 정답: r.actual, 재계산: r.rankR, 총체적: r.rankH, "재계산 1위": r.top1R, "총체적 1위": r.top1H })));
}
main().catch((e) => { console.error(e); process.exit(1); });

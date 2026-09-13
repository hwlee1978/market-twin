/**
 * 절제 실험 2×2 — {브랜드명 있음 / 익명화} × {순수 LLM / 그라운딩 얹음}
 *
 * 목적 두 가지를 한 번에 분리한다.
 *  (1) 기억의 기여분 — 브랜드명과 식별 단서를 지웠을 때 점수가 유지되는가.
 *      유지되면 속성 추론, 무너지면 회상이었다는 뜻.
 *  (2) 그라운딩의 기여분 — 우리가 주입하는 공식 통계 앵커가 모델의 총체적
 *      판단을 돕는가, 밀어내는가. 현행 엔진(47%)이 순수 호출(63%)보다 낮은
 *      이유의 유력 후보다.
 *
 * 참고점: 순수/브랜드명 = 63%, 현행 엔진 = 47% (둘 다 측정 완료, N=19).
 *
 * 한계 — 앵커는 country_stats_latest(2024년치)라 백테스트 시점(2012~2019)보다
 * 나중 데이터다. 즉 그라운딩 조건에 유리한 힌드사이트가 약간 섞여 있다.
 * 그럼에도 그라운딩 조건이 순수보다 낮게 나오면 "도움이 안 된다"는 결론은
 * 보수적으로 안전하다.
 *
 * 결과 (2026-09-13, claude-sonnet-4-6, N=19) — top-1 / top-2 / top-3
 *                 순수            +그라운딩
 *   브랜드명    58 / 79 / 84     68 / 74 / 84
 *   익명화      47 / 63 / 74     53 / 68 / 74
 *   현행 엔진                    47 / 63 / 68
 *
 *   (1) 그라운딩은 도움이 된다 — 브랜드명 +10pp, 익명화 +6pp (top-1).
 *       "공식 통계 주입이 모델의 사전지식을 밀어낸다"는 가설은 기각.
 *   (2) 브랜드 정체성의 기여는 약 11pp. 다만 익명화해도 47~53%로 무작위
 *       (~10%)보다 훨씬 높다 → 회상이 아니라 속성 추론이 주된 동력.
 *   (3) 현행 엔진은 브랜드명과 그라운딩을 둘 다 갖고도 "익명화·순수"와
 *       같은 점수다. 두 이점을 스코어카드 단계에서 전부 잃고 있다는 뜻.
 *
 *   익명화 검증: scripts/_anon-check.ts — 19건 중 브랜드 고유명사 잔존 0건
 *   (Cotton/3-in-1/Tteokbokki 같은 일반 서술어만 남음). 다만 설명문 안의
 *   특징적 사실 조합으로 모델이 역추론할 가능성까지 배제하지는 못한다.
 *
 *   재현 시 주의: temperature 0에서도 실행 간 ±1건이 움직인다(같은 조건
 *   앞선 실행은 63%, 이번엔 58%). ±1건은 노이즈로 취급할 것.
 *
 * 실행: npm exec -- tsx --env-file=.env.local scripts/_ablation-2x2.ts
 */
import { Client } from "pg";
import { getLLMProvider } from "../packages/shared/src/llm";
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

function parseJson<T>(raw: string): T | null {
  const m = raw.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (!m) return null;
  try { return JSON.parse(m[0]) as T; } catch { return null; }
}

interface Fx {
  name: string; actual: string; category: string; origin: string;
  price: string; desc: string; descAnon: string; candidates: string[]; anchors: string;
  leak: string[];
}

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const q = await c.query(`
    SELECT DISTINCT ON (p.product_name)
           p.product_name AS name, p.category, p.originating_country AS origin,
           p.description, p.candidate_countries, p.base_price_cents, p.currency
      FROM projects p JOIN ensembles e ON e.project_id = p.id
     WHERE e.status='completed' AND p.product_name = ANY($1::text[])
     ORDER BY p.product_name, p.created_at DESC;`, [Object.keys(TRUTH)]);
  const stats = await c.query(
    `SELECT country_code, country_name_en, population, gdp_per_capita_usd,
            median_household_income, source FROM country_stats_latest;`);
  await c.end();

  const anchorOf = new Map<string, string>();
  for (const s of stats.rows as any[]) {
    anchorOf.set(s.country_code,
      `${s.country_code} (${s.country_name_en}): 인구 ${Number(s.population).toLocaleString()}, ` +
      `1인당 GDP $${Number(s.gdp_per_capita_usd).toLocaleString()}, ` +
      `중위 가구소득 ${Number(s.median_household_income).toLocaleString()} 현지통화 — 출처 ${s.source}`);
  }

  const llm = getLLMProvider({ provider: "anthropic" });
  console.log(`모델: ${llm.name} / ${llm.model}\n`);

  const fx: Fx[] = [];
  for (const p of q.rows as any[]) {
    const actual = TRUTH[p.name];
    if (!actual || !SUPPORTED_MARKET_CODES.has(actual)) continue;
    const candidates = (p.candidate_countries ?? []).filter((x: string) => x !== p.origin);
    if (candidates.length < 3) continue;

    // 익명화 — 브랜드·모기업·플랫폼·창업자 등 고유명사를 속성 서술로 바꾼다.
    const anon = await llm.generate({
      system: "You rewrite product briefs to remove identity. Output JSON only.",
      prompt:
        `Rewrite the brief below so that the specific company or product can NOT be identified.\n` +
        `Remove: brand names, parent companies, founder names, retailer/platform names, app names,\n` +
        `award names, exact founding years, and any uniquely identifying phrase.\n` +
        `Keep: category, price tier, product form, positioning, ingredients/features, channel TYPE\n` +
        `(e.g. "a major domestic e-commerce marketplace"), and market position in generic terms.\n` +
        `Do not add facts. Keep it similar in length.\n\n` +
        `BRIEF:\n${p.description}\n\n` +
        `Return JSON: {"anon": "..."}`,
      temperature: 0, maxTokens: 1200,
    });
    const descAnon = parseJson<{ anon: string }>(anon.text)?.anon ?? "";

    // 누수 검사 — 브랜드명 토큰이 익명화본에 남아 있는지.
    const tokens = p.name.split(/[\s(),']+/).filter((t: string) => t.length >= 4 && !/^\d+$/.test(t));
    const leak = tokens.filter((t: string) => descAnon.toLowerCase().includes(t.toLowerCase()));

    fx.push({
      name: p.name, actual, category: p.category, origin: p.origin,
      price: `${(p.base_price_cents / 100).toFixed(2)} ${p.currency}`,
      desc: p.description, descAnon, candidates,
      anchors: candidates.map((x: string) => anchorOf.get(x) ?? `${x}: (통계 없음)`).join("\n"),
      leak,
    });
    if (leak.length) console.log(`  ⚠ 익명화 누수 ${p.name}: ${leak.join(", ")}`);
  }
  console.log(`픽스처 ${fx.length}건 준비 (익명화 누수 ${fx.filter((f) => f.leak.length).length}건)\n`);

  const ask = async (f: Fx, anonymous: boolean, grounded: boolean) => {
    const res = await llm.generate({
      system: "You are a market-entry adviser. Rank candidate export markets. Answer only with JSON.",
      prompt:
        (anonymous
          ? `Product: an unnamed ${f.category} product\n`
          : `Brand/product: ${f.name}\nCategory: ${f.category}\n`) +
        `Home country: ${f.origin}\nPrice: ${f.price}\n\n` +
        `Description:\n${anonymous ? f.descAnon : f.desc}\n\n` +
        (grounded ? `Official statistics for the candidate markets:\n${f.anchors}\n\n` : "") +
        `Candidate markets (ISO-2): ${f.candidates.join(", ")}\n\n` +
        `Which overseas market should this product enter first — the one most likely to become ` +
        `its first sustained, largest overseas market? Rank ALL candidates best-first.\n` +
        `Return JSON: {"ranking": ["XX", "YY", ...]}`,
      temperature: 0, maxTokens: 800,
    });
    return parseJson<{ ranking: string[] }>(res.text)?.ranking ?? [];
  };

  const CONDS: Array<[string, boolean, boolean]> = [
    ["브랜드명 · 순수", false, false],
    ["브랜드명 · 그라운딩", false, true],
    ["익명화 · 순수", true, false],
    ["익명화 · 그라운딩", true, true],
  ];
  const result = new Map<string, number[]>();
  for (const [label, anon, gr] of CONDS) {
    const ranksOut: number[] = [];
    for (const f of fx) ranksOut.push((await ask(f, anon, gr)).indexOf(f.actual) + 1 || 99);
    result.set(label, ranksOut);
    console.log(`완료: ${label}`);
  }

  const n = fx.length;
  const p = (x: number) => `${x}/${n} (${Math.round((x / n) * 100)}%)`;
  console.log("");
  console.log("=== 2×2 (N=" + n + ") ===");
  console.table(CONDS.map(([label]) => {
    const r = result.get(label)!;
    return { 조건: label, "top-1": p(r.filter((x) => x === 1).length),
             "top-2": p(r.filter((x) => x <= 2).length), "top-3": p(r.filter((x) => x <= 3).length) };
  }));
  console.log("참고 — 현행 엔진(스코어카드+가중치): top-1 9/19(47%) · top-2 12/19(63%) · top-3 13/19(68%)");
  console.table(fx.map((f, i) => ({
    브랜드: f.name, 정답: f.actual,
    "명·순수": result.get(CONDS[0][0])![i], "명·그라": result.get(CONDS[1][0])![i],
    "익·순수": result.get(CONDS[2][0])![i], "익·그라": result.get(CONDS[3][0])![i],
    누수: f.leak.length ? "⚠" : "",
  })));
}
main().catch((e) => { console.error(e); process.exit(1); });

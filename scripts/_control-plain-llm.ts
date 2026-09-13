/**
 * 대조군 — "그냥 LLM에 물어보면?" (실비 발생, 읽기 전용 DB 조회 + LLM 호출)
 *
 * Market Twin의 47%가 그라운딩·페르소나·앙상블 없이 범용 모델에 그대로
 * 물어본 것보다 나은지 측정한다. 입력은 백테스트와 동일한 의사결정 시점
 * 설명문(projects.description)과 후보국 목록이며, 우리 파이프라인이 붙이는
 * 공공데이터·페르소나·다중 실행은 전부 뺀다.
 *
 * ⚠ 교란 요인: 범용 모델은 학습 데이터로 정답을 이미 알 수 있다(Jinro가
 * 일본에서 성공한 사실 등). 우리 엔진은 --as-of 로 차단한 정보다. 그래서
 * 랭킹 질문과 분리된 두 번째 호출로 "이 브랜드의 실제 첫 해외 성공 시장을
 * 아는가"를 물어 인지/미인지로 갈라 본다. 인지군의 점수는 상한(inflated),
 * 미인지군이 공정한 비교에 가깝다.
 *
 * 결과 (2026-09-13, claude-sonnet-4-6, N=19, 실비 약 $0.3):
 *   범용 LLM 단일 호출  top-1 12/19(63%) · top-2 17/19(89%) · top-3 17/19(89%)
 *   Market Twin 동일 19건 top-1  9/19(47%) · top-2 12/19(63%) · top-3 13/19(68%)
 *   모델이 "정답을 모른다"고 답한 14건만 봐도 top-1 64% / top-3 86%.
 *
 *   → 이 코퍼스에서는 그냥 물어본 쪽이 모든 지표에서 앞선다.
 *   단, 코퍼스가 우리에게 불리하게 편향돼 있다: 19건 전부 결과가 문서화된
 *   유명 브랜드라 모델의 기억이 가장 잘 작동하는 표본이다(자기보고 미인지도
 *   잠재 기억을 배제하지 못한다 — Jinro는 "US로 안다"고 틀리게 답하고도
 *   JP를 1위로 찍었다). 무명 중소기업 제품에서도 같은 결과가 나온다는
 *   근거는 없으며, 그쪽이 실제 고객군이다. 다만 우리가 범용 모델을
 *   앞선다는 근거도 아직 없다.
 *
 * 실행: npm exec -- tsx --env-file=.env.local scripts/_control-plain-llm.ts
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

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const q = await c.query(`
    SELECT DISTINCT ON (p.product_name)
           p.product_name AS name, p.category, p.originating_country AS origin,
           p.description, p.candidate_countries, p.base_price_cents, p.currency
      FROM projects p JOIN ensembles e ON e.project_id = p.id
     WHERE e.status = 'completed' AND p.product_name = ANY($1::text[])
     ORDER BY p.product_name, p.created_at DESC;`, [Object.keys(TRUTH)]);
  await c.end();

  const llm = getLLMProvider({ provider: "anthropic" });
  console.log(`모델: ${llm.name} / ${llm.model}`);

  type Row = { name: string; actual: string; rank: number; top1: string; knew: boolean; knewSaid: string };
  const rows: Row[] = [];

  for (const p of q.rows as Array<{
    name: string; category: string; origin: string; description: string;
    candidate_countries: string[]; base_price_cents: number; currency: string;
  }>) {
    const actual = TRUTH[p.name];
    if (!actual || !SUPPORTED_MARKET_CODES.has(actual)) continue;
    const candidates = (p.candidate_countries ?? []).filter((x) => x !== p.origin);
    if (candidates.length < 3) continue;

    // ── 1차: 랭킹. 정답을 아는지 묻지 않는다(묻는 순간 랭킹이 오염된다).
    const rankRes = await llm.generate({
      system:
        "You are a market-entry adviser. Rank candidate export markets for a brand. " +
        "Answer only with JSON.",
      prompt:
        `Brand/product: ${p.name}\nCategory: ${p.category}\nHome country: ${p.origin}\n` +
        `Price: ${(p.base_price_cents / 100).toFixed(2)} ${p.currency}\n\n` +
        `Description:\n${p.description}\n\n` +
        `Candidate markets (ISO-2): ${candidates.join(", ")}\n\n` +
        `Which overseas market should this brand enter first — the one most likely to become ` +
        `its first sustained, largest overseas market? Rank ALL candidates best-first.\n` +
        `Return JSON: {"ranking": ["XX", "YY", ...]}`,
      temperature: 0,
      maxTokens: 800,
    });
    const ranked = parseJson<{ ranking: string[] }>(rankRes.text)?.ranking ?? [];
    const rank = ranked.indexOf(actual) + 1;

    // ── 2차: 인지 여부. 랭킹 호출과 완전히 분리된 대화다.
    const knowRes = await llm.generate({
      system: "Answer only with JSON. Be honest about uncertainty.",
      prompt:
        `From your training knowledge, do you know which overseas market ${p.name} ` +
        `(a ${p.category} brand from ${p.origin}) actually established as its first ` +
        `sustained or largest overseas market?\n` +
        `Return JSON: {"known": true|false, "market": "ISO-2 or null", "confidence": "high|medium|low"}`,
      temperature: 0,
      maxTokens: 200,
    });
    const k = parseJson<{ known: boolean; market: string | null; confidence: string }>(knowRes.text);
    const knew = Boolean(k?.known) && k?.market === actual;

    rows.push({
      name: p.name, actual, rank: rank || 99, top1: ranked[0] ?? "?",
      knew, knewSaid: `${k?.known ? "y" : "n"}/${k?.market ?? "-"}/${k?.confidence ?? "-"}`,
    });
    console.log(`  ${p.name.padEnd(38)} actual=${actual} rank=${rank || "-"} top1=${ranked[0] ?? "?"} knew=${knew ? "YES" : "no"}`);
  }

  const pct = (n: number, d: number) => (d === 0 ? "-" : `${n}/${d} (${Math.round((n / d) * 100)}%)`);
  const summarize = (label: string, rs: Row[]) => ({
    군: label,
    "top-1": pct(rs.filter((r) => r.rank === 1).length, rs.length),
    "top-2": pct(rs.filter((r) => r.rank <= 2).length, rs.length),
    "top-3": pct(rs.filter((r) => r.rank <= 3).length, rs.length),
  });

  console.log("");
  console.log("=== 범용 LLM 대조군 ===");
  console.table([
    summarize("전체", rows),
    summarize("정답 인지(상한)", rows.filter((r) => r.knew)),
    summarize("미인지(공정 비교)", rows.filter((r) => !r.knew)),
  ]);
  console.log("Market Twin 기준선 (동일 19건): top-1 9/19 (47%) · top-2 12/19 (63%) · top-3 13/19 (68%)");
  console.table(rows.map((r) => ({ 브랜드: r.name, 정답: r.actual, 순위: r.rank, top1: r.top1, 인지: r.knewSaid })));
}
main().catch((e) => { console.error(e); process.exit(1); });

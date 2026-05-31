/**
 * E2E: anchors → generateMarketReport with grounding 주입.
 * /api/challenge/content 와 동일 경로를 로컬에서 흘려서 LLM이 anchor
 * 수치를 인용하는지 확인.
 *
 *   npm exec tsx --env-file=.env.local scripts/debug-challenge-content-e2e.ts
 */
import {
  buildPublicDataGrounding,
  inferCategory,
  inferTargetCountry,
} from "../src/lib/challenge/anchors";
import { generateMarketReport } from "../src/lib/challenge/content";

const FIXTURE = {
  company: {
    name: "(주)예시화장품",
    industry: "화장품 제조",
    region: "서울",
    revenue_band: "10-50억",
    employee_band: "5-20명",
  },
  product: {
    name: "비건 쿠션 파운데이션",
    category: "화장품",
    description: "K-뷰티 비건 쿠션 파운데이션 (스킨케어 융합)",
  },
  goal: "베트남 진출 + ESG 인증",
  recommendations: [
    {
      program_id: "fake-1",
      program_table: "ch_voucher_programs" as const,
      program_name: "[서울] 2026년 2차 동남아(쇼피) 온라인 시장 진출 지원사업 참여기업 모집 공고",
      type: "export" as const,
      similarity_score: 0.48,
      llm_rank: 1,
      llm_score: 95,
      reason: "서울 소재 화장품 제조 중소기업의 동남아 진출 목표와 지역·업종·목표 모든 면에서 완벽하게 부합",
    },
    {
      program_id: "fake-2",
      program_table: "ch_voucher_programs" as const,
      program_name: "2026년 수출 중소ㆍ중견기업 ESG 공급망 컨설팅 지원사업",
      type: "export" as const,
      similarity_score: 0.44,
      llm_rank: 2,
      llm_score: 78,
      reason: "ESG 인증 목표에 정합",
    },
  ],
};

async function main() {
  console.log("━━━ Stage 1: anchors fetch ━━━");
  const country = inferTargetCountry(FIXTURE.goal, FIXTURE.recommendations);
  const category = inferCategory(FIXTURE.product);
  console.log(`  inferred country=${country} category=${category}`);
  if (!country) {
    console.error("타겟국 추론 실패");
    process.exit(1);
  }

  const t0 = Date.now();
  const grounding = await buildPublicDataGrounding(country, category);
  console.log(`  fetched ${Date.now() - t0}ms`);
  console.log(`  hofstede=${grounding.hofstede?.distance ?? "✗"} ` +
              `wb=${grounding.worldBank ? "✓" : "✗"} ` +
              `kotra=${grounding.kotra?.categoryMatched.length ?? 0} ` +
              `comtrade=${grounding.comtrade?.flows.length ?? 0}y`);
  if (grounding.errors.length > 0) {
    console.log(`  errors: ${grounding.errors.join(" | ")}`);
  }

  console.log("\n━━━ Stage 2: generateMarketReport (with grounding) ━━━");
  const t1 = Date.now();
  const report = await generateMarketReport({
    company: FIXTURE.company,
    products: [FIXTURE.product],
    goal: FIXTURE.goal,
    recommendations: FIXTURE.recommendations,
    grounding,
  });
  const dt = Date.now() - t1;
  console.log(`  generated ${dt}ms · cost $${report.cost_usd}`);
  console.log(`\n  Executive: ${report.executive_summary}\n`);
  console.log(`  Market signals (${report.market_signals.length}):`);
  for (const s of report.market_signals) console.log(`    · ${s}`);
  console.log(`\n  Actions (${report.recommended_actions.length}):`);
  for (const a of report.recommended_actions) console.log(`    · ${a}`);
  console.log(`\n  Risks (${report.risks.length}):`);
  for (const r of report.risks) console.log(`    · ${r}`);

  // 인용 검증 — signals 텍스트에 anchor 출처가 등장하는지
  console.log("\n━━━ Grounding 인용 검증 ━━━");
  const allText = [report.executive_summary, ...report.market_signals, ...report.recommended_actions]
    .join("\n").toLowerCase();
  const sources = [
    { name: "Hofstede", pattern: /hofstede|문화거리|문화 거리|권력거리|개인주의/i },
    { name: "World Bank", pattern: /world\s*bank|월드뱅크|gdp|가계소비|1인당/i },
    { name: "KOTRA", pattern: /kotra|진출 한국기업|진출한 한국기업|진출한 기업/i },
    { name: "UN Comtrade", pattern: /comtrade|수출.*\$|hs\s*\d/i },
  ];
  for (const s of sources) {
    const hit = s.pattern.test(allText);
    console.log(`  ${hit ? "✓" : "✗"} ${s.name} ${hit ? "인용됨" : "미인용"}`);
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});

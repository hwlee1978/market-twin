/**
 * src/lib/challenge/anchors.ts 동작 검증.
 * Hofstede + World Bank + KOTRA + Comtrade 4개 anchor를 실제 호출하고
 * 응답 정확도 + 시간 + 실패 anchor 확인.
 *
 *   npm exec tsx --env-file=.env.local scripts/debug-challenge-anchors.ts
 */
import {
  buildPublicDataGrounding,
  inferTargetCountry,
  inferCategory,
  renderGroundingBlock,
} from "../src/lib/challenge/anchors";

const FIXTURES = [
  {
    label: "화장품 / 동남아 진출",
    goal: "동남아 진출 + ESG 인증",
    product: { name: "비건 쿠션 파운데이션", category: "화장품" },
    recommendations: [
      { program_name: "[서울] 2026년 2차 동남아(쇼피) 온라인 시장 진출 지원사업", type: "export" as const },
    ],
  },
  {
    label: "신발 / 대만 진출",
    goal: "대만 시장 진출",
    product: { name: "메리노 울 스니커즈", category: "신발" },
    recommendations: [
      { program_name: "[경기] 2026년 중소기업 수출멘토링 지원사업", type: "export" as const },
    ],
  },
  {
    label: "식품 / 일본 수출",
    goal: "일본 수출",
    product: { name: "곤약 라면", category: "식품" },
    recommendations: [
      { program_name: "2026년 농식품 현지화지원사업(수입등록ㆍ검사) 신청 공고", type: "export" as const },
    ],
  },
];

async function main() {
  for (const fx of FIXTURES) {
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`  ${fx.label}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    const country = inferTargetCountry(fx.goal, fx.recommendations);
    const category = inferCategory(fx.product);
    console.log(`  inferred: country=${country} category=${category}`);

    if (!country) {
      console.log("  ❌ 타겟국 추론 실패");
      continue;
    }

    const t0 = Date.now();
    const g = await buildPublicDataGrounding(country, category);
    const dt = Date.now() - t0;
    console.log(`  fetched in ${dt}ms`);
    console.log(`  hofstede:  ${g.hofstede ? `distance=${g.hofstede.distance}` : "FAIL"}`);
    console.log(`  worldBank: ${g.worldBank ? `pop=${(g.worldBank.population / 1e6).toFixed(0)}M GDP/cap=$${Math.round(g.worldBank.gdpPerCapitaPpp).toLocaleString()}` : "FAIL"}`);
    console.log(`  kotra:     ${g.kotra ? `total=${g.kotra.totalKoreanCompanies} matched=${g.kotra.categoryMatched.length}` : "FAIL"}`);
    console.log(`  comtrade:  ${g.comtrade ? `flows=${g.comtrade.flows.length} yoy=${g.comtrade.yoyGrowthPct ?? "-"}%` : "FAIL"}`);
    if (g.errors.length > 0) {
      console.log(`  errors:    ${g.errors.length}`);
      for (const e of g.errors) console.log(`    - ${e}`);
    }
    console.log("\n  --- 프롬프트 block 미리보기 ---");
    console.log(renderGroundingBlock(g).split("\n").map((l) => `  | ${l}`).join("\n"));
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});

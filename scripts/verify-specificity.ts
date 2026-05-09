/**
 * Spot-check for assessActionSpecificity. Runs the heuristic against a
 * curated set of sample action strings and prints the decision matrix
 * so we can eyeball whether the regex catches the right things.
 *
 * Run: npx tsx scripts/verify-specificity.ts
 */
import { assessActionSpecificity } from "../packages/shared/src/simulation/ensemble-narrative";

const samples: Array<{ text: string; expected: "vague" | "partial" | "concrete" }> = [
  // Vague — should score 0-25
  { text: "일본 마케팅 강화", expected: "vague" },
  { text: "현지화 개선", expected: "vague" },
  { text: "브랜딩 차별화 검토", expected: "vague" },
  { text: "Improve marketing in Japan", expected: "vague" },
  { text: "Strengthen branding in Vietnam", expected: "vague" },

  // 1-element only — should bucket as vague (score 25 < 50)
  { text: "쿠팡 진출 검토", expected: "vague" }, // channel only
  { text: "전환율 개선", expected: "vague" }, // measurable only
  { text: "출시 30일 이내 캠페인 진행", expected: "vague" }, // timeline only
  { text: "Launch on TikTok Shop", expected: "vague" }, // channel only

  // 2-element — partial (50)
  { text: "Increase conversion rate by Q3", expected: "partial" }, // KPI + timeline
  { text: "쿠팡에서 90일 이내 진출", expected: "partial" }, // channel + timeline
  { text: "Spend $50K to lift CVR", expected: "partial" }, // metric + KPI

  // Concrete — should score 75-100
  {
    text: "쿠팡 본 진입 90일 이내, 첫 30일 광고예산 5,000만원으로 전환율 3% 목표",
    expected: "concrete",
  },
  {
    text: "Launch TikTok Shop in 6 weeks with $20K ad budget targeting 4% conversion",
    expected: "concrete",
  },
  {
    text: "올리브영 입점 Q3 내, 1억원 마케팅, 신규 구매전환 5% 달성",
    expected: "concrete",
  },
  {
    text: "Naver Smart Store 입점 후 D+30 까지 ROAS 200% 회복, 광고비 3,000만원",
    expected: "concrete",
  },
];

let passed = 0;
let failed = 0;

console.log("");
console.log("┌──────────┬─────────┬──────────┬──────────┬──────────┬───────┬───────┬──────────────────────────────────────────────────┐");
console.log("│ expected │  score  │ channel  │  metric  │ timeline │  KPI  │ pass? │ action text                                      │");
console.log("├──────────┼─────────┼──────────┼──────────┼──────────┼───────┼───────┼──────────────────────────────────────────────────┤");

for (const { text, expected } of samples) {
  const result = assessActionSpecificity(text);
  const actualBucket =
    result.score >= 75 ? "concrete" : result.score >= 50 ? "partial" : "vague";
  const ok = actualBucket === expected;
  if (ok) passed++;
  else failed++;
  const expectedPad = expected.padEnd(8);
  const scorePad = String(result.score).padEnd(7);
  const cell = (b: boolean) => (b ? " ✓ " : " . ").padEnd(8);
  const truncated = text.length > 48 ? text.slice(0, 47) + "…" : text.padEnd(48);
  const passMark = ok ? "  ✓  " : "  ✗  ";
  console.log(
    `│ ${expectedPad} │  ${scorePad}│${cell(result.hasChannel)}│${cell(result.hasMetric)}│${cell(
      result.hasTimeline,
    )}│${cell(result.hasMeasurable).slice(0, 6).padEnd(6)} │ ${passMark} │ ${truncated} │`,
  );
}
console.log("└──────────┴─────────┴──────────┴──────────┴──────────┴───────┴───────┴──────────────────────────────────────────────────┘");
console.log("");
console.log(`Passed: ${passed}/${samples.length}`);
console.log(`Failed: ${failed}/${samples.length}`);
process.exit(failed === 0 ? 0 : 1);

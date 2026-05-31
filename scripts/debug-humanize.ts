/**
 * Humanize KR — 로컬 e2e 검증.
 *   npm exec tsx --env-file=.env.local scripts/debug-humanize.ts
 */
import { humanizeKorean } from "../src/lib/humanize";

const SAMPLE = `생성형 AI의 등장은 콘텐츠 산업에 있어서 새로운 패러다임의 전환점을 시사하는 바가 크다. 본질적으로 인공지능은 인간의 창의성을 보조하는 도구로 기능할 수 있으며, 이를 통해 우리는 더욱 효율적인 콘텐츠 제작이 가능해질 것이다. 따라서 콘텐츠 제작자들은 AI를 적극적으로 활용해야 할 것이다.

또한 AI에 의해 생성된 콘텐츠는 다음과 같은 특징을 가지고 있다: (1) 빠른 생산 속도, (2) 균일한 품질, (3) 다양한 변주 가능성. 이러한 특징들은 전략적 관점에서 매우 중요한 의미를 가진다고 판단되어진다. 즉, AI 도구의 도입은 단순한 효율성 증대를 넘어, 콘텐츠 산업 전반에 걸친 구조적 변화를 가져올 수 있는 잠재력을 가지고 있다는 점에서 주목할 만하다.

결론적으로, 우리는 지금이야말로 AI와의 협업 모델을 구축해야 할 때다.`;

async function main() {
  console.log("━━━ 원문 ━━━");
  console.log(SAMPLE);
  console.log(`\n원문 길이: ${SAMPLE.length}자\n`);

  const t0 = Date.now();
  const r = await humanizeKorean(SAMPLE);
  const dt = Date.now() - t0;

  console.log("━━━ 윤문 결과 ━━━");
  console.log(r.humanized);
  console.log(`\n윤문 길이: ${r.humanized.length}자  (변경률: ${(r.change_rate * 100).toFixed(1)}%)`);
  console.log(`등급: ${r.grade}  ·  탐지 ${r.detected.length}건  ·  ${(dt / 1000).toFixed(1)}s  ·  $${r.cost_usd}`);
  console.log(`\nSummary: ${r.summary}`);

  console.log(`\n━━━ 탐지된 패턴 (${r.detected.length}) ━━━`);
  for (const d of r.detected) {
    console.log(`  [${d.severity}] ${d.id} (${d.category}): "${d.before}" → "${d.after}"`);
  }

  console.log("\n━━━ 자체검증 ━━━");
  console.log(`  사실 보존: ${r.self_check.preserved_facts ? "✓" : "✗"}`);
  console.log(`  register: ${r.self_check.preserved_register ? "✓" : "✗"}`);
  console.log(`  장르 보존: ${r.self_check.no_genre_drift ? "✓" : "✗"}`);
  console.log(`  인공 추가 없음: ${r.self_check.no_artificial_additions ? "✓" : "✗"}`);
  console.log(`  잔존 S1: ${r.self_check.residual_s1_count}`);
  console.log(`  잔존 S2: ${r.self_check.residual_s2_count}`);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});

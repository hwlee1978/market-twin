/**
 * 픽스처 코퍼스 감사 — 표본을 늘리면서 문제가 쉬워지지 않았는지 본다.
 *
 * N을 키우는 목적은 노이즈를 줄이는 것인데, 정답이 특정 국가에 몰리면
 * "중국이라고 답하면 맞는다"는 지름길이 생겨 오히려 코퍼스가 망가진다.
 * 정답·원산지·카테고리·시점 분포와 후보 수를 기계적으로 점검한다.
 *
 * 실행: npm exec -- tsx scripts/_audit-fixtures.ts
 */
import { readFileSync, readdirSync } from "node:fs";

const SUPPORTED = new Set("KR JP CN TW US CA GB DE FR IT ES NL AE SA SG MY PH AU IN VN TH ID BR MX".split(" "));
/** 참고용 대륙 표 — 분포를 볼 때만 쓴다. "같은 대륙이면 실격" 규칙은
 *  철회했다: 기존 19건 중 15건이 아시아 내 이동(KR→JP, ID→MY, JP→TW …)이라
 *  그 규칙을 세우면 코퍼스의 79%가 무효가 된다. */
const CONTINENT: Record<string, string> = {
  KR: "AS", JP: "AS", CN: "AS", TW: "AS", SG: "AS", MY: "AS", PH: "AS", IN: "AS",
  VN: "AS", TH: "AS", ID: "AS", AE: "AS", SA: "AS", HK: "AS",
  US: "NA", CA: "NA", MX: "NA", BR: "SA", AU: "OC",
  GB: "EU", DE: "EU", FR: "EU", IT: "EU", ES: "EU", NL: "EU",
};

interface Fx { file: string; slug: string; name: string; origin: string; actual: string; category: string; asOf: string; cands: string[] }

function parse(file: string, src: string): Fx[] {
  const out: Fx[] = [];
  const re = /slug:\s*"([^"]+)"[\s\S]{0,2500}?productName:\s*"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const block = src.slice(m.index, m.index + 3500);
    const pick = (rx: RegExp) => block.match(rx)?.[1] ?? "";
    const g = (k: string) =>
      k === "originatingCountry" ? pick(/originatingCountry:\s*"([^"]+)"/)
      : k === "actual" ? pick(/actual:\s*"([^"]+)"/)
      : k === "category" ? pick(/category:\s*"([^"]+)"/)
      : k === "asOfDate" ? pick(/asOfDate:\s*"([^"]+)"/)
      : "";
    const cands = block.match(/candidateCountries:\s*\[([^\]]*)\]/)?.[1] ?? "";
    out.push({
      file, slug: m[1], name: m[2], origin: g("originatingCountry"), actual: g("actual"),
      category: g("category"), asOf: g("asOfDate"),
      cands: cands.split(",").map((s) => s.replace(/["\s]/g, "")).filter(Boolean),
    });
  }
  return out;
}

const files = readdirSync("scripts").filter((f) => /^backtest50-.*seed\.ts$/.test(f));
const all = files.flatMap((f) => parse(f, readFileSync(`scripts/${f}`, "utf8")));
const scored = all.filter((f) => SUPPORTED.has(f.actual));

console.log(`\n파일 ${files.length}개 · 픽스처 ${all.length}건 · 채점 대상 ${scored.length}건 (범위 밖 ${all.length - scored.length})\n`);

const tally = (key: (f: Fx) => string, label: string) => {
  const m = new Map<string, number>();
  for (const f of scored) m.set(key(f), (m.get(key(f)) ?? 0) + 1);
  const rows = [...m.entries()].sort((a, b) => b[1] - a[1])
    .map(([k, v]) => ({ [label]: k, 건수: v, 비율: `${Math.round((v / scored.length) * 100)}%` }));
  console.log(`=== ${label} 분포 ===`); console.table(rows);
};
tally((f) => f.actual, "정답 시장");
tally((f) => f.origin, "원산지");
tally((f) => f.category, "카테고리");
tally((f) => f.asOf.slice(0, 3) + "0년대", "시점");

// 최빈 정답만 찍는 전략의 점수 — 코퍼스가 얼마나 쉬운지의 하한선
const top = [...scored.reduce((m, f) => m.set(f.actual, (m.get(f.actual) ?? 0) + 1), new Map<string, number>())]
  .sort((a, b) => b[1] - a[1])[0];
console.log(`\n⚠ 최빈 정답 "${top[0]}" 로만 답하는 전략: ${top[1]}/${scored.length} (${Math.round((top[1] / scored.length) * 100)}%)`);
console.log(`   무작위 기대치(후보 ${Math.round(scored.reduce((s, f) => s + f.cands.length, 0) / scored.length)}개 평균): ` +
  `${Math.round((1 / (scored.reduce((s, f) => s + f.cands.length, 0) / scored.length)) * 100)}%`);

const problems: string[] = [];
const seen = new Set<string>();
for (const f of all) {
  if (seen.has(f.name)) problems.push(`중복 브랜드: ${f.name}`);
  seen.add(f.name);
  if (f.cands.includes(f.origin)) problems.push(`후보에 원산지 포함: ${f.name} (${f.origin})`);
  if (!f.cands.includes(f.actual)) problems.push(`후보에 정답 없음: ${f.name} (${f.actual})`);
  if (f.cands.length < 5) problems.push(`후보 부족(${f.cands.length}개): ${f.name}`);
}
console.log(`\n=== 규칙 점검 ===`);
console.log(problems.length ? problems.map((p) => "  ✗ " + p).join("\n") : "  이상 없음");

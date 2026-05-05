/**
 * Spot-check for the country-locked channel sanitizer. Runs both the
 * mismatch detector and the in-place rewriter against curated KR /
 * JP / VN / US persona quotes, prints the pass/fail matrix.
 *
 * Run: npx tsx scripts/verify-channel-mismatch.ts
 */
import {
  detectChannelMismatch,
  sanitizeChannelMismatch,
} from "../src/lib/simulation/country-channel";

interface Case {
  text: string;
  personaCountry: string;
  expectMismatchCount: number;
  expectChannels: string[];
  note: string;
}

const cases: Case[] = [
  // ─── Legitimate (no mismatch) ───
  {
    text: "I'd buy this on Coupang if the price is right",
    personaCountry: "KR",
    expectMismatchCount: 0,
    expectChannels: [],
    note: "Coupang in KR persona — fine",
  },
  {
    text: "Rakuten Ichiba で見たことがあるけど高い",
    personaCountry: "JP",
    expectMismatchCount: 0,
    expectChannels: [],
    note: "Rakuten in JP persona — fine",
  },
  {
    text: "I usually shop on Amazon and TikTok Shop",
    personaCountry: "VN",
    expectMismatchCount: 0,
    expectChannels: [],
    note: "Amazon + TikTok = global, no flag in VN",
  },

  // ─── Hard mismatch (the bug pattern) ───
  {
    text: "I'd buy this on Coupang if I see good reviews",
    personaCountry: "VN",
    expectMismatchCount: 1,
    expectChannels: ["Coupang"],
    note: "Coupang in VN persona — bug",
  },
  {
    text: "올리브영에 입점하면 살 거 같아",
    personaCountry: "JP",
    expectMismatchCount: 1,
    expectChannels: ["올리브영"],
    note: "Olive Young (KR) in JP persona — bug",
  },
  {
    text: "Rakuten Ichiba から取り寄せようと思う",
    personaCountry: "TW",
    expectMismatchCount: 1,
    expectChannels: ["Rakuten Ichiba"],
    note: "Rakuten (JP) in TW persona — bug",
  },
  {
    text: "Naver Smart Store에서 찾아볼게요",
    personaCountry: "TH",
    expectMismatchCount: 1,
    expectChannels: ["Naver Smart Store"],
    note: "Naver Smart Store (KR) in TH persona — bug",
  },

  // ─── Multiple mismatches in one quote ───
  {
    text: "I'd compare prices on Coupang and Olive Young first",
    personaCountry: "JP",
    expectMismatchCount: 2,
    expectChannels: ["Coupang", "Olive Young"],
    note: "Two KR-locked channels in JP persona",
  },

  // ─── Edge: longest-match wins ───
  {
    text: "Naver Smart Store보다 Naver Brand Store가 더 좋아요",
    personaCountry: "VN",
    expectMismatchCount: 2,
    expectChannels: ["Naver Smart Store", "Naver Brand Store"],
    note: "Longest-match: Smart Store + Brand Store, not bare Naver",
  },
];

let pass = 0;
let fail = 0;
console.log("");
console.log("═".repeat(96));
for (const c of cases) {
  const detected = detectChannelMismatch(c.text, c.personaCountry);
  const sanitized = sanitizeChannelMismatch(c.text, c.personaCountry, "ko");
  const detectedChannels = detected.map((d) => d.channel);
  const okCount = detected.length === c.expectMismatchCount;
  const okChannels = c.expectChannels.every((ch) =>
    detectedChannels.some((d) => d.toLowerCase() === ch.toLowerCase()),
  );
  const ok = okCount && okChannels;
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? "✓" : "✗"} ${c.note}`);
  console.log(`  text: "${c.text}"`);
  console.log(
    `  detected: count=${detected.length} channels=${JSON.stringify(detectedChannels)} ` +
      `(expected ${c.expectMismatchCount}, ${JSON.stringify(c.expectChannels)})`,
  );
  if (sanitized.replacements > 0) {
    console.log(`  sanitized: "${sanitized.sanitized}" (${sanitized.replacements} replacements)`);
  }
  console.log("");
}
console.log("═".repeat(96));
console.log(`Passed: ${pass}/${cases.length}`);
console.log(`Failed: ${fail}/${cases.length}`);
process.exit(fail === 0 ? 0 : 1);

/**
 * SPIKE — does per-country social buzz discriminate, and does it point at
 * the RIGHT market on the cases the macro anchors missed?
 *
 * Test brands are chosen from the N=20 backtest MISSES (model picked a
 * proximate/large market; the true winner was elsewhere). If the buzz index
 * ranks the true winner at or near the top, this live-only signal is worth
 * wiring into prefetch. Backtest circularity is acknowledged: today's buzz
 * reflects the outcome — but for a LIVE expansion decision that is exactly
 * the forward signal we want, so the spike only needs to prove the signal
 * EXISTS and DISCRIMINATES per country.
 *
 * Run: npx tsx --env-file=.env.local scripts/spike-social-buzz.ts
 */
import {
  fetchSocialBuzzByCountry,
  formatSocialBuzzBlock,
} from "../packages/shared/src/market-research/social-buzz";

const CASES = [
  { brand: "medicube", category: "beauty", actual: "US", modelPicked: "TW", candidates: ["US", "TW", "KR", "SG", "JP"] },
  { brand: "TIRTIR", category: "beauty", actual: "JP", modelPicked: "KR", candidates: ["JP", "KR", "US", "TW", "CN"] },
  { brand: "Anker", category: "electronics", actual: "US", modelPicked: "US", candidates: ["US", "DE", "JP", "CA", "GB"] },
] as const;

async function main() {
  const hasKey = !!process.env.YOUTUBE_API_KEY;
  console.log(`YOUTUBE_API_KEY present: ${hasKey}`);
  console.log(`NAVER key present: ${!!process.env.NAVER_CLIENT_ID}`);
  console.log("");

  for (const c of CASES) {
    console.log(`===== ${c.brand} (${c.category}) — actual=${c.actual}, model picked=${c.modelPicked} =====`);
    const res = await fetchSocialBuzzByCountry({
      brand: c.brand,
      category: c.category,
      candidateCountries: [...c.candidates],
      windowDays: 90,
      locale: "en",
    });
    if (!res.active) {
      console.log("  (inactive — no YouTube key)\n");
      continue;
    }
    for (const b of res.byCountry) {
      const yt = b.youtube ? `YT ${b.youtube.videoCount}v/${fmt(b.youtube.viewSum)}` : "YT -";
      const nv = b.naver ? ` Naver ${b.naver.mentions}` : "";
      const rd = b.reddit ? ` Reddit ${b.reddit.posts}` : "";
      const mark = b.country === c.actual ? "  <== ACTUAL" : b.country === c.modelPicked ? "  (model pick)" : "";
      console.log(`  [${b.country}] index ${String(b.index).padStart(3)}  ${yt}${nv}${rd}${mark}`);
    }
    // verdict: did buzz rank the ACTUAL winner #1 or top-2?
    const rank = res.byCountry.findIndex((b) => b.country === c.actual) + 1;
    console.log(`  -> ACTUAL "${c.actual}" ranked #${rank} by buzz` +
      (rank === 1 ? "  [TOP-1 HIT]" : rank <= 2 ? "  [TOP-2]" : "  [miss]"));
    console.log("");
    console.log(formatSocialBuzzBlock(res, false));
    console.log("");
  }
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

main().catch((e) => { console.error(e); process.exit(1); });

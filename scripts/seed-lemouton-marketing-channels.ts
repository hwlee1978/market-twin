/**
 * Seed Le Mouton's virtual marketing-channel "spaces" — X, Instagram,
 * YouTube, 네이버 블로그, TikTok. Each row gets a platform-appropriate
 * handle / display_name / bio / posting style so we can move straight to
 * Sprint 2 (content drafter) without manual data entry.
 *
 * Idempotent: skips any (workspace_id, platform, handle) that already
 * exists. Re-run safely after schema changes.
 */
import { Client } from "pg";

type ChannelSeed = {
  platform: string;
  handle: string;
  display_name: string;
  market_country: string;
  target_segments: string[];
  posting_style: string;
  bio_text: string;
};

// Le Mouton — 캐시미어/K-comfort 브랜드. Top-2 사업 분석에서 US/TW 우세,
// 본진은 KR. Persona memory: 25-44 세 도시 직장인 여성 + 프리미엄 가격대 수용.
const SEEDS: ChannelSeed[] = [
  {
    platform: "x_twitter",
    handle: "lemouton_global",
    display_name: "Le Mouton — K-Cashmere",
    market_country: "US",
    target_segments: [
      "25-44 urban professionals",
      "premium-tier comfortwear",
      "K-fashion curious",
    ],
    posting_style:
      "단문 위주, 제품 베네핏 1문장 + 후킹 질문. 영문, 친근하지만 절제된 톤. 주 3회 평일 저녁 EST.",
    bio_text:
      "K-comfort cashmere from Seoul. Made for the days you choose softness. 🤍 ship worldwide. ↓ markettwin.ai/lemouton",
  },
  {
    platform: "instagram",
    handle: "lemouton.kr",
    display_name: "르무통 · Le Mouton",
    market_country: "KR",
    target_segments: [
      "25-39세 여성",
      "프리미엄 가격대 수용",
      "도시 직장인",
      "K-패션 일상 컨텐츠 소비",
    ],
    posting_style:
      "캐러셀 위주 (5-7컷). 룩북 + 제품 디테일 + 일상 신. 카피는 한 줄 임팩트 + 해시태그 8-12개. 화-목-일 저녁 8시 KST.",
    bio_text:
      "K-comfort 캐시미어 · 매일 입는 럭셔리\n프리미엄 니트 · 전세계 배송\n↓ 신규 컬렉션",
  },
  {
    platform: "youtube",
    handle: "lemouton.official",
    display_name: "Le Mouton Official",
    market_country: "KR",
    target_segments: [
      "30-44세 여성",
      "K-fashion deep-dive 시청자",
      "장인정신/소재 스토리 관심",
    ],
    posting_style:
      "Long-form (6-10분) 브랜드 다큐 + Shorts (30-60초) 스타일링. 월 2 long + 주 1 short. 자막 KR/EN 동시 제공.",
    bio_text:
      "르무통의 소재, 사람, 시간 — 한 장의 니트가 만들어지기까지.\nLuxury knitwear, made in Korea.",
  },
  {
    platform: "naver_blog",
    handle: "lemouton-journal",
    display_name: "Le Mouton Journal",
    market_country: "KR",
    target_segments: [
      "30-49세 여성",
      "네이버 검색 의존도 높은 직장인",
      "리뷰/비교 콘텐츠 신뢰",
      "SEO 기반 자연유입",
    ],
    posting_style:
      "Long-form 리뷰/스타일링 가이드 (1500-2500자). H2/H3 키워드 정렬, 인포그래픽 1장 + 제품 컷 6-8장. 주 1회 화요일 오전 10시 KST.",
    bio_text:
      "르무통이 직접 쓰는 K-캐시미어 저널 — 소재, 관리법, 스타일링, 그리고 그 사이의 이야기.",
  },
  {
    platform: "tiktok",
    handle: "lemouton.cashmere",
    display_name: "Le Mouton ✨",
    market_country: "US",
    target_segments: [
      "Gen Z + young millennial women",
      "K-fashion / soft-girl aesthetic",
      "ASMR/texture content viewers",
      "trend-driven discovery",
    ],
    posting_style:
      "15-30초 vertical. 트렌드 사운드 + 빠른 컷 전환. 첫 1초 후크 (질감 클로즈업 / before-after). 주 5-6회.",
    bio_text:
      "K-comfort cashmere 🤍\nthe softest 30 seconds of your day\n↓ shop new drop",
  },
];

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  const ws = await c.query<{ id: string }>(
    `select id from public.workspaces where name = '르무통' limit 1`,
  );
  if (ws.rows.length === 0) {
    console.error("FATAL: workspace '르무통' not found");
    await c.end();
    process.exit(1);
  }
  const workspaceId = ws.rows[0].id;
  console.log(`Le Mouton workspace: ${workspaceId}`);

  let inserted = 0;
  let skipped = 0;
  for (const s of SEEDS) {
    const exists = await c.query(
      `select 1 from public.mrai_marketing_channels
       where workspace_id = $1 and platform = $2 and handle = $3`,
      [workspaceId, s.platform, s.handle],
    );
    if ((exists.rowCount ?? 0) > 0) {
      console.log(`  skip  ${s.platform.padEnd(18)} @${s.handle}`);
      skipped++;
      continue;
    }
    await c.query(
      `insert into public.mrai_marketing_channels
       (workspace_id, platform, handle, display_name, market_country,
        target_segments, posting_style, bio_text, brand_assets, enabled)
       values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, '{}'::jsonb, true)`,
      [
        workspaceId,
        s.platform,
        s.handle,
        s.display_name,
        s.market_country,
        JSON.stringify(s.target_segments),
        s.posting_style,
        s.bio_text,
      ],
    );
    console.log(`  +     ${s.platform.padEnd(18)} @${s.handle} (${s.market_country})`);
    inserted++;
  }

  console.log(`\nDone. inserted=${inserted} skipped=${skipped}`);
  await c.end();
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});

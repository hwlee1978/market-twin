/**
 * Fix Le Mouton's marketing channels — original seed wrongly described
 * the brand as cashmere knitwear. Actual brand (per workspace memories
 * + simulation runs):
 *
 *   • Product : 메리노 울 컴포트 스니커즈 (제품명 "메이트")
 *   • Material: H1-TEX (자체 메리노 울 소재)
 *   • Category: Premium comfort sneaker (HS 6404)
 *   • Compete : Allbirds, Veja, On Running, Cole Haan
 *   • Price   : $124 US / $119 TW / 韓 made
 *   • Target  : 25-44 도시 직장인, comfort + sustainable
 *
 * Updates the 5 originally seeded channels in place (preserves the
 * user-added @Lemouton_us TikTok). Re-running this is idempotent.
 */
import { Client } from "pg";

const FIXED: Record<
  string,
  { country: string; segments: string[]; bio: string; tone: string }
> = {
  x_twitter: {
    country: "US",
    segments: [
      "25-44 urban professionals",
      "comfort sneaker buyers",
      "sustainability-curious",
      "Allbirds / Veja alternatives shoppers",
    ],
    bio: "Le Mouton — Korean merino wool sneakers. H1-TEX comfort, made in Korea. From $124 →",
    tone: "단문 위주, 1문장 후크. 영문, 비교 vs Allbirds/Veja 언급 적극 활용. 주 3회 평일 저녁 EST.",
  },
  instagram: {
    country: "TW",
    segments: [
      "25-39 都會女性",
      "通勤舒適鞋款買主",
      "永續時尚關注者",
      "Allbirds/Veja 替代品搜尋者",
    ],
    bio: "Le Mouton 韓國原裝 美麗諾羊毛運動鞋\nH1-TEX 整天舒適 · NT$3,808 起\n↓ 新品系列 · momo / Shopee 上架中",
    tone: "캐러셀 5-7컷: 1. 후크 (제품 디테일 클로즈업) → 2-5. 착화 신·소재 macro → 6. 가격+구매처 카드. 繁中 우선, 한자 해시태그. 화-목-일 21시 GMT+8.",
  },
  youtube: {
    country: "US",
    segments: [
      "30-44 women",
      "wool sneaker enthusiasts",
      "K-craft / material storytelling fans",
      "Allbirds long-form review viewers",
    ],
    bio: "Le Mouton — Korean merino wool sneakers. The H1-TEX story: material, craft, and the team behind every pair.",
    tone: "Long-form (6-10분) brand doc + material deep-dive + Allbirds 비교 review. Shorts (30-60초) 으로 unboxing/styling. 월 2 long + 주 1 short. EN subtitles primary.",
  },
  naver_blog: {
    country: "KR",
    segments: [
      "30-49세",
      "네이버 검색 의존 직장인",
      "리뷰/비교 신뢰",
      "컴포트 슈즈 검색자",
      "지속가능 패션 관심",
    ],
    bio: "르무통이 직접 쓰는 메리노 울 스니커즈 저널 — H1-TEX 소재, 신발 관리법, 데일리 코디.",
    tone: "Long-form 리뷰/가이드 (1500-2500자). 메리노 울 vs 일반 소재 비교, 신발 관리법, 한국 제조 공정 스토리. H2/H3 키워드 정렬. 주 1회 화요일 10시 KST.",
  },
  tiktok: {
    country: "JP",
    segments: [
      "Gen Z + 若年ミレニアル",
      "韓国ファッション関心層",
      "コンフォートシューズ",
      "サステナブル消費",
    ],
    bio: "韓国メリノウールスニーカー 🤍\nH1-TEX で一日中ふわふわ",
    tone: "15-30초 vertical. 트렌드 사운드 + 빠른 컷 + 첫 1초 후크 (질감 클로즈업 또는 before-after 착화). 주 5-6회. JP 시장이라 韓国コスメ/패션 트렌드 사운드 활용.",
  },
};

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  const ws = await c.query<{ id: string }>(
    `select id from public.workspaces where name = '르무통' limit 1`,
  );
  const wsId = ws.rows[0].id;

  for (const [platform, cfg] of Object.entries(FIXED)) {
    // Only update channels that were originally seeded (handle pattern: lemouton_global / lemouton.kr / etc).
    // Skip any handle the user added manually (e.g. @Lemouton_us).
    const ORIGINAL_HANDLES = [
      "lemouton_global",
      "lemouton.kr",
      "lemouton.official",
      "lemouton-journal",
      "lemouton.cashmere",
    ];
    const res = await c.query(
      `update public.mrai_marketing_channels
       set market_country = $1,
           target_segments = $2::jsonb,
           bio_text = $3,
           posting_style = $4
       where workspace_id = $5
         and platform = $6
         and handle = ANY($7::text[])`,
      [
        cfg.country,
        JSON.stringify(cfg.segments),
        cfg.bio,
        cfg.tone,
        wsId,
        platform,
        ORIGINAL_HANDLES,
      ],
    );
    console.log(
      `  ${platform.padEnd(18)} → ${cfg.country.padEnd(4)} (${res.rowCount} rows)`,
    );
  }

  // tiktok.cashmere handle is misleading too — rename to lemouton.sneakers
  const rename = await c.query(
    `update public.mrai_marketing_channels
     set handle = 'lemouton.sneakers'
     where workspace_id = $1 and platform = 'tiktok' and handle = 'lemouton.cashmere'`,
    [wsId],
  );
  if (rename.rowCount && rename.rowCount > 0) {
    console.log(`  renamed tiktok @lemouton.cashmere → @lemouton.sneakers`);
  }

  // Verify
  console.log("\nFinal state:");
  const r = await c.query<{
    platform: string;
    handle: string;
    market_country: string;
    bio_text: string;
  }>(
    `select platform, handle, market_country, bio_text
     from public.mrai_marketing_channels
     where workspace_id = $1
     order by created_at`,
    [wsId],
  );
  for (const row of r.rows) {
    console.log(
      `  ${row.platform.padEnd(18)} @${row.handle.padEnd(22)} ${row.market_country}  ${(row.bio_text || "").slice(0, 60)}…`,
    );
  }

  await c.end();
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});

/**
 * Le Mouton channel bios v3 — strip H1-TEX from brand-like positioning.
 *
 * v2 wrote things like "H1-TEX 整天舒適" which made the drafter treat
 * H1-TEX as a consumer-facing brand. User: "H1-TEX를 브랜드처럼 사용하지
 * 말라". The brand is Le Mouton / 르무통. H1-TEX is the material tech
 * (analogous to Gore-Tex), mentioned only as material story, not as
 * a headline.
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
    bio: "Le Mouton — Korean merino wool sneakers. Comfort from the first step. From $124 →",
    tone: "단문 위주, 1문장 후크. 영문, 비교 vs Allbirds/Veja 언급 적극 활용. 주 3회 평일 저녁 EST. 브랜드명은 'Le Mouton' — 소재 기술명(H1-TEX)을 헤드라인에 쓰지 말 것.",
  },
  instagram: {
    country: "TW",
    segments: [
      "25-39 都會女性",
      "通勤舒適鞋款買主",
      "永續時尚關注者",
      "Allbirds/Veja 替代品搜尋者",
    ],
    bio: "Le Mouton 韓國美麗諾羊毛運動鞋\n從早到晚的柔軟 · NT$3,808 起\n↓ 新品系列 · momo / Shopee 上架中",
    tone: "캐러셀 5-7컷: 1. 후크 (제품 디테일 클로즈업) → 2-5. 착화 신·소재 macro → 6. 가격+구매처 카드. 繁中 우선, 한자 해시태그. 화-목-일 21시 GMT+8. 브랜드명 = 'Le Mouton'. H1-TEX는 소재 스토리에서만 언급, 헤드라인 금지.",
  },
  youtube: {
    country: "US",
    segments: [
      "30-44 women",
      "wool sneaker enthusiasts",
      "K-craft / material storytelling fans",
      "Allbirds long-form review viewers",
    ],
    bio: "Le Mouton — Korean merino wool sneakers. The story of material, craft, and the team behind every pair.",
    tone: "Long-form (6-10분) brand doc + material deep-dive + Allbirds 비교 review. Shorts (30-60초) 으로 unboxing/styling. 월 2 long + 주 1 short. EN subtitles primary. 브랜드 = 'Le Mouton'. H1-TEX는 영상 내 소재 설명 segment에서만.",
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
    bio: "르무통이 직접 쓰는 메리노 울 스니커즈 저널 — 소재, 관리법, 데일리 코디.",
    tone: "Long-form 리뷰/가이드 (1500-2500자). 메리노 울 vs 일반 소재 비교, 신발 관리법, 한국 제조 공정 스토리. H2/H3 키워드 정렬. 주 1회 화요일 10시 KST. 브랜드명 = '르무통'. H1-TEX는 소재 설명 본문에서만 언급, 제목/헤드라인 금지.",
  },
  tiktok: {
    country: "JP",
    segments: [
      "Gen Z + 若年ミレニアル",
      "韓国ファッション関心層",
      "コンフォートシューズ",
      "サステナブル消費",
    ],
    bio: "Le Mouton 韓国メリノウールスニーカー 🤍\n一日中ふわふわ",
    tone: "15-30초 vertical. 트렌드 사운드 + 빠른 컷 + 첫 1초 후크 (질감 클로즈업 또는 before-after 착화). 주 5-6회. JP 시장이라 韓国コスメ/패션 트렌드 사운드 활용. 브랜드 = 'Le Mouton'. H1-TEX 헤드라인 금지.",
  },
};

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  const ws = await c.query<{ id: string }>(
    `select id from public.workspaces where name = '르무통' limit 1`,
  );
  const wsId = ws.rows[0].id;

  const ORIGINAL_HANDLES = [
    "lemouton_global",
    "lemouton.kr",
    "lemouton.official",
    "lemouton-journal",
    "lemouton.sneakers",
  ];

  for (const [platform, cfg] of Object.entries(FIXED)) {
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
    console.log(`  ${platform.padEnd(18)} (${res.rowCount} rows)`);
  }

  console.log("\nFinal state:");
  const r = await c.query<{
    platform: string;
    handle: string;
    bio_text: string;
  }>(
    `select platform, handle, bio_text from public.mrai_marketing_channels
     where workspace_id = $1 order by created_at`,
    [wsId],
  );
  for (const row of r.rows) {
    console.log(
      `  ${row.platform.padEnd(18)} @${row.handle.padEnd(22)} ${(row.bio_text || "").replace(/\n/g, " | ").slice(0, 80)}`,
    );
  }

  await c.end();
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});

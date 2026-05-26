/**
 * Re-balance Le Mouton's seeded marketing channels to markets where
 * personas actually exist (TW / US / JP / CN). The original seed
 * pointed 3 channels at KR — but Le Mouton's persona pool only covers
 * export markets, so those channels would show an empty audience.
 *
 * Mapping:
 *   x_twitter   → US (English global, 1175 personas)
 *   instagram   → TW (K-fashion hotspot, 1186 personas)
 *   youtube     → US (long-form English, 1175 personas)
 *   naver_blog  → KR (Korean-only platform, stays KR even if empty —
 *                       documents the aspiration)
 *   tiktok      → JP (K-aesthetic trend market, 989 personas)
 */
import { Client } from "pg";

const REASSIGN: Record<string, { country: string; segments: string[]; bio: string; tone: string }> = {
  x_twitter: {
    country: "US",
    segments: ["25-44 urban professionals", "premium comfortwear", "K-fashion curious"],
    bio: "K-comfort cashmere from Seoul. Made for the days you choose softness. 🤍 worldwide shipping.",
    tone: "단문 위주, 1문장 후크. 영문, 친근하지만 절제된 톤. 주 3회 평일 저녁 EST.",
  },
  instagram: {
    country: "TW",
    segments: ["25-39歲 都會女性", "K-fashion 高關注", "輕奢消費"],
    bio: "韓國原裝喀什米爾 · 每天穿的奢華\n全球配送 ↓ 新品系列",
    tone: "캐러셀 5-7컷, 룩북 + 디테일 + 일상 신. 繁中 카피 우선 + 한자 해시태그. 화-목-일 21시 GMT+8.",
  },
  youtube: {
    country: "US",
    segments: ["30-44 women", "K-fashion deep-dive", "craft/material storytelling fans"],
    bio: "Le Mouton — material, craft, time. The story behind every knit.\nLuxury knitwear, made in Korea.",
    tone: "Long-form (6-10분) brand doc + Shorts (30-60초) styling. 월 2 long + 주 1 short. EN subtitles primary.",
  },
  naver_blog: {
    country: "KR",
    segments: ["30-49세", "네이버 검색 의존", "리뷰 신뢰", "SEO 자연유입"],
    bio: "르무통이 직접 쓰는 K-캐시미어 저널 — 소재, 관리법, 스타일링.",
    tone: "Long-form 리뷰/가이드 (1500-2500자). H2/H3 키워드 정렬. 주 1회 화요일 10시 KST.",
  },
  tiktok: {
    country: "JP",
    segments: ["Gen Z + 若年ミレニアル女性", "韓国コスメ・ファッション", "soft-girl aesthetic"],
    bio: "韓国カシミヤ 🤍\n1日のうち最も柔らかい30秒",
    tone: "15-30초 vertical. 트렌드 사운드 + 빠른 컷 + 첫 1초 후크 (질감 클로즈업). 주 5-6회.",
  },
};

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  const ws = await c.query<{ id: string }>(
    `select id from public.workspaces where name = '르무통' limit 1`,
  );
  const wsId = ws.rows[0].id;

  for (const [platform, cfg] of Object.entries(REASSIGN)) {
    const res = await c.query(
      `update public.mrai_marketing_channels
       set market_country = $1,
           target_segments = $2::jsonb,
           bio_text = $3,
           posting_style = $4
       where workspace_id = $5 and platform = $6`,
      [cfg.country, JSON.stringify(cfg.segments), cfg.bio, cfg.tone, wsId, platform],
    );
    console.log(`  ${platform.padEnd(18)} → ${cfg.country.padEnd(4)} (${res.rowCount} rows)`);
  }

  // Re-print audience counts after rebalance
  console.log("\nPost-rebalance audience:");
  const channels = await c.query<{
    platform: string;
    handle: string;
    market_country: string;
  }>(
    `select platform, handle, market_country from public.mrai_marketing_channels
     where workspace_id = $1 order by created_at`,
    [wsId],
  );
  for (const ch of channels.rows) {
    const match = await c.query<{ n: string }>(
      `select count(*)::text as n from public.personas where workspace_id = $1 and country = $2`,
      [wsId, ch.market_country],
    );
    console.log(
      `  ${ch.platform.padEnd(18)} @${ch.handle.padEnd(24)} ${ch.market_country} → ${match.rows[0].n} personas`,
    );
  }

  await c.end();
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});

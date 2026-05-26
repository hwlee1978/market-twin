import { NextResponse } from "next/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/mrai/marketing-channels/auto-seed
 *
 * Idempotent — inserts the 5 canonical platforms (X / Instagram /
 * YouTube / 네이버 블로그 / TikTok) for the active workspace with
 * sensible placeholder handles + bios derived from the workspace name.
 *
 * Skips any (workspace_id, platform, handle) that already exists. Returns
 * the rows that ended up inserted PLUS the rows that were already there
 * so the UI can re-render the full list.
 *
 * Sprint 2+ will swap the placeholder text for LLM-generated metadata
 * pulled from workspace memories (brand voice, target segments, etc.).
 */
type SeedRow = {
  platform: string;
  handle: string;
  display_name: string;
  market_country: string;
  target_segments: string[];
  posting_style: string;
  bio_text: string;
};

function buildSeeds(brandName: string, brandSlug: string): SeedRow[] {
  return [
    {
      platform: "x_twitter",
      handle: `${brandSlug}_global`,
      display_name: `${brandName} — Global`,
      market_country: "US",
      target_segments: ["25-44 urban professionals", "international audience"],
      posting_style:
        "단문 위주, 1문장 후크 + 베네핏. 영문, 친근하지만 절제된 톤. 주 3회.",
      bio_text: `${brandName} · proudly Korean, made for the world.`,
    },
    {
      platform: "instagram",
      handle: `${brandSlug}.kr`,
      display_name: `${brandName}`,
      market_country: "KR",
      target_segments: ["25-39세 여성", "도시 직장인", "K-콘텐츠 일상 소비"],
      posting_style:
        "캐러셀 5-7컷, 룩북 + 제품 디테일 + 일상 신. 해시태그 8-12개. 주 3회 저녁 8시 KST.",
      bio_text: `${brandName} · 매일의 럭셔리\n전세계 배송\n↓ 신규 컬렉션`,
    },
    {
      platform: "youtube",
      handle: `${brandSlug}.official`,
      display_name: `${brandName} Official`,
      market_country: "KR",
      target_segments: ["30-44세", "deep-dive 시청자", "브랜드 스토리 관심"],
      posting_style:
        "Long-form (6-10분) 다큐 + Shorts (30-60초). 월 2 long + 주 1 short. 자막 KR/EN.",
      bio_text: `${brandName}의 소재, 사람, 시간 — 그 사이의 이야기.`,
    },
    {
      platform: "naver_blog",
      handle: `${brandSlug}-journal`,
      display_name: `${brandName} Journal`,
      market_country: "KR",
      target_segments: ["30-49세", "네이버 검색 의존 직장인", "리뷰/비교 신뢰", "SEO 자연유입"],
      posting_style:
        "Long-form 리뷰/가이드 (1500-2500자). H2/H3 키워드 정렬, 인포그래픽 + 제품 컷. 주 1회 화요일 10시 KST.",
      bio_text: `${brandName}이 직접 쓰는 저널 — 소재, 관리법, 스타일링.`,
    },
    {
      platform: "tiktok",
      handle: `${brandSlug}.official`,
      display_name: `${brandName} ✨`,
      market_country: "US",
      target_segments: ["Gen Z + young millennial", "K-aesthetic", "trend discovery"],
      posting_style:
        "15-30초 vertical. 트렌드 사운드 + 빠른 컷. 첫 1초 후크 (texture / before-after). 주 5-6회.",
      bio_text: `${brandName} 🤍\nthe softest 30 seconds of your day`,
    },
  ];
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9가-힣]/g, "")
      .replace(/[가-힣]+/g, "") || "brand"
  );
}

export async function POST() {
  const wsCtx = await getOrCreatePrimaryWorkspace();
  if (!wsCtx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = await createClient();
  const { data: ws } = await supabase
    .from("workspaces")
    .select("name")
    .eq("id", wsCtx.workspaceId)
    .single<{ name: string }>();
  const brandName = ws?.name ?? "Brand";
  let brandSlug = slugify(brandName);
  // Korean-only workspace names slugify to "brand" — fallback to the
  // workspace id prefix so handles stay unique across workspaces.
  if (brandSlug === "brand") {
    brandSlug = `brand_${wsCtx.workspaceId.slice(0, 6)}`;
  }

  const seeds = buildSeeds(brandName, brandSlug);

  // Service client for batch insert — RLS would still apply via
  // workspace_id, but inserts here are auth'd by getOrCreatePrimaryWorkspace.
  const svc = createServiceClient();

  let inserted = 0;
  let skipped = 0;
  for (const s of seeds) {
    const { data: existing } = await svc
      .from("mrai_marketing_channels")
      .select("id")
      .eq("workspace_id", wsCtx.workspaceId)
      .eq("platform", s.platform)
      .eq("handle", s.handle)
      .maybeSingle();
    if (existing) {
      skipped++;
      continue;
    }
    const { error } = await svc.from("mrai_marketing_channels").insert({
      workspace_id: wsCtx.workspaceId,
      platform: s.platform,
      handle: s.handle,
      display_name: s.display_name,
      market_country: s.market_country,
      target_segments: s.target_segments,
      posting_style: s.posting_style,
      bio_text: s.bio_text,
      brand_assets: {},
      enabled: true,
    });
    if (error) {
      return NextResponse.json(
        { error: error.message, inserted, skipped },
        { status: 500 },
      );
    }
    inserted++;
  }

  // Return the now-current full list for UI re-render.
  const { data: all } = await supabase
    .from("mrai_marketing_channels")
    .select(
      "id, platform, handle, display_name, market_country, target_segments, posting_style, bio_text, brand_assets, enabled, created_at, updated_at",
    )
    .eq("workspace_id", wsCtx.workspaceId)
    .order("created_at", { ascending: false });

  return NextResponse.json({
    inserted,
    skipped,
    channels: all ?? [],
  });
}

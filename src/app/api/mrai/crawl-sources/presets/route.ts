import { NextResponse } from "next/server";
import { getOrCreatePrimaryWorkspace } from "@/lib/workspace";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/mrai/crawl-sources/presets
 *
 * Returns ready-to-go preset templates with workspace-specific
 * placeholders resolved (brand name pulled from workspace.name +
 * memory hints). User picks one preset → URL/label/filter auto-fill
 * → submit. Removes the "go to news.google.com, build the URL,
 * paste back" friction.
 *
 * Each preset has:
 *   - id (stable)
 *   - icon + label + description
 *   - source_type + suggested fetch_interval_hours
 *   - resolved url, label, brand_filter
 *   - editable: which fields the user can tweak inline (query, brand_en)
 */

type Preset = {
  id: string;
  group: string;            // "자사 브랜드 모니터링" / "경쟁사" / "카테고리 트렌드" / "자사 채널"
  icon: string;
  label: string;
  description: string;
  source_type: "self_website" | "news_rss" | "competitor";
  fetch_interval_hours: number;
  url: string;
  label_text: string;       // pre-filled label field
  brand_filter: string | null;
  // Hints for inline-editable fields the UI exposes
  edit_hints: {
    query?: string;          // current query string (for news_rss presets)
    brand_filter?: string;
  };
  // Workspace category gate. `null` = universal (always show). Otherwise
  // only emit when the workspace's product profile category is listed.
  // Without this, fashion-specific competitor presets (Allbirds, Cole
  // Haan, etc.) bled into every workspace including B2B SaaS ones.
  categories?: ProductCategory[] | null;
};

type ProductCategory =
  | "footwear"
  | "apparel"
  | "cosmetics"
  | "skincare"
  | "fragrance"
  | "accessories"
  | "jewelry"
  | "electronics"
  | "home_goods"
  | "food_beverage"
  | "health_supplements"
  | "saas_digital"
  | "ip_media"
  | "other";

function gnews(q: string, lang: "ko" | "en"): string {
  const encoded = encodeURIComponent(q);
  if (lang === "ko") {
    return `https://news.google.com/rss/search?q=${encoded}&hl=ko&gl=KR&ceid=KR:ko`;
  }
  return `https://news.google.com/rss/search?q=${encoded}&hl=en-US&gl=US&ceid=US:en`;
}

export async function GET() {
  const wsCtx = await getOrCreatePrimaryWorkspace();
  if (!wsCtx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = await createClient();
  const { data: ws } = await supabase
    .from("workspaces")
    .select("name")
    .eq("id", wsCtx.workspaceId)
    .single<{ name: string }>();
  const brandKr = ws?.name?.trim() ?? "";

  // Try to find an English brand variant from workspace memories
  // (heuristic: look for capitalized English words near the brand name).
  let brandEn: string | null = null;
  if (brandKr) {
    const { data: mems } = await supabase
      .from("mrai_memories")
      .select("title, body")
      .eq("workspace_id", wsCtx.workspaceId)
      .or(`title.ilike.%${brandKr}%,body.ilike.%${brandKr}%`)
      .limit(10);
    for (const m of (mems ?? []) as Array<{ title: string | null; body: string | null }>) {
      const text = `${m.title ?? ""} ${m.body ?? ""}`;
      // Look for "Le Mouton" / "LeMouton" / "LE MOUTON" style English forms
      const match = text.match(/\b[A-Z][A-Za-z\-]+(?:\s+[A-Z][A-Za-z\-]+){0,3}\b/);
      if (match && match[0].length >= 4 && match[0].length <= 40) {
        brandEn = match[0];
        break;
      }
    }
  }

  // Existing self_website hint — pull from SEO properties if registered
  const { data: seoProps } = await supabase
    .from("mrai_seo_properties")
    .select("property_url")
    .eq("workspace_id", wsCtx.workspaceId)
    .eq("property_type", "website")
    .limit(1);
  const selfDomain =
    Array.isArray(seoProps) && seoProps.length > 0 ? seoProps[0].property_url : null;

  // Workspace category (drives category-specific preset gating). Falls back
  // to "other" when the workspace hasn't built a product profile yet —
  // that effectively hides every category-tagged preset, which is the
  // privacy-safe default ("show nothing irrelevant").
  const { data: profile } = await supabase
    .from("mrai_workspace_product_profile")
    .select("category")
    .eq("workspace_id", wsCtx.workspaceId)
    .maybeSingle<{ category: ProductCategory }>();
  const wsCategory: ProductCategory = profile?.category ?? "other";

  const presets: Preset[] = [];

  // ─── Self website ──────────────────────────────────────────────
  presets.push({
    id: "self_homepage",
    group: "자사 채널",
    icon: "🏠",
    label: "자사 홈페이지",
    description:
      "워크스페이스의 공식 사이트 — 신상품/공지/블로그 변동을 매일 추출.",
    source_type: "self_website",
    fetch_interval_hours: 24,
    url: selfDomain ?? "",
    label_text: `${brandKr} 공식 사이트`,
    brand_filter: null,
    edit_hints: {},
  });

  // ─── Brand monitoring ──────────────────────────────────────────
  if (brandKr) {
    presets.push({
      id: "news_brand_kr",
      group: "자사 브랜드 모니터링",
      icon: "🇰🇷",
      label: "한국 뉴스 (자사 브랜드)",
      description: `Google News 한국어 검색 — "${brandKr}" 멘션을 6시간마다 수집.`,
      source_type: "news_rss",
      fetch_interval_hours: 6,
      url: gnews(brandKr, "ko"),
      label_text: `Google News KR: ${brandKr}`,
      brand_filter: brandKr,
      edit_hints: { query: brandKr },
    });
  }
  if (brandEn || brandKr) {
    const q = brandEn ?? brandKr;
    presets.push({
      id: "news_brand_en",
      group: "자사 브랜드 모니터링",
      icon: "🌐",
      label: "글로벌 영문 뉴스 (자사 브랜드)",
      description: `Google News 영문 검색 — "${q}" 멘션 추적. 영문 브랜드명을 수정해서 추가하세요.`,
      source_type: "news_rss",
      fetch_interval_hours: 12,
      url: gnews(q, "en"),
      label_text: `Google News EN: ${q}`,
      brand_filter: q,
      edit_hints: { query: q },
    });
  }

  // ─── Competitor — pre-curated working URLs (verified) ──────────
  const competitors: Array<{
    id: string;
    label: string;
    url: string;
    label_text: string;
  }> = [
    {
      id: "comp_allbirds_men",
      label: "Allbirds — 남성 신상",
      url: "https://www.allbirds.com/collections/mens-new-arrivals",
      label_text: "Allbirds 남성 신상",
    },
    {
      id: "comp_allbirds_women",
      label: "Allbirds — 여성 신상",
      url: "https://www.allbirds.com/collections/womens-new-arrivals",
      label_text: "Allbirds 여성 신상",
    },
    {
      id: "comp_colehaan_men",
      label: "Cole Haan — 남성",
      url: "https://www.colehaan.com/mens-shoes",
      label_text: "Cole Haan 남성",
    },
    {
      id: "comp_on_men",
      label: "On Running — 남성",
      url: "https://www.on.com/en-us/shop/men",
      label_text: "On Running 남성",
    },
  ];
  for (const c of competitors) {
    presets.push({
      id: c.id,
      group: "경쟁사 페이지",
      icon: "⚔️",
      label: c.label,
      description: `${c.label_text} 페이지 변동을 매일 fetch — 신상/가격/베스트셀러 추적.`,
      source_type: "competitor",
      fetch_interval_hours: 24,
      url: c.url,
      label_text: c.label_text,
      brand_filter: null,
      edit_hints: {},
      // Footwear-specific (Allbirds / Cole Haan / On Running are
      // all sneaker brands). Apparel workspaces could plausibly want
      // these too, so we include both.
      categories: ["footwear", "apparel"],
    });
  }

  // ─── Competitor — combined news RSS (Cloudflare-blocked sites workaround) ─
  presets.push({
    id: "news_competitors_combined",
    group: "경쟁사 뉴스",
    icon: "📰",
    label: "경쟁사 묶음 뉴스 (Allbirds/Veja/On)",
    description:
      "Cloudflare로 막힌 Veja 같은 사이트는 직접 fetch 불가 → Google News로 우회. 3개 브랜드를 한 번에.",
    source_type: "news_rss",
    fetch_interval_hours: 12,
    url: gnews('Allbirds OR Veja OR "On Running"', "en"),
    label_text: "Allbirds/Veja/On 뉴스",
    brand_filter: null,
    edit_hints: { query: 'Allbirds OR Veja OR "On Running"' },
    categories: ["footwear", "apparel"],
  });

  // ─── Category trends ───────────────────────────────────────────
  presets.push({
    id: "news_kfashion",
    group: "카테고리 트렌드",
    icon: "📈",
    label: "K-fashion 스니커즈 글로벌 트렌드",
    description:
      "K-fashion + sneaker 키워드 영문 뉴스 — 카테고리 흐름 모니터링.",
    source_type: "news_rss",
    fetch_interval_hours: 24,
    url: gnews('"K-fashion" sneaker', "en"),
    label_text: "K-fashion 스니커즈 트렌드",
    brand_filter: null,
    edit_hints: { query: '"K-fashion" sneaker' },
    categories: ["footwear", "apparel"],
  });
  presets.push({
    id: "news_merino_wool",
    group: "카테고리 트렌드",
    icon: "🐑",
    label: "메리노 울 스니커즈 글로벌 뉴스",
    description:
      "merino wool sneaker 키워드 영문 뉴스 — 소재 카테고리 동향.",
    source_type: "news_rss",
    fetch_interval_hours: 24,
    url: gnews('"merino wool" sneaker', "en"),
    label_text: "메리노 울 스니커즈 뉴스",
    brand_filter: null,
    edit_hints: { query: '"merino wool" sneaker' },
    categories: ["footwear"],
  });
  presets.push({
    id: "news_sustainable_fashion",
    group: "카테고리 트렌드",
    icon: "♻️",
    label: "지속가능 패션 글로벌 트렌드",
    description: "sustainable fashion 키워드 뉴스 — 인증/규제/소비자 동향.",
    source_type: "news_rss",
    fetch_interval_hours: 48,
    url: gnews('"sustainable fashion"', "en"),
    label_text: "지속가능 패션 트렌드",
    brand_filter: null,
    edit_hints: { query: '"sustainable fashion"' },
    categories: ["footwear", "apparel", "accessories"],
  });

  // ─── SaaS / AI consumer-research competitors ───────────────────
  // Direct fetch from each vendor's blog/insights page. Most of these
  // are behind Cloudflare for the homepage, so we point at the blog
  // route which is typically less aggressively gated.
  const saasCompetitors: Array<{
    id: string;
    label: string;
    url: string;
    label_text: string;
  }> = [
    {
      id: "comp_syntheticusers",
      label: "Synthetic Users — 블로그",
      url: "https://www.syntheticusers.com/blog",
      label_text: "Synthetic Users 블로그",
    },
    {
      id: "comp_yabble",
      label: "Yabble — 인사이트",
      url: "https://www.yabble.com/blog",
      label_text: "Yabble 블로그",
    },
    {
      id: "comp_quantilope",
      label: "Quantilope — 인사이트",
      url: "https://www.quantilope.com/insights",
      label_text: "Quantilope insights",
    },
    {
      id: "comp_remesh",
      label: "Remesh — 블로그",
      url: "https://blog.remesh.ai/",
      label_text: "Remesh 블로그",
    },
  ];
  for (const c of saasCompetitors) {
    presets.push({
      id: c.id,
      group: "경쟁사 페이지",
      icon: "⚔️",
      label: c.label,
      description: `${c.label_text} 변동을 매일 fetch — 신기능·케이스 스터디·가격 추적.`,
      source_type: "competitor",
      fetch_interval_hours: 24,
      url: c.url,
      label_text: c.label_text,
      brand_filter: null,
      edit_hints: {},
      categories: ["saas_digital"],
    });
  }

  // Combined news RSS — covers all the SaaS competitors at once
  // (Cloudflare-blocked sites are handled by routing through Google News).
  presets.push({
    id: "news_aiconsumer_research_combined",
    group: "경쟁사 뉴스",
    icon: "📰",
    label: "AI 컨슈머 리서치 묶음 뉴스",
    description:
      "Synthetic Users / Yabble / Quantilope / Remesh / Attest 5개 SaaS 뉴스를 한 번에. 직접 fetch가 막힌 사이트도 우회.",
    source_type: "news_rss",
    fetch_interval_hours: 12,
    url: gnews(
      '"Synthetic Users" OR Yabble OR Quantilope OR Remesh OR "Askattest"',
      "en",
    ),
    label_text: "AI 컨슈머 리서치 SaaS 뉴스",
    brand_filter: null,
    edit_hints: {
      query:
        '"Synthetic Users" OR Yabble OR Quantilope OR Remesh OR "Askattest"',
    },
    categories: ["saas_digital"],
  });

  // Category trends — useful for any SaaS workspace tracking the
  // AI-research / synthetic-personas space.
  presets.push({
    id: "news_ai_market_research",
    group: "카테고리 트렌드",
    icon: "🧠",
    label: "AI 시장조사 글로벌 트렌드",
    description: '"AI market research" 키워드 영문 뉴스 — 카테고리 흐름 모니터링.',
    source_type: "news_rss",
    fetch_interval_hours: 24,
    url: gnews('"AI market research"', "en"),
    label_text: "AI market research 트렌드",
    brand_filter: null,
    edit_hints: { query: '"AI market research"' },
    categories: ["saas_digital"],
  });
  presets.push({
    id: "news_synthetic_personas_category",
    group: "카테고리 트렌드",
    icon: "🤖",
    label: "Synthetic personas / AI 페르소나",
    description: "synthetic users / AI personas 키워드 영문 뉴스 — 직접 카테고리 동향.",
    source_type: "news_rss",
    fetch_interval_hours: 24,
    url: gnews(
      '"synthetic users" OR "AI personas" OR "synthetic personas"',
      "en",
    ),
    label_text: "Synthetic personas 트렌드",
    brand_filter: null,
    edit_hints: {
      query: '"synthetic users" OR "AI personas" OR "synthetic personas"',
    },
    categories: ["saas_digital"],
  });
  presets.push({
    id: "news_kr_export_trend",
    group: "카테고리 트렌드",
    icon: "🇰🇷",
    label: "한국 수출·해외 진출 동향 (KR)",
    description:
      "KOTRA·KITA·한국 수출 키워드 KR 뉴스 — 진출 관련 정책·시장 동향.",
    source_type: "news_rss",
    fetch_interval_hours: 24,
    url: gnews('"한국 수출" OR KOTRA OR KITA OR "해외 진출"', "ko"),
    label_text: "한국 수출·해외 진출 동향",
    brand_filter: null,
    edit_hints: { query: '"한국 수출" OR KOTRA OR KITA OR "해외 진출"' },
    categories: ["saas_digital"],
  });

  // Apply category gate. Presets without an explicit `categories` field
  // are universal (self_website, brand monitoring, etc.) and always pass.
  const filtered = presets.filter(
    (p) => !p.categories || p.categories.includes(wsCategory),
  );

  return NextResponse.json({
    workspace: { name: brandKr, brand_en: brandEn, category: wsCategory },
    presets: filtered,
  });
}

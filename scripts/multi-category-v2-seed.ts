/**
 * Multi-category v2 — 의류/가전/B2B 3 brand backtest (2026-06-05).
 * v0.2-E generalization 카테고리 확장 검증용.
 *
 *   MUSINSA Standard (Fashion)         — 2020 Q4 decision · JP first
 *   Cuckoo 밥솥 (Electronics / B2C)    — 2017 Q1 decision · US + CN (Asian-Am + duty-free)
 *   Celltrion 바이오시밀러 (B2B Bio)   — 2017 Q1 decision · EU first (EMA approval)
 *
 * 동일 decision-point vintage description 원칙. brandStrategy 힌트는
 * scripts/_inject-multi-v2-brand-strategy.ts 로 별도 주입.
 */
import { createClient } from "@supabase/supabase-js";

const TARGET_WORKSPACE = "0c8e774f-356a-4bf2-ba3d-8bfb41e6d019";

const BRANDS = [
  {
    slug: "mcv2-musinsa-standard",
    productName: "MUSINSA Standard Basics",
    category: "fashion",
    description:
      "MUSINSA Standard — 한국 1위 패션 D2C 플랫폼 무신사 (2003 설립) 의 자체 PB 라인 (basics, T-shirts, hoodies, denim). 가격대 mass-market (₩20,000-50,000/item). MUSINSA 플랫폼 + 자체 쇼룸 (서울 홍대) 채널. 2020년 매출 단일 라인 ~₩200B 도달. 글로벌 진출 첫 본격 검토 단계 — 한국 K-fashion D2C 명성 + MUSINSA 매거진·인플루언서 후광 활용 계획. 일본 시장이 MUSINSA 의 직구 비율 가장 높은 외국 시장 신호로 확인.",
    basePriceCents: 3500,
    asOfDate: "2020-12-31",
    candidateCountries: ["US", "JP", "CN", "TW", "HK", "SG", "TH", "VN", "ID", "MY"],
  },
  {
    slug: "mcv2-cuckoo-rice",
    productName: "Cuckoo Premium Pressure Rice Cooker",
    category: "electronics",
    description:
      "쿠쿠 (Cuckoo) 프리미엄 압력 밥솥. 한국 밥솥 1위 (70%+ 점유율, 1978 창립). 가격대 ~$200-500/unit. 국내 채널 = 직영점 + 이마트·홈플러스 대형마트. K-드라마 PPL 빈번 (한식 culture 노출). 2017년 첫 본격 글로벌 D2C 진출 검토 단계 — 한인 디아스포라 + 한식 globalization wave 잡으려는 전략. 미국 한인 상가 + 면세점 sample 매출 anchor 신호로 확인.",
    basePriceCents: 35000,
    asOfDate: "2017-03-31",
    candidateCountries: ["US", "CN", "JP", "TW", "HK", "SG", "VN", "TH", "MY", "ID"],
  },
  {
    slug: "mcv2-celltrion-biosimilar",
    productName: "Celltrion Biosimilar (Remsima / Truxima portfolio)",
    category: "other",
    description:
      "셀트리온 (Celltrion) 자가면역·종양 바이오시밀러 portfolio (Remsima/Inflectra, Truxima/Rituxan biosimilar). 1991 설립, 2002 바이오시밀러 본격. 가격 ~$500-5000/dose. 채널 = B2B 의약품 유통 + 병원 처방. 2013 EMA Remsima 승인 (세계 첫 항체 바이오시밀러), 2016 FDA Inflectra 승인. 2017년 글로벌 portfolio 확장 본격 단계 — EMA 승인 경로 vs FDA 등 regulatory 차이가 시장 선택 결정 변수. R&D + 임상 데이터 중심 corporate, 의학계 KOL 학회 발표 의존.",
    basePriceCents: 200000,
    asOfDate: "2017-03-31",
    candidateCountries: ["US", "DE", "FR", "GB", "IT", "JP", "CN", "CA", "IN", "BR"],
  },
] as const;

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  const { data: owner, error: ownerErr } = await sb
    .from("workspace_members")
    .select("user_id")
    .eq("workspace_id", TARGET_WORKSPACE)
    .eq("role", "owner")
    .limit(1)
    .single();
  if (ownerErr || !owner) {
    console.error("Workspace owner not found", ownerErr);
    process.exit(1);
  }

  console.log(`Seeding ${BRANDS.length} multi-category v2 projects → workspace ${TARGET_WORKSPACE.slice(0, 8)}\n`);

  for (const brand of BRANDS) {
    const { data: existing } = await sb
      .from("projects")
      .select("id, product_name")
      .eq("workspace_id", TARGET_WORKSPACE)
      .eq("product_name", brand.productName)
      .limit(1)
      .maybeSingle();

    if (existing) {
      console.log(`✓ ${brand.slug} exists: ${(existing.id as string).slice(0, 8)}`);
      continue;
    }

    const { data: created, error: insErr } = await sb
      .from("projects")
      .insert({
        workspace_id: TARGET_WORKSPACE,
        created_by: owner.user_id,
        name: brand.productName,
        product_name: brand.productName,
        category: brand.category,
        description: brand.description,
        base_price_cents: brand.basePriceCents,
        currency: "USD",
        objective: "expansion",
        originating_country: "KR",
        candidate_countries: brand.candidateCountries,
        competitor_urls: [],
        asset_descriptions: [],
        asset_urls: [],
        status: "draft",
      })
      .select("id")
      .single();
    if (insErr || !created) {
      console.error(`✗ ${brand.slug} insert failed:`, insErr);
      continue;
    }
    console.log(`+ ${brand.slug} created: ${(created.id as string).slice(0, 8)} — ${brand.productName} (as-of ${brand.asOfDate})`);
  }

  console.log(`\nRun hypothesis tier 3-sim multi-LLM per brand:`);
  for (const brand of BRANDS) {
    console.log(`  npx tsx --env-file=.env.local scripts/smoke-ensemble-e2e.ts <${brand.slug}_prefix> hypothesis --as-of=${brand.asOfDate}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/**
 * Seed 3 Korean brand projects across non-beauty categories for
 * v0.2-A→E methodology generalization test (2026-06-04).
 *
 * Each description is "decision-point vintage" — only facts publicly
 * known at the launch-decision quarter, to minimize hindsight bias.
 * Companion to scripts/k-beauty-methodology-seed.ts.
 *
 *   불닭 (Samyang Buldak)         — 2018 Q4 decision · K-Food
 *   정관장 홍삼정 (KGC)            — 2020 Q4 decision · K-Wellness
 *   빙그래 바나나우유 (Binggrae)   — 2017 Q1 decision · K-Beverage
 *
 * Skips inserts when a project with the same product_name already exists.
 * Brand-strategy hints injected separately via
 * scripts/_inject-brand-strategy-multi.ts.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/multi-category-methodology-seed.ts
 */
import { createClient } from "@supabase/supabase-js";

const TARGET_WORKSPACE = "0c8e774f-356a-4bf2-ba3d-8bfb41e6d019";

const BRANDS = [
  {
    slug: "mcm-buldak",
    productName: "Samyang Buldak Spicy Chicken Ramen",
    category: "food",
    description:
      "Samyang Foods Buldak Bokkeum-myeon (불닭볶음면). Korean instant noodle, extreme-spicy 매운맛 hero positioning (Scoville 4404). Launched domestic 2012, became Samyang's flagship by 2017 with 30% revenue share. Olive Young + GS25 + CU + 이마트 channels dominant in KR. Mass-market price (~₩1,500/unit). YouTube spicy-challenge videos starting to surface mid-2018. Looking to identify first major overseas export market for sustained scale.",
    basePriceCents: 250,
    asOfDate: "2018-12-31",
    candidateCountries: ["US", "JP", "CN", "TW", "ID", "VN", "TH", "MY", "PH", "AU"],
  },
  {
    slug: "mcm-kgc-redginseng",
    productName: "KGC Cheong Kwan Jang Korean Red Ginseng Extract",
    category: "health",
    description:
      "KGC (한국인삼공사) 정관장 홍삼정 (Korean Red Ginseng concentrated extract). 6-year root with 70+ ginsenoside profile, KFDA functional food approval. 국내 인삼 시장 1위 (60%+ share). Channel mix historically duty-free + 백화점 + 직영점. COVID-19 (2020) impact on duty-free → considering D2C / overseas online expansion. ~$80 retail per 240g jar. Looking for first major D2C export market beyond traditional CN duty-free channel.",
    basePriceCents: 8000,
    asOfDate: "2020-12-31",
    candidateCountries: ["US", "CN", "JP", "TW", "HK", "SG", "VN", "TH", "MY", "GB"],
  },
  {
    slug: "mcm-binggrae-banana",
    productName: "Binggrae Banana Milk",
    category: "beverage",
    description:
      "Binggrae 바나나우유 (banana-flavored milk drink in iconic 단지 yellow plastic container). Korean national beverage since 1974, ~$1.5/unit. Distributed via CU/GS25/세븐일레븐 convenience stores + 대형마트 in KR. Major Korean cultural icon — featured in K-Dramas + tourist must-buy. Looking to set up first overseas production / distribution subsidiary; aware that ambient-stable formulation + cold-chain limitations of fresh-milk products will shape market choice. Mid-2010s tourist exports to CN/SEA via 면세점 already established as anchor signal.",
    basePriceCents: 200,
    asOfDate: "2017-03-31",
    candidateCountries: ["VN", "CN", "PH", "ID", "TH", "MY", "US", "JP", "AU", "SG"],
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

  console.log(
    `Seeding ${BRANDS.length} multi-category methodology projects → workspace ${TARGET_WORKSPACE.slice(0, 8)}\n`,
  );

  for (const brand of BRANDS) {
    const { data: existing } = await sb
      .from("projects")
      .select("id, product_name")
      .eq("workspace_id", TARGET_WORKSPACE)
      .eq("product_name", brand.productName)
      .limit(1)
      .maybeSingle();

    if (existing) {
      console.log(
        `✓ ${brand.slug} exists: ${(existing.id as string).slice(0, 8)} — ${brand.productName}`,
      );
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
    console.log(
      `+ ${brand.slug} created: ${(created.id as string).slice(0, 8)} — ${brand.productName} (as-of ${brand.asOfDate})`,
    );
  }

  console.log(`\nRun hypothesis tier 3-sim multi-LLM per brand:`);
  for (const brand of BRANDS) {
    console.log(
      `  npx tsx --env-file=.env.local scripts/smoke-ensemble-e2e.ts <${brand.slug}_prefix> hypothesis --as-of=${brand.asOfDate}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

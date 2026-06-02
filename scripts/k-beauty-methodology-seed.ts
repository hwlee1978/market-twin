/**
 * Seed 3 K-Beauty D2C brand projects for the methodology benchmark
 * (proposals/K-Beauty-D2C-Benchmark-Methodology-v1.md).
 *
 * Each brand uses a "decision-point vintage" description containing only
 * facts that were publicly known at the brand's overseas-launch decision
 * point, to minimize hindsight bias.
 *
 *   Anua    — 2021 Q4 decision (HOLDOUT in our ground truth corpus)
 *   Tirtir  — 2020 Q2 decision (TRUE holdout — not in ground truth at all)
 *   BoJ     — 2021 Q4 decision, Dynasty Cream hero (TUNING in ground truth)
 *
 * Skips inserts when a project with the same product_name already exists.
 * Prints project IDs to feed `smoke-ensemble-e2e --as-of=YYYY-MM-DD`.
 *
 * Usage:
 *   npm run k-beauty:seed
 *   # or
 *   tsx --env-file=.env.local scripts/k-beauty-methodology-seed.ts
 */
import { createClient } from "@supabase/supabase-js";

const TARGET_WORKSPACE = "0c8e774f-356a-4bf2-ba3d-8bfb41e6d019";

const BRANDS = [
  {
    slug: "kbm-anua",
    productName: "Anua Heartleaf Pore Control Cleansing Oil",
    category: "beauty",
    description:
      "Anua Heartleaf Pore Control Cleansing Oil. Functional cleansing oil for sensitive/oily skin, hero ingredient 어성초 (Heartleaf 77%). Mid-price clean beauty positioning. The Founders Inc subsidiary (창업 2017). Olive Young Korea bestseller in sensitive-skin category. Looking to identify first major export market.",
    basePriceCents: 2000,
    asOfDate: "2021-12-31",
    candidateCountries: ["US", "JP", "ID", "CN", "GB", "DE", "TH", "VN", "MX", "MY"],
  },
  {
    slug: "kbm-tirtir",
    productName: "Tirtir Mask Fit Red Cushion",
    category: "beauty",
    description:
      "Tirtir Mask Fit Red Cushion compact foundation. Mass-market K-beauty, 72-hour longevity claim, glass-skin finish. D2C-native brand founded by influencer 이유빈, group-buy origin (2017 시작, TIRTIR Inc 정식 법인 2019). Korean retail via Olive Young + Lotte Duty Free entry 2019. Looking for first major overseas market.",
    basePriceCents: 2200,
    asOfDate: "2020-06-30",
    candidateCountries: ["US", "JP", "ID", "CN", "GB", "DE", "TH", "VN", "MX", "MY"],
  },
  {
    slug: "kbm-boj",
    productName: "Beauty of Joseon Dynasty Cream",
    category: "beauty",
    description:
      "Beauty of Joseon Dynasty Cream. Hanbang heritage moisturizer — rice bran water + ginseng + ceramide + niacinamide. Royal court Joseon beauty positioning citing 규합총서. Niche indie founded 2016 by Sumin Lee, acquired by Goodai Global 2019. ~$83K global revenue 2020. Existing organic following on Reddit r/AsianBeauty + Western K-beauty YouTube reviewers — minimal Korea domestic marketing.",
    basePriceCents: 1700,
    asOfDate: "2021-12-31",
    candidateCountries: ["US", "JP", "ID", "CN", "GB", "DE", "TH", "VN", "MX", "MY"],
  },
] as const;

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  // Find workspace owner for created_by attribution
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

  console.log(`Seeding ${BRANDS.length} K-Beauty methodology projects → workspace ${TARGET_WORKSPACE.slice(0, 8)}\n`);

  for (const brand of BRANDS) {
    const { data: existing } = await sb
      .from("projects")
      .select("id, product_name")
      .eq("workspace_id", TARGET_WORKSPACE)
      .eq("product_name", brand.productName)
      .limit(1)
      .maybeSingle();

    if (existing) {
      console.log(`✓ ${brand.slug} exists: ${(existing.id as string).slice(0, 8)} — ${brand.productName}`);
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

  console.log(`\nRun smoke with each project ID (hypothesis tier ≈ $1-2/brand):`);
  for (const brand of BRANDS) {
    console.log(`  tsx --env-file=.env.local scripts/smoke-ensemble-e2e.ts <${brand.slug}_prefix> hypothesis --as-of=${brand.asOfDate}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

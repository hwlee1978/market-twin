/**
 * N=50 cross-origin backtest — PILOT batch (6 brands, 5 origin countries).
 * Validates the origin-agnostic grounding (Comtrade dynamic + US SEC/FDA +
 * JP EDINET + SEA baseline) end-to-end before scaling to 50.
 *
 * Fixtures researched hindsight-clean (decision-point vintage descriptions,
 * verified actual-launch outcomes with sources). `actual` is ground truth for
 * scoring — NOT inserted into the project (never fed to the sim).
 *
 * Run:  npx tsx --env-file=.env.local scripts/backtest50-pilot-seed.ts
 * Then: npx tsx --env-file=.env.local scripts/smoke-ensemble-e2e.ts <prefix> hypothesis --as-of=<asOfDate>
 */
import { createClient } from "@supabase/supabase-js";

const TARGET_WORKSPACE = "0c8e774f-356a-4bf2-ba3d-8bfb41e6d019";

const BRANDS = [
  {
    slug: "bt50-medicube",
    productName: "Medicube Zero Pore Pad",
    category: "beauty",
    originatingCountry: "KR",
    basePriceCents: 2200,
    asOfDate: "2019-12-31",
    candidateCountries: ["US", "JP", "CN", "SG", "MY", "TH", "VN", "HK", "TW", "ID"],
    actual: "US",
    description:
      "Medicube is a Korean derma-cosmetic skincare brand launched in 2016 by APR Corp, positioned as dermatologist-inspired, clinically-tested, hypoallergenic care for problem skin (pores, blemishes, keratin). Hero franchise is the Zero Pore Pad, alongside toners, serums and sheet masks. Accessible mass-premium tier: flagship SKUs ~KRW 20,000-30,000. Domestic channels: Olive Young + own online D2C store, with strong traction on the Hwahae ingredient-review app driving a 'safe ingredients / results-driven' reputation. Marketing is digital-first and review/UGC-led rather than celebrity-endorsement-led. Establishing dedicated overseas D2C storefronts to begin serious international expansion.",
  },
  {
    slug: "bt50-kundal",
    productName: "Kundal Perfume Shampoo",
    category: "beauty",
    originatingCountry: "KR",
    basePriceCents: 900,
    asOfDate: "2018-03-31",
    candidateCountries: ["RU", "PL", "ES", "US", "SG", "MY", "ID", "JP", "VN", "CN"],
    actual: "ID",
    description:
      "Kundal is a Korean personal-care/haircare D2C brand launched in 2016 by The Skin Factory, founded by ex-WeMakePrice e-commerce merchandisers. Hero products are sulfate/paraben-free perfumed shampoos, conditioners and body washes differentiated by ~25 long-lasting fragrances at a mass-affordable price tier (large bottles ~KRW 9,900-12,900). Positioning: 'hair perfume' scent experience with clean ingredients at value pricing. Domestically it scaled almost entirely through online marketplaces, becoming the #1 best-selling personal-care brand on Coupang (~500,000 units/month), driven by review/word-of-mouth and scent-led marketing rather than celebrity endorsement.",
  },
  {
    slug: "bt50-fiveguys",
    productName: "Five Guys burgers",
    category: "food",
    originatingCountry: "US",
    basePriceCents: 519,
    asOfDate: "2012-12-31",
    candidateCountries: ["GB", "IE", "AU", "AE", "SA", "DE", "FR", "MX", "ES", "JP"],
    actual: "GB",
    description:
      "Five Guys (fd. 1986, Arlington VA, by the Murrell family) is a fast-casual 'better burger' chain: fresh, never-frozen 80/20 beef, made-to-order, no freezers or microwaves in-store, a deliberately limited menu with 15 free toppings, hand-cut fries cooked in peanut oil, and free roasted peanuts while you wait. Positioned above QSR on quality but standalone/strip-mall quick-service in format. Explosive US franchising drove it to ~1,039 locations (200 company-owned, 839 franchised) and roughly $1B system sales by 2012, up ~790% since 2006. A regular hamburger runs about $5; cheeseburger/bacon variants $6-7. Marketing is word-of-mouth and awards-driven (Zagat 'Best Burger', a widely covered 2009 Obama visit); no traditional ad spend.",
  },
  {
    slug: "bt50-shiro",
    productName: "shiro natural cosmetics",
    category: "beauty",
    originatingCountry: "JP",
    basePriceCents: 3800,
    asOfDate: "2016-03-31",
    candidateCountries: ["GB", "FR", "US", "KR", "TW", "CN", "HK", "SG", "DE", "AU"],
    actual: "TW",
    description:
      "A premium Hokkaido-born natural-cosmetics brand (Sunagawa, Hokkaido), originally an OEM manufacturer that launched its own retail label 'Laurel' in 2009 and rebranded to 'shiro' in 2015. Positioning centers on additive-conscious, ingredient-led formulations using regional Japanese natural materials such as gagome kelp and sake kasu across skincare, makeup, and a fast-growing signature fragrance line. Minimalist Scandinavian-influenced packaging and store design; premium-but-accessible price tier (hero items ~3,000-5,000 yen). Sold mainly through the brand's own company-operated stores across Japan plus its official e-commerce site, with a craft/transparency narrative and design-forward identity beginning to draw press attention.",
  },
  {
    slug: "bt50-meetmore",
    productName: "Meet More fruit instant coffee",
    category: "beverage",
    originatingCountry: "VN",
    basePriceCents: 450,
    asOfDate: "2018-12-31",
    candidateCountries: ["KR", "JP", "US", "AU", "RU", "CN", "TW", "SG", "TH", "IN"],
    actual: "KR",
    description:
      "Founded in 2018 by Nguyen Ngoc Luan in Ho Chi Minh City, Meet More is Vietnam's first 'agricultural fruit coffee' brand: instant coffee blended with locally sourced fruit and produce (coconut, taro, mango, mint, pandan) using a health-oriented, no-sugar-added positioning. It targets non-traditional coffee drinkers and health-conscious buyers, sitting mid-tier above commodity instant coffee but below specialty roasters. Range is instant sachets and boxed multipacks. Domestic channels are supermarkets, OCOP/agricultural-product fairs, and early e-commerce in HCMC. Marketing leans on Vietnamese-farmer storytelling and provincial-produce provenance. Because local consumers initially resisted the fruit-coffee format, the founder prioritizes overseas markets first.",
  },
  {
    slug: "bt50-wardah",
    productName: "Wardah halal cosmetics",
    category: "beauty",
    originatingCountry: "ID",
    basePriceCents: 400,
    asOfDate: "2011-12-31",
    candidateCountries: ["MY", "SG", "TH", "PH", "BN", "BD", "PK", "AE", "SA", "EG"],
    actual: "MY",
    description:
      "Wardah is Indonesia's pioneering halal-certified color-cosmetics and skincare line (lipsticks, lip creams, foundations, moisturizers) made by PT Paragon Technology and Innovation. Positioned as an affordable, mass-market brand aimed at Muslim women seeking halal-assured beauty products. Value/entry-level tier, hero SKUs ~Rp 30,000-50,000. Sold domestically through department-store counters (notably Matahari), drugstores, MLM/direct-sales agents, and a growing branch/distribution-center network across Indonesia. Marketing leans on halal certification, Muslimah-lifestyle messaging, and local celebrity/beauty-advisor promotion. By 2011 a fast-rising Indonesia Original Brand award winner and a leading local cosmetics name.",
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

  console.log(`Seeding ${BRANDS.length} pilot backtest projects → workspace ${TARGET_WORKSPACE.slice(0, 8)}\n`);
  const runs: string[] = [];
  for (const brand of BRANDS) {
    const { data: existing } = await sb
      .from("projects")
      .select("id")
      .eq("workspace_id", TARGET_WORKSPACE)
      .eq("product_name", brand.productName)
      .limit(1)
      .maybeSingle();
    let id = existing?.id as string | undefined;
    if (id) {
      console.log(`✓ ${brand.slug} exists: ${id.slice(0, 8)} (origin ${brand.originatingCountry})`);
    } else {
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
          originating_country: brand.originatingCountry,
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
      id = created.id as string;
      console.log(`+ ${brand.slug} created: ${id.slice(0, 8)} (origin ${brand.originatingCountry}, actual=${brand.actual})`);
    }
    runs.push(`${id.slice(0, 8)}|${brand.asOfDate}|${brand.originatingCountry}|${brand.actual}|${brand.slug}`);
  }

  console.log(`\n=== RUN LINES (id8|asOf|origin|actual|slug) ===`);
  for (const r of runs) console.log(r);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

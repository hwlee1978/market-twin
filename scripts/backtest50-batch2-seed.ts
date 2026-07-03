/**
 * N=20 cross-origin backtest — BATCH 2 (14 brands, 10 origin countries).
 * Adds to the 6-brand pilot for a 20-brand corpus. Ground truth = FIRST
 * SUSTAINED / largest overseas market (revenue/longevity), not first-entered.
 * Researched hindsight-clean with sources. `actual` = ground truth (not seeded).
 *
 * Run:  npx tsx --env-file=.env.local scripts/backtest50-batch2-seed.ts
 */
import { createClient } from "@supabase/supabase-js";

const TARGET_WORKSPACE = "0c8e774f-356a-4bf2-ba3d-8bfb41e6d019";

const BRANDS = [
  {
    slug: "bt50-yopokki", productName: "Yopokki Instant Tteokbokki", category: "food",
    originatingCountry: "KR", basePriceCents: 170, asOfDate: "2016-06-30", actual: "JP",
    candidateCountries: ["JP", "VN", "CN", "US", "PH", "ID", "MY", "SG", "TH", "AE"],
    description:
      "Shelf-stable instant tteokbokki (Korean rice cakes with sauce) from Youngpoong, a Daegu food SME. Built on a proprietary rice-processing method giving ~12-month room-temperature shelf life with no preservatives, engineered for shipping. Single-serve cups and pouches in sauce variants (sweet-spicy, cheese, black bean), with milder recipes tuned for non-Korean palates. Mid-tier convenience-snack pricing (~$1.70/cup). Domestic distribution via marts, convenience stores, warehouse clubs and B2B private-label; still a small exporter leaning on trade shows, sampling and Korean-Wave awareness to grow abroad.",
  },
  {
    slug: "bt50-jinro", productName: "Jinro Soju", category: "beverage",
    originatingCountry: "KR", basePriceCents: 200, asOfDate: "1977-11-01", actual: "JP",
    candidateCountries: ["JP", "VN", "US", "CN", "TW", "PH", "HK", "TH", "DE", "RU"],
    description:
      "A Seoul-based distiller and the dominant maker of Korea's national spirit — a clear, lightly sweet diluted grain liquor sold in single-serve bottles — planning its first serious overseas push. It has shipped small trial volumes abroad since the late 1960s but never built a sustained foreign base. The product is inexpensive, high-volume, and culturally specific, so demand hinges on where an ethnic-Korean/expat community, familiar drinking customs, and viable import channels overlap. Management must pick one market to concentrate marketing and localized distribution, betting on durable repeat revenue.",
  },
  {
    slug: "bt50-kleannara", productName: "Kleannara Pure Cotton Sanitary Pads", category: "wellness",
    originatingCountry: "KR", basePriceCents: 700, asOfDate: "2020-03-01", actual: "SG",
    candidateCountries: ["SG", "MY", "VN", "TH", "ID", "HK", "JP", "CN", "US", "RU"],
    description:
      "Kleannara, an established Korean paper and hygiene manufacturer, is preparing the first cross-border retail push of its organic-cotton sanitary pad line. The brand competes on skin-safe organic cotton, low-irritation materials and quality control after domestic scares raised demand for 'clean' pads. Prior overseas activity is limited to early baby-diaper and wipe shipments into a couple of Asian ports. The team must choose one lead export market to concentrate listings, localization and marketing spend, across mature developed markets and fast-growing Asian e-commerce regions where Korean hygiene / K-beauty affinity is rising.",
  },
  {
    slug: "bt50-native", productName: "Native Deodorant", category: "beauty",
    originatingCountry: "US", basePriceCents: 1300, asOfDate: "2021-03-31", actual: "CA",
    candidateCountries: ["CA", "GB", "AU", "DE", "FR", "MX", "IE", "NZ", "SG", "AE"],
    description:
      "Native is a US-founded (San Francisco, 2015) natural personal-care brand built as a direct-to-consumer deodorant label, later expanding into body wash, bar soap, toothpaste and haircare. Acquired by a major CPG parent in 2017, it scaled on a clean-ingredient, aluminum-free positioning with strong online reach and, more recently, US mass-retail placement. As of early 2021 it sells almost entirely inside the US and is weighing its first structured overseas retail entry. Buyer base skews young, English-speaking, clean-beauty-oriented; cross-border demand signals latent appetite. The decision: one first international market to anchor a durable retail beachhead.",
  },
  {
    slug: "bt50-celsius", productName: "Celsius Fitness Energy Drink", category: "beverage",
    originatingCountry: "US", basePriceCents: 200, asOfDate: "2009-01-15", actual: "SE",
    candidateCountries: ["SE", "GB", "DE", "CA", "AU", "JP", "KR", "AE", "NL", "FR"],
    description:
      "Celsius is a Boca Raton, Florida beverage maker (founded 2004) selling a 'better-for-you' functional energy drink positioned around thermogenic, calorie-burning, fitness-lifestyle claims rather than sugar-heavy incumbents. As of early 2009 the company is small, US-focused and unprofitable, with distribution concentrated in domestic grocery, drug and fitness channels. Management is weighing its first international expansion across mature European energy-drink markets, wellness-forward Northern European consumers, English-speaking Anglosphere markets, and Asian/Gulf growth markets. No overseas market has yet been entered; the question is which first market yields durable traction.",
  },
  {
    slug: "bt50-pocky", productName: "Glico Pocky biscuit sticks", category: "food",
    originatingCountry: "JP", basePriceCents: 100, asOfDate: "1968-03-31", actual: "TH",
    candidateCountries: ["TH", "HK", "SG", "MY", "PH", "ID", "TW", "KR", "US", "VN"],
    description:
      "Ezaki Glico, an Osaka confectioner, has built a strong domestic base on its chocolate-coated biscuit-stick line (Pocky, 1966) and salted stick (Pretz). In 1967 it ran a limited product launch in Hong Kong to probe demand for its stick snacks outside Japan. Encouraged, management now wants to commit its first postwar overseas production-and-sales subsidiary somewhere in the Asia-Pacific region and is researching candidate markets. Key screens: chocolate's poor heat tolerance in tropical climates, political/economic stability, distribution feasibility, purchasing power for affordable confectionery, and room to re-export to neighbors.",
  },
  {
    slug: "bt50-bulkhomme", productName: "Bulk Homme men's skincare", category: "beauty",
    originatingCountry: "JP", basePriceCents: 2000, asOfDate: "2016-12-31", actual: "TW",
    candidateCountries: ["TW", "CN", "KR", "HK", "SG", "TH", "US", "GB", "FR", "AU"],
    description:
      "Bulk Homme is a Tokyo-based men's skincare startup founded in 2013, built around a small premium range (face wash, toner, moisturizer) sold direct-to-consumer and through select retail in Japan. Its stated ambition is to become the world's No.1 men's-skincare brand, so an overseas move is now on the table. As of end-2016 the brand has proven demand at home, a lean e-commerce operating model, and strong inbound tourist interest, and has just shown at a major Hong Kong beauty exhibition. It must choose its first export market for a cross-border e-commerce launch, balancing 'made-in-Japan' quality demand, logistics feasibility, and a beachhead for wider expansion.",
  },
  {
    slug: "bt50-kratingdaeng", productName: "Krating Daeng energy drink", category: "beverage",
    originatingCountry: "TH", basePriceCents: 30, asOfDate: "1981-12-15", actual: "SG",
    candidateCountries: ["SG", "HK", "MY", "PH", "ID", "TW", "JP", "KR", "VN", "MM"],
    description:
      "A Bangkok-made non-carbonated caffeine-and-taurine tonic drink, launched domestically in 1976 by pharmacist-entrepreneur Chaleo Yoovidhya's T.C. Pharmaceutical. By late 1981 it is a runaway domestic hit among truck drivers, laborers, farmers and shift workers, sold cheaply in small brown glass bottles. Facing rising competition from Japanese and Korean tonic-drink imports at home, the maker is preparing its first overseas push into nearby Asian markets where similar sweet caffeinated tonics already sell well. The company must pick which regional market to enter first. No overseas track record yet exists.",
  },
  {
    slug: "bt50-irvins", productName: "IRVINS Salted Egg snacks", category: "food",
    originatingCountry: "SG", basePriceCents: 1000, asOfDate: "2017-12-31", actual: "HK",
    candidateCountries: ["HK", "MY", "TH", "VN", "PH", "ID", "TW", "CN", "AE", "US"],
    description:
      "IRVINS is a Singapore snack brand founded in 2016 out of a zi char eatery, selling salted egg fish skin and potato chips that became a viral domestic hit. By late 2017 the product commands snaking queues at its Singapore outlets and strong social-media buzz, but the company has no physical presence outside Singapore yet. Management is weighing its first overseas market to capitalize on regional demand for salted egg flavors. Key considerations: proximity, snack-retail culture, mall/foot-traffic density, tourist gifting demand, ease of cross-border food import, and diaspora familiarity. The brand must pick one launch market for its inaugural international store.",
  },
  {
    slug: "bt50-oishi", productName: "Oishi prawn crackers (Liwayway)", category: "food",
    originatingCountry: "PH", basePriceCents: 30, asOfDate: "1992-12-31", actual: "CN",
    candidateCountries: ["CN", "VN", "TH", "ID", "MY", "SG", "HK", "MM", "US", "JP"],
    description:
      "Liwayway Marketing Corporation, a Manila-based family snack maker founded in 1946, launched its Oishi brand of prawn crackers and Kirei flakes in 1974 after importing Japanese processing equipment. By the early 1990s Oishi is a leading Philippine snack brand, holding a dominant share of the domestic salty-snacks category and competing directly with Universal Robina's Jack 'n Jill. Chairman Carlos Chan, facing intense local competition and slowing domestic growth, is weighing the company's first overseas manufacturing venture. The firm has no export operations yet and must choose a single first market in which to lease facilities and localize its prawn-cracker line.",
  },
  {
    slug: "bt50-oldtown", productName: "OldTown White Coffee 3-in-1", category: "beverage",
    originatingCountry: "MY", basePriceCents: 350, asOfDate: "1999-12-31", actual: "SG",
    candidateCountries: ["SG", "TH", "ID", "HK", "TW", "CN", "PH", "AU", "GB", "AE"],
    description:
      "OldTown, founded 1999 in Ipoh, Perak, has just commercialized an instant 3-in-1 white coffee mix based on a traditional Ipoh kopitiam recipe. The product targets the domestic Malaysian retail sector as a convenient, shelf-stable take on the local white-coffee style. With the home market established, the founders are weighing which nearby overseas market to enter first for the packaged instant mix. No cafe/franchise business exists yet; the brand is purely a packaged-goods player at this decision point, evaluating a first export beachhead among regional and diaspora-heavy markets.",
  },
  {
    slug: "bt50-indomie", productName: "Indomie Mi Goreng (Indofood)", category: "food",
    originatingCountry: "ID", basePriceCents: 15, asOfDate: "1987-12-31", actual: "NG",
    candidateCountries: ["NG", "GH", "SA", "EG", "MY", "AE", "KE", "ZA", "PH", "AU"],
    description:
      "Indomie is an Indonesian instant-noodle brand (launched 1972 by what becomes Indofood); its fried-noodle Mi Goreng variant debuted in 1982. Through the mid-1980s the brand has moved beyond domestic dominance into exports, establishing footholds in neighboring Southeast Asian markets and beginning to reach the Middle East. Management is weighing where to concentrate its next major overseas push: a market large and fast-growing enough to justify a dedicated distribution partnership and, eventually, local production. Instant noodles are cheap, shelf-stable and well-suited to price-sensitive, carbohydrate-oriented, urbanizing populations. Which candidate market can absorb the product at scale and sustain long-term demand?",
  },
  {
    slug: "bt50-anker", productName: "Anker charging accessories", category: "electronics",
    originatingCountry: "CN", basePriceCents: 4500, asOfDate: "2011-12-01", actual: "US",
    candidateCountries: ["US", "GB", "DE", "JP", "FR", "CA", "AU", "IN", "BR", "RU"],
    description:
      "A newly founded Shenzhen consumer-electronics startup led by a former Google software engineer, targeting high-quality, affordable mobile-power and charging accessories. Its initial catalog centers on replacement laptop batteries, with a planned pivot toward portable power banks and USB wall/car chargers. The founder has no domestic retail distribution or brand recognition and intends to reach consumers almost entirely through cross-border e-commerce marketplaces rather than physical retail. The core question: which single overseas market should the brand prioritize first to build reviews, ranking and repeat demand for an unknown Chinese accessories label sold online?",
  },
  {
    slug: "bt50-tonys", productName: "Tony's Chocolonely chocolate", category: "food",
    originatingCountry: "NL", basePriceCents: 500, asOfDate: "2015-03-31", actual: "US",
    candidateCountries: ["US", "DE", "GB", "BE", "FR", "SE", "DK", "CA", "AU", "JP"],
    description:
      "Amsterdam-founded impact chocolate maker (est. 2005), built on a mission to end forced/child labor in cocoa. After a decade selling almost exclusively in its home market, the brand has scaled to roughly EUR 17M in annual sales and about 5% share of the Dutch chocolate market by 2014, riding strong word-of-mouth and a distinctive unequally-divided bar. Production capacity and brand awareness are now large enough that leadership is weighing its first international market. The company is a mid-size, mission-driven D2C-leaning FMCG player, not a global confectioner, and no overseas market has yet been chosen.",
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
  console.log(`Seeding ${BRANDS.length} batch-2 backtest projects\n`);
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
      console.log(`✓ ${brand.slug} exists: ${id.slice(0, 8)}`);
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
      console.log(`+ ${brand.slug} created: ${id.slice(0, 8)} (${brand.originatingCountry}→${brand.actual})`);
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

/**
 * Prospective validation cohort — seed 15 real brands that are AT the overseas-
 * expansion decision point NOW (2026-07). We run live sims to freeze a
 * prediction, then re-check the actual market in 3-6 / 12 months.
 *
 * This is the live counterpart to the N=20 hindsight backtest: it validates the
 * LIVE-only signals (search demand, TikTok, Baidu, GTM discovery) which the
 * backtest can't. Candidate markets are a region-relevant shortlist of the 24
 * supported markets (origin excluded). Predictions are frozen in the ensembles
 * table + the pre-registration doc.
 *
 * Run:  npx tsx --env-file=.env.local scripts/prospective-cohort-seed.ts
 */
import { createClient } from "@supabase/supabase-js";

const TARGET_WORKSPACE = "0c8e774f-356a-4bf2-ba3d-8bfb41e6d019";

const BRANDS = [
  { slug: "pval-front2line", productName: "FRONT2LINE apparel", category: "fashion", originatingCountry: "KR", basePriceCents: 9000, candidateCountries: ["JP","TW","US","DE","FR","SG","TH"],
    description: "A Korean contemporary fashion / apparel brand building an international presence. Design-led, premium-but-accessible positioning, strong in Korea and now weighing which overseas market to anchor next. Open question: which single market should lead the international push and prove durable." },
  { slug: "pval-lemouton", productName: "Le Mouton shoes", category: "fashion", originatingCountry: "KR", basePriceCents: 15000, candidateCountries: ["JP","TW","DE","FR","US","SG"],
    description: "A Korean premium footwear (shoes) brand that has begun entering Japan and is deciding where to expand next. Craft-quality, design-forward positioning. Open question: which market becomes the largest sustained overseas market — Japan (already begun) or another." },
  { slug: "pval-torriden", productName: "Torriden skincare", category: "beauty", originatingCountry: "KR", basePriceCents: 2500, candidateCountries: ["US","JP","CN","TW","SG","TH","VN","ID"],
    description: "A Korean skincare brand known for its cica / Dive-In hydration line, mass-premium K-beauty positioning, expanding via cross-border e-commerce and retail. Deciding which overseas market to concentrate on." },
  { slug: "pval-srichand", productName: "Srichand cosmetics", category: "beauty", originatingCountry: "TH", basePriceCents: 1500, candidateCountries: ["ID","MY","SG","PH","VN","CN","JP","AE"],
    description: "A heritage Thai cosmetics brand (translucent powder roots) modernized for younger consumers, planning Southeast-Asia-first international expansion. Deciding the first anchor market abroad." },
  { slug: "pval-you-beauty", productName: "Y.O.U Beauty", category: "beauty", originatingCountry: "ID", basePriceCents: 800, candidateCountries: ["MY","PH","SG","TH","VN","SA","AE","IN"],
    description: "An Indonesian mass-market beauty brand (skincare + makeup) with strong local traction, targeting international / regional expansion. Deciding the first overseas market." },
  { slug: "pval-kopikenangan", productName: "Kopi Kenangan coffee", category: "beverage", originatingCountry: "ID", basePriceCents: 250, candidateCountries: ["MY","SG","PH","TH","TW","AE","SA","IN"],
    description: "An Indonesian tech-enabled coffee chain unicorn, planning international expansion (Malaysia, Taiwan, and GCC markets cited). Deciding which market becomes the largest sustained overseas presence." },
  { slug: "pval-buttonscarves", productName: "Buttonscarves modest fashion", category: "fashion", originatingCountry: "ID", basePriceCents: 4000, candidateCountries: ["MY","SG","SA","AE","GB","US","BR"],
    description: "An Indonesian modest-fashion / lifestyle brand (scarves, bags, apparel) expanding regionally (Singapore launched), aiming for global modest-fashion leadership. Deciding the next anchor market." },
  { slug: "pval-cocoon", productName: "Cocoon vegan beauty", category: "beauty", originatingCountry: "VN", basePriceCents: 1200, candidateCountries: ["JP","KR","US","FR","DE","SG","TH","GB"],
    description: "A Vietnamese vegan / cruelty-free beauty brand with local ingredients, beginning international expansion (Europe / Japan entries). Deciding which market becomes the durable overseas anchor." },
  { slug: "pval-congcaphe", productName: "Cong Caphe coffee", category: "beverage", originatingCountry: "VN", basePriceCents: 300, candidateCountries: ["KR","JP","US","SG","MY","AU","CA","TW"],
    description: "A Vietnamese coffee-chain brand with a distinctive retro-military aesthetic, early international expansion (Korea, Malaysia, Canada entries). Deciding the largest sustained overseas market." },
  { slug: "pval-littleears", productName: "Little Ears", category: "other", originatingCountry: "TW", basePriceCents: 2000, candidateCountries: ["SG","MY","JP","US","CN","TH","VN","AU"],
    description: "A Taiwanese consumer brand planning overseas expansion with Singapore and Malaysia cited as early targets. Deciding the first anchor market abroad. (Category to be confirmed.)" },
  { slug: "pval-mosaicwellness", productName: "Mosaic Wellness", category: "health", originatingCountry: "IN", basePriceCents: 1500, candidateCountries: ["US","GB","AE","SA","SG","AU","CA","MY"],
    description: "An Indian digital-first health & wellness house (men's / women's health brands) recently funded, eyeing international expansion. Deciding the first overseas market." },
  { slug: "pval-atomgrid", productName: "Atomgrid", category: "beauty", originatingCountry: "IN", basePriceCents: 1200, candidateCountries: ["US","GB","AE","SG","MY","AU","SA","DE"],
    description: "An Indian science-led beauty / personal-care brand (recently funded), planning international expansion. Deciding the first anchor market abroad." },
  { slug: "pval-ysebeauty", productName: "YSE Beauty", category: "beauty", originatingCountry: "US", basePriceCents: 3000, candidateCountries: ["GB","CA","AU","JP","KR","SG","DE","FR"],
    description: "A US skincare brand (recently raised Series A) expanding internationally beyond its home market. Deciding which overseas market to anchor first." },
  { slug: "pval-sisi", productName: "SISI skincare", category: "beauty", originatingCountry: "JP", basePriceCents: 2800, candidateCountries: ["US","CN","TW","KR","SG","TH","VN","GB"],
    description: "A Japanese skincare brand (well-funded) making its first overseas expansion. Deciding the first anchor market abroad." },
  { slug: "pval-ieva", productName: "Ieva Group beauty", category: "beauty", originatingCountry: "FR", basePriceCents: 3500, candidateCountries: ["US","GB","DE","IT","ES","JP","CN","AE"],
    description: "A French beauty-tech group generating most revenue in France, planning US / international expansion. Deciding the first major overseas market." },
] as const;

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const { data: owner } = await sb
    .from("workspace_members").select("user_id")
    .eq("workspace_id", TARGET_WORKSPACE).eq("role", "owner").limit(1).single();
  if (!owner) { console.error("no owner"); process.exit(1); }
  const runs: string[] = [];
  for (const b of BRANDS) {
    const { data: existing } = await sb.from("projects").select("id")
      .eq("workspace_id", TARGET_WORKSPACE).eq("product_name", b.productName)
      .limit(1).maybeSingle();
    let id = existing?.id as string | undefined;
    if (!id) {
      const { data: created, error } = await sb.from("projects").insert({
        workspace_id: TARGET_WORKSPACE, created_by: owner.user_id,
        name: b.productName, product_name: b.productName,
        category: b.category, description: b.description,
        base_price_cents: b.basePriceCents, currency: "USD", objective: "expansion",
        originating_country: b.originatingCountry,
        candidate_countries: b.candidateCountries,
        competitor_urls: [], asset_descriptions: [], asset_urls: [], status: "draft",
      }).select("id").single();
      if (error || !created) { console.error(`${b.slug} failed`, error?.message); continue; }
      id = created.id as string;
      console.log(`+ ${b.slug} ${id.slice(0,8)} (${b.originatingCountry}, ${b.candidateCountries.length} markets)`);
    } else console.log(`= ${b.slug} exists ${id.slice(0,8)}`);
    runs.push(`${id.slice(0,8)}|${b.originatingCountry}|${b.productName}`);
  }
  console.log("\n=== RUN PREFIXES ===");
  runs.forEach((r) => console.log(r));
}
main().catch((e) => { console.error(e); process.exit(1); });

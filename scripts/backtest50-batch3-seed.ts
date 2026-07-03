/**
 * N=20 backtest — BATCH 3: 2 in-scope replacements for the out-of-scope
 * fixtures (Celsius→SE, Indomie→NG whose sustained markets fall outside the
 * 24 supported markets). Both replacements have in-scope outcomes.
 * Run:  npx tsx --env-file=.env.local scripts/backtest50-batch3-seed.ts
 */
import { createClient } from "@supabase/supabase-js";

const TARGET_WORKSPACE = "0c8e774f-356a-4bf2-ba3d-8bfb41e6d019";

const BRANDS = [
  {
    slug: "bt50-shakeshack", productName: "Shake Shack burgers", category: "food",
    originatingCountry: "US", basePriceCents: 475, asOfDate: "2010-11-15", actual: "AE",
    candidateCountries: ["AE", "SA", "GB", "JP", "KR", "SG", "HK", "AU", "MX", "CN"],
    description:
      "A New York City fast-casual burger brand born as a Madison Square Park hot-dog cart (2001) and permanent kiosk (2004), built around the ShackBurger, crinkle-cut fries, and frozen custard. As of late 2010 it operates a small but cult-followed US footprint (NYC plus early East Coast expansion) with long lines, strong press, and premium-but-accessible pricing. Management is now weighing its first move outside the US via a licensing partner. The brand skews urban, aspirational, and 'modern roadside American', appealing to affluent, brand-conscious, mall-going consumers and tourists. Open question: which single overseas market should anchor the international launch and prove durable.",
  },
  {
    slug: "bt50-kopiko", productName: "Kopiko Brown 3-in-1 Coffee", category: "beverage",
    originatingCountry: "ID", basePriceCents: 180, asOfDate: "2006-03-31", actual: "PH",
    candidateCountries: ["PH", "TH", "VN", "SG", "HK", "TW", "MY", "SA", "AE", "KR"],
    description:
      "Kopiko, PT Mayora Indah's coffee-candy brand born in Indonesia in 1982, has spent two decades building distribution across Southeast Asia and is now extending the name into instant 3-in-1 sachet coffee for overseas markets. As of early 2006 the brand is a confectionery-led player with strong regional shelf presence but no leadership position in any foreign instant-coffee category. Incumbent multinationals and established local roasters dominate every candidate market's crowded 3-in-1 segment, where price, sachet format, and taste positioning decide share. Mayora must pick one first market to concentrate marketing and trade spend behind the coffee line.",
  },
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
  for (const brand of BRANDS) {
    const { data: existing } = await sb.from("projects").select("id")
      .eq("workspace_id", TARGET_WORKSPACE).eq("product_name", brand.productName)
      .limit(1).maybeSingle();
    let id = existing?.id as string | undefined;
    if (!id) {
      const { data: created, error } = await sb.from("projects").insert({
        workspace_id: TARGET_WORKSPACE, created_by: owner.user_id,
        name: brand.productName, product_name: brand.productName,
        category: brand.category, description: brand.description,
        base_price_cents: brand.basePriceCents, currency: "USD", objective: "expansion",
        originating_country: brand.originatingCountry,
        candidate_countries: brand.candidateCountries,
        competitor_urls: [], asset_descriptions: [], asset_urls: [], status: "draft",
      }).select("id").single();
      if (error || !created) { console.error(`${brand.slug} failed`, error); continue; }
      id = created.id as string;
      console.log(`+ ${brand.slug} created: ${id.slice(0, 8)} (${brand.originatingCountry}->${brand.actual})`);
    } else console.log(`= ${brand.slug} exists ${id.slice(0, 8)}`);
    runs.push(`${id.slice(0, 8)}|${brand.asOfDate}|${brand.originatingCountry}|${brand.actual}|${brand.slug}`);
  }
  console.log("\n=== RUN LINES ===");
  runs.forEach((r) => console.log(r));
}
main().catch((e) => { console.error(e); process.exit(1); });

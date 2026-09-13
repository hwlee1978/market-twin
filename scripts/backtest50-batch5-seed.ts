/**
 * N=50 cross-origin backtest — BATCH 5 (6 brands, 4 origin countries).
 * Extends the scored corpus from N=36 toward N=42.
 *
 * Ground truth (`actual`) = FIRST SUSTAINED major overseas market
 * (revenue + longevity), not first-entered. Same rule set as batch 4:
 *
 *   Rule 8 — at `asOfDate` the brand had NO overseas operations, and its
 *            first overseas entry IS the sustained market.
 *   Rule 9 — no single answer country exceeds 20% of the combined corpus.
 *
 * This batch was researched under a hard **anti-concentration brief**: the
 * 36-fixture corpus already carried US 7 / JP 5 / SG 4 / CA 3 / TW 3 / CN 3
 * and had ZERO fixtures answering DE, FR, IT, ES, SA, AU, IN or BR. Every
 * brand below was selected to fill one of the empty answer countries
 * (AU x2, ES x2, DE, SA) — no US or JP answers were added. Origins are
 * likewise new to the corpus (NZ, PT, NL, AE), and categories lean away
 * from the oversubscribed food/beauty/beverage block (saas x3, fashion x2,
 * toys x1).
 *
 * NOTE on origin scope: NZ and PT are not among the 24 supported answer
 * markets. That is fine — the scope rule constrains the ANSWER and the
 * candidate list, not the origin (cf. Pandora/DK in the batch-4 research
 * queue). Every `actual` and every `candidateCountries` entry here is
 * inside the 24.
 *
 * Descriptions are decision-point vintage (hindsight-clean): domestic
 * position, product, price tier, channel and marketing only. No post-entry
 * facts, awards or overseas outcomes.
 *
 * Researched this pass and REJECTED (do NOT re-add without new evidence):
 *   simultaneous multi-country entry (no single "first" market)
 *     — Camper (ES): Paris, Milan and London all opened in 1992.
 *     — Mavi Jeans (TR): "Mavi US and Europe were founded" in the same year
 *       (1996); the North American entity was Vancouver-based, so neither a
 *       DE nor a US label is defensible.
 *   first sustained market out of scope / banned answer
 *     — Le Pain Quotidien (BE): first store outside Belgium was New York
 *       1997 → US, which is at the concentration cap.
 *     — Blackmores (AU): first overseas markets were Singapore/Malaysia in
 *       1976, i.e. decision point far before 1990.
 *   unresolved after research (evidence contradicts itself)
 *     — Kiko Milano (IT): the priority ES lead did not hold. Secondary
 *       sources put France at 2010 and list Portugal alongside it in the
 *       2010-2015 wave; it.wikipedia gives no first-foreign-country at all.
 *       Portugal is out of scope, so the label cannot be fixed either way.
 *     — Havanna (AR): Brazil is unambiguously the largest overseas market
 *       (176 of 212 foreign stores) but sources split between a 2001 and a
 *       2006 São Paulo entry, and the 2003 franchise wave (Paraguay, Chile,
 *       Venezuela, Spain) may predate it → rule 8 cannot be verified.
 *     — Simit Sarayı (TR): Netherlands 2010 (Utrecht) is reported as the
 *       first store abroad, but durability of that market could not be
 *       confirmed and the en.wikipedia page did not resolve.
 *     — Aperol (IT→DE), Pandora (DK→US), FARM Rio (BR→US), Samyang Buldak
 *       (KR→CN): carried over unresolved/deprioritised from batch 4.
 *   too thin at the decision point to describe honestly
 *     — Vinted (LT): Germany (Kleiderkreisel) is the first foreign market,
 *       but the entry happened in 2009 when the company was ~6 months old
 *       and had no describable domestic position.
 *
 * Run:  npx tsx --env-file=.env.local scripts/backtest50-batch5-seed.ts
 */
import { createClient } from "@supabase/supabase-js";

const TARGET_WORKSPACE = "0c8e774f-356a-4bf2-ba3d-8bfb41e6d019";

const BRANDS = [
  // ── NZ origin → AU (answer country previously EMPTY) ─────────────────
  {
    // Sources: xero.com/au/media/factsheet (founded 2006, NZX listing June
    //   2007, ASX listing Nov 2012); en.wikipedia.org/wiki/Xero_(company)
    //   (founded 2006-07-06 Wellington by Rod Drury and Hamish Edwards;
    //   NZX IPO June 2007 raising NZ$15m; >1m ANZ subscribers by 2018);
    //   brandhistories.com/xero/company-history ("in 2008 Xero opened
    //   offices in Australia and the United Kingdom… Australia soon became
    //   Xero's largest market").
    //   CAVEAT: Australia and the UK were both entered in 2008, so "first"
    //   is not strictly separable. The label rests on the second half of
    //   the rule — Australia is by a wide margin the first SUSTAINED
    //   MAJOR/largest overseas market and has never been exited. Medium
    //   confidence on ordering, high confidence on the country.
    slug: "bt50-xero", productName: "Xero cloud accounting", category: "saas",
    originatingCountry: "NZ", basePriceCents: 3500, asOfDate: "2007-12-31", actual: "AU",
    candidateCountries: ["AU", "GB", "US", "CA", "SG", "MY", "IN", "DE", "NL", "AE"],
    description:
      "Xero is a New Zealand software company founded in Wellington in 2006 to rebuild small-business accounting as a browser-based service rather than a desktop package. Its design premise is a single always-on ledger shared by the business owner and their accountant, fed by automatic daily bank and credit-card feeds so the books are reconciled continuously instead of at year end. It is sold as a flat monthly subscription per business with unlimited users, no licences, no installs and no version upgrades, which positions it against entrenched desktop incumbents that charge per seat and per annual release. Distribution runs largely through a partner programme of accounting and bookkeeping practices that recommend, resell and support the product to their own client books. It listed on the New Zealand Exchange in June 2007, raising NZ$15 million as one of the first cloud software companies on that market. Marketing is online content, community and accountant roadshows rather than paid mass media. Its entire customer base is in New Zealand and it is choosing a first market abroad.",
  },
  {
    // Sources: theregister.co.nz / retail.kiwi "The evolution of Pumpkin
    //   Patch" ("by 1994 Pumpkin Patch had headed into Australia as a mail
    //   order catalogue, opening its first Australian store three years
    //   later" = 1997); en.wikipedia.org/wiki/Pumpkin_Patch_(retailer)
    //   (founded 1990 by Sally Synnott as a mail-order catalogue; 48 NZ
    //   stores in 2010; UK 2000, US 2004); fashionbrandingrmit / NZ Herald
    //   ("Australia — their most retail stores"). Australia was the first
    //   and the biggest overseas market and ran ~22 years; the UK and US
    //   are the exit cases (closed 2011), not this one.
    slug: "bt50-pumpkinpatch", productName: "Pumpkin Patch children's clothing", category: "fashion",
    originatingCountry: "NZ", basePriceCents: 2000, asOfDate: "1993-12-31", actual: "AU",
    candidateCountries: ["AU", "GB", "US", "CA", "SG", "JP", "MY", "AE", "ID", "TH"],
    description:
      "Pumpkin Patch is a New Zealand children's clothing brand started in Auckland in 1990 by a former childrenswear buyer who judged that local parents were choosing between cheap chainstore basics and expensive imported labels with nothing designed in between. It designs its own range in-house — bright prints, coordinated tops-and-bottoms outfits and playwear built to survive wear and washing, in baby-to-early-school sizes — and has it made to order offshore rather than buying in other labels. The business began as a mail-order catalogue posted to a house list of parents, which lets it show complete coordinated looks and sell nationally without a store network; strong catalogue response then justified opening retail stores. Prices sit above supermarket and discount chainstore childrenswear but below imported designer kidswear. There is no mass advertising: the catalogue itself, its photography and word of mouth among mothers do the work. It trades only in New Zealand and is looking at taking the catalogue into a market abroad.",
  },

  // ── PT origin → ES (answer country previously EMPTY) ─────────────────
  {
    // Sources: pt.wikipedia.org/wiki/Science4you_S.A. (founded January 2008
    //   by Miguel Pina Martins with FCUL; started selling in Portugal late
    //   2008; "October 2009 — entered Spain market"; Angola/Brazil Sept
    //   2010; first subsidiary Madrid June 2011; second subsidiary London
    //   Jan 2013); academia.edu case study "Science4You: Expanding the
    //   internationalization plan in Spain" (Spain is the first
    //   international market, sales from 2009, Madrid subsidiary 2011,
    //   "Spain still represents the second biggest market after Portugal");
    //   eib.org 2017 press release (Portuguese toy company profile).
    slug: "bt50-science4you", productName: "Science4you educational science kits", category: "toys",
    originatingCountry: "PT", basePriceCents: 2500, asOfDate: "2009-06-30", actual: "ES",
    candidateCountries: ["ES", "FR", "GB", "IT", "DE", "NL", "BR", "MX", "US", "AE"],
    description:
      "Science4you is a Portuguese educational-toy maker founded in Lisbon in January 2008 by a business graduate in partnership with the Faculty of Sciences of the University of Lisbon, which develops and validates the scientific content of every product. It sells boxed experiment kits for children roughly four to twelve — chemistry sets, perfume and soap making, crystal growing, dinosaur excavation — each pairing the physical materials with a printed educational booklet, so the product is positioned as a learning tool parents can justify rather than as a novelty. Retail prices sit in the accessible gift range of about EUR 15-30. It began selling in Portugal at the end of 2008 through toy specialists, hypermarkets and department-store toy departments, and supplements product sales with science birthday parties and school workshops that double as sampling. Marketing is education-press and school-channel led rather than paid advertising. The company is young, small and trades only in Portugal, and is preparing its first sales abroad.",
  },
  {
    // Sources: saberviver.pt / grokipedia "Parfois" ("began its
    //   internationalization in 2002 with the opening of its first stores
    //   in Spain and first franchised spaces in Saudi Arabia");
    //   en.wikipedia.org/wiki/Parfois (founded 1994 in Porto by Manuela
    //   Medeiros; 365 stores in Spain as of 2023; 1,000th store Paris 2019);
    //   marketeer.sapo.pt profile of Manuela Medeiros (Rua de Santa
    //   Catarina first store, second store in Gaia, franchising model).
    //   CAVEAT: Spain and the first Saudi franchise spaces both date to
    //   2002, so the two entries are simultaneous. Spain is labelled
    //   because it is unambiguously the sustained MAXIMUM overseas market
    //   (own-store operation, several hundred stores, second only to
    //   Portugal), while the Saudi entry was a small franchise partnership.
    slug: "bt50-parfois", productName: "Parfois fashion accessories", category: "fashion",
    originatingCountry: "PT", basePriceCents: 1500, asOfDate: "2001-12-31", actual: "ES",
    candidateCountries: ["ES", "FR", "IT", "GB", "DE", "NL", "SA", "AE", "BR", "MX"],
    description:
      "Parfois is a Portuguese fashion-accessories retailer founded in 1994 on Rua de Santa Catarina in Porto by a former buyer who had seen accessories-only shops while travelling in England and found nothing equivalent at home. It sells handbags, costume jewellery, scarves, belts, hair accessories and sunglasses — no clothing — at impulse price points, with the assortment designed in-house in Porto and sourced from external manufacturers so that collections can be refreshed continuously rather than seasonally. The proposition is that a shopper can restyle an existing wardrobe cheaply and often, which makes newness and turnover more important than any single hero product. Growth has come from company-owned stores in shopping centres plus a franchising model that let the brand reach secondary Portuguese cities quickly. There is effectively no advertising budget; the stores, their windows and their high-street and mall siting are the marketing. It trades only in Portugal and is preparing its first openings abroad.",
  },

  // ── NL origin → DE (answer country previously EMPTY) ─────────────────
  {
    // Sources: ecommercenews.eu "Dutch online supermarket Picnic expands to
    //   Germany" (March 2018 — launch "next month" from Neuss; Kaarst,
    //   Neuss, Meerbusch and Oberkassel the first German areas; Picnic
    //   launched 2015 after three years of preparation, ~30 Dutch cities,
    //   free delivery above a EUR 25 minimum, EUR 100m raised March 2017);
    //   retaildetail.eu "Picnic confirms German arrival" (described as the
    //   first step in internationalising the concept); freshplaza /
    //   ecommercenews.eu follow-ups (Germany profitable in two cities, then
    //   the primary growth market). Netherlands-only at the decision point;
    //   Germany has never been exited and is now its largest market outside
    //   the Netherlands. France came years later.
    //   CAVEAT on category: "saas" is used the way it is for Nubank in
    //   batch 4 — Picnic is an app-ordered service business with no clean
    //   HS-code grounding. A "food" label would ground on grocery trade
    //   flows that do not drive this decision.
    slug: "bt50-picnic", productName: "Picnic online supermarket", category: "saas",
    originatingCountry: "NL", basePriceCents: 2900, asOfDate: "2017-12-31", actual: "DE",
    candidateCountries: ["DE", "GB", "FR", "ES", "IT", "US", "CA", "AU", "JP", "BR"],
    description:
      "Picnic is a Dutch online-only supermarket launched in 2015 in Amersfoort after three years of development. It has no stores and no website checkout for walk-in traffic: customers order entirely through its app, and orders are delivered on fixed daily routes by small electric vans in twenty-minute windows, a deliberately revived milkman model in which the company enters one neighbourhood at a time and only once it has enough households on that route to fill it. Delivery is free above a EUR 25 minimum order and the company guarantees the lowest price in the market, matching the supermarket chains' own weekly promotional flyers — a combination it can afford precisely because route density and a narrow curated assortment strip out store and picking costs. It now serves roughly thirty Dutch cities and raised EUR 100 million in March 2017 to keep building distribution capacity. Growth is driven by per-postcode waiting lists and word of mouth rather than mass advertising. It is preparing its first launch outside the Netherlands.",
  },

  // ── AE origin → SA (answer country previously EMPTY) ─────────────────
  {
    // Sources: wamda.com/2013/09/uber-vs-careem-dubai-saudi-arabia ("after
    //   testing in Doha and launching in beta in Riyadh… Jeddah and Dammam
    //   next year"; STC Ventures' USD 1.7m investment Sept 2013 to fund the
    //   Saudi push); gulfbusiness.com (Careem founded Dubai 2012 as a
    //   website-based corporate car-booking service; 2013 first mobile app
    //   and expansion to Riyadh/Saudi Arabia — its first market outside the
    //   UAE); arabianbusiness.com / uaestartupstory.com (Saudi Arabia became
    //   a top market: 242m of Careem's first 1bn rides). Qatar was a test
    //   that Careem later exited entirely (Feb 2023), so Saudi Arabia is the
    //   sustained one. Pakistan, Egypt, Jordan and Iraq all come later.
    //   Pricing: 2013 regulation obliged it to charge ~30% above metered
    //   taxis; a Groupon promotion of the period valued a ride at AED 90.
    slug: "bt50-careem", productName: "Careem chauffeur car booking", category: "saas",
    originatingCountry: "AE", basePriceCents: 2400, asOfDate: "2013-03-31", actual: "SA",
    candidateCountries: ["SA", "IN", "PH", "ID", "MY", "SG", "TH", "VN", "GB", "US"],
    description:
      "Careem is a Dubai car-booking service started in 2012 by two former management consultants, built first as a website for corporate accounts that need reliable ground transport for staff and visitors and are billed monthly. Rides are taken in chauffeur-driven saloons and people-carriers supplied by licensed limousine operators rather than by a company-owned fleet, with drivers vetted, trained and English-speaking. Local regulation requires it to price meaningfully above metered street taxis, so it does not compete on fare: it sells booking certainty, a car that actually arrives at the time requested, a known driver and vehicle, card payment instead of cash, and live tracking of the vehicle — all weak points of the existing taxi system for business users. It is now extending the same service to individual riders through a mobile app and building out an operations team that can open a city quickly. It operates only in the United Arab Emirates and is choosing its first country abroad.",
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

  console.log(`Seeding ${BRANDS.length} batch-5 backtest projects → workspace ${TARGET_WORKSPACE.slice(0, 8)}\n`);
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

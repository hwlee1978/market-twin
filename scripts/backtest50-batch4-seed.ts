/**
 * N=50 cross-origin backtest — BATCH 4 (18 brands, 11 origin countries).
 * Extends the N=19 scored corpus toward N=37.
 *
 * Ground truth (`actual`) = FIRST SUSTAINED major overseas market
 * (revenue + longevity), not first-entered. Every fixture additionally
 * satisfies the two rules tightened during this batch:
 *
 *   Rule 8 — at `asOfDate` the brand had NO overseas operations, and its
 *            first overseas entry IS the sustained market. (This is why
 *            Uniqlo, Coway, Lock&Lock, 85C, Xiaomi, Taokaenoi and OPPO were
 *            researched but REJECTED: each was already trading abroad at the
 *            decision point, so the "domestic-only" premise of the
 *            description would have been false.)
 *   Rule 9 — no single answer country exceeds 20% of the combined corpus.
 *            With the existing 19 this lands at US 7/37 (18.9%) and
 *            JP 5/37 (13.5%). Moleskine (IT→US) was researched and verified
 *            but dropped solely to keep US under the cap.
 *
 * Descriptions are decision-point vintage (hindsight-clean): domestic
 * position, product, price tier, channel and marketing only. No post-entry
 * facts, awards or overseas outcomes.
 *
 * Rejected after research (do NOT re-add without new evidence):
 *   out-of-scope answer  — Rituals (BE), Dabur (NP/EG), Canada Goose (SE),
 *                          Swisse (NZ), Gong Cha (HK)
 *   decision point <1990 — Dyson (JP 1986), Pigeon (SG 1978), Starbucks
 *   no clean entry event — Gymshark, Royal Enfield, Secretlab, DJI
 *   unresolved answer    — Pandora, Kiko Milano, Samyang Buldak, Aperol
 *                          (DE vs AT), Havaianas, Aesop, TOUS, Chatime,
 *                          FARM Rio
 *
 * Run:  npx tsx --env-file=.env.local scripts/backtest50-batch4-seed.ts
 */
import { createClient } from "@supabase/supabase-js";

const TARGET_WORKSPACE = "0c8e774f-356a-4bf2-ba3d-8bfb41e6d019";

const BRANDS = [
  // ── JP / KR / TW origin ─────────────────────────────────────────────
  {
    // Sources: ja.wikipedia.org/wiki/ニトリ (first overseas store Kaohsiung,
    //   Taiwan 2007-05-12, still operating and expanded); Nitori Holdings
    //   corporate 沿革; ja.wikipedia (US entry 2013 → full withdrawal 2023-04,
    //   China from 2014) — confirms TW is the first and the sustained one.
    slug: "bt50-nitori", productName: "Nitori home furnishings", category: "home",
    originatingCountry: "JP", basePriceCents: 4500, asOfDate: "2007-03-31", actual: "TW",
    candidateCountries: ["TW", "CN", "KR", "SG", "MY", "TH", "US", "AU", "GB", "DE"],
    description:
      "Nitori is Japan's largest home-furnishings chain, founded in Sapporo in 1967 and built on a vertically integrated model: it designs its own furniture and household goods and has them made to its own cost targets rather than reselling other makers' lines. Stores merchandise complete room coordinations — sofas and beds alongside curtains, bedding, rugs and kitchenware — under an everyday-low-price promise summarized by its 'o-nedan ijou' (more than the price) tagline. It has posted an unbroken run of rising sales and profit since the late 1980s, expanding through large suburban roadside stores across Japan. Marketing is price-led flyer and TV advertising aimed at value-conscious households. With the domestic network maturing, management is preparing its first store outside Japan.",
  },
  {
    // Sources: SPC Group official 연혁 ("2004 상해 SPC 공장 준공 및 상해
    //   파리바게뜨 1호점 개설"); en.wikipedia.org/wiki/Paris_Baguette
    //   (leading Korean bakery chain by 2004). The 2002 US entity is a
    //   paper company with no stores, so CN 2004 is the first real entry
    //   and has run continuously since.
    slug: "bt50-parisbaguette", productName: "Paris Baguette bakery cafe", category: "food",
    originatingCountry: "KR", basePriceCents: 250, asOfDate: "2004-06-30", actual: "CN",
    candidateCountries: ["CN", "JP", "TW", "US", "VN", "SG", "TH", "ID", "MY", "PH"],
    description:
      "Paris Baguette is South Korea's leading bakery-cafe franchise, launched in 1988 out of the Shany baking business. It sells European-style breads, pastries and cakes in a bright neighborhood cafe format that pairs a bakery counter with seating and coffee. Goods are baked in-store from dough supplied by the company's own plants, which keeps quality consistent across a fast-growing franchise network that has made it the largest bakery chain in the country by store count. Pricing is mid-tier: a typical pastry runs KRW 1,500-3,000 and a whole cake KRW 20,000-30,000. Distribution is almost entirely domestic franchised stores in residential and transit locations. Marketing leans on store density, freshness claims and seasonal cake campaigns. Management is now planning a first overseas venture backed by its own production plant.",
  },
  {
    // Sources: en.wikipedia.org/wiki/Innisfree_(brand) (2011: 434 domestic
    //   stores, KRW 140.5bn revenue; first overseas flagship Shanghai
    //   2012-04-25); Amorepacific annual report. No overseas presence of any
    //   kind before the 2012 China flagship — the cleanest rule-8 fixture in
    //   this batch.
    slug: "bt50-innisfree", productName: "Innisfree naturalist cosmetics", category: "beauty",
    originatingCountry: "KR", basePriceCents: 1200, asOfDate: "2012-03-31", actual: "CN",
    candidateCountries: ["CN", "JP", "TW", "US", "SG", "TH", "VN", "MY", "ID", "PH"],
    description:
      "Innisfree is a Korean naturalist cosmetics brand launched in 2000 by Amorepacific as the group's first eco-conscious label. It is built on ingredients sourced from Jeju Island — green tea, volcanic clay, canola honey — with a clean, minimal design language and a return-and-recycle program for used containers. The range spans skincare, sheet masks and color cosmetics at an accessible mass tier, with hero SKUs around KRW 5,000-15,000. It sells through its own single-brand road shops, which reached 434 stores and KRW 140.5 billion in revenue in 2011, plus its own e-commerce site. Marketing pairs young celebrity models with a nature-and-sustainability narrative and heavy sampling. The brand has no stores outside Korea and is preparing its first international flagship.",
  },
  {
    // Sources: en.wikipedia.org/wiki/Din_Tai_Fung ("In 1996, the first
    //   international location opened in Tokyo", Takashimaya Shinjuku, still
    //   operating ~30 years later); company history (1958 cooking-oil shop →
    //   1972 restaurant conversion). US (Arcadia CA) and mainland China both
    //   come in 2000, after Japan.
    slug: "bt50-dintaifung", productName: "Din Tai Fung xiaolongbao", category: "food",
    originatingCountry: "TW", basePriceCents: 800, asOfDate: "1995-12-31", actual: "JP",
    candidateCountries: ["JP", "CN", "SG", "MY", "US", "TH", "ID", "KR", "PH", "AU"],
    description:
      "Din Tai Fung is a Taipei restaurant on Xinyi Road that began in 1958 as a cooking-oil retailer and converted fully to a dumpling house in 1972. Its reputation rests on one technical signature: xiaolongbao soup dumplings made to a fixed standard of folds and a precise gram weight, assembled in a glass-walled kitchen that passers-by can watch from the street. The menu is deliberately narrow — steamed dumplings, noodles, wontons and a few Shanghainese dishes — served in a small, queue-forming dining room at mid-market prices. It is effectively a single-location operation with no franchising, no branch network and no advertising; demand is driven by word of mouth and press notice. The owners are being approached about opening a first restaurant abroad with a partner.",
  },

  // ── GB / FR / SE origin ─────────────────────────────────────────────
  {
    // Sources: encyclopedia.com "Malone, Jo"; notablebiographies.com Jo
    //   Malone (Bergdorf Goodman Fifth Avenue store-in-store 1998, turned
    //   over $1m quickly; Neiman Marcus and Saks followed); Estée Lauder
    //   acquisition Oct 1999. US is both the first market entered and the
    //   one that scaled.
    slug: "bt50-jomalone", productName: "Jo Malone London cologne", category: "beauty",
    originatingCountry: "GB", basePriceCents: 6000, asOfDate: "1997-12-31", actual: "US",
    candidateCountries: ["US", "FR", "DE", "IT", "ES", "NL", "JP", "AE", "CA", "AU"],
    description:
      "Jo Malone is a London fragrance and bath brand founded by a facialist who began blending scents for her treatment clients. Its signature is simplicity: single-note or two-note colognes such as Lime Basil & Mandarin and Nutmeg & Ginger, presented in plain cream-and-black packaging with a grosgrain ribbon, and sold on the idea that scents should be layered and combined rather than worn alone. The range extends to bath oils, body cremes and candles. The business runs from one boutique on Walton Street, opened in 1994 and known for queues down the pavement, plus a treatment room and a mail-order list built from personal clients. There is no advertising and no PR agency; awareness comes from fashion-press mentions and society word of mouth. The founders are weighing a first overseas retail partnership.",
  },
  {
    // Sources: united-arrows.co.jp/news/7607 (United Arrows takes Japanese
    //   distribution rights, 2002); j-cast.com 2006-05-30 and the Daikanyama
    //   own-brand store 2006-09-16; Cath Kidston Japan KK from 2015. Japan
    //   ran at scale ~2002-2020. The US is the trap: the New York and Los
    //   Angeles stores both opened and then closed.
    slug: "bt50-cathkidston", productName: "Cath Kidston print homeware", category: "home",
    originatingCountry: "GB", basePriceCents: 4500, asOfDate: "2001-12-31", actual: "JP",
    candidateCountries: ["JP", "US", "FR", "DE", "NL", "IT", "ES", "AU", "CA", "KR"],
    description:
      "Cath Kidston is a British home and accessories label founded in 1993 in Holland Park, London, built on nostalgic floral and polka-dot prints applied to practical everyday goods — oilcloth totes, ironing-board covers, cushions, aprons, tea towels and kitchenware. The look is deliberately 'modern vintage': mid-century English domestic patterns redrawn in fresh colorways and sold as cheerful, affordable design rather than as antiques. The business is small and founder-led, trading through a handful of own shops in London and southern England, a mail-order catalogue running since 1995, and a series of illustrated design books that function as brand storytelling. Prices sit in the accessible-gift range. There is no paid advertising. The company is considering its first distribution arrangement outside the UK.",
  },
  {
    // Sources: FashionNetwork US, Sept 2017 (L'Appartement, 254 Elizabeth
    //   Street, Nolita NY, 2017-09-07, reported as its first store outside
    //   France); fr.wikipedia.org/wiki/Sézane. Extended to LA and SF and
    //   remains the largest overseas market; London came later. The country
    //   label is US under every definition tested.
    slug: "bt50-sezane", productName: "Sezane womenswear", category: "fashion",
    originatingCountry: "FR", basePriceCents: 11000, asOfDate: "2017-06-30", actual: "US",
    candidateCountries: ["US", "GB", "DE", "IT", "ES", "NL", "CA", "JP", "AU", "KR"],
    description:
      "Sezane is a French womenswear label founded in 2013 in Paris, grown out of its founder's online vintage-rework business. It sells exclusively direct — no wholesale, no department stores — through monthly limited-run drops announced to an email and Instagram community, with pieces designed in Paris and produced in quantities small enough that they routinely sell out. The aesthetic is understated Parisian: blouses, knitwear, leather boots and bags at a contemporary price tier well below designer but above high street. Its only physical site is 'L'Appartement' in Paris, an apartment-style showroom opened in 2015 that works as a brand space rather than a conventional shop. A menswear line, Octobre, launched in 2016. Marketing is entirely community- and content-led, with no traditional advertising. The team is scouting a first physical location abroad.",
  },
// ── US / CA / BR origin ─────────────────────────────────────────────
  {
    // Sources: Sprudge 2015-02-04 (Kiyosumi-Shirakawa Roastery & Cafe,
    //   Tokyo, opened 2015-02-06, wholly owned not franchised); Sprudge
    //   James Freeman interview 2014-03-25 (revenue mix, Tokyo plan);
    //   en.wikipedia.org/wiki/Blue_Bottle_Coffee. Durable: 16 Japanese
    //   stores by Jan 2019, 24 by Jan 2022. US-only before this.
    slug: "bt50-bluebottle", productName: "Blue Bottle Coffee", category: "food",
    originatingCountry: "US", basePriceCents: 450, asOfDate: "2014-12-31", actual: "JP",
    candidateCountries: ["JP", "KR", "GB", "CA", "AU", "DE", "FR", "SG", "TW", "CN"],
    description:
      "Blue Bottle Coffee is an American specialty roaster founded in Oakland in 2002, beginning as a farmers-market cart and home-delivery subscription and growing into a small chain of cafes across the San Francisco Bay Area, New York and Los Angeles. It roasts in small batches and commits to selling beans within 48 hours of roasting, serving single-origin coffee by hand-pour and siphon alongside a New Orleans-style iced blend and an in-house pastry program. Roughly three-quarters of revenue comes from its own cafes and web store rather than wholesale. A subscription service, Blue Bottle at Home, launched in 2014 at a flat $19 a month. There is no paid advertising; attention comes from architecture, design and food-press coverage and from deliberately slow, hand-built store openings. It is venture-backed and planning a first cafe outside the United States.",
  },
  {
    // Sources: en.wikipedia.org/wiki/Lululemon (founded 1998 Vancouver,
    //   first standalone store Nov 2000); company history — first store
    //   outside Canada opened in the United States in 2003, and the US has
    //   been its largest market since. Australia/Japan franchises follow in
    //   2004-05, so the brand is Canada-only at the decision point.
    //   CAVEAT: first-US-store date is well attested in secondary coverage
    //   but was not re-verified against a primary filing in this pass.
    slug: "bt50-lululemon", productName: "lululemon yoga apparel", category: "fashion",
    originatingCountry: "CA", basePriceCents: 8000, asOfDate: "2003-06-30", actual: "US",
    candidateCountries: ["US", "GB", "AU", "JP", "DE", "FR", "NL", "SG", "KR", "CN"],
    description:
      "lululemon athletica is a Vancouver-based designer and retailer of technical athletic apparel, founded in 1998 and opened as a standalone store in 2000. It sells yoga-first womenswear — pants, tops and bras cut from proprietary performance fabrics — at a premium price point, with yoga pants around CAD 90-100, well above mass sportswear. Stores are company-operated in Canadian urban neighborhoods and double as community hubs: free in-store yoga classes, local instructor 'ambassadors' who wear and recommend the product, and floor staff trained as educators rather than salespeople. There is essentially no paid advertising; growth comes from word of mouth inside yoga studios and running clubs, and from a distinctive design-led fit that customers evangelize. With the Canadian network established, the company is choosing a first market outside Canada.",
  },
  {
    // Sources: en.wikipedia.org/wiki/Chipotle_Mexican_Grill (first
    //   international location August 2008, Toronto, Ontario; 60 Canadian
    //   locations still trading as of 2025). UK/France/Germany come later
    //   and are the exit cases, not this one. Fully separated from
    //   McDonald's in 2006, US-only at the decision point.
    slug: "bt50-chipotle", productName: "Chipotle Mexican Grill", category: "food",
    originatingCountry: "US", basePriceCents: 650, asOfDate: "2008-06-30", actual: "CA",
    candidateCountries: ["CA", "GB", "MX", "DE", "FR", "ES", "AE", "AU", "JP", "BR"],
    description:
      "Chipotle Mexican Grill is a US fast-casual chain founded in Denver in 1993, expanded nationally on investment from a large quick-service parent and fully separated from it in 2006. It serves a deliberately narrow menu — burritos, bowls, tacos and salads — assembled to order along a service line in front of the customer, with a 'Food With Integrity' sourcing platform emphasizing naturally raised meat and fresh produce prepared in-store. Entrees run about USD 6-7, positioning it above quick-service burger chains but below casual dining. Restaurants are company-operated rather than franchised, concentrated in US metro areas and suburban centers. Marketing has relied on billboards, radio and word of mouth rather than national television. With roughly 800 US restaurants trading, management is evaluating its first location outside the United States.",
  },
  {
    // Sources: Netflix Q2 2010 results, SEC EX-99.1 filed 2010-07-21 (15.0m
    //   subscribers, $519.8m quarterly revenue, 4.0% churn); Engadget
    //   2010-09-22 (Canada launch, streaming-only at C$7.99 — the first
    //   market outside the US, never exited; LatAm follows Sept 2011,
    //   UK/IE Jan 2012). NOTE the date trap: the US streaming-only $7.99
    //   tier only arrived 2010-11-22, i.e. AFTER this decision point.
    slug: "bt50-netflix", productName: "Netflix subscription video", category: "saas",
    originatingCountry: "US", basePriceCents: 899, asOfDate: "2010-06-30", actual: "CA",
    candidateCountries: ["CA", "GB", "DE", "FR", "NL", "ES", "IT", "AU", "JP", "BR"],
    description:
      "Netflix is a US subscription video service founded in 1997 that ships DVDs by mail from regional distribution centers and, since 2007, bundles unlimited streaming with every plan at no extra charge. As of the second quarter of 2010 it has about 15 million subscribers, quarterly revenue of USD 520 million, and churn improving to 4.0%. The entry plan is USD 8.99 a month for streaming plus one DVD out at a time, with higher tiers for multiple discs. It is purely direct-to-consumer: members sign up on the web with no retail or cable intermediary, and stream through partnerships with game consoles, Roku, connected TVs and tablets. Marketing is performance-driven — free trials, device bundling and co-marketing — rather than mass brand advertising, with public attention drawn by its recommendation algorithm. Management is preparing a first launch outside the United States.",
  },
  {
    // Sources: en.wikipedia.org/wiki/Nubank ("In May 2019 Nubank announced
    //   operations in Mexico through a subsidiary called Nu — the first time
    //   Nubank offered its services and products outside of Brazil");
    //   Colombia follows Nov 2020; Nubank F-1, Dec 2021. Brazil-only at the
    //   decision point. Category kept as saas: no HS-code grounding exists,
    //   which is a known weakness for this fixture.
    slug: "bt50-nubank", productName: "Nubank digital credit card", category: "saas",
    originatingCountry: "BR", basePriceCents: 0, asOfDate: "2019-03-31", actual: "MX",
    candidateCountries: ["MX", "US", "ES", "IN", "ID", "PH", "VN", "DE", "GB", "IT"],
    description:
      "Nubank is a Brazilian digital bank founded in Sao Paulo in 2013, built around a no-annual-fee purple credit card managed entirely from a mobile app. It targets consumers underserved and overcharged by an incumbent banking oligopoly, offering transparent pricing, instant card controls and in-app support instead of branches and call-center queues. The product line has widened from the credit card to a digital account (NuConta), a rewards program, debit and personal loans. Customer acquisition runs almost entirely on referral and word of mouth — invite waitlists, social sharing and unusually vocal customer advocacy — rather than paid media, and the company has become one of the largest independent digital banks in its home market by customer count. It is now evaluating a first market outside Brazil.",
  },

  // ── CN / SG / IN origin ─────────────────────────────────────────────
  {
    // Sources: zh.wikipedia.org/wiki/海底捞 ("2012年底…海外第一家分店",
    //   Clarke Quay, Singapore); China Daily 2023-11-30; Mothership.sg
    //   2025-08 (that Singapore outlet traded ~13 years). US 2013, Korea
    //   2014, Taiwan/Japan 2015 all follow. Mainland-only at the decision
    //   point.
    slug: "bt50-haidilao", productName: "Haidilao hotpot", category: "food",
    originatingCountry: "CN", basePriceCents: 1400, asOfDate: "2012-09-30", actual: "SG",
    candidateCountries: ["SG", "JP", "KR", "US", "TW", "MY", "TH", "AU", "VN", "ID"],
    description:
      "Haidilao is a Chinese hotpot restaurant chain founded in Jianyang, Sichuan in 1994 and run entirely as company-owned outlets with no franchising. Its differentiator is not the food but the service: waiting customers are given free manicures, shoe shines, snacks and hand massages, diners are offered aprons, hair ties and phone covers, and noodle-pulling is performed tableside. Average spend is roughly RMB 80-90 a head, placing it mid-market, above street hotpot and below fine dining. It operates a national network across major mainland cities supported by a centralized supply chain and an internally promoted store-manager system. The company spends nothing on advertising and relies on word of mouth; a 2011 bestselling management book about its practices made it a case study in Chinese business circles. It is preparing its first restaurant abroad.",
  },
  {
    // Sources: en.wikipedia.org/wiki/Mixue (first overseas store Hanoi,
    //   Vietnam, 2018-09-05); letschuhai (>5,000 domestic stores by 2018);
    //   Foodaily / 澎湃新闻 (Vietnam >1,300 stores and the local number-one
    //   freshly-made drinks brand by 2023 — durable and material).
    slug: "bt50-mixue", productName: "Mixue Bingcheng tea and ice cream", category: "beverage",
    originatingCountry: "CN", basePriceCents: 100, asOfDate: "2018-06-30", actual: "VN",
    candidateCountries: ["VN", "TH", "ID", "MY", "PH", "KR", "JP", "SG", "IN", "TW"],
    description:
      "Mixue Bingcheng is a Chinese tea-drink and ice-cream chain founded in Zhengzhou in 1997 that has scaled past 5,000 franchised outlets on an extreme value proposition: an ice-cream cone at about RMB 2, lemonade at RMB 4 and milk tea at RMB 6-8, undercutting every premium tea brand in the market. Stores are small, around 30 square meters, and sited in lower-tier cities, university districts and busy street corners rather than premium malls. The company makes its money not from franchise royalties but from selling powders, jams, syrups and equipment to its franchisees through a vertically integrated production and logistics network. Brand identity centers on the Snow King mascot and a relentlessly cheap, high-volume positioning. Management is preparing a first store outside China.",
  },
  {
    // Sources: chagee.us official timeline (2019); 界面新闻 6826201
    //   ("2019年8月15日 쿠알라룸푸르… 당시 국내 100개 미만"); en.wikipedia.org/
    //   wiki/Chagee. By end-2024, 148 of its 156 overseas stores were in
    //   Malaysia. Singapore opened the same month via franchise, was pulled,
    //   and only relaunched company-owned in 2024 — so MY is the sustained
    //   one; Thailand (Oct 2019) stayed marginal.
    slug: "bt50-chagee", productName: "CHAGEE fresh-leaf milk tea", category: "beverage",
    originatingCountry: "CN", basePriceCents: 250, asOfDate: "2019-06-30", actual: "MY",
    candidateCountries: ["MY", "SG", "TH", "VN", "ID", "PH", "KR", "JP", "TW", "US"],
    description:
      "CHAGEE is a Chinese tea-drink chain founded in 2017 in Kunming, with fewer than 100 stores concentrated in Yunnan and the southwest. It sells fresh-leaf milk tea brewed from whole tea leaves rather than powder, anchored on a single signature series and priced at roughly RMB 15-20 a cup — above the deep-discount chains, below the premium fruit-tea brands. Milk tea makes up more than 60% of sales, a deliberate choice to avoid competing head-on in the crowded fruit-tea segment. It mixes franchised, company-owned and joint-venture stores, accepts only ground-floor mall or main-street sites above 80 square meters, and takes orders through a WeChat mini-program. Branding is 'new Chinese style': a name drawn from Peking opera, painted-face motifs and wood-framed interiors. It is planning a first store abroad.",
  },
  {
    // Sources: en.wikipedia.org/wiki/Charles_&_Keith (first overseas
    //   expansion 1998, Indonesia); Martin Roll brand case study, 2018;
    //   Forbes 2009-05-01. Indonesia held ~40 stores by 2015 and remains a
    //   core market; Philippines 2001, Dubai 2004, Saudi 2005 all follow.
    //   CAVEAT: one source pairs Australia with Indonesia in 1998; Australian
    //   durability could not be confirmed, so ID is the single label.
    slug: "bt50-charleskeith", productName: "Charles & Keith women's footwear", category: "fashion",
    originatingCountry: "SG", basePriceCents: 3500, asOfDate: "1997-12-31", actual: "ID",
    candidateCountries: ["ID", "MY", "TH", "PH", "VN", "TW", "JP", "CN", "AU", "AE"],
    description:
      "Charles & Keith is a Singaporean women's footwear retailer run by two brothers who took over their parents' shoe shop in Ang Mo Kio in 1990 and opened their own branded store at Amara Shopping Centre in 1996. It trades from a small number of mall stores in Singapore, selling fashion-forward women's shoes at accessible prices, and the business is built on speed rather than advertising: short design cycles, fast stock turnover and constant newness at price points a young working woman will buy on impulse. The decisive change this year is a shift away from buying wholesale stock toward designing its own shoes and working directly with factories, giving the brothers control of both look and cost. The range is women's shoes only. They are now looking at a first store outside Singapore.",
  },
  {
    // Sources: haldiramuk.com/pages/about-us ("1993 … first entering the USA
    //   market"); Business Standard 2024-05-21 (family/regional structure,
    //   US diaspora-led export build-out, later New Jersey distribution
    //   base); en.wikipedia.org/wiki/Haldiram's. The UK plant only comes in
    //   2016. CAVEAT: one secondary source claims 1991 and simultaneous
    //   US/UK/Middle East; the 1992-12-31 decision point sits before either.
    slug: "bt50-haldirams", productName: "Haldiram's namkeen snacks", category: "food",
    originatingCountry: "IN", basePriceCents: 200, asOfDate: "1992-12-31", actual: "US",
    candidateCountries: ["US", "GB", "AE", "SA", "CA", "AU", "SG", "MY", "TH", "NL"],
    description:
      "Haldiram's is an Indian maker of packaged namkeen — savory snacks such as Bikaneri bhujia and sev — alongside traditional sweets and papad, run as a family enterprise with separately managed units in Nagpur, Delhi, Kolkata and Rajasthan. It is the pioneer of branded, packaged namkeen in a category otherwise dominated by unbranded bulk snacks weighed out loose by neighborhood halwais, and it competes on hygiene, consistent taste and sealed packaging rather than price. A new Delhi manufacturing plant has just come on stream to add capacity. Distribution runs through its own retail sweet shops plus clearing-and-forwarding agents and regional distributors, all directly managed rather than franchised. Marketing is deliberately low-key, with no mass advertising, relying on word of mouth and the shops themselves. The family is considering its first shipments overseas.",
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

  console.log(`Seeding ${BRANDS.length} batch-4 backtest projects → workspace ${TARGET_WORKSPACE.slice(0, 8)}\n`);
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

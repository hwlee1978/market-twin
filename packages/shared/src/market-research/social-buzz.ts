/**
 * Per-country social-buzz anchor — the QUANTITATIVE counterpart to the
 * qualitative Tavily KOL-ecosystem block (see tavily.ts buildKolEcosystem*).
 *
 * Motivation (N=20 cross-origin backtest, 2026-07): the macro anchors
 * (Comtrade trade flow, World Bank, market size) reward large/proximate
 * markets, so the true winner of a non-obvious, brand-specific expansion
 * (Medicube→US, not TW; Shake Shack→UAE, not GB) is pushed to rank 2-3.
 * Re-weighting existing components was ruled out (A/B negative result). The
 * real lever is a NEW signal the macro anchors can't see: where is the brand
 * ALREADY generating organic social / search demand, per candidate country.
 *
 * LIVE-ONLY by design: these signals reflect the present, so they cannot
 * reconstruct 2010-era buzz for the historical backtest. They are wired for
 * the live product (forward-looking expansion decisions) — the exact case
 * where "where is this brand trending right now" is the signal you want.
 *
 * Signal stack (spiked 2026-07; each verified against N=20 misses):
 *   ① DataForSEO Google-Ads search volume by country — ABSOLUTE monthly
 *      searches per market. The cleanest per-country demand signal: absolute
 *      (not normalized), so US-40K vs TW-2K compares directly, and search-
 *      based so it has NO platform blind spot (covers CN/JP that TikTok/
 *      YouTube miss). PRIMARY when DATAFORSEO_* creds are set. Paid (~cents).
 *   ② TikTok hashtag views (/challenge/info) — brand global virality volume
 *      ("is it hot at all"). Brand-level, not per-country.
 *   ③ TikTok video-region tally (/feed/search → video.region) — per-country
 *      creator distribution. Nailed US #1 on Medicube+Anker (the macro-miss
 *      cases). Structural blind spots: CN (TikTok banned→Douyin), JP (weak),
 *      small markets underrepresented; US-over-indexed. Deemphasized alone.
 *   ④ YouTube regionCode search — SECONDARY and OFF BY DEFAULT. Global view
 *      counts leak across regions (weak per-country discrimination), and
 *      search.list costs 100 quota units/country against a 10k/day free cap
 *      (~4 brands/day for a 24-market run) — the worst value/quota ratio in
 *      the stack. Opt in with SOCIAL_BUZZ_YOUTUBE=1 only if the quota is
 *      raised; TikTok (500k/mo headroom) + DataForSEO cover this better.
 *   ⑤ Naver (KR) — local community deepener for the origin market.
 *
 * Reddit country subs were ⑤'s other half until 2026-10: the unauthenticated
 * search.json endpoint now answers 403 to every call, so it contributed
 * nothing to any score while costing one request per country per run.
 * Restoring it needs an OAuth app, not a bug fix.
 *
 * Best-effort contract, same as every other anchor: never throw, return an
 * empty/degraded result on any miss so a missing key or a rate-limit never
 * fails the sim. Active when ANY of DataForSEO / RapidAPI / YouTube is set.
 */

const YT_SEARCH = "https://www.googleapis.com/youtube/v3/search";
const YT_VIDEOS = "https://www.googleapis.com/youtube/v3/videos";
const NAVER_BLOG = "https://openapi.naver.com/v1/search/blog.json";
const NAVER_NEWS = "https://openapi.naver.com/v1/search/news.json";

/**
 * Next augments RequestInit with `cache`; @types/node's undici RequestInit
 * does not. This module is shared, so under the worker's tsconfig a literal
 * carrying `cache` fails the excess-property check — which is what kept
 * `npm run build` in apps/worker broken, and the Cloud Run image pinned to
 * its June build. Widening the init type keeps the no-store hint (Next
 * needs it to bypass its data cache) while compiling in both places.
 */
type FetchInit = RequestInit & { cache?: "no-store" | "force-cache" };
const TT_HOST = "tiktok-scraper7.p.rapidapi.com";
const DFS_ENDPOINT =
  "https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live";

const HTTP_TIMEOUT_MS = 12_000;

interface CountrySource {
  regionCode: string;
  lang: string;
  /** DataForSEO / Google-Ads numeric location criterion. */
  dfsLoc: number;
}
/**
 * Country → source config for the 24 supported markets. regionCode is
 * ISO-3166, lang is ISO-639-1, and dfsLoc is the Google-Ads geo criterion
 * code DataForSEO expects.
 */
const COUNTRY_SOURCES: Record<string, CountrySource> = {
  KR: { regionCode: "KR", lang: "ko", dfsLoc: 2410 },
  JP: { regionCode: "JP", lang: "ja", dfsLoc: 2392 },
  CN: { regionCode: "CN", lang: "zh", dfsLoc: 2156 },
  TW: { regionCode: "TW", lang: "zh", dfsLoc: 2158 },
  HK: { regionCode: "HK", lang: "zh", dfsLoc: 2344 },
  SG: { regionCode: "SG", lang: "en", dfsLoc: 2702 },
  TH: { regionCode: "TH", lang: "th", dfsLoc: 2764 },
  VN: { regionCode: "VN", lang: "vi", dfsLoc: 2704 },
  ID: { regionCode: "ID", lang: "id", dfsLoc: 2360 },
  MY: { regionCode: "MY", lang: "ms", dfsLoc: 2458 },
  PH: { regionCode: "PH", lang: "en", dfsLoc: 2608 },
  IN: { regionCode: "IN", lang: "en", dfsLoc: 2356 },
  US: { regionCode: "US", lang: "en", dfsLoc: 2840 },
  CA: { regionCode: "CA", lang: "en", dfsLoc: 2124 },
  GB: { regionCode: "GB", lang: "en", dfsLoc: 2826 },
  DE: { regionCode: "DE", lang: "de", dfsLoc: 2276 },
  FR: { regionCode: "FR", lang: "fr", dfsLoc: 2250 },
  IT: { regionCode: "IT", lang: "it", dfsLoc: 2380 },
  ES: { regionCode: "ES", lang: "es", dfsLoc: 2724 },
  NL: { regionCode: "NL", lang: "nl", dfsLoc: 2528 },
  AU: { regionCode: "AU", lang: "en", dfsLoc: 2036 },
  NZ: { regionCode: "NZ", lang: "en", dfsLoc: 2554 },
  AE: { regionCode: "AE", lang: "en", dfsLoc: 2784 },
  SA: { regionCode: "SA", lang: "ar", dfsLoc: 2682 },
  BR: { regionCode: "BR", lang: "pt", dfsLoc: 2076 },
  MX: { regionCode: "MX", lang: "es", dfsLoc: 2484 },
};

export interface CountryBuzz {
  country: string;
  /** DataForSEO absolute monthly search volume (undefined when no creds). */
  searchVolume?: number;
  /** Recent 3-mo vs prior 3-mo % change in search volume (demand direction). */
  searchTrendPct?: number | null;
  /** Google Ads top-of-page CPC in USD — what this demand costs to buy. */
  cpcUsd?: number;
  /** Google Ads competition index 0-100 for the brand keyword. */
  competitionIndex?: number;
  /** TikTok videos in the brand's top search attributed to this region. */
  tiktokVideos?: number;
  /** China-only: count of top Baidu organic results from Chinese commerce /
   *  official / encyclopedia sources — establishes CN presence where TikTok
   *  (banned) and Google (blocked) are blind. */
  baiduPresence?: number;
  youtube?: { videoCount: number; viewSum: number };
  naver?: { mentions: number };
  /** Composite raw score (log-scaled weighted sum, pre-normalization). */
  raw: number;
  /** 0-100, normalized against the max raw across the candidate set. */
  index: number;
}

export interface SocialBuzzInput {
  brand: string;
  category: string;
  candidateCountries: string[];
  /** ISO date anchoring the window end; defaults to now (live sims). */
  asOfDate?: string;
  /** Look-back window in days for "recent" buzz. Default 90. */
  windowDays?: number;
  locale?: "ko" | "en";
}

export interface SocialBuzzResult {
  byCountry: CountryBuzz[];
  /** Brand-level TikTok hashtag view volume (global virality, not per-country). */
  hashtagViews?: number;
  /** Which primary signal drove the ranking, for the prompt header. */
  primarySignal: "search-volume" | "social" | "none";
  active: boolean;
}

function withTimeout(ms: number = HTTP_TIMEOUT_MS): { signal: AbortSignal; clear: () => void } {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, clear: () => clearTimeout(t) };
}

/**
 * Baidu's live SERP endpoint is slower than the rest of the stack —
 * measured at 6.0s, 11.7s and 13.1s on three consecutive calls against
 * the shared 12s budget, so it was being aborted about as often as it
 * returned. That looked identical to "China has no signal for this
 * brand": baiduPresence came back undefined and the report simply
 * omitted it. The endpoint itself is fine — it answers 200 with ~20
 * organic results.
 */
const BAIDU_TIMEOUT_MS = 25_000;

/** Deep-search a JSON value for the first numeric value under any of `keys`. */
function deepNum(obj: unknown, keys: string[], depth = 0): number | null {
  if (obj == null || depth > 6) return null;
  if (Array.isArray(obj)) {
    for (const v of obj) {
      const n = deepNum(v, keys, depth + 1);
      if (n != null) return n;
    }
    return null;
  }
  if (typeof obj === "object") {
    const o = obj as Record<string, unknown>;
    for (const k of keys) {
      const v = o[k];
      if (typeof v === "number" && Number.isFinite(v)) return v;
      if (typeof v === "string" && /^\d+$/.test(v)) return Number(v);
    }
    for (const v of Object.values(o)) {
      const n = deepNum(v, keys, depth + 1);
      if (n != null) return n;
    }
  }
  return null;
}

/* ─────────────────────────  ① DataForSEO  ───────────────────────── */

export interface CountryDemand {
  /** Absolute monthly Google search volume. */
  volume: number;
  /** Recent 3-mo vs prior 3-mo % change in monthly search volume (trajectory),
   *  or null when < 6 months of data. Positive = rising demand. */
  trendPct: number | null;
  /** Google Ads top-of-page CPC in USD for the brand keyword. The cost side of
   *  the same demand: two markets with equal volume are not equally cheap to
   *  enter. Arrives in the response we already make for volume. */
  cpcUsd?: number;
  /** Google Ads competition index 0-100 (how contested the keyword's auction
   *  is). High volume + high index = demand already being bid for. */
  competitionIndex?: number;
}

/** Recent-3-month vs prior-3-month % change from DataForSEO monthly_searches
 *  (which arrives newest→oldest). Grounds demand DIRECTION, not just level. */
function trajectory(
  monthly?: Array<{ search_volume?: number | null }>,
): number | null {
  if (!monthly || monthly.length < 6) return null;
  const v = monthly.map((m) =>
    typeof m.search_volume === "number" ? m.search_volume : 0,
  );
  const recent = (v[0] + v[1] + v[2]) / 3;
  const prior = (v[3] + v[4] + v[5]) / 3;
  if (prior <= 0) return null;
  return Math.round(((recent - prior) / prior) * 100);
}

/**
 * Absolute monthly Google search volume + trajectory + ad-auction cost per
 * candidate country. The clean per-country backbone: absolute volume compares
 * directly across markets with no platform blind spot, and the same response
 * carries CPC and the competition index at no extra request — the cost side of
 * entering that demand. Sends ONE task per request (the plan
 * rejects multi-task arrays with "one task at a time" — 40000), concurrently.
 * Empty when DATAFORSEO_LOGIN/PASSWORD are unset (graceful degrade to social).
 */
async function dataForSeoDemandByCountry(
  brand: string,
  countries: string[],
): Promise<Record<string, CountryDemand>> {
  const login = process.env.DATAFORSEO_LOGIN;
  const pass = process.env.DATAFORSEO_PASSWORD;
  if (!login || !pass) return {};
  const auth = Buffer.from(`${login}:${pass}`).toString("base64");
  const targets = countries
    .map((c) => ({ iso: c.toUpperCase(), src: COUNTRY_SOURCES[c.toUpperCase()] }))
    .filter((t): t is { iso: string; src: CountrySource } => Boolean(t.src));

  const entries = await Promise.all(
    targets.map(
      async ({ iso, src }): Promise<[string, CountryDemand] | null> => {
        const { signal, clear } = withTimeout();
        try {
          // Single-task array — plan allows only one task per request.
          // language_code omitted: it doesn't change brand-keyword volume and
          // some ISO-639 pairs 40000-error the request.
          const res = await fetch(DFS_ENDPOINT, {
            method: "POST",
            headers: {
              Authorization: `Basic ${auth}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify([
              { keywords: [brand], location_code: src.dfsLoc },
            ]),
            signal,
          });
          if (!res.ok) return null;
          const json = (await res.json()) as {
            tasks?: Array<{
              result?: Array<{
                search_volume?: number | null;
                cpc?: number | null;
                competition_index?: number | null;
                monthly_searches?: Array<{ search_volume?: number | null }>;
              }>;
            }>;
          };
          const r = json.tasks?.[0]?.result?.[0];
          if (typeof r?.search_volume !== "number") return null;
          return [
            iso,
            {
              volume: r.search_volume,
              trendPct: trajectory(r.monthly_searches),
              cpcUsd: typeof r.cpc === "number" ? r.cpc : undefined,
              competitionIndex:
                typeof r.competition_index === "number"
                  ? r.competition_index
                  : undefined,
            },
          ];
        } catch {
          return null;
        } finally {
          clear();
        }
      },
    ),
  );
  const out: Record<string, CountryDemand> = {};
  for (const e of entries) if (e) out[e[0]] = e[1];
  return out;
}

/* ─────────────────────────  ②③ TikTok  ───────────────────────── */

/** TikTok hashtag global view count (brand-level virality volume). */
async function tiktokHashtagViews(brand: string): Promise<number | undefined> {
  const key = process.env.RAPIDAPI_KEY;
  if (!key) return undefined;
  const tag = brand.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!tag) return undefined;
  const { signal, clear } = withTimeout();
  try {
    const res = await fetch(
      `https://${TT_HOST}/challenge/info?challenge_name=${encodeURIComponent(tag)}`,
      { headers: { "x-rapidapi-key": key, "x-rapidapi-host": TT_HOST }, signal },
    );
    if (!res.ok) return undefined;
    const j = await res.json();
    const v = deepNum(j, ["viewCount", "view_count", "views"]);
    return v ?? undefined;
  } catch {
    return undefined;
  } finally {
    clear();
  }
}

/**
 * TikTok per-country creator distribution — tally the `region` of the brand's
 * top ~30 search-result videos. One call, mapped onto the candidate set.
 */
async function tiktokRegionTally(
  brand: string,
): Promise<Record<string, number> | undefined> {
  const key = process.env.RAPIDAPI_KEY;
  if (!key) return undefined;
  const { signal, clear } = withTimeout();
  try {
    const res = await fetch(
      `https://${TT_HOST}/feed/search?keywords=${encodeURIComponent(brand)}&region=US&count=30`,
      { headers: { "x-rapidapi-key": key, "x-rapidapi-host": TT_HOST }, signal },
    );
    if (!res.ok) return undefined;
    const j = (await res.json()) as { data?: { videos?: { region?: string }[] } };
    const tally: Record<string, number> = {};
    for (const v of j.data?.videos ?? []) {
      const r = v.region?.toUpperCase();
      if (r) tally[r] = (tally[r] ?? 0) + 1;
    }
    return Object.keys(tally).length ? tally : undefined;
  } catch {
    return undefined;
  } finally {
    clear();
  }
}

/* ─────────────────────────  ④ China (Baidu)  ───────────────────────── */

// Chinese commerce / official / encyclopedia signals — an organic Baidu result
// from these means the brand is really established in China, versus generic /
// dictionary noise (e.g. "oishi" = 美味しい). Domains + title markers.
const CN_PRESENCE_DOMAINS = [
  "tmall.com", "taobao.com", "jd.com", "1688.com", "baike.baidu.com",
  "xiaohongshu.com", "douyin.com", "weibo.com", "zhihu.com",
];
const CN_PRESENCE_TITLE = ["官网", "官方", "旗舰店", "百科", "天猫", "淘宝"];

/**
 * China presence via Baidu SERP — the CN blind-spot fix (TikTok is banned,
 * Google is blocked, so the other signals can't see China). Scores how
 * established the brand is by counting top Baidu organic results from Chinese
 * commerce/official/encyclopedia sources. DataForSEO Baidu SERP (~$0.002).
 * se_results_count is unreliable (always 0), so we score by result content.
 */
async function baiduChinaPresence(brand: string): Promise<number | undefined> {
  const login = process.env.DATAFORSEO_LOGIN;
  const pass = process.env.DATAFORSEO_PASSWORD;
  if (!login || !pass) return undefined;
  const auth = Buffer.from(`${login}:${pass}`).toString("base64");
  const { signal, clear } = withTimeout(BAIDU_TIMEOUT_MS);
  try {
    const res = await fetch(
      "https://api.dataforseo.com/v3/serp/baidu/organic/live/advanced",
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([
          { keyword: brand, location_code: 2156, language_code: "zh_CN", depth: 20 },
        ]),
        signal,
      },
    );
    if (!res.ok) return undefined;
    const json = (await res.json()) as {
      tasks?: Array<{
        result?: Array<{
          items?: Array<{ type?: string; url?: string; title?: string }>;
        }>;
      }>;
    };
    const items = json.tasks?.[0]?.result?.[0]?.items ?? [];
    let score = 0;
    for (const it of items) {
      if (it.type !== "organic") continue;
      const url = (it.url ?? "").toLowerCase();
      const title = it.title ?? "";
      if (
        CN_PRESENCE_DOMAINS.some((d) => url.includes(d)) ||
        CN_PRESENCE_TITLE.some((t) => title.includes(t))
      ) {
        score++;
      }
    }
    return score;
  } catch {
    return undefined;
  } finally {
    clear();
  }
}

/* ─────────────────────────  ④⑤ YouTube / community  ───────────────────────── */

async function youtubeBuzz(
  brand: string,
  src: CountrySource,
  publishedAfter: string,
  key: string,
): Promise<CountryBuzz["youtube"] | undefined> {
  const { signal, clear } = withTimeout();
  try {
    const q = new URLSearchParams({
      part: "snippet",
      type: "video",
      q: brand,
      regionCode: src.regionCode,
      relevanceLanguage: src.lang,
      maxResults: "25",
      order: "relevance",
      publishedAfter,
      key,
    });
    const res = await fetch(`${YT_SEARCH}?${q}`, { signal });
    if (!res.ok) return undefined;
    const json = (await res.json()) as {
      items?: { id?: { videoId?: string } }[];
    };
    const ids = (json.items ?? [])
      .map((i) => i.id?.videoId)
      .filter(Boolean) as string[];
    if (ids.length === 0) return { videoCount: 0, viewSum: 0 };
    const vq = new URLSearchParams({
      part: "statistics",
      id: ids.slice(0, 50).join(","),
      key,
    });
    const vres = await fetch(`${YT_VIDEOS}?${vq}`, { signal });
    let viewSum = 0;
    if (vres.ok) {
      const vjson = (await vres.json()) as {
        items?: { statistics?: { viewCount?: string } }[];
      };
      viewSum = (vjson.items ?? []).reduce(
        (s, v) => s + Number(v.statistics?.viewCount ?? 0),
        0,
      );
    }
    return { videoCount: ids.length, viewSum };
  } catch {
    return undefined;
  } finally {
    clear();
  }
}

async function naverBuzz(
  brand: string,
  windowMs: number,
  windowEnd: number,
): Promise<CountryBuzz["naver"] | undefined> {
  const id = process.env.NAVER_CLIENT_ID;
  const secret = process.env.NAVER_CLIENT_SECRET;
  if (!id || !secret) return undefined;
  const headers = { "X-Naver-Client-Id": id, "X-Naver-Client-Secret": secret };
  const start = windowEnd - windowMs;
  let mentions = 0;
  const { signal, clear } = withTimeout();
  const init: FetchInit = { headers, signal, cache: "no-store" };
  try {
    const blog = await fetch(
      `${NAVER_BLOG}?query=${encodeURIComponent(brand)}&display=100&sort=date`,
      init,
    );
    if (blog.ok) {
      const j = (await blog.json()) as { items?: { postdate?: string }[] };
      for (const it of j.items ?? []) {
        const d = it.postdate;
        if (
          d &&
          d.length === 8 &&
          Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`) >=
            start
        )
          mentions++;
      }
    }
    const news = await fetch(
      `${NAVER_NEWS}?query=${encodeURIComponent(brand)}&display=100&sort=date`,
      init,
    );
    if (news.ok) {
      const j = (await news.json()) as { items?: { pubDate?: string }[] };
      for (const it of j.items ?? []) {
        if (it.pubDate && Date.parse(it.pubDate) >= start) mentions++;
      }
    }
    return { mentions };
  } catch {
    return undefined;
  } finally {
    clear();
  }
}

/* ─────────────────────────  composite  ───────────────────────── */

/**
 * Weighted composite. DataForSEO absolute search volume dominates when
 * present (clean per-country demand); TikTok creator distribution is the
 * strongest social signal; YouTube view-sum is a weak tiebreaker (global
 * views leak across regions); Naver is a local deepener. Naver is
 * deweighted vs the Spotlight original so the origin market (always high on
 * home-country buzz) doesn't dominate an EXPORT-market ranking.
 *
 * CPC and the competition index are deliberately NOT summed in. This index
 * measures how much demand exists; what that demand costs to buy is a
 * separate axis the ranking model should weigh itself, and folding an
 * expensive auction into a demand score would read as more demand.
 */
function composite(b: CountryBuzz): number {
  const log10 = (n: number) => Math.log10(1 + Math.max(0, n));
  let raw = 0;
  if (b.searchVolume != null) raw += 3 * log10(b.searchVolume); // ① primary
  if (b.tiktokVideos != null) raw += 0.8 * b.tiktokVideos; // ③ per-country social
  if (b.baiduPresence != null) raw += 1.2 * b.baiduPresence; // ④ China (Baidu)
  if (b.youtube) raw += 0.4 * log10(b.youtube.viewSum); // weak tiebreaker
  if (b.naver) raw += 1.0 * log10(b.naver.mentions); // ⑤ deweighted
  return raw;
}

/**
 * Fetch per-country social buzz for a brand. Inactive (empty) only when NONE
 * of DataForSEO / RapidAPI / YouTube keys are present. Brand-level signals
 * (TikTok hashtag, region tally, DataForSEO batch) are fetched once; YouTube/
 * Naver run per country. All best-effort.
 */
export async function fetchSocialBuzzByCountry(
  input: SocialBuzzInput,
): Promise<SocialBuzzResult> {
  // YouTube is OFF by default: 100 quota units/country against a 10k/day free
  // cap makes it the stack's worst value/quota ratio, and it only acts as a
  // weak tiebreaker. Opt in with SOCIAL_BUZZ_YOUTUBE=1 (and a raised quota).
  const ytKey =
    process.env.SOCIAL_BUZZ_YOUTUBE === "1"
      ? process.env.YOUTUBE_API_KEY
      : undefined;
  const hasRapid = !!process.env.RAPIDAPI_KEY;
  const hasDfs = !!(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD);
  if (!ytKey && !hasRapid && !hasDfs) {
    return { byCountry: [], active: false, primarySignal: "none" };
  }

  const countries = input.candidateCountries.map((c) => c.toUpperCase());
  const windowDays = input.windowDays ?? 90;
  const windowMs = windowDays * 86_400_000;
  const windowEnd = input.asOfDate ? Date.parse(input.asOfDate) : Date.now();
  const publishedAfter = new Date(windowEnd - windowMs).toISOString();

  // Brand-level (once): DataForSEO per-country demand, TikTok hashtag + region,
  // and Baidu China presence (only when CN is a candidate — TikTok/Google blind).
  const hasCN = countries.includes("CN");
  const [demandByCountry, hashtagViews, ttTally, baiduCN] = await Promise.all([
    dataForSeoDemandByCountry(input.brand, countries),
    tiktokHashtagViews(input.brand),
    tiktokRegionTally(input.brand),
    hasCN ? baiduChinaPresence(input.brand) : Promise.resolve(undefined),
  ]);

  const results = await Promise.all(
    countries.map(async (country): Promise<CountryBuzz> => {
      const src = COUNTRY_SOURCES[country];
      if (!src) return { country, raw: 0, index: 0 };
      const [youtube, naver] = await Promise.all([
        ytKey ? youtubeBuzz(input.brand, src, publishedAfter, ytKey) : undefined,
        country === "KR" ? naverBuzz(input.brand, windowMs, windowEnd) : undefined,
      ]);
      const cb: CountryBuzz = {
        country,
        searchVolume: demandByCountry[country]?.volume,
        searchTrendPct: demandByCountry[country]?.trendPct,
        cpcUsd: demandByCountry[country]?.cpcUsd,
        competitionIndex: demandByCountry[country]?.competitionIndex,
        tiktokVideos: ttTally?.[country],
        baiduPresence: country === "CN" ? baiduCN : undefined,
        youtube,
        naver,
        raw: 0,
        index: 0,
      };
      cb.raw = composite(cb);
      return cb;
    }),
  );

  const maxRaw = Math.max(0, ...results.map((r) => r.raw));
  for (const r of results) {
    r.index = maxRaw > 0 ? Math.round((100 * r.raw) / maxRaw) : 0;
  }
  results.sort((a, b) => b.raw - a.raw);
  return {
    byCountry: results,
    hashtagViews,
    primarySignal: hasDfs ? "search-volume" : "social",
    active: true,
  };
}

/**
 * Format the per-country buzz into a compact block for the country-ranking
 * prompt. Presents the RELATIVE index (0-100) plus the raw sub-signals, and
 * flags the primary signal so the LLM knows how much to trust it. Returns ""
 * when there is no usable signal.
 *
 * Closes with per-source coverage, because a blank sub-signal is ambiguous:
 * TikTok answers for 2 of 7 candidate countries on a typical run, and a
 * country missing from that tally looks exactly like a country with no
 * creators posting. Naming the coverage stops a silent source from reading
 * as measured-zero demand.
 */
export function formatSocialBuzzBlock(
  result: SocialBuzzResult,
  isKo: boolean,
): string {
  if (!result.active) return "";
  const withSignal = result.byCountry.filter((c) => c.raw > 0);
  if (withSignal.length === 0) return "";
  const viral =
    result.hashtagViews != null
      ? isKo
        ? ` (브랜드 TikTok 해시태그 총 ${formatViews(result.hashtagViews)} 조회 = 글로벌 바이럴 볼륨)`
        : ` (brand TikTok hashtag ${formatViews(result.hashtagViews)} views = global virality volume)`
      : "";
  const primaryNote =
    result.primarySignal === "search-volume"
      ? isKo
        ? "주 신호=국가별 절대 검색량(DataForSEO)"
        : "primary=absolute search volume by country (DataForSEO)"
      : isKo
        ? "주 신호=소셜(TikTok) — 검색량 미연동(근사치)"
        : "primary=social proxy (TikTok) — search volume not wired (approximate)";
  const header = isKo
    ? `═══ 후보국별 소셜/검색 수요 지수 (실측)${viral} ═══\n브랜드명 기준 국가별 조직적(organic) 수요의 상대 지수(0-100, 후보군 내 최대=100). ${primaryNote}. 시장 규모와 다른 축 — 규모는 작아도 이미 뜨는 시장을 식별하기 위한 것. brand-strategy가 KOL/소셜/검색 주도면 country score에 가중:`
    : `═══ PER-COUNTRY SOCIAL / SEARCH DEMAND INDEX (measured)${viral} ═══\nRelative index (0-100, max in candidate set = 100) of organic demand for the brand per country. ${primaryNote}. A SEPARATE axis from market size — surfaces markets already trending even if small. Weight into the country score when the brand-strategy is KOL/social/search-led:`;
  const lines = withSignal.map((c) => {
    const bits: string[] = [];
    if (c.searchVolume != null) {
      const tr =
        c.searchTrendPct == null
          ? ""
          : ` ${c.searchTrendPct >= 0 ? "↑" : "↓"}${Math.abs(c.searchTrendPct)}%`;
      bits.push(`search ${formatViews(c.searchVolume)}/mo${tr}`);
    }
    if (c.cpcUsd != null) {
      const comp = c.competitionIndex != null ? `/comp ${c.competitionIndex}` : "";
      bits.push(`CPC $${c.cpcUsd.toFixed(2)}${comp}`);
    }
    if (c.tiktokVideos) bits.push(`TikTok ${c.tiktokVideos} vids`);
    if (c.baiduPresence != null) bits.push(`Baidu-CN ${c.baiduPresence}`);
    if (c.youtube && c.youtube.viewSum > 0)
      bits.push(`YT ${formatViews(c.youtube.viewSum)}`);
    if (c.naver && c.naver.mentions > 0) bits.push(`Naver ${c.naver.mentions}`);
    return `  [${c.country}] index ${c.index}  (${bits.join(", ") || "—"})`;
  });
  const n = result.byCountry.length;
  const covered = (f: (c: CountryBuzz) => boolean) =>
    `${result.byCountry.filter(f).length}/${n}`;
  const coverage = [
    `search ${covered((c) => c.searchVolume != null)}`,
    `CPC ${covered((c) => c.cpcUsd != null)}`,
    `TikTok ${covered((c) => !!c.tiktokVideos)}`,
    `Baidu-CN ${covered((c) => c.baiduPresence != null)}`,
  ].join(" · ");
  const note = isKo
    ? `소스별 응답 국가수: ${coverage}. 응답하지 않은 소스는 "수요 0"이 아니라 "미측정"이다 — 해당 소스가 비어 있다는 이유로 그 국가를 낮추지 말 것. (CPC/comp는 수요가 아니라 그 수요를 사는 비용이므로 index에 미포함)`
    : `Source coverage: ${coverage}. A source that returned nothing means NOT MEASURED, not zero demand — do not mark a country down because a source is blank. (CPC/comp is the cost of buying that demand, not demand itself, and is excluded from the index.)`;
  return `${header}\n${lines.join("\n")}\n${note}`;
}

function formatViews(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

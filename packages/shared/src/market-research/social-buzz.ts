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
 *   ⑤ Naver (KR) / Reddit (country subs) — local community deepeners.
 *
 * Best-effort contract, same as every other anchor: never throw, return an
 * empty/degraded result on any miss so a missing key or a rate-limit never
 * fails the sim. Active when ANY of DataForSEO / RapidAPI / YouTube is set.
 */

const YT_SEARCH = "https://www.googleapis.com/youtube/v3/search";
const YT_VIDEOS = "https://www.googleapis.com/youtube/v3/videos";
const NAVER_BLOG = "https://openapi.naver.com/v1/search/blog.json";
const NAVER_NEWS = "https://openapi.naver.com/v1/search/news.json";
const REDDIT_SEARCH = "https://www.reddit.com/search.json";
const TT_HOST = "tiktok-scraper7.p.rapidapi.com";
const DFS_ENDPOINT =
  "https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live";

const HTTP_TIMEOUT_MS = 12_000;

interface CountrySource {
  regionCode: string;
  lang: string;
  reddit?: string;
  /** DataForSEO / Google-Ads numeric location criterion. */
  dfsLoc: number;
}
/**
 * Country → source config for the 24 supported markets. regionCode is
 * ISO-3166, lang is ISO-639-1, dfsLoc is the Google-Ads geo criterion code
 * DataForSEO expects, reddit is a country subreddit where one is an active
 * buzz proxy.
 */
const COUNTRY_SOURCES: Record<string, CountrySource> = {
  KR: { regionCode: "KR", lang: "ko", reddit: "korea", dfsLoc: 2410 },
  JP: { regionCode: "JP", lang: "ja", reddit: "japan", dfsLoc: 2392 },
  CN: { regionCode: "CN", lang: "zh", dfsLoc: 2156 },
  TW: { regionCode: "TW", lang: "zh", reddit: "taiwan", dfsLoc: 2158 },
  HK: { regionCode: "HK", lang: "zh", reddit: "HongKong", dfsLoc: 2344 },
  SG: { regionCode: "SG", lang: "en", reddit: "singapore", dfsLoc: 2702 },
  TH: { regionCode: "TH", lang: "th", reddit: "Thailand", dfsLoc: 2764 },
  VN: { regionCode: "VN", lang: "vi", reddit: "VietNam", dfsLoc: 2704 },
  ID: { regionCode: "ID", lang: "id", reddit: "indonesia", dfsLoc: 2360 },
  MY: { regionCode: "MY", lang: "ms", reddit: "malaysia", dfsLoc: 2458 },
  PH: { regionCode: "PH", lang: "en", reddit: "Philippines", dfsLoc: 2608 },
  IN: { regionCode: "IN", lang: "en", reddit: "india", dfsLoc: 2356 },
  US: { regionCode: "US", lang: "en", reddit: "all", dfsLoc: 2840 },
  CA: { regionCode: "CA", lang: "en", reddit: "canada", dfsLoc: 2124 },
  GB: { regionCode: "GB", lang: "en", reddit: "unitedkingdom", dfsLoc: 2826 },
  DE: { regionCode: "DE", lang: "de", reddit: "germany", dfsLoc: 2276 },
  FR: { regionCode: "FR", lang: "fr", reddit: "france", dfsLoc: 2250 },
  IT: { regionCode: "IT", lang: "it", reddit: "italy", dfsLoc: 2380 },
  ES: { regionCode: "ES", lang: "es", reddit: "es", dfsLoc: 2724 },
  NL: { regionCode: "NL", lang: "nl", reddit: "thenetherlands", dfsLoc: 2528 },
  AU: { regionCode: "AU", lang: "en", reddit: "australia", dfsLoc: 2036 },
  NZ: { regionCode: "NZ", lang: "en", reddit: "newzealand", dfsLoc: 2554 },
  AE: { regionCode: "AE", lang: "en", reddit: "dubai", dfsLoc: 2784 },
  SA: { regionCode: "SA", lang: "ar", reddit: "saudiarabia", dfsLoc: 2682 },
  BR: { regionCode: "BR", lang: "pt", reddit: "brasil", dfsLoc: 2076 },
  MX: { regionCode: "MX", lang: "es", reddit: "mexico", dfsLoc: 2484 },
};

export interface CountryBuzz {
  country: string;
  /** DataForSEO absolute monthly search volume (undefined when no creds). */
  searchVolume?: number;
  /** Recent 3-mo vs prior 3-mo % change in search volume (demand direction). */
  searchTrendPct?: number | null;
  /** TikTok videos in the brand's top search attributed to this region. */
  tiktokVideos?: number;
  youtube?: { videoCount: number; viewSum: number };
  naver?: { mentions: number };
  reddit?: { posts: number };
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

function withTimeout(): { signal: AbortSignal; clear: () => void } {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), HTTP_TIMEOUT_MS);
  return { signal: ctrl.signal, clear: () => clearTimeout(t) };
}

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
 * Absolute monthly Google search volume + trajectory per candidate country.
 * The clean per-country backbone: absolute volume compares directly across
 * markets with no platform blind spot. Sends ONE task per request (the plan
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
                monthly_searches?: Array<{ search_volume?: number | null }>;
              }>;
            }>;
          };
          const r = json.tasks?.[0]?.result?.[0];
          if (typeof r?.search_volume !== "number") return null;
          return [
            iso,
            { volume: r.search_volume, trendPct: trajectory(r.monthly_searches) },
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
  try {
    const blog = await fetch(
      `${NAVER_BLOG}?query=${encodeURIComponent(brand)}&display=100&sort=date`,
      { headers, signal, cache: "no-store" },
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
      { headers, signal, cache: "no-store" },
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

async function redditBuzz(
  brand: string,
  sub: string,
  windowDays: number,
): Promise<CountryBuzz["reddit"] | undefined> {
  const t =
    windowDays <= 1
      ? "day"
      : windowDays <= 7
        ? "week"
        : windowDays <= 31
          ? "month"
          : "year";
  const url =
    sub === "all"
      ? `${REDDIT_SEARCH}?q=${encodeURIComponent(brand)}&t=${t}&limit=100`
      : `https://www.reddit.com/r/${sub}/search.json?q=${encodeURIComponent(brand)}&restrict_sr=1&t=${t}&limit=100`;
  const { signal, clear } = withTimeout();
  try {
    const res = await fetch(url, {
      headers: { "user-agent": "market-twin/0.1 (grounding)" },
      signal,
    });
    if (!res.ok) return undefined;
    const json = (await res.json()) as {
      data?: { dist?: number; children?: unknown[] };
    };
    return { posts: json.data?.dist ?? json.data?.children?.length ?? 0 };
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
 * views leak across regions); Naver/Reddit are local deepeners. Naver is
 * deweighted vs the Spotlight original so the origin market (always high on
 * home-country buzz) doesn't dominate an EXPORT-market ranking.
 */
function composite(b: CountryBuzz): number {
  const log10 = (n: number) => Math.log10(1 + Math.max(0, n));
  let raw = 0;
  if (b.searchVolume != null) raw += 3 * log10(b.searchVolume); // ① primary
  if (b.tiktokVideos != null) raw += 0.8 * b.tiktokVideos; // ③ per-country social
  if (b.youtube) raw += 0.4 * log10(b.youtube.viewSum); // ④ weak tiebreaker
  if (b.naver) raw += 1.0 * log10(b.naver.mentions); // ⑤ deweighted
  if (b.reddit) raw += 1.0 * log10(b.reddit.posts); // ⑤
  return raw;
}

/**
 * Fetch per-country social buzz for a brand. Inactive (empty) only when NONE
 * of DataForSEO / RapidAPI / YouTube keys are present. Brand-level signals
 * (TikTok hashtag, region tally, DataForSEO batch) are fetched once; YouTube/
 * Reddit/Naver run per country. All best-effort.
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

  // Brand-level (once): DataForSEO per-country demand, TikTok hashtag + region.
  const [demandByCountry, hashtagViews, ttTally] = await Promise.all([
    dataForSeoDemandByCountry(input.brand, countries),
    tiktokHashtagViews(input.brand),
    tiktokRegionTally(input.brand),
  ]);

  const results = await Promise.all(
    countries.map(async (country): Promise<CountryBuzz> => {
      const src = COUNTRY_SOURCES[country];
      if (!src) return { country, raw: 0, index: 0 };
      const [youtube, reddit, naver] = await Promise.all([
        ytKey ? youtubeBuzz(input.brand, src, publishedAfter, ytKey) : undefined,
        src.reddit ? redditBuzz(input.brand, src.reddit, windowDays) : undefined,
        country === "KR" ? naverBuzz(input.brand, windowMs, windowEnd) : undefined,
      ]);
      const cb: CountryBuzz = {
        country,
        searchVolume: demandByCountry[country]?.volume,
        searchTrendPct: demandByCountry[country]?.trendPct,
        tiktokVideos: ttTally?.[country],
        youtube,
        naver,
        reddit,
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
        ? "주 신호=소셜(TikTok/YouTube/커뮤니티) — 검색량 미연동(근사치)"
        : "primary=social proxies (TikTok/YouTube/community) — search volume not wired (approximate)";
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
    if (c.tiktokVideos) bits.push(`TikTok ${c.tiktokVideos} vids`);
    if (c.youtube && c.youtube.viewSum > 0)
      bits.push(`YT ${formatViews(c.youtube.viewSum)}`);
    if (c.naver && c.naver.mentions > 0) bits.push(`Naver ${c.naver.mentions}`);
    if (c.reddit && c.reddit.posts > 0) bits.push(`Reddit ${c.reddit.posts}`);
    return `  [${c.country}] index ${c.index}  (${bits.join(", ") || "—"})`;
  });
  return `${header}\n${lines.join("\n")}`;
}

function formatViews(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

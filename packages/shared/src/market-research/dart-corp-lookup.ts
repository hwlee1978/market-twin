/**
 * DART corp_code lookup by company name.
 *
 * For production user products (not in fixture SLUG_TO_CORP_CODE), this
 * module fetches the bulk corpCode.xml (one ZIP, ~3.5MB) and builds an
 * in-memory name → corp_code index. Filters to LISTED companies (stock_code
 * present) since DART API endpoints only work for them.
 *
 * Cache strategy:
 *   - In-process Map (built on first call, persists for process lifetime)
 *   - File-backed JSON snapshot at validation/reference/dart-corp-index.json
 *     (gitignored, regenerated weekly via cron)
 *
 * Matching strategy:
 *   - Exact corp_name match first (case-insensitive)
 *   - Then prefix match (e.g., "오리온" matches "오리온홀딩스" + "오리온")
 *   - Returns the listed company that best matches; falls back to any match
 *
 * Product-name → company-name resolution is OUT OF SCOPE here — caller
 * passes the company name (e.g., extracted via LLM or hardcoded brand→parent
 * mapping). For "오리온 초코파이" → caller passes "오리온".
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import JSZip from "jszip";

const CORPCODE_ENDPOINT = "https://opendart.fss.or.kr/api/corpCode.xml";
const CACHE_FILE = "validation/reference/dart-corp-index.json";
const TIMEOUT_MS = 30_000;

export interface CorpIndexEntry {
  corpCode: string;
  corpNameKo: string;
  corpNameEn: string;
  stockCode: string; // empty string for unlisted
}

interface CorpIndex {
  _meta: { fetchedAt: string; totalEntries: number; listedEntries: number };
  /** All listed (stock_code present) companies. */
  listed: CorpIndexEntry[];
}

let memoryCache: CorpIndex | null = null;

/** Load or build the index. Builds from corpCode.xml on cache miss. */
export async function loadCorpIndex(apiKey?: string): Promise<CorpIndex | null> {
  if (memoryCache) return memoryCache;
  const cachePath = resolve(process.cwd(), CACHE_FILE);
  if (existsSync(cachePath)) {
    try {
      memoryCache = JSON.parse(readFileSync(cachePath, "utf8")) as CorpIndex;
      return memoryCache;
    } catch {
      // fall through to refetch
    }
  }
  return refreshCorpIndex(apiKey);
}

/** Force-refresh the index from DART (use for weekly cron). */
export async function refreshCorpIndex(apiKey?: string): Promise<CorpIndex | null> {
  const key = apiKey ?? process.env.DART_API_KEY;
  if (!key) return null;
  const url = `${CORPCODE_ENDPOINT}?crtfc_key=${key}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const zip = await JSZip.loadAsync(buf);
    const xml = await zip.files["CORPCODE.xml"].async("string");

    // Parse <list> entries — string-scan rather than full XML parse for speed
    const listed: CorpIndexEntry[] = [];
    let total = 0;
    const re = /<list>\s*<corp_code>([^<]+)<\/corp_code>\s*<corp_name>([^<]*)<\/corp_name>\s*<corp_eng_name>([^<]*)<\/corp_eng_name>\s*<stock_code>([^<]*)<\/stock_code>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml)) !== null) {
      total++;
      const corpCode = m[1].trim();
      const corpNameKo = m[2].trim();
      const corpNameEn = m[3].trim();
      const stockCode = m[4].trim();
      if (stockCode && stockCode !== "") {
        // Decode common HTML entities (&amp; → &, &lt; → <, etc.)
        const decodeEntities = (s: string) =>
          s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
        listed.push({
          corpCode,
          corpNameKo: decodeEntities(corpNameKo),
          corpNameEn: decodeEntities(corpNameEn),
          stockCode,
        });
      }
    }
    const index: CorpIndex = {
      _meta: {
        fetchedAt: new Date().toISOString(),
        totalEntries: total,
        listedEntries: listed.length,
      },
      listed,
    };

    // Persist to cache file
    try {
      const cachePath = resolve(process.cwd(), CACHE_FILE);
      mkdirSync(dirname(cachePath), { recursive: true });
      writeFileSync(cachePath, JSON.stringify(index), "utf8");
    } catch (err) {
      console.warn(`[dart-corp-lookup] cache write failed: ${(err as Error).message}`);
    }

    memoryCache = index;
    return index;
  } catch (err) {
    clearTimeout(timer);
    console.warn(`[dart-corp-lookup] refresh failed: ${(err as Error).message}`);
    return null;
  }
}

/**
 * Find the best corp_code for a given company name (listed companies only).
 * Returns null when no match.
 *
 * Priority:
 *   1. Exact Korean name match (case-insensitive after trim)
 *   2. English name exact match
 *   3. Korean prefix match (entries whose corp_name starts with query)
 *   4. Korean substring match (query is contained in corp_name)
 */
export async function lookupCorpCodeByName(
  companyName: string,
  apiKey?: string,
): Promise<CorpIndexEntry | null> {
  const index = await loadCorpIndex(apiKey);
  if (!index) return null;
  const q = companyName.trim();
  const qLower = q.toLowerCase();

  // 1. Exact Korean
  for (const e of index.listed) {
    if (e.corpNameKo === q) return e;
  }
  // 2. Exact English (case-insensitive)
  for (const e of index.listed) {
    if (e.corpNameEn.toLowerCase() === qLower) return e;
  }
  // 3. Korean prefix (shortest match preferred — avoid "오리온홀딩스" when "오리온" exists)
  const prefixMatches = index.listed
    .filter((e) => e.corpNameKo.startsWith(q))
    .sort((a, b) => a.corpNameKo.length - b.corpNameKo.length);
  if (prefixMatches.length > 0) return prefixMatches[0];
  // 4. English prefix (e.g., "KT&G" matches "KT&G Corporation")
  const enPrefix = index.listed
    .filter((e) => e.corpNameEn.toLowerCase().startsWith(qLower))
    .sort((a, b) => a.corpNameEn.length - b.corpNameEn.length);
  if (enPrefix.length > 0) return enPrefix[0];
  // 5. Korean substring
  for (const e of index.listed) {
    if (e.corpNameKo.includes(q)) return e;
  }
  // 6. English substring
  for (const e of index.listed) {
    if (e.corpNameEn.toLowerCase().includes(qLower)) return e;
  }
  return null;
}

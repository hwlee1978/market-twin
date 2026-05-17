/**
 * One-shot fetcher for MFDS 화장품 규제정보 (cosmetic ingredient regulations).
 * Dumps the full 7,257-row dataset to validation/reference/mfds-cosmetic-
 * regulations.json for in-memory lookup at sim time.
 *
 * Re-run weekly (or via cron) to refresh — MFDS updates restrictions
 * sporadically as new evidence accumulates. The file is gitignored
 * because it's bulk data, not a hand-curated reference.
 *
 *   npx tsx --env-file=.env.local scripts/prefetch-mfds-regulations.ts
 */

import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const ENDPOINT =
  "https://apis.data.go.kr/1471000/CsmtcsReglMaterialInfoService/getCsmtcsReglMaterialInfoService";
const PAGE_SIZE = 500; // server-side max; smaller chunks just inflate page count
const TIMEOUT_MS = 30_000;
const OUTPUT = path.join("validation", "reference", "mfds-cosmetic-regulations.json");

interface RawItem {
  INGR_STD_NAME?: string;
  INGR_ENG_NAME?: string;
  PROH_NATIONAL?: string | null;
  LIMIT_NATIONAL?: string | null;
}

interface NormalizedItem {
  /** Standard Korean ingredient name (primary key, unique). */
  ingredientKo: string;
  /** English/INCI name when available. */
  ingredientEn: string | null;
  /** Countries where the ingredient is fully banned. */
  prohibitedCountries: string[];
  /** Countries where the ingredient has restricted/limited use. */
  limitedCountries: string[];
}

function normalizeCountryList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  // Field is a Korean comma list: "EU,대만,아세안,중국,한국".
  // Normalize to ISO-2 where unambiguous, leave region tags ("EU","아세안")
  // intact for downstream prompt rendering.
  const map: Record<string, string> = {
    한국: "KR",
    대만: "TW",
    중국: "CN",
    일본: "JP",
    미국: "US",
    캐나다: "CA",
    영국: "GB",
    독일: "DE",
    프랑스: "FR",
    이탈리아: "IT",
    스페인: "ES",
    네덜란드: "NL",
    호주: "AU",
    뉴질랜드: "NZ",
    멕시코: "MX",
    브라질: "BR",
    아르헨티나: "AR",
    러시아: "RU",
    터키: "TR",
    인도: "IN",
    인도네시아: "ID",
    말레이시아: "MY",
    태국: "TH",
    필리핀: "PH",
    베트남: "VN",
    싱가포르: "SG",
    홍콩: "HK",
    "사우디아라비아": "SA",
    아랍에미리트: "AE",
    UAE: "AE",
  };
  return raw
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => map[s] ?? s);
}

async function fetchPage(apiKey: string, pageNo: number): Promise<{ items: RawItem[]; total: number }> {
  const params = new URLSearchParams({
    serviceKey: apiKey,
    pageNo: String(pageNo),
    numOfRows: String(PAGE_SIZE),
    type: "json",
  });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${ENDPOINT}?${params}`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as {
      header?: { resultCode?: string; resultMsg?: string };
      body?: { totalCount?: number; items?: RawItem[] };
    };
    if (json.header?.resultCode !== "00") {
      throw new Error(`API error ${json.header?.resultCode}: ${json.header?.resultMsg}`);
    }
    return {
      items: json.body?.items ?? [],
      total: json.body?.totalCount ?? 0,
    };
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

async function main() {
  const apiKey = process.env.DATAGOKR_API_KEY;
  if (!apiKey) {
    console.error("DATAGOKR_API_KEY required (load via --env-file=.env.local)");
    process.exit(1);
  }

  console.log(`Fetching MFDS cosmetic regulations from ${ENDPOINT}\n`);
  const all: NormalizedItem[] = [];
  let page = 1;
  let total = Infinity;
  const start = Date.now();

  while (all.length < total) {
    const { items, total: t } = await fetchPage(apiKey, page);
    if (page === 1) {
      total = t;
      console.log(`Total rows on server: ${total.toLocaleString()}\n`);
    }
    if (items.length === 0) break;
    for (const r of items) {
      if (!r.INGR_STD_NAME) continue;
      all.push({
        ingredientKo: r.INGR_STD_NAME.trim(),
        ingredientEn: r.INGR_ENG_NAME?.trim() || null,
        prohibitedCountries: normalizeCountryList(r.PROH_NATIONAL),
        limitedCountries: normalizeCountryList(r.LIMIT_NATIONAL),
      });
    }
    console.log(`  page ${page}: +${items.length} rows (cumulative ${all.length}/${total})`);
    page++;
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`\nFetched ${all.length.toLocaleString()} rows in ${elapsed}s`);

  // Cross-check coverage stats
  const withProh = all.filter((x) => x.prohibitedCountries.length > 0).length;
  const withLimit = all.filter((x) => x.limitedCountries.length > 0).length;
  const withBoth = all.filter(
    (x) => x.prohibitedCountries.length > 0 && x.limitedCountries.length > 0,
  ).length;
  console.log(
    `  with PROH list: ${withProh.toLocaleString()} (${((withProh / all.length) * 100).toFixed(1)}%)`,
  );
  console.log(
    `  with LIMIT list: ${withLimit.toLocaleString()} (${((withLimit / all.length) * 100).toFixed(1)}%)`,
  );
  console.log(`  with both: ${withBoth.toLocaleString()}`);

  // Top-10 most-restricted regions
  const regionCounts = new Map<string, number>();
  for (const r of all) {
    for (const c of [...r.prohibitedCountries, ...r.limitedCountries]) {
      regionCounts.set(c, (regionCounts.get(c) ?? 0) + 1);
    }
  }
  const top = [...regionCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  console.log("\nTop-10 regions by restriction count:");
  for (const [region, n] of top) {
    console.log(`  ${region.padEnd(6)} ${n.toLocaleString()}`);
  }

  mkdirSync(path.dirname(OUTPUT), { recursive: true });
  const payload = {
    _meta: {
      source: "MFDS data.go.kr 15111773 (CsmtcsReglMaterialInfoService)",
      fetchedAt: new Date().toISOString(),
      totalRows: all.length,
    },
    items: all,
  };
  writeFileSync(OUTPUT, JSON.stringify(payload, null, 2), "utf8");
  console.log(`\nWrote ${OUTPUT} (${(JSON.stringify(payload).length / 1024).toFixed(0)} KB)`);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});

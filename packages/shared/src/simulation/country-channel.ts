/**
 * Country/channel cross-validation for persona free-text fields.
 *
 * Pattern this defends against: an LLM generates a Vietnamese persona
 * but has them say "I'd buy on Coupang" — Coupang is Korea-only, so
 * the quote is implausible. Mismatches like this look fine in
 * isolation but compound across the dashboard (objection top-N gets
 * polluted by Korea-only channels surfacing under VN, etc.).
 *
 * Conservative scope: only flag channels that are HARD-LOCKED to a
 * single country. Globally-active marketplaces (Amazon, TikTok Shop,
 * Shopee SEA) stay unflagged because their presence in another
 * country's persona is plausible.
 *
 * Two pass design — same shape as locale-filter.ts:
 *   1. detectChannelMismatch(text, personaCountry) → list of slips
 *   2. sanitizeChannelMismatch(text, personaCountry) → redacts the
 *      offending channel name in-place; returns null if the result
 *      becomes nonsense (no remaining content).
 *
 * Used at runner sanitize-time, same hop as sanitizeVoice. Slip rate
 * surfaces in the quality audit alongside voiceSlipRate so we can
 * track prompt regressions.
 */

import type { LocaleHint } from "./locale-filter";

/**
 * Country code → set of channel name patterns LOCKED to that country.
 * A persona whose `country` ≠ the locked country must NOT mention
 * these patterns. Patterns are case-insensitive, matched with word
 * boundaries on the Latin spellings; Korean/Japanese spellings match
 * by contains (no easy CJK word boundary).
 *
 * Curation principle: only include channels whose presence in another
 * country is implausible enough to flag. Brand names that have grown
 * into other markets (Amazon JP, Costco KR, Sephora APAC) are
 * intentionally NOT here.
 */
const LOCKED_CHANNELS: Record<string, { latin: string[]; cjk: string[] }> = {
  KR: {
    latin: [
      "Coupang",
      "Naver Smart Store",
      "Naver Brand Store",
      "Naver Shopping",
      "Kakao Gift",
      "Kakao Shopping",
      "11st",
      "GMarket",
      "Auction",
      "Olive Young",
      "OliveYoung",
      "Musinsa",
      "29CM",
      "Market Kurly",
      "Kurly",
      "Idus",
      "Wadiz",
      "SSG",
      "SSG.com",
      "Lotte On",
    ],
    cjk: [
      "쿠팡",
      "네이버 스마트스토어",
      "네이버 브랜드스토어",
      "네이버쇼핑",
      "카카오톡 선물하기",
      "카카오톡쇼핑",
      "11번가",
      "지마켓",
      "옥션",
      "올리브영",
      "무신사",
      "마켓컬리",
      "컬리",
      "아이디어스",
      "와디즈",
      "에스에스지",
      "롯데온",
    ],
  },
  JP: {
    latin: [
      "Rakuten Ichiba",
      "Mercari",
      "Don Quijote",
      "Donki",
      "Yodobashi",
      "Bic Camera",
      "BicCamera",
      "Tokyu Hands",
      "Loft Japan",
      "Cosme",
      "@cosme",
      "Atcosme",
      "ZOZOTOWN",
      "ZOZO",
      "Yahoo Shopping",
      "PayPay Mall",
    ],
    cjk: [
      "楽天市場",
      "メルカリ",
      "ドン・キホーテ",
      "ドンキ",
      "ヨドバシ",
      "ビックカメラ",
      "東急ハンズ",
      "ロフト",
      "アットコスメ",
      "ゾゾタウン",
      "PayPayモール",
      "ヤフーショッピング",
    ],
  },
  CN: {
    latin: [
      "Tmall",
      "Taobao",
      "JD.com",
      "Pinduoduo",
      "Xiaohongshu",
      "RED app",
      "Douyin Shop",
      "Dewu",
      "Vipshop",
      "Suning",
      "Kuaishou Shop",
    ],
    cjk: [
      "天猫",
      "淘宝",
      "京东",
      "拼多多",
      "小红书",
      "抖音商城",
      "得物",
      "唯品会",
      "苏宁",
      "快手小店",
    ],
  },
  TW: {
    latin: ["PChome", "PChome 24h", "Momo Shop", "Momo TW", "Yahoo Tw", "Pinkoi", "Shopee TW"],
    cjk: ["蝦皮台灣", "露天拍賣", "博客來"],
  },
  VN: {
    latin: ["Tiki", "Sendo", "FPT Shop", "Bach Hoa Xanh", "Lazada VN", "Shopee VN"],
    cjk: [],
  },
  TH: {
    latin: ["Lazada TH", "Shopee TH", "JD Central", "Central Online", "Watsons TH"],
    cjk: [],
  },
  ID: {
    latin: ["Tokopedia", "Bukalapak", "Blibli", "Lazada ID", "Shopee ID"],
    cjk: [],
  },
  IN: {
    latin: ["Flipkart", "Myntra", "Nykaa", "BigBasket", "JioMart", "Meesho"],
    cjk: [],
  },
  US: {
    latin: ["Walmart.com", "Target.com", "BestBuy", "Best Buy", "Sephora US", "Ulta", "Walgreens"],
    cjk: [],
  },
  GB: {
    latin: ["Boots", "Argos", "John Lewis", "ASOS UK", "Tesco Online", "Ocado"],
    cjk: [],
  },
};

export interface ChannelMismatch {
  channel: string;
  /** Country the channel is locked to. */
  lockedTo: string;
  /** The persona's country (which doesn't match). */
  personaCountry: string;
}

const MASK_TOKEN = {
  ko: "현지 쇼핑몰",
  en: "a local marketplace",
} as const;

function normalizeCountry(c: string | undefined): string {
  if (!c) return "";
  return c.trim().toUpperCase();
}

function buildLatinRegex(patterns: string[]): RegExp | null {
  if (patterns.length === 0) return null;
  // Escape for regex; sort by length DESC so "Naver Brand Store" wins over
  // "Naver" if both are valid. Word-boundary on Latin spellings.
  const sorted = [...patterns].sort((a, b) => b.length - a.length);
  const escaped = sorted.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`(?<![\\w])(${escaped.join("|")})(?![\\w])`, "gi");
}

// Cache regex per country for re-use; CJK list uses raw substring
// matching (no word boundary in CJK), but kept sorted for longest-
// first replacement so "네이버 스마트스토어" matches before "네이버".
const LATIN_REGEX_CACHE = new Map<string, RegExp | null>();
const CJK_PATTERNS_CACHE = new Map<string, string[]>();
for (const [country, lists] of Object.entries(LOCKED_CHANNELS)) {
  LATIN_REGEX_CACHE.set(country, buildLatinRegex(lists.latin));
  CJK_PATTERNS_CACHE.set(
    country,
    [...lists.cjk].sort((a, b) => b.length - a.length),
  );
}

/**
 * Find every locked-channel slip in the text. Each entry names a
 * channel mentioned in the text whose lock country differs from
 * personaCountry.
 */
export function detectChannelMismatch(
  text: string | undefined,
  personaCountry: string | undefined,
): ChannelMismatch[] {
  if (!text) return [];
  const pc = normalizeCountry(personaCountry);
  if (!pc) return [];
  const out: ChannelMismatch[] = [];
  for (const [lockedTo] of Object.entries(LOCKED_CHANNELS)) {
    if (lockedTo === pc) continue;
    const latinRe = LATIN_REGEX_CACHE.get(lockedTo);
    if (latinRe) {
      latinRe.lastIndex = 0; // global regex needs reset across calls
      let m: RegExpExecArray | null;
      while ((m = latinRe.exec(text))) {
        out.push({ channel: m[1], lockedTo, personaCountry: pc });
      }
    }
    const cjkList = CJK_PATTERNS_CACHE.get(lockedTo) ?? [];
    for (const p of cjkList) {
      if (text.includes(p)) {
        out.push({ channel: p, lockedTo, personaCountry: pc });
      }
    }
  }
  return out;
}

/**
 * Replace each locked-channel mention in the text with a locale-
 * appropriate generic phrase (KR locale → "현지 쇼핑몰"; otherwise
 * "a local marketplace"). Returns the rewritten string. If the
 * original had no mismatch, returns it unchanged.
 *
 * Returning a sanitized string (vs null) keeps the rest of the
 * persona's voice intact — we only want to neutralise the false
 * channel claim, not throw away the whole quote.
 */
export function sanitizeChannelMismatch(
  text: string | undefined,
  personaCountry: string | undefined,
  locale: LocaleHint,
): { sanitized: string; replacements: number } {
  if (!text) return { sanitized: "", replacements: 0 };
  const pc = normalizeCountry(personaCountry);
  if (!pc) return { sanitized: text, replacements: 0 };
  const mask = locale === "ko" ? MASK_TOKEN.ko : MASK_TOKEN.en;
  let out = text;
  let replacements = 0;
  for (const [lockedTo] of Object.entries(LOCKED_CHANNELS)) {
    if (lockedTo === pc) continue;
    const latinRe = LATIN_REGEX_CACHE.get(lockedTo);
    if (latinRe) {
      out = out.replace(latinRe, () => {
        replacements++;
        return mask;
      });
    }
    const cjkList = CJK_PATTERNS_CACHE.get(lockedTo) ?? [];
    for (const p of cjkList) {
      if (out.includes(p)) {
        // Replace all occurrences (string includes → split/join).
        const parts = out.split(p);
        replacements += parts.length - 1;
        out = parts.join(mask);
      }
    }
  }
  return { sanitized: out, replacements };
}

/**
 * Convenience for arrays (objections, trustFactors, interests). Maps
 * each item through sanitizeChannelMismatch and counts total
 * replacements across the array.
 */
export function sanitizeChannelMismatchArray(
  items: string[] | undefined,
  personaCountry: string | undefined,
  locale: LocaleHint,
): { items: string[]; replacements: number } {
  if (!items || items.length === 0) return { items: [], replacements: 0 };
  let totalReplacements = 0;
  const sanitized = items.map((s) => {
    const r = sanitizeChannelMismatch(s, personaCountry, locale);
    totalReplacements += r.replacements;
    return r.sanitized;
  });
  return { items: sanitized, replacements: totalReplacements };
}

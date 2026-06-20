/**
 * Heuristic scorer for the wizard's product description field.
 *
 * Motivation (K-Beauty D2C benchmark 2026-06-03): BoJ's description
 * explicitly cited "Reddit r/AsianBeauty + Western K-beauty YouTube
 * reviewers", which gave the sim a strong direct cue toward the US
 * market and contributed to BoJ being the only top-1 hit in hypothesis
 * tier. Anua's description ("Olive Young 1위 + 민감성") was vague about
 * target audience / channel / region and the sim picked DE instead of US.
 *
 * Goal: nudge users toward descriptions that include channel mentions,
 * audience signals, demographic cues, geographic positioning, and price
 * tier. We score 0-100 across 6 heuristic dimensions and surface tips
 * when individual buckets are missing.
 *
 * This is NOT a hard gate — wizard still submits even on low scores.
 * It's a quality nudge, not a validation rule.
 */

export interface DescriptionStrength {
  /** 0-100 score, sum of bucket points. */
  score: number;
  /** Per-bucket pass/fail with what triggered the match. */
  buckets: Array<{
    key:
      | "length"
      | "channel"
      | "demographic"
      | "audience"
      | "geography"
      | "price_tier";
    points: number;
    passed: boolean;
    /** Match snippets shown to user. Empty when bucket failed. */
    matches: string[];
  }>;
}

// Bucket weights — should sum to 100.
const WEIGHTS = {
  length: 10,
  channel: 20,
  demographic: 20,
  audience: 20,
  geography: 15,
  price_tier: 15,
} as const;

// Channel keyword patterns. Korean + English, case-insensitive.
// NOTE: JS \b (word boundary) is ASCII-only — it does NOT fire at a
// Hangul/space boundary, so wrapping Korean tokens in \b makes them
// NEVER match (e.g. /\b쿠팡\b/ fails). Korean tokens therefore use NO \b;
// English tokens keep \b to avoid substring false-positives ("mid" in
// "midnight"). This was the bug behind Korean descriptions scoring ~30.
const CHANNEL_PATTERNS = [
  /\bamazon\b/i,
  /\bsephora\b/i,
  /\bulta\b/i,
  /\btiktok\s*shop\b/i,
  /\btiktok\b/i,
  /\binstagram\s*shop\b/i,
  /\bolive\s*young\b/i,
  /올리브\s*영/,
  /\bcostco\b/i,
  /\bcoupang\b/i,
  /쿠팡/,
  /\bqoo10\b/i,
  /\brakuten\b/i,
  /\bdon\s*quijote\b/i,
  /돈키호테/,
  /\bduty\s*free\b/i,
  /면세점/,
  /\bshopee\b/i,
  /\blazada\b/i,
  /\btmall\b/i,
  /\btaobao\b/i,
  /京东|jd\.com/i,
  /\bwatsons\b/i,
  /\bd2c\b/i,
  /\bdtc\b/i,
  /직판/,
  /자사몰/,
  /\bnaver\b/i,
  /네이버\s*(쇼핑|스마트스토어)?/,
  /스마트스토어/,
];

// Demographic patterns: age × gender, income, life stage.
const DEMOGRAPHIC_PATTERNS = [
  /\d{2,3}\s*[-~–]?\s*\d{2,3}\s*대?\s*(여성|남성|여자|남자)/, // 20-30대 여성
  /\b\d{2,3}\s*[-~–]?\s*\d{2,3}\s*(female|male|women|men)\b/i,
  /\d{2,3}\s*[-~–]\s*\d{2,3}\s*세/, // 19~35세
  /\b(gen|generation)\s*[zxy]\b/i,
  /[zZ]\s*세대|제트\s*세대|mz\s*세대|엠지\s*세대/i,
  /\b(millennial|millennials)\b/i,
  /밀레니얼/,
  /\d{2}\s*대/, // 20대, 30대
  /\b(teen|teens|youth|young\s*adult|adult|middle[-\s]aged|senior)\b/i,
  /\b(working\s*women|working\s*moms?|young\s*professionals?)\b/i,
  /(직장인|학생|주부|맘|아빠|대학생)/,
  /\b(soccer\s*moms?|gen-?z|gen-?x)\b/i,
];

// Audience signal: who consumes content, where, what cues.
const AUDIENCE_PATTERNS = [
  /\breddit\b/i,
  /\b(r\/|sub-?reddit)\w+/i,
  /\bhyram\b/i,
  /\bcharlotte\s*palermino\b/i,
  /\bdr\.?\s*dray\b/i,
  /\bjessica\s*defino\b/i,
  /\bskincare\s*addiction\b/i,
  /\basian\s*beauty\b/i,
  /\bk[-\s]?(pop|drama|beauty)\s*fan\b/i,
  /(인플루언서|크리에이터|유튜버|틱톡커|인플루언서\s*마케팅)/,
  /\b(influencer|creator|reviewer)\s*(network|community)?\b/i,
  /\bword[-\s]of[-\s]mouth\b/i,
  /\borganic\s*(traffic|following|growth)\b/i,
  /\bcommunity[-\s]driven\b/i,
  /언박싱|하울|입소문/,
];

// Geographic positioning: regional/cultural cues.
const GEOGRAPHY_PATTERNS = [
  /\b(north\s*america|usa?|states|america)\b/i,
  /미국|북미/,
  /\b(europe|eu|european|euro)\b/i,
  /유럽/,
  /\b(asia|asian|southeast\s*asia|sea)\b/i,
  /아시아|동남아|동아시아/,
  /\b(latin\s*america|latam)\b/i,
  /남미|중남미/,
  /\b(middle\s*east|gcc)\b/i,
  /중동/,
  /\b(western|global|export)\b/i,
  /글로벌|수출/,
  /\b(japanese|korean|chinese)\s*(market|consumers?)\b/i,
  /(일본|한국|중국|동아시아)\s*(시장|소비자|도시)?/,
];

// Price tier signals.
const PRICE_TIER_PATTERNS = [
  /\b(mass|massmarket)\b/i,
  /드럭스토어|저가/,
  /\bmid[-\s]?(price|tier)\b/i,
  /중가|미들/,
  /\bpremium\b/i,
  /프리미엄|고급/,
  /\b(luxury|high[-\s]end)\b/i,
  /럭셔리|하이엔드/,
  /\baffordable\b/i,
  /가성비|합리적(인)?\s*(가격|가격대)/,
  /\$\s*\d+\s*[-~]\s*\$?\s*\d+/, // $20-50 range
  /\$\s*\d+/, // single $40 price point
  /\b(under|below)\s*\$\s*\d+\b/i,
  /\d{1,3}\s*달러/,
  /₩\s*[\d,]+/, // ₩50,000
];

function matchesIn(text: string, patterns: readonly RegExp[]): string[] {
  const found: string[] = [];
  for (const re of patterns) {
    const m = text.match(re);
    if (m && m[0]) {
      const snippet = m[0].trim();
      if (snippet && !found.includes(snippet)) found.push(snippet);
    }
  }
  return found;
}

export function scoreDescription(text: string): DescriptionStrength {
  const cleaned = text.trim();
  const buckets: DescriptionStrength["buckets"] = [];

  // 1. Length bucket: ≥80 chars gives full points (10).
  // Length alone doesn't help much, just a baseline signal.
  const lengthOk = cleaned.length >= 80;
  buckets.push({
    key: "length",
    points: lengthOk ? WEIGHTS.length : 0,
    passed: lengthOk,
    matches: lengthOk ? [`${cleaned.length}자`] : [],
  });

  // 2-6. Pattern buckets.
  for (const [key, patterns] of [
    ["channel", CHANNEL_PATTERNS],
    ["demographic", DEMOGRAPHIC_PATTERNS],
    ["audience", AUDIENCE_PATTERNS],
    ["geography", GEOGRAPHY_PATTERNS],
    ["price_tier", PRICE_TIER_PATTERNS],
  ] as const) {
    const matches = matchesIn(cleaned, patterns);
    const passed = matches.length > 0;
    buckets.push({
      key,
      points: passed ? WEIGHTS[key] : 0,
      passed,
      matches: matches.slice(0, 3),
    });
  }

  const score = buckets.reduce((sum, b) => sum + b.points, 0);
  return { score, buckets };
}

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
// Match retail chains, marketplaces, direct channels that are
// concrete enough to suggest market entry strategy.
const CHANNEL_PATTERNS = [
  /\bamazon\b/i,
  /\bsephora\b/i,
  /\bulta\b/i,
  /\btiktok\s*shop\b/i,
  /\btiktok\b/i,
  /\binstagram\s*shop\b/i,
  /\bolive\s*young\b/i,
  /\bolive\s*young\s*global\b/i,
  /\b올리브\s*영\b/,
  /\bcostco\b/i,
  /\bcoupang\b/i,
  /\b쿠팡\b/,
  /\bqoo10\b/i,
  /\brakuten\b/i,
  /\bdon\s*quijote\b/i,
  /\b돈키호테\b/,
  /\bduty\s*free\b/i,
  /\b면세점\b/,
  /\bshopee\b/i,
  /\blazada\b/i,
  /\btmall\b/i,
  /\btaobao\b/i,
  /\b京东|jd\.com\b/i,
  /\bwatsons\b/i,
  /\bd2c\b/i,
  /\bdtc\b/i,
  /\bd\s*\.\s*t\s*\.\s*c\b/i,
  /\b직판\b/,
  /\b자사몰\b/,
];

// Demographic patterns: age × gender, income, life stage.
const DEMOGRAPHIC_PATTERNS = [
  /\b\d{2,3}\s*[-~–]?\s*\d{2,3}\s*대?\s*(여성|남성|여자|남자|female|male|women|men)\b/i,
  /\b(gen|generation)\s*[zxy]\b/i,
  /\b(millennial|millennials)\b/i,
  /\b밀레니얼\b/,
  /\b\d{2}\s*대\b/, // 20대, 30대
  /\b(teen|teens|youth|young\s*adult|adult|middle[-\s]aged|senior)\b/i,
  /\b(working\s*women|working\s*moms?|young\s*professionals?)\b/i,
  /\b(직장인|학생|주부|맘|아빠)\b/,
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
  /\b(인플루언서|크리에이터|유튜버|틱톡커)\b/,
  /\b(influencer|creator|reviewer)\s*(network|community)?\b/i,
  /\bword[-\s]of[-\s]mouth\b/i,
  /\borganic\s*(traffic|following|growth)\b/i,
  /\bcommunity[-\s]driven\b/i,
];

// Geographic positioning: regional/cultural cues.
const GEOGRAPHY_PATTERNS = [
  /\b(north\s*america|na|us|usa|states|america|미국|북미)\b/i,
  /\b(europe|eu|european|유럽|euro)\b/i,
  /\b(asia|asian|southeast\s*asia|sea|아시아|동남아)\b/i,
  /\b(latin\s*america|latam|남미|중남미)\b/i,
  /\b(middle\s*east|중동|gcc)\b/i,
  /\b(western|글로벌|global|export)\b/i,
  /\b(japanese|korean|chinese|일본|한국|중국)\s*(market|consumers?|소비자)\b/i,
];

// Price tier signals.
const PRICE_TIER_PATTERNS = [
  /\b(mass|massmarket|드럭스토어|저가)\b/i,
  /\b(mid[-\s]price|mid[-\s]tier|중가|미들|mid)\b/i,
  /\b(premium|프리미엄|고급)\b/i,
  /\b(luxury|럭셔리|하이엔드|high[-\s]end)\b/i,
  /\b(affordable|가성비|value)\b/i,
  /\b\$\s*\d+[-~]\s*\$?\s*\d+\b/, // $20-50 range
  /\b(under|below)\s*\$\s*\d+\b/i,
  /\b\d{1,3}\s*달러\b/,
  /\b₩\s*[\d,]+\b/, // ₩50,000
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

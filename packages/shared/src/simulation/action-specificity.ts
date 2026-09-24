/**
 * Concreteness scoring for a single action string.
 *
 * Lives in its own leaf module because the results page needs it too:
 * ensemble-narrative.ts pulls in the LLM providers, and importing that
 * from a client component would ship the SDKs to the browser. Nothing
 * here touches IO — it is regex and keyword matching over one string.
 */
import { z } from "zod";

/**
 * Concreteness audit on a single action. Computed heuristically post-LLM
 * (regex + keyword match) so we have a deterministic check on whether
 * the merge model actually followed the "be specific" rule. Fields are
 * booleans rather than a single score so the UI can show *why* an
 * action looks vague — e.g., "missing timeline".
 *
 * Scoring is plain count×25 (0/25/50/75/100). Below 50 = vague;
 * the UI surfaces a warning badge so users don't quote unactionable
 * "improve marketing in Japan"-style items.
 */
export const ACTION_SPECIFICITY_SCHEMA = z.object({
  /** Mentions a specific channel/platform/medium (TikTok, Coupang, Naver Smart Store…). */
  hasChannel: z.boolean(),
  /** Contains a quantity — budget, %, count, units. */
  hasMetric: z.boolean(),
  /** Contains a deadline or time window (Q3, 30 days, by Aug…). */
  hasTimeline: z.boolean(),
  /** Names a measurable outcome (CTR, conversion, NPS, GMV…). */
  hasMeasurable: z.boolean(),
  /** Sum × 25 → 0/25/50/75/100. Convenience for UI sort and threshold display. */
  score: z.number().int().min(0).max(100),
});
export type ActionSpecificity = z.infer<typeof ACTION_SPECIFICITY_SCHEMA>;

export function assessActionSpecificity(action: string): ActionSpecificity {
  const text = action.toLowerCase();

  // Named action anchors — channels, regulators, certifications, named
  // documents. Originally just channels, but actions like "FDA food
  // facility registration" or "commission an SGS COA" are highly
  // concrete (named third party + specific deliverable) yet would score
  // 0 on a channel-only check. Broadened to "things you can name as
  // the target of the action". Mixing KR+global since actions are
  // bilingual.
  const channelTokens = [
    // ── Channels (Korean / regional) ──
    "쿠팡", "네이버", "11번가", "카카오", "카카오톡", "카카오톡채널", "라인", "인스타", "유튜브", "틱톡",
    "올리브영", "다이소", "이마트", "롯데", "신세계", "지마켓", "옥션", "당근", "무신사", "29cm",
    "스마트스토어", "브랜드스토어", "라방", "라이브커머스", "쿠캣", "포카리", "마켓컬리", "오아시스",
    // ── Channels (generic) ──
    "리테일", "도매", "자체몰", "공식몰", "dtc",
    // ── Channels (global) ──
    "amazon", "tiktok", "instagram", "facebook", "youtube", "google ads", "meta", "shopee",
    "lazada", "qoo10", "rakuten", "etsy", "shopify", "tmall", "taobao", "wechat", "douyin",
    "wholefoods", "costco", "walmart", "target", "sephora", "ulta", "kickstarter", "indiegogo",
    "linkedin", "reddit", "x.com", "twitter", "threads", "naver",
    // ── Regulators (named regulatory bodies anchor concrete actions) ──
    "fda", "usda", "epa", "ftc", "fcc", "kfda", "mfds", "mhlw", "pmda", "efsa", "ema",
    "mhra", "fsa", "anvisa", "nmpa", "tga", "cfia", "health canada", "kotra", "식약처", "한국식품의약품안전처",
    // ── Certifications & accredited test labs ──
    "coa", "ukca", "ce mark", "ce-mark", "nop", "usda organic", "nsf", "sgs", "eurofins",
    "bureau veritas", "bvqi", "brc", "brcgs", "iso 22000", "iso 9001", "halal", "kosher",
    "vegan society", "b corp", "fair trade", "rainforest alliance", "gmp", "haccp",
    "non-gmo", "noprohibited", "specialty food association", "kosher certification",
    // ── Trade & customs anchors ──
    "customs broker", "import permit", "export licence", "export license", "hs code",
    "bill of lading", "incoterms",
    // ── Named programs / accelerators / events ──
    "amazon vine", "vine program", "fancy food show", "natural products expo",
    "specialty food", "shopify capital",
  ];
  const hasChannel = channelTokens.some((t) => text.includes(t));

  // Metrics — any digit + currency/quantity unit, or % anywhere.
  const hasMetric =
    /[0-9][\d,.]*\s*(?:원|만원|억원|만|천만|krw|usd|\$|€|￥|jpy|cny|%|개|건|회|배|x|만건|뷰|view|impression|click|gmv|이상|미만|이내)/i.test(
      action,
    ) ||
    /(?:^|\s)[0-9][\d,.]*\s*%/.test(action) ||
    /\b[0-9][\d,.]*\s*[kKmM](?:\s|$)/.test(action);

  // Timeline — explicit deadline or duration.
  const hasTimeline =
    /(?:Q[1-4]|FY?\d{2,4}|H[12]|d-?\d|d\+\d|\d+\s*(?:일|주|개월|년|month|months|week|weeks|day|days|year|years|qtr|quarter|q1|q2|q3|q4)|by\s+\w+\s*\d{2,4}|within\s+\d|next\s+\d|by\s+(?:end\s+of\s+)?(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec))/i.test(
      action,
    ) ||
    /(?:오는|이내|까지|내|개월\s*이내|주\s*이내|일\s*이내)/.test(action);

  // Measurable — names a tracked metric (conversion / lift / retention etc.)
  const hasMeasurable =
    /(?:전환율|클릭률|구매전환|장바구니|이탈률|체류|검색량|점유율|재구매|재방문|신규|매출|gmv|arpu|aov|ltv|cac|roi|roas|ctr|cvr|cpa|cpm|cpc|nps|csat|retention|conversion|engagement|recall|awareness|net\s*promoter|repeat|reach|impressions|sessions|signups?|installs?)/i.test(
      action,
    );

  const hits = [hasChannel, hasMetric, hasTimeline, hasMeasurable].filter(Boolean).length;
  return {
    hasChannel,
    hasMetric,
    hasTimeline,
    hasMeasurable,
    score: hits * 25,
  };
}

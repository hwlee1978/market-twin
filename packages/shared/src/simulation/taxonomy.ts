/**
 * Decision-grade taxonomies for free-text outputs the LLM was previously
 * trusted to produce as full sentences. Pairing every emit with one of
 * these enum codes (`category`) plus the original free-text (`detail`)
 * gives the renderer a deterministic axis to compare across countries
 * and sims, while the detail field preserves the LLM's specific
 * framing for narrative panels.
 *
 * Why this exists: by 2026-05-09 we'd accumulated five rounds of
 * patches against "every market's top blocker is a price comparison"
 * style failures. The root cause was that the LLM emitted free-text
 * objections / actions / risks, the aggregator fuzzy-clustered them,
 * and the modal cluster across markets repeatedly collapsed onto
 * price-themed framings because that's the model's safe-default. Each
 * patch reduced probability without eliminating recurrence. Forcing a
 * structured `category` field per item and computing the column off
 * the enum modal makes recurrence impossible — same input deterministic-
 * ally produces the same column value, and "every country = price" only
 * happens if the persona reactions actually all fall into price categories
 * (in which case the diagnosis is honest rather than a model artifact).
 *
 * Each taxonomy includes an `other` overflow so the model is never
 * forced to mis-classify a niche concern. The admin sim-quality panel
 * tracks the `other` rate per taxonomy; if it climbs above ~20% in a
 * sustained way for any product category, that's a signal to extend
 * the enum (data-driven, not speculative).
 */

/* ────────────────────────────────── Objection ─── */

export const OBJECTION_CATEGORIES = [
  "price_relative",
  "price_absolute",
  "channel_access",
  "regulatory_friction",
  "climate_fit",
  "size_fit",
  "brand_familiarity",
  "competitor_strength",
  "cultural_misalignment",
  "quality_concern",
  "service_warranty",
  "repurchase_concern",
  "other",
] as const;
export type ObjectionCategory = (typeof OBJECTION_CATEGORIES)[number];

export const OBJECTION_LABELS: Record<
  ObjectionCategory,
  { ko: string; en: string; description: string }
> = {
  price_relative: {
    ko: "경쟁 대비 가격",
    en: "Price vs competitors",
    description: "Price concern with an explicit comparison anchor (a named brand / channel sale price / specific price gap).",
  },
  price_absolute: {
    ko: "절대 가격 부담",
    en: "Absolute price burden",
    description: "Price-vs-income or price-vs-budget concern with no comparator (raw affordability ceiling).",
  },
  channel_access: {
    ko: "채널 접근성",
    en: "Channel access",
    description: "Wants to buy but can't easily — no local listing, no official channel, complex import path.",
  },
  regulatory_friction: {
    ko: "규제·인증",
    en: "Regulatory friction",
    description: "Missing certification, customs hurdles, ingredient/label compliance gap.",
  },
  climate_fit: {
    ko: "기후·환경 적합성",
    en: "Climate / environment fit",
    description: "Product not suited to local climate / weather / terrain / use environment.",
  },
  size_fit: {
    ko: "사이즈·체형 적합성",
    en: "Size / fit",
    description: "Sizing chart mismatch, missing local sizes, body-type fit concerns.",
  },
  brand_familiarity: {
    ko: "브랜드 인지도",
    en: "Brand awareness",
    description: "Unknown / new brand — low recognition, not enough reviews to trust.",
  },
  competitor_strength: {
    ko: "대안 풍부",
    en: "Strong alternatives",
    description: "Plenty of substitutes already exist; differentiator unclear.",
  },
  cultural_misalignment: {
    ko: "문화·취향 불일치",
    en: "Cultural mismatch",
    description: "Aesthetic / behavior / value clash with local market norms.",
  },
  quality_concern: {
    ko: "품질 우려",
    en: "Quality concern",
    description: "Material durability, washing instructions, long-term wear / shelf life worry.",
  },
  service_warranty: {
    ko: "A/S·보증",
    en: "After-sales / warranty",
    description: "No local service center, slow returns, complex exchange path.",
  },
  repurchase_concern: {
    ko: "재구매·소모성",
    en: "Repurchase / consumable",
    description: "Subscription / refill burden, low LTV per customer, one-shot purchase.",
  },
  other: {
    ko: "기타",
    en: "Other",
    description: "Niche concern that doesn't fit the above 12. Detail field carries the meaning.",
  },
};

/* ────────────────────────────────── TrustFactor ─── */

export const TRUST_FACTOR_CATEGORIES = [
  "brand_heritage",
  "certification",
  "expert_endorsement",
  "peer_review",
  "channel_credibility",
  "product_specification",
  "price_value",
  "visual_design",
  "celebrity_endorsement",
  "proof_data",
  "other",
] as const;
export type TrustFactorCategory = (typeof TRUST_FACTOR_CATEGORIES)[number];

export const TRUST_FACTOR_LABELS: Record<
  TrustFactorCategory,
  { ko: string; en: string; description: string }
> = {
  brand_heritage: {
    ko: "브랜드 역사·원산지",
    en: "Brand heritage",
    description: "Founding year, country of origin, cultural authority earned over time.",
  },
  certification: {
    ko: "인증·규제 통과",
    en: "Certification",
    description: "Official cert (B Corp, GOTS, OEKO-TEX, MFDS, FDA, KFDA, etc.).",
  },
  expert_endorsement: {
    ko: "전문가 추천",
    en: "Expert endorsement",
    description: "Authority figure recommendation — Wirecutter, registered dietician, fashion-week stylist, doctor.",
  },
  peer_review: {
    ko: "커뮤니티 리뷰",
    en: "Peer / community review",
    description: "Organic user review depth — Reddit threads, 맘카페 후기, @cosme reviews, Trustpilot ratings.",
  },
  channel_credibility: {
    ko: "신뢰 채널 입점",
    en: "Trusted channel",
    description: "Distribution through a trusted retailer (Cult Beauty, REI, Sephora, Coupang Rocket, John Lewis).",
  },
  product_specification: {
    ko: "스펙·기술 차별",
    en: "Product spec",
    description: "Measurable spec advantage — weight, material grade, performance test results.",
  },
  price_value: {
    ko: "가격 대비 가치",
    en: "Price-value",
    description: "Value-for-money signal — cheaper than equivalent competitor, sale price, bundle math.",
  },
  visual_design: {
    ko: "디자인·외관",
    en: "Visual design",
    description: "Aesthetic appeal — color, silhouette, packaging matches local taste.",
  },
  celebrity_endorsement: {
    ko: "셀럽·인플루언서",
    en: "Celebrity / influencer",
    description: "High-profile public figure visible wearing / using the product.",
  },
  proof_data: {
    ko: "데이터·임상 근거",
    en: "Proof / data",
    description: "Quantified evidence — clinical trial results, satisfaction %, durability test data.",
  },
  other: {
    ko: "기타",
    en: "Other",
    description: "Niche trust signal that doesn't fit the above 10.",
  },
};

/* ────────────────────────────────── Action ─── */

export const ACTION_CATEGORIES = [
  "channel_entry",
  "partnership",
  "influencer_marketing",
  "content_marketing",
  "paid_advertising",
  "pricing_strategy",
  "product_localization",
  "regulatory_compliance",
  "offline_event",
  "direct_sales",
  "pricing_promotion",
  "customer_service",
  "other",
] as const;
export type ActionCategory = (typeof ACTION_CATEGORIES)[number];

export const ACTION_LABELS: Record<
  ActionCategory,
  { ko: string; en: string; description: string }
> = {
  channel_entry: {
    ko: "채널 입점",
    en: "Channel entry",
    description: "Onboard with a marketplace or retailer (ZOZOTOWN, Coupang, Sephora, REI, John Lewis).",
  },
  partnership: {
    ko: "제휴·협업",
    en: "Partnership / collab",
    description: "Brand or retail collab (Allbirds × LeMouton, joint capsule, retailer-exclusive SKU).",
  },
  influencer_marketing: {
    ko: "인플루언서 마케팅",
    en: "Influencer marketing",
    description: "Pay or seed influencers (TikTok, Instagram, YouTube creators) for product placement.",
  },
  content_marketing: {
    ko: "콘텐츠 마케팅",
    en: "Content marketing",
    description: "SEO articles, Reddit AMAs, YouTube long-form reviews, owned-blog content.",
  },
  paid_advertising: {
    ko: "유료 광고",
    en: "Paid advertising",
    description: "Performance ads on Meta / Google / TikTok / Naver / native search.",
  },
  pricing_strategy: {
    ko: "가격 전략",
    en: "Pricing strategy",
    description: "Structural pricing decision — premium / mid / entry tier, repositioning to align with competitors.",
  },
  product_localization: {
    ko: "제품 현지화",
    en: "Product localization",
    description: "Localized SKU — climate-adapted material, regional sizing, local packaging / language.",
  },
  regulatory_compliance: {
    ko: "인증·규제 대응",
    en: "Regulatory compliance",
    description: "File for cert, register with regulator, hire local compliance consultant.",
  },
  offline_event: {
    ko: "오프라인 이벤트",
    en: "Offline event / pop-up",
    description: "Pop-up store, fashion week booth, expo presence, in-store demo.",
  },
  direct_sales: {
    ko: "자체 채널 (DTC)",
    en: "Direct sales (DTC)",
    description: "Own website / app / multi-language storefront / native checkout.",
  },
  pricing_promotion: {
    ko: "할인·프로모션",
    en: "Pricing promotion",
    description: "Time-bound discount — Shopee 11.11, launch -20%, BFCM bundle.",
  },
  customer_service: {
    ko: "고객 서비스",
    en: "Customer service",
    description: "Service ops — local A/S center, free returns policy, multi-language CS.",
  },
  other: {
    ko: "기타",
    en: "Other",
    description: "Niche action that doesn't fit the above 12.",
  },
};

/* ────────────────────────────────── Risk ─── */

export const RISK_CATEGORIES = [
  "regulatory",
  "competitive",
  "channel",
  "pricing",
  "demand",
  "operational",
  "brand",
  "cultural",
  "foreign_exchange",
  "payment",
  "timing",
  "other",
] as const;
export type RiskCategory = (typeof RISK_CATEGORIES)[number];

export const RISK_LABELS: Record<
  RiskCategory,
  { ko: string; en: string; description: string }
> = {
  regulatory: {
    ko: "규제 리스크",
    en: "Regulatory",
    description: "Cert / law / labeling — entry-blocker risk if not addressed before launch.",
  },
  competitive: {
    ko: "경쟁 강도",
    en: "Competitive",
    description: "Strong incumbent dominates category, hard to differentiate or steal share.",
  },
  channel: {
    ko: "채널 리스크",
    en: "Channel",
    description: "Channel access denied, slow listing, retailer-exclusive incumbent agreement.",
  },
  pricing: {
    ko: "가격 포지셔닝",
    en: "Pricing positioning",
    description: "Mismatch between intended positioning and price — too premium without proof, too cheap eroding margin.",
  },
  demand: {
    ko: "수요 부족",
    en: "Demand",
    description: "TAM too thin, target segment <5% of market, weak intent signal in personas.",
  },
  operational: {
    ko: "운영·물류",
    en: "Operational / logistics",
    description: "MOQ too high, inventory carry, shipping cost, supply-chain reliability.",
  },
  brand: {
    ko: "브랜드 평판",
    en: "Brand reputation",
    description: "Awareness or trust building required — 6+ months of seeding before traction.",
  },
  cultural: {
    ko: "문화 리스크",
    en: "Cultural",
    description: "Local cultural norms / luxury conventions / religious considerations clash with positioning.",
  },
  foreign_exchange: {
    ko: "환율 변동",
    en: "FX risk",
    description: "Material FX exposure — KRW/SGD swing erodes margin, hedging cost.",
  },
  payment: {
    ko: "결제·정산",
    en: "Payment infrastructure",
    description: "Local payment habits — cash-on-delivery dominant, card penetration low, settlement fee high.",
  },
  timing: {
    ko: "타이밍 리스크",
    en: "Timing",
    description: "Seasonal / event miss — winter SKU shipping in April, expo / fashion week passed.",
  },
  other: {
    ko: "기타",
    en: "Other",
    description: "Niche risk that doesn't fit the above 11.",
  },
};

/* ────────────────────────────────── Differentiator ─── */

export const DIFFERENTIATOR_CATEGORIES = [
  "cost",
  "quality",
  "experience",
  "brand_origin",
  "specification",
  "value_alignment",
  "accessibility",
  "other",
] as const;
export type DifferentiatorCategory = (typeof DIFFERENTIATOR_CATEGORIES)[number];

export const DIFFERENTIATOR_LABELS: Record<
  DifferentiatorCategory,
  { ko: string; en: string; description: string }
> = {
  cost: {
    ko: "가격 우위",
    en: "Cost advantage",
    description: "Material price gap vs nearest competitor — lower at same quality.",
  },
  quality: {
    ko: "품질 우위",
    en: "Quality advantage",
    description: "Higher-grade material, better durability, finer craftsmanship.",
  },
  experience: {
    ko: "사용 경험",
    en: "Experience advantage",
    description: "User-experience win — comfort, ease of use, no-pain-point feature.",
  },
  brand_origin: {
    ko: "원산지 자산",
    en: "Brand origin / heritage",
    description: "Country-of-origin signal — Korean design, Japanese craftsmanship, French luxury.",
  },
  specification: {
    ko: "기술·스펙",
    en: "Spec / technical",
    description: "Technical credential — patent, certification, measurable spec gap.",
  },
  value_alignment: {
    ko: "가치 정렬",
    en: "Value alignment",
    description: "Ethical / value match — B Corp, fair trade, sustainability, vegan.",
  },
  accessibility: {
    ko: "접근성",
    en: "Accessibility",
    description: "Buying / using easier — subscription, free returns, lower minimum, wide channel.",
  },
  other: {
    ko: "기타",
    en: "Other",
    description: "Niche differentiator that doesn't fit the above 7.",
  },
};

/* ────────────────────────────────── Helpers ─── */

/** Localized label for a category code. Safe for unknown codes (returns the code itself). */
export function categoryLabel(
  taxonomy: "objection" | "trust" | "action" | "risk" | "differentiator",
  code: string,
  locale: "ko" | "en",
): string {
  const map = (() => {
    switch (taxonomy) {
      case "objection":
        return OBJECTION_LABELS as Record<string, { ko: string; en: string }>;
      case "trust":
        return TRUST_FACTOR_LABELS as Record<string, { ko: string; en: string }>;
      case "action":
        return ACTION_LABELS as Record<string, { ko: string; en: string }>;
      case "risk":
        return RISK_LABELS as Record<string, { ko: string; en: string }>;
      case "differentiator":
        return DIFFERENTIATOR_LABELS as Record<string, { ko: string; en: string }>;
    }
  })();
  const entry = map[code];
  if (!entry) return code;
  return locale === "ko" ? entry.ko : entry.en;
}

/**
 * Build a prompt-friendly enum block listing every category code with
 * its locale-appropriate description. Used by the prompt builder so
 * the LLM sees the same definitions the renderer will use, avoiding
 * the LLM and the UI disagreeing on what each code means.
 */
export function taxonomyPromptBlock(
  taxonomy: "objection" | "trust" | "action" | "risk" | "differentiator",
  locale: "ko" | "en",
): string {
  const codes = (() => {
    switch (taxonomy) {
      case "objection":
        return OBJECTION_CATEGORIES;
      case "trust":
        return TRUST_FACTOR_CATEGORIES;
      case "action":
        return ACTION_CATEGORIES;
      case "risk":
        return RISK_CATEGORIES;
      case "differentiator":
        return DIFFERENTIATOR_CATEGORIES;
    }
  })();
  return codes
    .map((code) => {
      const label = categoryLabel(taxonomy, code, locale);
      const desc = (() => {
        switch (taxonomy) {
          case "objection":
            return OBJECTION_LABELS[code as ObjectionCategory].description;
          case "trust":
            return TRUST_FACTOR_LABELS[code as TrustFactorCategory].description;
          case "action":
            return ACTION_LABELS[code as ActionCategory].description;
          case "risk":
            return RISK_LABELS[code as RiskCategory].description;
          case "differentiator":
            return DIFFERENTIATOR_LABELS[code as DifferentiatorCategory].description;
        }
      })();
      return `  - ${code} (${label}): ${desc}`;
    })
    .join("\n");
}

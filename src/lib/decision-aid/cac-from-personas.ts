/**
 * Server-side CAC computation derived from the persona simulation.
 *
 * Why this exists: prior to 2026-05-10 we trusted the country-stage LLM
 * to emit cacEstimateUsd as a free-form number. Two failure modes
 * dominated:
 *
 *   1. LLM arithmetic noise — same prompt produced $7-$50 across sims
 *      for the same country-category. Median absorbed but hid the
 *      underlying inconsistency.
 *   2. Channel-cost data asymmetries — countries with rich
 *      LOCAL_CHANNEL_OVERRIDES (JP Rakuten, KR Coupang) got
 *      structurally lower CAC than countries without (SG, TW) before
 *      we filled the gaps. LLMs latched onto the data, not the market.
 *
 * The deeper issue: our product's value is the 5,000-persona simulation,
 * but CAC was computed in a parallel arithmetic that ignored persona
 * output entirely. This module fixes that — channel mix derives from
 * what personas in this country actually mention (Instagram 38% +
 * Shopee 31% + Reddit 12%), the per-channel cost is the cold-calibrated
 * channel-costs.ts data, and the new-brand multiplier is grounded in
 * category × originating-country × candidate-country friction.
 *
 * Output: a CAC range (low / median / high) plus benchmark sanity flag.
 * Range acknowledges inherent uncertainty rather than pretending one
 * number is exact.
 */

import {
  COUNTRY_COST_INDEX,
  CHANNEL_CATEGORY_MATRIX,
  LOCAL_CHANNEL_OVERRIDES,
  type Channel,
  type CostCategory,
  type CostMetrics,
  type LocalChannel,
  resolveCostCategory,
} from "@/lib/reference/channel-costs";
import {
  lookupBenchmark,
  type BenchmarkLookup,
} from "@/lib/reference/cac-benchmarks";

/* ────────────────────────────────── inputs ─── */

export interface PersonaForCac {
  country: string;
  purchaseIntent: number;
  voice?: string;
  trustFactors?: string[];
  objections?: string[];
  adReaction?: { curiosity: number; wouldClick: boolean };
}

export interface CacComputationInput {
  /** ISO country code (target market). */
  countryCode: string;
  /** Project category — drives benchmark lookup + channel CVR. */
  category: string | null | undefined;
  /** Origin / home market — drives new-brand multiplier and brand-stage. */
  originatingCountry: string;
  /** Personas in this candidate country. Funnel signal source. */
  personas: PersonaForCac[];
}

/* ────────────────────────────────── outputs ─── */

export interface CacChannelComponent {
  /** Display name (e.g. "Meta", "Shopee SG", "Rakuten Ads"). */
  channel: string;
  /** Share of mix, 0-1. */
  share: number;
  /** Per-conversion cost in USD at country-adjusted prices. */
  costPerConversionUsd: number;
  /** Source of this channel weight: persona mentions vs default mix. */
  source: "persona-mentions" | "default-mix" | "local-marketplace";
}

export interface CacRangeResult {
  /** Lower band — efficient execution scenario (USD). */
  lowUsd: number;
  /** Best-estimate point value (USD). */
  medianUsd: number;
  /** Upper band — friction-heavy scenario (USD). */
  highUsd: number;
  /** Per-channel decomposition that summed to median. */
  components: CacChannelComponent[];
  /** New-brand multiplier applied to the channel arithmetic. */
  newBrandMultiplier: number;
  /** Benchmark range used for sanity check. */
  benchmark: BenchmarkLookup;
  /** "OK" when median sits inside benchmark range; otherwise flag string. */
  benchmarkFlag:
    | { status: "in-range" }
    | { status: "below-range"; message: string }
    | { status: "above-range"; message: string };
  /** Persona pool size feeding this estimate. Used by renderer to gate
   *  display ("based on N personas") and skip when too thin. */
  personaSampleSize: number;
  /** Human-readable rationale for the renderer. KO + EN both supplied. */
  rationaleKo: string;
  rationaleEn: string;
}

/* ────────────────────────────────── channel-mention mapping ─── */

/**
 * Map a persona-mentioned channel display name (from CHANNEL_DICTIONARY
 * in ensemble.ts) to a channel-costs.ts ad-channel entry. Returns null
 * when the mention is a retail venue without matching ad-buying surface
 * (Sephora, Ulta, Boots, etc.) — those signal awareness of the venue
 * but don't directly imply ad spend allocation. Renderer notes this in
 * the rationale ("28% mention Sephora — implies retail-led launch").
 */
function mapPersonaChannelToAdChannel(
  channelDisplay: string,
  countryCode: string,
): { kind: "global"; channel: Channel } | { kind: "local"; index: number } | null {
  const upper = countryCode.toUpperCase();
  const locals = LOCAL_CHANNEL_OVERRIDES[upper] ?? [];
  const lower = channelDisplay.toLowerCase();

  // Local channel name matching first — Shopee in SG personas should map
  // to LOCAL_CHANNEL_OVERRIDES.SG[Shopee SG], not the global tiktok or
  // a generic fallback.
  const localMatchByName = locals.findIndex((lc) => {
    const lcName = lc.name.toLowerCase();
    return lcName.includes(lower) || lower.includes(lcName.split(/[ \/(]/)[0]);
  });
  if (localMatchByName >= 0) {
    return { kind: "local", index: localMatchByName };
  }

  // Global channel mappings.
  switch (lower) {
    case "amazon":
      return { kind: "global", channel: "amazon" };
    case "tiktok":
    case "tiktok shop":
      return { kind: "global", channel: "tiktok" };
    case "instagram":
      return { kind: "global", channel: "meta" };
    case "youtube":
      return { kind: "global", channel: "youtube" };
    case "reddit":
      return { kind: "global", channel: "reddit" };
    case "naver":
    case "coupang":
      // KR-local; if country is KR, find the matching local. Otherwise
      // mention doesn't apply (persona reference to source-market venue).
      if (upper === "KR") {
        const idx = locals.findIndex((lc) =>
          lc.name.toLowerCase().includes(lower),
        );
        return idx >= 0 ? { kind: "local", index: idx } : null;
      }
      return null;
    case "rakuten":
      if (upper === "JP") {
        const idx = locals.findIndex((lc) =>
          lc.name.toLowerCase().includes("rakuten"),
        );
        return idx >= 0 ? { kind: "local", index: idx } : null;
      }
      return null;
    case "shopee":
    case "lazada":
    case "qoo10":
      // SE Asia / SG / TW local marketplaces.
      const idx = locals.findIndex((lc) => lc.name.toLowerCase().includes(lower));
      return idx >= 0 ? { kind: "local", index: idx } : null;
    case "influencer":
      // Influencer marketing — split between TikTok and Meta in practice.
      // We map to tiktok for younger / SE Asia, meta for older / Western.
      return { kind: "global", channel: "tiktok" };
    default:
      // Retail channels (Sephora, Ulta, Boots, Olive Young, Cult Beauty,
      // YesStyle, Stylevana, Style Korean, Watsons, Cosme.com, Walmart,
      // Target, 11st) — no direct ad-channel mapping. Caller treats as
      // null and falls back to default mix.
      return null;
  }
}

/* ────────────────────────────────── persona channel extraction ─── */

const CHANNEL_DICTIONARY: Array<{ display: string; patterns: string[] }> = [
  { display: "Amazon", patterns: ["amazon", "아마존"] },
  { display: "TikTok Shop", patterns: ["tiktok shop", "tiktokshop", "틱톡샵"] },
  { display: "TikTok", patterns: ["tiktok", "틱톡"] },
  { display: "Instagram", patterns: ["instagram", "인스타그램", "인스타", "ig "] },
  { display: "YouTube", patterns: ["youtube", "youtuber", "유튜브", "유튜버"] },
  { display: "Reddit", patterns: ["reddit", "레딧", "/r/"] },
  { display: "Naver", patterns: ["naver shopping", "네이버", "스마트스토어"] },
  { display: "Coupang", patterns: ["coupang", "쿠팡"] },
  { display: "Rakuten", patterns: ["rakuten", "라쿠텐"] },
  { display: "Shopee", patterns: ["shopee", "쇼피"] },
  { display: "Lazada", patterns: ["lazada", "라자다"] },
  { display: "Qoo10", patterns: ["qoo10", "큐텐"] },
  { display: "Influencer", patterns: ["influencer", "인플루언서", "blogger", "블로거"] },
];

interface PersonaChannelMix {
  /** Channel display name → share of country personas mentioning it. */
  shareByChannel: Map<string, number>;
  /** Number of personas analyzed. */
  personaCount: number;
  /** Number of personas mentioning at least one channel. */
  withMentions: number;
}

function extractChannelMixFromPersonas(
  personas: PersonaForCac[],
): PersonaChannelMix {
  const result: PersonaChannelMix = {
    shareByChannel: new Map(),
    personaCount: personas.length,
    withMentions: 0,
  };
  if (personas.length === 0) return result;

  const counts = new Map<string, number>();
  for (const p of personas) {
    const haystack = [
      p.voice ?? "",
      ...(p.trustFactors ?? []),
      ...(p.objections ?? []),
    ]
      .join(" ")
      .toLowerCase();
    if (!haystack.trim()) continue;

    const matched = new Set<string>();
    for (const entry of CHANNEL_DICTIONARY) {
      if (matched.has(entry.display)) continue;
      for (const pat of entry.patterns) {
        if (haystack.includes(pat)) {
          matched.add(entry.display);
          break;
        }
      }
    }
    if (matched.size > 0) result.withMentions += 1;
    for (const ch of matched) {
      counts.set(ch, (counts.get(ch) ?? 0) + 1);
    }
  }

  for (const [ch, n] of counts.entries()) {
    result.shareByChannel.set(ch, n / personas.length);
  }
  return result;
}

/* ────────────────────────────────── new-brand multiplier matrix ─── */

/**
 * New-brand awareness multiplier derived from category × originating ×
 * candidate combinations. Captures the trust-gap inflation a cross-
 * border launch faces vs domestic. K-cultural-halo categories landing
 * in JP / SE Asia / TW get the lowest multiplier (pre-existing tailwind
 * shrinks awareness gap). Premium/luxury entering low-context Western
 * markets gets the highest. Domestic (originating === candidate) gets
 * 1.0 (no awareness gap).
 */
function computeNewBrandMultiplier(opts: {
  category: string | null | undefined;
  originatingCountry: string;
  candidateCountry: string;
}): { value: number; reason: string } {
  const orig = opts.originatingCountry.toUpperCase();
  const cand = opts.candidateCountry.toUpperCase();
  if (orig === cand) {
    return { value: 1.0, reason: "domestic launch — no awareness gap" };
  }
  const cat = resolveCostCategory(opts.category);

  // K-cultural-halo: KR-origin beauty / fashion / food / ip into JP /
  // SE Asia / TW where K-wave already operates as awareness preload.
  const KHALO_CATEGORIES = new Set<CostCategory>(["beauty", "fashion", "food", "ip"]);
  const KHALO_TARGETS = new Set([
    "JP", "TW", "TH", "VN", "ID", "PH", "MY", "SG", "HK", "CN",
  ]);
  if (orig === "KR" && KHALO_CATEGORIES.has(cat) && KHALO_TARGETS.has(cand)) {
    return { value: 1.4, reason: "K-cultural halo (K-wave precedent in target market)" };
  }

  // Premium-trust gates: SaaS / health / electronics into low-context
  // Western markets (US, UK, DE, NL) — buyer expects review depth and
  // certifications before trust transfers.
  const PREMIUM_CATEGORIES = new Set<CostCategory>(["saas", "health", "electronics"]);
  const LOW_CONTEXT_WESTERN = new Set(["US", "GB", "DE", "NL", "AU", "CA"]);
  if (PREMIUM_CATEGORIES.has(cat) && LOW_CONTEXT_WESTERN.has(cand)) {
    return { value: 1.9, reason: "premium-trust category in low-context market — needs review depth + certs" };
  }

  // Default cross-border DTC.
  return { value: 1.6, reason: "typical cross-border DTC awareness gap" };
}

/* ────────────────────────────────── CAC arithmetic ─── */

interface ChannelCost {
  display: string;
  metrics: CostMetrics;
  countryIndex: number;
}

function costPerConversion(cost: ChannelCost): number | null {
  // Effective CPC: prefer explicit CPC if set; else derive from CPM × CTR.
  let cpc: number | null = null;
  if (cost.metrics.cpcUsd !== null && cost.metrics.cpcUsd > 0) {
    cpc = cost.metrics.cpcUsd * cost.countryIndex;
  } else if (cost.metrics.cpmUsd > 0 && cost.metrics.ctrPct > 0) {
    cpc = (cost.metrics.cpmUsd * cost.countryIndex) / 1000 / (cost.metrics.ctrPct / 100);
  }
  if (cpc === null || cpc <= 0) return null;
  if (cost.metrics.cvrPct <= 0) return null;
  return cpc / (cost.metrics.cvrPct / 100);
}

/**
 * Default channel mix when persona mentions don't cover ≥30% of
 * personas. Heavy on Meta + Google for general DTC, with a slot for
 * the country's top local-marketplace channel when one exists.
 */
function defaultChannelMix(
  countryCode: string,
  category: CostCategory,
): Array<{ channel: ChannelCost; share: number; display: string; source: CacChannelComponent["source"] }> {
  const idx = COUNTRY_COST_INDEX[countryCode.toUpperCase()]?.index ?? 0.7;
  const out: Array<{
    channel: ChannelCost;
    share: number;
    display: string;
    source: CacChannelComponent["source"];
  }> = [];

  const meta: ChannelCost = {
    display: "Meta (default)",
    metrics: CHANNEL_CATEGORY_MATRIX.meta[category],
    countryIndex: idx,
  };
  const google: ChannelCost = {
    display: "Google Search (default)",
    metrics: CHANNEL_CATEGORY_MATRIX.googleSearch[category],
    countryIndex: idx,
  };

  // Pick the country's strongest local-marketplace channel if any —
  // gives the country structural parity with the rest of our matrix.
  const locals = LOCAL_CHANNEL_OVERRIDES[countryCode.toUpperCase()] ?? [];
  const strongLocal = locals.find((lc) => lc.strongCategories.includes(category));

  if (strongLocal) {
    out.push({
      channel: localToChannelCost(strongLocal, idx),
      share: 0.3,
      display: strongLocal.name + " (default)",
      source: "local-marketplace",
    });
    out.push({ channel: meta, share: 0.45, display: meta.display, source: "default-mix" });
    out.push({ channel: google, share: 0.25, display: google.display, source: "default-mix" });
  } else {
    out.push({ channel: meta, share: 0.6, display: meta.display, source: "default-mix" });
    out.push({ channel: google, share: 0.4, display: google.display, source: "default-mix" });
  }
  return out;
}

function localToChannelCost(lc: LocalChannel, countryIndex: number): ChannelCost {
  return {
    display: lc.name,
    metrics: {
      cpmUsd: lc.cpmUsd,
      cpcUsd: lc.cpcUsd,
      ctrPct: lc.ctrPct,
      cvrPct: lc.cvrPct,
    },
    countryIndex,
  };
}

/* ────────────────────────────────── main entry ─── */

export function computeCacFromPersonas(
  input: CacComputationInput,
): CacRangeResult | null {
  const { countryCode, category, originatingCountry, personas } = input;
  if (personas.length < 5) return null;

  const cat = resolveCostCategory(category);
  const idx = COUNTRY_COST_INDEX[countryCode.toUpperCase()]?.index ?? 0.7;
  const mix = extractChannelMixFromPersonas(personas);

  // Build the channel mix used for CAC arithmetic. When persona mentions
  // cover < 25% of personas, the signal is too thin and we use the
  // default mix instead. When > 25%, we use the top mappable mentions
  // to weight the mix; channels not mappable to ad-channel surfaces
  // (Sephora, Ulta, Boots — retail venues) drop out.
  const persRatioWithMentions = mix.withMentions / personas.length;
  let mixComponents: Array<{
    channel: ChannelCost;
    share: number;
    display: string;
    source: CacChannelComponent["source"];
  }> = [];

  if (persRatioWithMentions >= 0.25) {
    // Map persona mentions to ad channels and normalize to 100%.
    const mappedShares: Array<{
      channel: ChannelCost;
      rawShare: number;
      display: string;
    }> = [];
    for (const [chDisplay, share] of mix.shareByChannel.entries()) {
      const mapping = mapPersonaChannelToAdChannel(chDisplay, countryCode);
      if (!mapping) continue;
      let costData: ChannelCost;
      let displayLabel: string;
      if (mapping.kind === "global") {
        costData = {
          display: chDisplay,
          metrics: CHANNEL_CATEGORY_MATRIX[mapping.channel][cat],
          countryIndex: idx,
        };
        displayLabel = chDisplay;
      } else {
        const local = (LOCAL_CHANNEL_OVERRIDES[countryCode.toUpperCase()] ?? [])[mapping.index];
        if (!local) continue;
        costData = localToChannelCost(local, idx);
        displayLabel = local.name;
      }
      mappedShares.push({ channel: costData, rawShare: share, display: displayLabel });
    }
    const totalRaw = mappedShares.reduce((s, m) => s + m.rawShare, 0);
    if (totalRaw > 0) {
      // Cap at top 4 channels; renormalize.
      const top = [...mappedShares].sort((a, b) => b.rawShare - a.rawShare).slice(0, 4);
      const topTotal = top.reduce((s, m) => s + m.rawShare, 0);
      mixComponents = top.map((m) => ({
        channel: m.channel,
        share: m.rawShare / topTotal,
        display: m.display,
        source: "persona-mentions",
      }));
    }
  }
  if (mixComponents.length === 0) {
    mixComponents = defaultChannelMix(countryCode, cat);
  }

  // Compute base blended CAC.
  let baseCac = 0;
  const components: CacChannelComponent[] = [];
  for (const m of mixComponents) {
    const cpc = costPerConversion(m.channel);
    if (cpc === null) continue;
    baseCac += m.share * cpc;
    components.push({
      channel: m.display,
      share: m.share,
      costPerConversionUsd: Math.round(cpc * 100) / 100,
      source: m.source,
    });
  }
  if (baseCac <= 0 || components.length === 0) return null;

  // Apply new-brand multiplier.
  const multiplier = computeNewBrandMultiplier({
    category,
    originatingCountry,
    candidateCountry: countryCode,
  });
  const median = baseCac * multiplier.value;

  // Range bands ±30% to acknowledge inherent uncertainty.
  const low = median * 0.7;
  const high = median * 1.4;

  // Benchmark sanity check.
  const benchmark = lookupBenchmark({
    category,
    originatingCountry,
    candidateCountry: countryCode,
  });
  let benchmarkFlag: CacRangeResult["benchmarkFlag"];
  if (median < benchmark.range.low * 0.5) {
    benchmarkFlag = {
      status: "below-range",
      message: `산출 CAC $${median.toFixed(0)}이 카테고리 벤치마크 ($${benchmark.range.low}-${benchmark.range.high})의 하한 이하 — 데이터 또는 가정 재검토 권장`,
    };
  } else if (median > benchmark.range.high * 1.5) {
    benchmarkFlag = {
      status: "above-range",
      message: `산출 CAC $${median.toFixed(0)}이 카테고리 벤치마크 ($${benchmark.range.low}-${benchmark.range.high})의 상한 초과 — premium 포지셔닝 또는 특수 채널 필요?`,
    };
  } else {
    benchmarkFlag = { status: "in-range" };
  }

  // Rationale prose for the renderer.
  const topComps = components.slice(0, 3).map((c) => `${c.channel} ${(c.share * 100).toFixed(0)}%`).join(" + ");
  const rationaleKo =
    `채널 mix (페르소나 언급 ${(persRatioWithMentions * 100).toFixed(0)}%): ${topComps}. ` +
    `채널 산술 base CAC $${baseCac.toFixed(2)} × 신규 브랜드 multiplier ${multiplier.value}× (${multiplier.reason}) = $${median.toFixed(2)}. ` +
    `벤치마크 (${benchmark.category}, ${benchmark.tier}, ${benchmark.stage}): $${benchmark.range.low}-${benchmark.range.high}.`;
  const rationaleEn =
    `Channel mix (persona-mentioned ${(persRatioWithMentions * 100).toFixed(0)}%): ${topComps}. ` +
    `Channel arithmetic base CAC $${baseCac.toFixed(2)} × new-brand multiplier ${multiplier.value}× (${multiplier.reason}) = $${median.toFixed(2)}. ` +
    `Benchmark (${benchmark.category}, ${benchmark.tier}, ${benchmark.stage}): $${benchmark.range.low}-${benchmark.range.high}.`;

  return {
    lowUsd: Math.round(low * 100) / 100,
    medianUsd: Math.round(median * 100) / 100,
    highUsd: Math.round(high * 100) / 100,
    components,
    newBrandMultiplier: multiplier.value,
    benchmark,
    benchmarkFlag,
    personaSampleSize: personas.length,
    rationaleKo,
    rationaleEn,
  };
}

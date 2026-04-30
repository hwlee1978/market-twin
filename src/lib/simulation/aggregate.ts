/**
 * Aggregation layer between raw personas and downstream LLM stages
 * (country scoring, pricing, synthesis).
 *
 * Why this exists:
 * - At ≥500 personas the original code paths only forwarded `avg intent`
 *   and `count` per country to the LLM, throwing away ~95% of persona
 *   signal. Aggregating into bounded statistical summaries lets us pass
 *   much richer grounding without prompt size growing with N.
 * - At ≥10k personas the bounded summaries are the only viable input —
 *   raw personas cannot fit in any model's context window, and the
 *   per-country aggregate is roughly the same size whether we have 100
 *   or 100k personas.
 *
 * Output shape (kept compact intentionally — easy to inline in prompts):
 *   - per-country: count, intent stats + histogram, top objections /
 *     trust factors / interests, distributions over profession / age /
 *     income / sensitivity, plus a small set of stratified exemplars
 *   - overall: total count, mean intent, sensitivity split
 */

import type { Persona } from "./schemas";

export interface FreqEntry {
  text: string;
  count: number;
}

export interface DistEntry {
  value: string;
  pct: number;
}

export interface SensitivitySplit {
  low: number;
  medium: number;
  high: number;
}

export interface CountryAggregate {
  country: string;
  count: number;

  /** Intent statistics. */
  intentMean: number;
  intentStd: number;
  /** 10 buckets covering [0,10), [10,20), ..., [90,100]. */
  intentHistogram: number[];
  highIntentPct: number;
  lowIntentPct: number;

  /** Top frequency-ranked entries from each free-text array field. */
  topObjections: FreqEntry[];
  topTrustFactors: FreqEntry[];
  topInterests: FreqEntry[];

  /** Distributions across structured fields. */
  professionDistribution: DistEntry[];
  ageDistribution: DistEntry[];
  incomeBandDistribution: DistEntry[];
  purchaseStyleDistribution: DistEntry[];
  priceSensitivity: SensitivitySplit;

  /** Stratified exemplars (full detail) — see selectExemplars. */
  exemplars: Persona[];
}

export interface SimulationAggregate {
  totalCount: number;
  byCountry: CountryAggregate[];
  overall: {
    intentMean: number;
    priceSensitivity: SensitivitySplit;
  };
}

const TOP_OBJECTIONS = 15;
const TOP_TRUST_FACTORS = 15;
const TOP_INTERESTS = 12;
const TOP_PROFESSIONS = 10;
const TOP_AGES = 6;
const TOP_INCOMES = 6;
const TOP_STYLES = 6;
const DEFAULT_EXEMPLARS = 5;

function freqCount(items: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const raw of items) {
    const key = raw.trim();
    if (!key) continue;
    m.set(key, (m.get(key) ?? 0) + 1);
  }
  return m;
}

function topN(map: Map<string, number>, n: number): FreqEntry[] {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([text, count]) => ({ text, count }));
}

function distribution(values: string[], n: number): DistEntry[] {
  if (values.length === 0) return [];
  const counts = freqCount(values);
  const total = values.length;
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([value, c]) => ({ value, pct: Math.round((c / total) * 100) }));
}

function intentHistogramOf(intents: number[]): number[] {
  const buckets = new Array(10).fill(0);
  for (const v of intents) {
    // 0–9 → bucket 0, 10–19 → bucket 1, …, 90–100 → bucket 9
    const idx = Math.min(9, Math.max(0, Math.floor(v / 10)));
    buckets[idx]++;
  }
  return buckets;
}

function meanStd(values: number[]): { mean: number; std: number } {
  if (values.length === 0) return { mean: 0, std: 0 };
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance =
    values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return { mean, std: Math.sqrt(variance) };
}

/**
 * Stratified picks across the intent range so the LLM sees high / mid / low
 * intent voices for each country, not just the modal segment. Falls back to
 * whatever's available if the country has fewer personas than `count`.
 */
function selectExemplars(personas: Persona[], count: number): Persona[] {
  if (personas.length <= count) return [...personas];
  const sorted = [...personas].sort((a, b) => a.purchaseIntent - b.purchaseIntent);
  const out: Persona[] = [];
  const seen = new Set<number>();
  for (let i = 0; i < count; i++) {
    // Evenly-spaced percentiles: 10, 30, 50, 70, 90 for count=5
    const pct = (i + 0.5) / count;
    const idx = Math.min(sorted.length - 1, Math.floor(pct * sorted.length));
    if (seen.has(idx)) continue;
    seen.add(idx);
    out.push(sorted[idx]);
  }
  return out;
}

function aggregateCountry(
  country: string,
  personas: Persona[],
  exemplarCount: number,
): CountryAggregate {
  const intents = personas.map((p) => p.purchaseIntent);
  const { mean, std } = meanStd(intents);

  const sens: SensitivitySplit = { low: 0, medium: 0, high: 0 };
  for (const p of personas) sens[p.priceSensitivity]++;

  return {
    country,
    count: personas.length,
    intentMean: Math.round(mean * 10) / 10,
    intentStd: Math.round(std * 10) / 10,
    intentHistogram: intentHistogramOf(intents),
    highIntentPct:
      personas.length > 0
        ? Math.round(
            (personas.filter((p) => p.purchaseIntent >= 70).length /
              personas.length) *
              100,
          )
        : 0,
    lowIntentPct:
      personas.length > 0
        ? Math.round(
            (personas.filter((p) => p.purchaseIntent < 35).length /
              personas.length) *
              100,
          )
        : 0,
    topObjections: topN(
      freqCount(personas.flatMap((p) => p.objections ?? [])),
      TOP_OBJECTIONS,
    ),
    topTrustFactors: topN(
      freqCount(personas.flatMap((p) => p.trustFactors ?? [])),
      TOP_TRUST_FACTORS,
    ),
    topInterests: topN(
      freqCount(personas.flatMap((p) => p.interests ?? [])),
      TOP_INTERESTS,
    ),
    professionDistribution: distribution(
      personas.map((p) => p.profession),
      TOP_PROFESSIONS,
    ),
    ageDistribution: distribution(
      personas.map((p) => p.ageRange),
      TOP_AGES,
    ),
    incomeBandDistribution: distribution(
      personas.map((p) => p.incomeBand),
      TOP_INCOMES,
    ),
    purchaseStyleDistribution: distribution(
      personas.map((p) => p.purchaseStyle),
      TOP_STYLES,
    ),
    priceSensitivity: sens,
    exemplars: selectExemplars(personas, exemplarCount),
  };
}

/**
 * Builds the full aggregate. `exemplarCount` is the target number of stratified
 * exemplars per country — defaults to 5, drop to 3 (or 0) when token budget is
 * tighter (e.g. very high persona counts pushing into 1M-context tier).
 */
export function aggregatePersonas(
  personas: Persona[],
  exemplarCount: number = DEFAULT_EXEMPLARS,
): SimulationAggregate {
  const byCode = new Map<string, Persona[]>();
  for (const p of personas) {
    const code = (p.country ?? "").toUpperCase() || "UNKNOWN";
    const list = byCode.get(code) ?? [];
    list.push(p);
    byCode.set(code, list);
  }

  // Sort country aggregates by descending count so the LLM sees the biggest
  // segments first when the prompt gets truncated by token limits.
  const byCountry = Array.from(byCode.entries())
    .map(([code, ps]) => aggregateCountry(code, ps, exemplarCount))
    .sort((a, b) => b.count - a.count);

  const overallSens: SensitivitySplit = { low: 0, medium: 0, high: 0 };
  for (const p of personas) overallSens[p.priceSensitivity]++;
  const { mean: overallMean } = meanStd(personas.map((p) => p.purchaseIntent));

  return {
    totalCount: personas.length,
    byCountry,
    overall: {
      intentMean: Math.round(overallMean * 10) / 10,
      priceSensitivity: overallSens,
    },
  };
}

/**
 * Compact, prompt-friendly text rendering of a SimulationAggregate. Designed
 * to fit comfortably in a synthesis prompt regardless of N — per country we
 * emit ~30 short lines, so 10 countries ≈ 300 lines / ~5–8k tokens.
 */
export function renderAggregateForPrompt(agg: SimulationAggregate, locale: "ko" | "en"): string {
  const isKo = locale === "ko";
  const L = (ko: string, en: string) => (isKo ? ko : en);

  const lines: string[] = [];
  lines.push(
    L(
      `═══ 페르소나 통계 요약 (총 ${agg.totalCount}명, 전체 평균 의향 ${agg.overall.intentMean}/100) ═══`,
      `═══ PERSONA STATS (total ${agg.totalCount}, overall mean intent ${agg.overall.intentMean}/100) ═══`,
    ),
  );

  for (const c of agg.byCountry) {
    lines.push("");
    lines.push(
      L(
        `[${c.country}] n=${c.count}, 평균 의향 ${c.intentMean} (σ ${c.intentStd}), 고의향 ${c.highIntentPct}% / 저의향 ${c.lowIntentPct}%`,
        `[${c.country}] n=${c.count}, mean intent ${c.intentMean} (σ ${c.intentStd}), high-intent ${c.highIntentPct}% / low-intent ${c.lowIntentPct}%`,
      ),
    );
    lines.push(
      L(
        `  의향 분포 [0-9..90-100]: [${c.intentHistogram.join(", ")}]`,
        `  intent histogram [0-9..90-100]: [${c.intentHistogram.join(", ")}]`,
      ),
    );
    lines.push(
      L(
        `  가격 민감도: low=${c.priceSensitivity.low} / med=${c.priceSensitivity.medium} / high=${c.priceSensitivity.high}`,
        `  price sensitivity: low=${c.priceSensitivity.low} / med=${c.priceSensitivity.medium} / high=${c.priceSensitivity.high}`,
      ),
    );

    if (c.professionDistribution.length > 0) {
      lines.push(
        L(
          `  직업 분포: ${c.professionDistribution.map((d) => `${d.value} ${d.pct}%`).join(" · ")}`,
          `  profession mix: ${c.professionDistribution.map((d) => `${d.value} ${d.pct}%`).join(" · ")}`,
        ),
      );
    }
    if (c.ageDistribution.length > 0) {
      lines.push(
        L(
          `  연령대: ${c.ageDistribution.map((d) => `${d.value} ${d.pct}%`).join(" · ")}`,
          `  age groups: ${c.ageDistribution.map((d) => `${d.value} ${d.pct}%`).join(" · ")}`,
        ),
      );
    }
    if (c.incomeBandDistribution.length > 0) {
      lines.push(
        L(
          `  소득대: ${c.incomeBandDistribution.map((d) => `${d.value} ${d.pct}%`).join(" · ")}`,
          `  income bands: ${c.incomeBandDistribution.map((d) => `${d.value} ${d.pct}%`).join(" · ")}`,
        ),
      );
    }
    if (c.topObjections.length > 0) {
      lines.push(
        L(
          `  주요 거부 요인 (top ${c.topObjections.length}): ${c.topObjections.map((e) => `${e.text} ×${e.count}`).join(" · ")}`,
          `  top objections (top ${c.topObjections.length}): ${c.topObjections.map((e) => `${e.text} ×${e.count}`).join(" · ")}`,
        ),
      );
    }
    if (c.topTrustFactors.length > 0) {
      lines.push(
        L(
          `  주요 신뢰 신호 (top ${c.topTrustFactors.length}): ${c.topTrustFactors.map((e) => `${e.text} ×${e.count}`).join(" · ")}`,
          `  top trust signals (top ${c.topTrustFactors.length}): ${c.topTrustFactors.map((e) => `${e.text} ×${e.count}`).join(" · ")}`,
        ),
      );
    }
    if (c.topInterests.length > 0) {
      lines.push(
        L(
          `  관심사: ${c.topInterests.map((e) => `${e.text} ×${e.count}`).join(" · ")}`,
          `  interests: ${c.topInterests.map((e) => `${e.text} ×${e.count}`).join(" · ")}`,
        ),
      );
    }
    if (c.exemplars.length > 0) {
      lines.push(L(`  대표 페르소나 ${c.exemplars.length}명:`, `  ${c.exemplars.length} exemplars:`));
      for (const ex of c.exemplars) {
        lines.push(
          `    • ${ex.profession} / ${ex.ageRange} / ${ex.incomeBand} / intent ${ex.purchaseIntent}/100` +
            (ex.objections.length > 0
              ? L(` — 우려: ${ex.objections.slice(0, 2).join(", ")}`, ` — concerns: ${ex.objections.slice(0, 2).join(", ")}`)
              : ""),
        );
      }
    }
  }
  return lines.join("\n");
}

"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { clsx } from "clsx";
import { ChevronDown, Database, MapPin, MessageSquareWarning, ShieldCheck } from "lucide-react";
import type { CountryScore, Persona, Risk } from "@/lib/simulation/schemas";
import { COUNTRIES, getCountryLabel } from "@/lib/countries";
import { HelpTooltip } from "@/components/ui/HelpTooltip";
import { isLocaleNative } from "@/lib/simulation/locale-filter";

// Stopwords stripped before risk↔text overlap. Korean particles + locale-agnostic
// risk-vocabulary terms are excluded so noun stems drive matching.
const STOPWORDS = new Set([
  "the", "and", "for", "this", "that", "with", "from", "into", "over", "under",
  "about", "are", "was", "were", "but", "not", "than", "such", "they", "them",
  "their", "there", "have", "has", "had", "will", "may", "can", "could",
  "would", "should", "might", "very", "more", "most", "some", "any", "all",
  "one", "two", "its", "also", "due", "because", "when", "where", "what",
  "which", "while", "high", "low", "medium", "risk", "risks", "factor",
  "level", "market", "markets", "product", "products", "concern", "concerns",
  "issue", "issues",
  "있다", "없다", "것은", "것을", "것이", "위해", "대한", "따라", "수도",
  "수가", "이다", "하다", "에서", "으로", "에게", "까지", "부터", "에도",
  "이며", "리스크", "위험", "우려", "문제",
]);

function tokenize(s: string): string[] {
  if (!s) return [];
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => {
      if (!t || STOPWORDS.has(t)) return false;
      const isCjk = /[\p{Script=Han}\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(t);
      return isCjk ? t.length >= 2 : t.length >= 3;
    });
}

interface LinkedObjection {
  text: string;
  count: number;
  score: number;
  /** Country code → occurrence count, sorted desc. */
  countryDist: Array<[string, number]>;
  /** Personas behind this objection — surfaced when the user expands the row. */
  personas: Persona[];
}

interface LinkedTrustFactor {
  text: string;
  count: number;
}

interface RiskImpact {
  affectedCount: number;
  totalCount: number;
  affectedPct: number;
  affectedAvgIntent: number;
  overallAvgIntent: number;
  delta: number;
}

interface AffectedSegment {
  /** Top profession(s) — most-frequent up to two when there's a clear runner-up. */
  professions: string[];
  /** Top age range. */
  ageRange: string | null;
  /** Top income band. */
  incomeBand: string | null;
}

interface SensitivityDist {
  low: number;
  medium: number;
  high: number;
  total: number;
}

interface AffectedCountries {
  list: CountryScore[];
  /** True when no country was named in the risk text — falling back to lowest-scoring. */
  implied: boolean;
}

/** Most-common value(s). Ties up to `keep` are returned to avoid hiding a real second-place. */
function topModes(values: string[], keep = 1): string[] {
  if (values.length === 0) return [];
  const counts = new Map<string, number>();
  for (const v of values) {
    const k = v.trim();
    if (!k) continue;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0) return [];
  const out: string[] = [sorted[0][0]];
  // Include runner-up when its count is at least half the leader's — meaningful split,
  // not noise.
  for (let i = 1; i < sorted.length && out.length < keep + 1; i++) {
    if (sorted[i][1] * 2 >= sorted[0][1]) out.push(sorted[i][0]);
    else break;
  }
  return out;
}

/**
 * Single-pass analysis: identifies the personas whose objections share keywords with
 * the risk, then derives objection groupings (with per-country counts), trust-factor
 * aggregation (only from affected personas), the affected-segment profile, the
 * price-sensitivity distribution, and the quantitative impact stat.
 */
function analyzeRisk(risk: Risk, personas: Persona[], locale: string) {
  const riskTokens = new Set(tokenize(`${risk.factor} ${risk.description}`));
  const affectedPersonas = new Set<Persona>();

  type ObjGroup = { text: string; count: number; score: number; personas: Persona[] };
  const objGroups = new Map<string, ObjGroup>();

  if (riskTokens.size > 0) {
    for (const p of personas) {
      let pHasMatch = false;
      for (const raw of p.objections ?? []) {
        const text = raw.trim();
        if (!text) continue;
        // Skip locale-leaked text — keeps cross-language items out of the aggregation.
        if (!isLocaleNative(text, locale)) continue;
        let hits = 0;
        for (const t of tokenize(text)) if (riskTokens.has(t)) hits++;
        if (hits === 0) continue;
        pHasMatch = true;

        const key = text.toLowerCase();
        const existing = objGroups.get(key);
        if (existing) {
          existing.count++;
          existing.personas.push(p);
        } else {
          objGroups.set(key, { text, count: 1, score: hits, personas: [p] });
        }
      }
      if (pHasMatch) affectedPersonas.add(p);
    }
  }

  const objections: LinkedObjection[] = Array.from(objGroups.values())
    .map((o) => {
      const dist = new Map<string, number>();
      for (const p of o.personas) {
        const c = (p.country ?? "").toUpperCase();
        if (!c) continue;
        dist.set(c, (dist.get(c) ?? 0) + 1);
      }
      return {
        text: o.text,
        count: o.count,
        score: o.score,
        countryDist: Array.from(dist.entries()).sort((a, b) => b[1] - a[1]),
        personas: o.personas,
      };
    })
    .sort((a, b) => b.score * b.count - a.score * a.count || b.count - a.count)
    .slice(0, 5);

  const tfGroups = new Map<string, LinkedTrustFactor>();
  for (const p of affectedPersonas) {
    for (const raw of p.trustFactors ?? []) {
      const text = raw.trim();
      if (!text) continue;
      if (!isLocaleNative(text, locale)) continue;
      const key = text.toLowerCase();
      const existing = tfGroups.get(key);
      if (existing) existing.count++;
      else tfGroups.set(key, { text, count: 1 });
    }
  }
  const trustFactors = Array.from(tfGroups.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  let impact: RiskImpact | null = null;
  let segment: AffectedSegment | null = null;
  let sensitivity: SensitivityDist | null = null;

  if (personas.length > 0 && affectedPersonas.size > 0) {
    const total = personas.length;
    const affected = Array.from(affectedPersonas);
    const affectedCount = affected.length;
    const overallAvg = Math.round(
      personas.reduce((s, p) => s + p.purchaseIntent, 0) / total,
    );
    const affectedAvg = Math.round(
      affected.reduce((s, p) => s + p.purchaseIntent, 0) / affectedCount,
    );
    impact = {
      affectedCount,
      totalCount: total,
      affectedPct: Math.round((affectedCount / total) * 100),
      affectedAvgIntent: affectedAvg,
      overallAvgIntent: overallAvg,
      delta: affectedAvg - overallAvg,
    };

    segment = {
      professions: topModes(affected.map((p) => p.profession), 1),
      ageRange: topModes(affected.map((p) => p.ageRange), 0)[0] ?? null,
      incomeBand: topModes(affected.map((p) => p.incomeBand), 0)[0] ?? null,
    };

    const sCounts = { low: 0, medium: 0, high: 0 };
    for (const p of affected) sCounts[p.priceSensitivity]++;
    sensitivity = { ...sCounts, total: affectedCount };
  }

  return { objections, trustFactors, impact, segment, sensitivity };
}

function affectedCountries(
  risk: Risk,
  countries: CountryScore[],
  locale: string,
): AffectedCountries {
  const txt = `${risk.factor} ${risk.description}`.toLowerCase();
  const direct = countries.filter((c) => {
    const code = c.country.toLowerCase();
    if (txt.includes(` ${code} `) || txt.startsWith(`${code} `) || txt.endsWith(` ${code}`)) {
      return true;
    }
    const labelEn = COUNTRIES.find((x) => x.code === c.country.toUpperCase())?.labelEn?.toLowerCase();
    if (labelEn && txt.includes(labelEn)) return true;
    const labelLocale = getCountryLabel(c.country, locale).toLowerCase();
    if (labelLocale && txt.includes(labelLocale)) return true;
    return false;
  });
  if (direct.length > 0) return { list: direct.slice(0, 4), implied: false };
  if (countries.length === 0) return { list: [], implied: true };
  const sorted = [...countries].sort((a, b) => a.finalScore - b.finalScore);
  return { list: sorted.slice(0, 2), implied: true };
}

export function RisksTab({
  risks,
  personas = [],
  countries = [],
  sources = [],
}: {
  risks: Risk[];
  personas?: Persona[];
  countries?: CountryScore[];
  sources?: string[];
}) {
  const t = useTranslations("results.risks");
  const tImpact = useTranslations("results.risks.impact");
  const locale = useLocale();
  // Keyed `${riskIdx}::${objectionTextLower}`. Single-slot so cards don't all balloon
  // at once — clicking a different objection collapses any prior one.
  const [expanded, setExpanded] = useState<string | null>(null);

  const enriched = useMemo(
    () =>
      risks.map((r) => {
        const a = analyzeRisk(r, personas, locale);
        return {
          risk: r,
          ...a,
          countries: affectedCountries(r, countries, locale),
        };
      }),
    [risks, personas, countries, locale],
  );

  // Rank risks by affected-persona count (descending). Risks with no impact
  // share the trailing rank — we omit the label for them in the UI.
  const rankByIdx = useMemo(() => {
    const sorted = enriched
      .map((e, i) => ({ idx: i, score: e.impact?.affectedCount ?? 0 }))
      .sort((a, b) => b.score - a.score);
    const map = new Map<number, number>();
    sorted.forEach((r, rank) => map.set(r.idx, rank + 1));
    return map;
  }, [enriched]);

  if (risks.length === 0) {
    return <div className="card text-center text-slate-500 text-sm">{t("noRisks")}</div>;
  }

  const showLegend = enriched.some((e) => e.impact !== null);
  const totalRisks = enriched.length;

  return (
    <div className="space-y-4">
      {showLegend && <ImpactLegend />}
      {enriched.map((e, i) => {
        const hasEvidence =
          e.objections.length > 0 ||
          e.trustFactors.length > 0 ||
          e.countries.list.length > 0;
        const hasProfile = e.segment !== null || e.sensitivity !== null;
        const rank = e.impact ? rankByIdx.get(i) : undefined;

        return (
          <div key={i} className="card">
            <div className="flex items-start gap-5">
              <span
                className={clsx(
                  "badge mt-0.5 shrink-0",
                  e.risk.severity === "high"
                    ? "bg-risk-soft text-risk"
                    : e.risk.severity === "medium"
                      ? "bg-warn-soft text-warn"
                      : "bg-success-soft text-success",
                )}
              >
                {e.risk.severity.toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="font-semibold text-slate-900">{e.risk.factor}</div>
                  {rank && (
                    <span className="inline-flex items-center gap-1 text-xs text-slate-400 tabular-nums shrink-0">
                      {t("rank", { n: rank, total: totalRisks })}
                      <HelpTooltip text={t("rankHelp")} />
                    </span>
                  )}
                </div>
                <p className="prose-body mt-2">{e.risk.description}</p>

                {e.impact && <ImpactRow impact={e.impact} t={tImpact} />}

                {hasProfile && (
                  <ProfileRow
                    segment={e.segment}
                    sensitivity={e.sensitivity}
                    locale={locale}
                  />
                )}

                {hasEvidence && (
                  <div className="mt-5 pt-4 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-5">
                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-2 inline-flex items-center gap-1.5">
                        <MessageSquareWarning size={12} />
                        {t("linkedObjections")}
                      </div>
                      {e.objections.length === 0 ? (
                        <p className="text-xs text-slate-500 leading-relaxed">
                          {t("noLinkedObjections")}
                        </p>
                      ) : (
                        <ul className="space-y-1.5 text-sm">
                          {e.objections.map((o) => {
                            const key = `${i}::${o.text.toLowerCase()}`;
                            const isOpen = expanded === key;
                            return (
                              <li key={o.text}>
                                <button
                                  type="button"
                                  onClick={() => setExpanded(isOpen ? null : key)}
                                  className="w-full flex items-start gap-2 text-left hover:bg-slate-50 rounded -mx-1 px-1 py-0.5 transition-colors"
                                  aria-expanded={isOpen}
                                  aria-label={isOpen ? t("collapse") : t("expand")}
                                >
                                  <span className="badge bg-slate-100 text-slate-600 shrink-0 tabular-nums">
                                    ×{o.count}
                                  </span>
                                  <span className="flex-1 min-w-0">
                                    <span className="text-slate-700">{o.text}</span>
                                    {o.countryDist.length > 0 && (
                                      <span className="ml-2 text-[11px] text-slate-400 tabular-nums whitespace-nowrap">
                                        {o.countryDist
                                          .map(([c, n]) => `${c} ${n}`)
                                          .join(" · ")}
                                      </span>
                                    )}
                                  </span>
                                  <ChevronDown
                                    size={12}
                                    className={clsx(
                                      "mt-1 text-slate-400 shrink-0 transition-transform",
                                      isOpen && "rotate-180",
                                    )}
                                  />
                                </button>
                                {isOpen && (
                                  <ObjectionPersonas
                                    personas={o.personas}
                                    locale={locale}
                                    t={t}
                                  />
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>

                    <div>
                      <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-2 inline-flex items-center gap-1.5">
                        <ShieldCheck size={12} />
                        {t("mitigatingTrustFactors")}
                      </div>
                      {e.trustFactors.length === 0 ? (
                        <p className="text-xs text-slate-500 leading-relaxed">
                          {t("noMitigation")}
                        </p>
                      ) : (
                        <>
                          <ul className="space-y-1.5 text-sm">
                            {e.trustFactors.map((tf) => (
                              <li key={tf.text} className="flex items-start gap-2">
                                <span className="badge bg-success-soft text-success shrink-0 tabular-nums">
                                  ×{tf.count}
                                </span>
                                <span className="text-slate-700">{tf.text}</span>
                              </li>
                            ))}
                          </ul>
                          <p className="mt-2 text-[11px] text-slate-400 leading-relaxed">
                            {t("mitigatingTrustFactorsHint")}
                          </p>
                        </>
                      )}
                    </div>

                    {e.countries.list.length > 0 && (
                      <div>
                        <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-2 inline-flex items-center gap-1.5">
                          <MapPin size={12} />
                          {e.countries.implied ? t("weakestMarkets") : t("affectedMarkets")}
                        </div>
                        <ul className="space-y-1.5 text-sm">
                          {e.countries.list.map((c) => (
                            <li
                              key={c.country}
                              className="flex items-center justify-between gap-3"
                            >
                              <span className="text-slate-700">
                                {getCountryLabel(c.country, locale) || c.country}
                              </span>
                              <span className="text-xs text-slate-500 tabular-nums">
                                {t("score")} {c.finalScore.toFixed(0)}
                              </span>
                            </li>
                          ))}
                        </ul>
                        {e.countries.implied && (
                          <p className="mt-2 text-[11px] text-slate-400 leading-relaxed">
                            {t("weakestMarketsHint")}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {sources.length > 0 && (
        <div className="card bg-slate-50 border-slate-200">
          <div className="flex items-start gap-3">
            <Database size={16} className="text-slate-400 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                {t("anchoredOn")}
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">{sources.join(" · ")}</p>
              <p className="mt-2 text-[11px] text-slate-400 leading-relaxed">
                {t("anchoredHint")}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ImpactLegend() {
  const t = useTranslations("results.risks.legend");
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 pb-1">
      <span className="inline-flex items-center gap-1.5 font-medium">
        {t("title")}
        <HelpTooltip text={t("help")} />
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block w-2.5 h-2.5 rounded-full bg-risk" />
        <span className="text-slate-700">{t("high")}</span>
        <span className="text-slate-400 tabular-nums">{t("highRange")}</span>
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block w-2.5 h-2.5 rounded-full bg-warn" />
        <span className="text-slate-700">{t("medium")}</span>
        <span className="text-slate-400 tabular-nums">{t("mediumRange")}</span>
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block w-2.5 h-2.5 rounded-full bg-slate-400" />
        <span className="text-slate-700">{t("low")}</span>
        <span className="text-slate-400 tabular-nums">{t("lowRange")}</span>
      </span>
    </div>
  );
}

function ImpactRow({
  impact,
  t,
}: {
  impact: RiskImpact;
  t: ReturnType<typeof useTranslations>;
}) {
  const deltaTone =
    impact.delta <= -10
      ? "text-risk"
      : impact.delta < 0
        ? "text-warn"
        : "text-slate-500";
  const deltaText =
    impact.delta > 0 ? t("deltaPositive", { n: impact.delta }) : t("deltaNeutral", { n: impact.delta });

  return (
    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500 tabular-nums">
      <span>
        {t("affected")}{" "}
        <span className="text-slate-700 font-medium">
          {t("affectedValue", {
            n: impact.affectedCount,
            total: impact.totalCount,
            pct: impact.affectedPct,
          })}
        </span>
      </span>
      <span>
        {t("avgIntent")}{" "}
        <span className="text-slate-700 font-medium">
          {t("avgIntentValue", { n: impact.affectedAvgIntent })}
        </span>
      </span>
      <span>
        {t("delta")} <span className={clsx(deltaTone, "font-medium")}>{deltaText}</span>
      </span>
    </div>
  );
}

function ProfileRow({
  segment,
  sensitivity,
  locale,
}: {
  segment: AffectedSegment | null;
  sensitivity: SensitivityDist | null;
  locale: string;
}) {
  const t = useTranslations("results.risks");

  const segmentBits: string[] = [];
  if (segment) {
    if (segment.professions.length > 0) segmentBits.push(segment.professions.join(" · "));
    if (segment.ageRange) segmentBits.push(segment.ageRange);
    if (segment.incomeBand) segmentBits.push(segment.incomeBand);
  }
  // Suppress empty profile blocks so we don't render a label with no value.
  void locale;

  return (
    <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
      {segmentBits.length > 0 && (
        <div className="text-xs text-slate-500">
          <span className="font-medium text-slate-600">{t("affectedSegment")}:</span>{" "}
          <span className="text-slate-700">{segmentBits.join(" · ")}</span>
        </div>
      )}
      {sensitivity && sensitivity.total > 0 && (
        <SensitivityMini sensitivity={sensitivity} t={t} />
      )}
    </div>
  );
}

function SensitivityMini({
  sensitivity,
  t,
}: {
  sensitivity: SensitivityDist;
  t: ReturnType<typeof useTranslations>;
}) {
  const { low, medium, high, total } = sensitivity;
  const lowPct = Math.round((low / total) * 100);
  const medPct = Math.round((medium / total) * 100);
  const highPct = Math.round((high / total) * 100);

  return (
    <div className="text-xs text-slate-500">
      <div className="flex items-center gap-3">
        <span className="font-medium text-slate-600 shrink-0">{t("priceSensitivity")}:</span>
        <div className="flex h-2 flex-1 min-w-0 rounded-full overflow-hidden bg-slate-100">
          {lowPct > 0 && (
            <div className="bg-success" style={{ width: `${lowPct}%` }} title={`low ${lowPct}%`} />
          )}
          {medPct > 0 && (
            <div className="bg-warn" style={{ width: `${medPct}%` }} title={`medium ${medPct}%`} />
          )}
          {highPct > 0 && (
            <div className="bg-risk" style={{ width: `${highPct}%` }} title={`high ${highPct}%`} />
          )}
        </div>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] tabular-nums">
        <span>
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-success mr-1" />
          {t("sensitivityLow")} {lowPct}%
        </span>
        <span>
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-warn mr-1" />
          {t("sensitivityMedium")} {medPct}%
        </span>
        <span>
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-risk mr-1" />
          {t("sensitivityHigh")} {highPct}%
        </span>
      </div>
    </div>
  );
}

function ObjectionPersonas({
  personas,
  locale,
  t,
}: {
  personas: Persona[];
  locale: string;
  t: ReturnType<typeof useTranslations>;
}) {
  const MAX = 8;
  const shown = personas.slice(0, MAX);
  const more = personas.length - shown.length;

  return (
    <div className="mt-1 ml-7 mb-1 space-y-0.5 text-xs text-slate-500">
      {shown.map((p, idx) => (
        <div key={p.id ?? idx} className="flex items-center gap-1.5">
          <span className="text-slate-300">•</span>
          <span className="text-slate-600">
            {p.profession}, {p.ageRange}, {getCountryLabel(p.country, locale) || p.country}
          </span>
          <span className="text-slate-300">—</span>
          <span className="tabular-nums">{t("personaIntent", { n: p.purchaseIntent })}</span>
        </div>
      ))}
      {more > 0 && (
        <div className="text-slate-400 pl-3">{t("morePersonas", { n: more })}</div>
      )}
    </div>
  );
}

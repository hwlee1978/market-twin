/**
 * What a tier is called, how big it is, and how long it takes — in one
 * place.
 *
 * These three facts were written out separately in the tier dropdown,
 * three comparison screens, the help page, the beta landing page and the
 * projects empty state. They drifted: the dropdown said a Hypothesis run
 * takes 5-6 minutes, the help page said the same, and the measured
 * median was 8. Fixing the published times meant finding six copies, and
 * one was still missed on the first pass.
 *
 * Client-safe on purpose: no import of the orchestrator, which pulls the
 * LLM SDKs. `personas` therefore duplicates TIER_PRESETS' sim count ×
 * personas-per-sim rather than deriving it — keep them in step when a
 * preset changes.
 */

export type Tier = "hypothesis" | "decision" | "decision_plus" | "deep" | "deep_pro";

export interface TierDisplay {
  /** Customer-facing name. The key ("decision") is internal and never shown. */
  name: { ko: string; en: string };
  /** Total personas across the run — parallelSims × perSimPersonas. */
  personas: number;
  /**
   * Wall-clock range shown to the user.
   *
   * Measured from completed runs since 2026-09 (p10–p90, zombies and
   * instant failures excluded): hypothesis n=281 → 6/8/10 min,
   * decision n=5 → 17/18/18, decision_plus n=1 → 19.
   *
   * `deep` and `deep_pro` have no completed run to measure. Their ranges
   * are inferred from the others, which barely move with sim count
   * because the sims run in parallel — 15 sims took 19 minutes against 6
   * sims' 18. Re-measure before treating them as fact.
   */
  minutes: { ko: string; en: string };
  /** Whether the tier is offered in the run dropdown. */
  selectable: boolean;
}

export const TIER_DISPLAY: Record<Tier, TierDisplay> = {
  hypothesis: {
    name: { ko: "초기검증", en: "Hypothesis" },
    personas: 600,
    minutes: { ko: "약 6~10분", en: "~6-10 min" },
    selectable: true,
  },
  decision: {
    name: { ko: "검증분석", en: "Consensus" },
    personas: 1200,
    minutes: { ko: "약 15~20분", en: "~15-20 min" },
    selectable: true,
  },
  decision_plus: {
    name: { ko: "검증분석 Plus", en: "Consensus Plus" },
    personas: 3000,
    minutes: { ko: "약 20분", en: "~20 min" },
    selectable: true,
  },
  deep: {
    name: { ko: "심층분석", en: "Triangulated" },
    personas: 5000,
    minutes: { ko: "약 20~30분", en: "~20-30 min" },
    selectable: true,
  },
  deep_pro: {
    // Not offered in the dropdown: 50 sims × multi-LLM exceeds Vercel's
    // maxDuration today. The API still accepts it for CLI runs, and
    // finished deep_pro ensembles still need a label on the comparison
    // screens, so it stays in the table.
    name: { ko: "심층분석 Pro", en: "Triangulated Pro" },
    personas: 10000,
    minutes: { ko: "약 30분+", en: "~30 min+" },
    selectable: false,
  },
};

/** The tier's customer-facing name. */
export function tierName(tier: Tier, locale: string): string {
  return TIER_DISPLAY[tier]?.name[locale === "ko" ? "ko" : "en"] ?? tier;
}

/** One dropdown row: "검증분석 · 1,200명 · 약 15~20분". */
export function tierOptionLabel(tier: Tier, locale: string): string {
  const d = TIER_DISPLAY[tier];
  if (!d) return tier;
  const isKo = locale === "ko";
  const lang = isKo ? "ko" : "en";
  const multiLLM = tier === "deep" || tier === "deep_pro" ? (isKo ? " · 멀티 LLM" : " · multi-LLM") : "";
  const people = isKo
    ? `${d.personas.toLocaleString()}명`
    : `${d.personas.toLocaleString()} personas`;
  return `${d.name[lang]} · ${people}${multiLLM} · ${d.minutes[lang]}`;
}

/** Tiers offered in the run dropdown, cheapest first. */
export const SELECTABLE_TIERS: Tier[] = (
  Object.keys(TIER_DISPLAY) as Tier[]
).filter((t) => TIER_DISPLAY[t].selectable);

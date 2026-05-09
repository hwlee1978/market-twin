/**
 * Simulation quality audit. Runs after every successful sim with the
 * same data the runner already has in memory (personas, country
 * scores, pricing, voice-slip stats). Output is a quality score
 * (0-100) + a list of warnings, persisted to simulation_quality.
 *
 * Design principles:
 *   - Best-effort: any check that throws falls through silently. The
 *     audit must never roll back a successful sim.
 *   - Cheap: no LLM calls, no external HTTP. Pure in-process math
 *     against data we already have.
 *   - Honest: thresholds are tuned conservatively so a "60+" score
 *     means "trustworthy", and a quarantine flag means "really
 *     don't ship this one".
 */

import { createServiceClient } from "@/lib/supabase/admin";
import type { CountryScore, Persona, PricingResult } from "@/lib/simulation/schemas";

export type WarningSeverity = "info" | "warning" | "critical";

export interface QualityWarning {
  code: string;
  severity: WarningSeverity;
  message: string;
  /** Numeric value the check evaluated (rate, range, etc.). */
  value: number;
  /** Threshold the value crossed to trigger the warning. */
  threshold: number;
}

export interface QualityAuditInput {
  simulationId: string;
  workspaceId: string;
  /** Personas the sim emitted (pre-aggregation). Reaction fields ignored except voice. */
  personas: Pick<Persona, "country" | "incomeBand" | "profession" | "purchaseIntent" | "voice">[];
  /** Country-score sample medians (already aggregated). */
  countries: CountryScore[];
  /** Pricing aggregate output. */
  pricing?: PricingResult | null;
  /** Project's base price in cents. Used for the "price in band" check. */
  basePriceCents?: number | null;
  /** Voice-slip rate the runner already computed (0-1). null if not measured. */
  voiceSlipRate?: number | null;
  /**
   * Total count of channel-mismatch rewrites the runner's country-channel
   * sanitizer applied (e.g., a Vietnamese persona who mentioned Coupang).
   * Normalised against persona count downstream into channelMismatchRate.
   */
  channelMismatchCount?: number;
  /** Whether the synthesis stage fell over to a backup provider. */
  synthesisFailover: boolean;
  /** Effective persona count after generation (some may have been skipped). */
  personaCount: number;
  /** Expected per-sim persona count from the tier preset. */
  personaCountTarget: number;
}

export interface QualityAuditResult {
  confidenceScore: number;
  quarantined: boolean;
  warnings: QualityWarning[];
  metrics: {
    voiceSlipRate: number | null;
    countryScoreUniformity: number;
    countryScoreRange: number;
    professionDiversity: number;
    incomeDriftPct: number;
    priceInBand: boolean;
    synthesisFailover: boolean;
    /**
     * Fraction of voice quotes that have at least one near-duplicate
     * (token-set Jaccard ≥ 0.7) elsewhere in the same sim. 0 = every
     * quote unique; 1 = every quote paraphrases another. null when
     * fewer than 5 voiced personas — not enough sample to judge.
     */
    voiceHomogeneity: number | null;
    /**
     * Per-persona average count of country/channel mismatches rewritten
     * by the runner's country-channel sanitizer. 0 = the LLM emitted
     * country-aware channel choices throughout; >0.5 = roughly every
     * other persona named a Korea-only/Japan-only/etc. marketplace
     * inappropriately. Null when persona count is 0.
     */
    channelMismatchRate: number | null;
  };
}

/**
 * Run the full audit battery and return a result. Pure function; the
 * caller persists to simulation_quality. Tests can call this with
 * fixture inputs without touching the DB.
 */
export function auditQuality(input: QualityAuditInput): QualityAuditResult {
  const warnings: QualityWarning[] = [];

  // ── 1. Voice slip rate ──────────────────────────────────────────
  const voiceSlipRate = input.voiceSlipRate ?? null;
  if (voiceSlipRate !== null) {
    if (voiceSlipRate >= 0.25) {
      warnings.push({
        code: "voice_slip_critical",
        severity: "critical",
        message: "voice slip rate exceeds 25% — many personas slipped into the wrong language",
        value: voiceSlipRate,
        threshold: 0.25,
      });
    } else if (voiceSlipRate >= 0.05) {
      warnings.push({
        code: "voice_slip_warning",
        severity: "warning",
        message: "voice slip rate above 5% — some personas slipped",
        value: voiceSlipRate,
        threshold: 0.05,
      });
    }
  }

  // ── 2. Country score uniformity / range ─────────────────────────
  const finalScores = input.countries.map((c) => c.finalScore).filter((n) => Number.isFinite(n));
  let countryScoreUniformity = 0;
  let countryScoreRange = 0;
  if (finalScores.length >= 2) {
    const mn = Math.min(...finalScores);
    const mx = Math.max(...finalScores);
    countryScoreRange = mx - mn;
    const mean = finalScores.reduce((a, b) => a + b, 0) / finalScores.length;
    const variance =
      finalScores.reduce((s, x) => s + (x - mean) ** 2, 0) / finalScores.length;
    const std = Math.sqrt(variance);
    // Coefficient of variation — std/mean. Scaled so 0 = identical
    // scores (suspicious), >0.15 = healthy spread.
    countryScoreUniformity = mean > 0 ? std / mean : 0;

    if (countryScoreRange < 5) {
      warnings.push({
        code: "country_scores_uniform",
        severity: "critical",
        message:
          "all country finalScores within 5pt — model probably gave a flat distribution; recommendation will be unreliable",
        value: countryScoreRange,
        threshold: 5,
      });
    } else if (countryScoreRange < 15) {
      warnings.push({
        code: "country_scores_narrow",
        severity: "warning",
        message: "country finalScore spread is small (<15pt) — recommendation has weak signal",
        value: countryScoreRange,
        threshold: 15,
      });
    }
  }

  // ── 3. Profession diversity ─────────────────────────────────────
  // Top-1 share — if a single profession dominates, the sim is biased
  // and the persona pool wasn't doing its job. Slot-based generation
  // should keep this below ~15% in practice.
  const professionCounts = new Map<string, number>();
  for (const p of input.personas) {
    if (p.profession) {
      professionCounts.set(p.profession, (professionCounts.get(p.profession) ?? 0) + 1);
    }
  }
  const totalWithProfession = [...professionCounts.values()].reduce((a, b) => a + b, 0);
  const topShare =
    totalWithProfession > 0
      ? Math.max(...professionCounts.values()) / totalWithProfession
      : 0;
  const professionDiversity = totalWithProfession > 0 ? 1 - topShare : 0;

  if (topShare >= 0.4) {
    warnings.push({
      code: "profession_dominant",
      severity: "critical",
      message: `single profession is ${(topShare * 100).toFixed(0)}% of personas — slot diversity broke`,
      value: topShare,
      threshold: 0.4,
    });
  } else if (topShare >= 0.25) {
    warnings.push({
      code: "profession_skewed",
      severity: "warning",
      message: `top profession is ${(topShare * 100).toFixed(0)}% of personas — diversity weaker than typical`,
      value: topShare,
      threshold: 0.25,
    });
  }

  // ── 4. Income drift (cheap heuristic; deeper KOSIS check would need DB lookup) ──
  // Heuristic: count how many incomeBand strings parse to a USD figure.
  // If most are unparseable, the LLM is producing garbage — already
  // hurts the segment view, but worth flagging at the sim level too.
  const validIncomes = input.personas.filter((p) => parsableUsdRange(p.incomeBand)).length;
  const incomeParseRate = input.personas.length > 0 ? validIncomes / input.personas.length : 1;
  // Drift = inverse of parse rate.
  const incomeDriftPct = 1 - incomeParseRate;
  if (incomeParseRate < 0.5) {
    warnings.push({
      code: "income_unparseable",
      severity: "warning",
      message: `only ${(incomeParseRate * 100).toFixed(0)}% of incomeBand strings have a parseable USD figure — segment by-income view will be sparse`,
      value: incomeDriftPct,
      threshold: 0.5,
    });
  }

  // ── 5. Recommended price in basement band ───────────────────────
  let priceInBand = true;
  if (input.basePriceCents != null && input.pricing?.recommendedPriceCents != null) {
    const base = input.basePriceCents;
    const rec = input.pricing.recommendedPriceCents;
    if (base > 0) {
      const ratio = rec / base;
      if (ratio < 0.5 || ratio > 1.5) {
        priceInBand = false;
        warnings.push({
          code: "price_outside_band",
          severity: "warning",
          message: `recommended price (${(rec / 100).toFixed(2)}) is outside ±50% of base (${(base / 100).toFixed(2)}) — verify before pricing`,
          value: ratio,
          threshold: ratio < 0.5 ? 0.5 : 1.5,
        });
      }
    }
  }

  // ── 6. Persona generation completeness ──────────────────────────
  if (input.personaCountTarget > 0 && input.personaCount < input.personaCountTarget * 0.9) {
    const ratio = input.personaCount / input.personaCountTarget;
    warnings.push({
      code: "persona_count_short",
      severity: "warning",
      message: `only ${input.personaCount}/${input.personaCountTarget} personas generated — LLM truncated batches`,
      value: ratio,
      threshold: 0.9,
    });
  }

  // ── 7. Voice homogeneity ────────────────────────────────────────
  // Detects sims where the LLM produced 30 personas but their quotes
  // are all paraphrases of each other ("맘에 들어요", "정말 좋아요",
  // "괜찮네요"…). Useful as a quality signal because the cosmetic
  // "30 personas" implies diversity that doesn't actually exist.
  // Algorithm: bigram-set Jaccard between every pair of voices.
  // A voice is "near-duplicate" if it has ≥1 sibling with similarity
  // ≥ 0.4. The 0.4 threshold isn't arbitrary — bigram tokenisation
  // fragments shared phrases, so direct paraphrases land around
  // 0.4-0.55. Tighter would miss obvious "맘에 들어요" repetition;
  // looser would false-positive sims with shared product vocabulary.
  // Skipped when fewer than 5 voiced personas — too small to judge,
  // and Hypothesis tier ensembles often hit that floor.
  const NEAR_DUP_THRESHOLD = 0.4;
  const voicedPersonas = input.personas.filter(
    (p) => typeof p.voice === "string" && p.voice.trim().length >= 8,
  );
  let voiceHomogeneity: number | null = null;
  if (voicedPersonas.length >= 5) {
    const tokens = voicedPersonas.map((p) => tokenize(p.voice ?? ""));
    let nearDupCount = 0;
    for (let i = 0; i < tokens.length; i++) {
      let foundDup = false;
      for (let j = 0; j < tokens.length; j++) {
        if (i === j) continue;
        if (jaccard(tokens[i], tokens[j]) >= NEAR_DUP_THRESHOLD) {
          foundDup = true;
          break;
        }
      }
      if (foundDup) nearDupCount++;
    }
    voiceHomogeneity = nearDupCount / tokens.length;

    if (voiceHomogeneity >= 0.5) {
      warnings.push({
        code: "voice_homogeneous_critical",
        severity: "critical",
        message: `${(voiceHomogeneity * 100).toFixed(0)}% of persona quotes have a near-duplicate sibling — voice diversity broke; the 'N personas' headline is misleading`,
        value: voiceHomogeneity,
        threshold: 0.5,
      });
    } else if (voiceHomogeneity >= 0.3) {
      warnings.push({
        code: "voice_homogeneous_warning",
        severity: "warning",
        message: `${(voiceHomogeneity * 100).toFixed(0)}% of persona quotes are near-paraphrases — moderate voice repetition`,
        value: voiceHomogeneity,
        threshold: 0.3,
      });
    }
  }

  // ── 8. Channel mismatch rate ────────────────────────────────────
  // The runner sanitizer rewrites country-locked channel mentions
  // (Coupang in a VN persona, Rakuten in a US persona, etc.). The
  // value is informational unless it gets large — a sustained slip
  // rate suggests the country-aware persona prompt regressed.
  let channelMismatchRate: number | null = null;
  if (input.personaCount > 0 && typeof input.channelMismatchCount === "number") {
    channelMismatchRate = input.channelMismatchCount / input.personaCount;
    if (channelMismatchRate >= 0.5) {
      warnings.push({
        code: "channel_mismatch_high",
        severity: "warning",
        message: `${input.channelMismatchCount} channel-mismatches rewritten (${(channelMismatchRate * 100).toFixed(0)}% of personas) — country-aware persona prompt may have regressed`,
        value: channelMismatchRate,
        threshold: 0.5,
      });
    }
  }

  // ── 9. Synthesis failover (informational, not penalising) ──────
  if (input.synthesisFailover) {
    warnings.push({
      code: "synthesis_failover",
      severity: "info",
      message: "synthesis stage failed over to a backup provider — output is from a different model than originally assigned",
      value: 1,
      threshold: 1,
    });
  }

  // ── Composite confidence score ──────────────────────────────────
  // Start at 100, subtract for each warning by severity.
  // Critical = -25 each, warning = -10 each, info = 0 (just informational).
  // Cap at 0; min 0, max 100.
  let confidenceScore = 100;
  for (const w of warnings) {
    if (w.severity === "critical") confidenceScore -= 25;
    else if (w.severity === "warning") confidenceScore -= 10;
  }
  confidenceScore = Math.max(0, Math.min(100, confidenceScore));

  // Quarantine: any critical warning (regardless of count) flips it.
  // The ensemble aggregator can choose to skip quarantined sims when
  // computing recommendation consensus — defended by the fact that
  // a "all countries scored equally" sim would only pollute the vote.
  const quarantined = warnings.some((w) => w.severity === "critical");

  return {
    confidenceScore,
    quarantined,
    warnings,
    metrics: {
      voiceSlipRate,
      countryScoreUniformity,
      countryScoreRange,
      professionDiversity,
      incomeDriftPct,
      priceInBand,
      synthesisFailover: input.synthesisFailover,
      voiceHomogeneity,
      channelMismatchRate,
    },
  };
}

/**
 * Tokeniser for voice-homogeneity detection. Drops punctuation, lowercases,
 * splits on whitespace and CJK character boundaries (since Korean/Japanese
 * doesn't space-separate). Filters single-character tokens to avoid
 * inflating Jaccard with stop-particles like "은", "는", "이", "가".
 *
 * Bigram-based would be more accurate but pure unigrams are good enough
 * for catching the "all 30 personas say 좋아요" failure mode that
 * matters here — the goal isn't semantic dedup, it's flagging when the
 * LLM produces obvious-template output.
 */
function tokenize(s: string): Set<string> {
  const cleaned = s
    .toLowerCase()
    .replace(/["'`'']/g, "")
    .replace(/[.,!?…·~()\[\]{}<>「」『』、。:;\-—–]/g, " ");
  // Split on whitespace; further split CJK runs into single chars then
  // re-glue 2-char windows. Cheaper than a real morphological analyser.
  const out = new Set<string>();
  for (const word of cleaned.split(/\s+/)) {
    if (!word) continue;
    if (/^[ㄱ-ㆎ가-힣一-鿿぀-ゟ゠-ヿ]+$/.test(word)) {
      // CJK run → emit overlapping bigrams (length 2 windows). 1-char
      // tokens drop because they're typically particles/affixes.
      for (let i = 0; i + 1 < word.length; i++) {
        out.add(word.slice(i, i + 2));
      }
    } else {
      // Latin / mixed — emit as-is if at least 2 chars long.
      if (word.length >= 2) out.add(word);
    }
  }
  return out;
}

/** Token-set Jaccard. Returns 0 when either side is empty. */
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * Persist the audit result to simulation_quality. Upsert because a
 * re-audit later (e.g. after a checks library update) just refreshes
 * the existing row.
 */
export async function persistAudit(
  input: { simulationId: string; workspaceId: string },
  result: QualityAuditResult,
): Promise<void> {
  const admin = createServiceClient();
  await admin.from("simulation_quality").upsert(
    {
      simulation_id: input.simulationId,
      workspace_id: input.workspaceId,
      audited_at: new Date().toISOString(),
      confidence_score: result.confidenceScore,
      quarantined: result.quarantined,
      voice_slip_rate: result.metrics.voiceSlipRate,
      country_score_uniformity: result.metrics.countryScoreUniformity,
      country_score_range: result.metrics.countryScoreRange,
      profession_diversity: result.metrics.professionDiversity,
      income_drift_pct: result.metrics.incomeDriftPct,
      price_in_band: result.metrics.priceInBand,
      synthesis_failover: result.metrics.synthesisFailover,
      voice_homogeneity: result.metrics.voiceHomogeneity,
      channel_mismatch_rate: result.metrics.channelMismatchRate,
      warnings: result.warnings,
    },
    { onConflict: "simulation_id" },
  );
}

/**
 * Cheap "does this incomeBand string contain a $X(k) figure" check —
 * mirrors normaliseIncome's regex in ensemble.ts. Used for the
 * income drift signal without re-implementing the bucketer.
 */
function parsableUsdRange(s: string | undefined): boolean {
  if (!s) return false;
  return /\$\s*\d{1,4}(?:\s*[-–~to]+\s*\$?\s*\d{1,4})?\s*[kK]/.test(s) ||
    /\$\s*\d{1,3},(\d{3})/.test(s);
}
